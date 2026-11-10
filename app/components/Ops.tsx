"use client";

// Casca do sistema: carrega o estado já recortado pela permissão, deriva as visões e
// despacha as alterações. Depois de cada escrita o estado é recarregado do servidor — o
// conjunto é pequeno e assim a tela nunca mostra algo que o banco não confirmou.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LiffMark, Button } from "./ds";
import ThemeToggle from "./ThemeToggle";
import {
  Auditoria,
  Aviso,
  Cadastros,
  Comercial,
  Cronograma,
  Drawer,
  NovaAtividade,
  FormOportunidade,
  Operacoes,
  Overview,
  WaModal,
  type CadSet,
  type PainelDados,
  type ItemCronograma,
  type Semana,
} from "./views";
import { C, GHOST_FIX, avatarStyle, eyebrow, markTone, statusColor, useTheme, writeTheme, type Theme } from "./tokens";
import CoresDasAreas from "./CoresDasAreas";
import ImportarPlanilha from "./ImportarPlanilha";
import SeletorArea from "./SeletorArea";
import SeletorResponsaveis from "./SeletorResponsaveis";
import Conexoes from "./Conexoes";
import { EditarPessoa, EditarProduto } from "./EditarCadastro";
import { api, type State } from "./api";
import {
  NAV, STAGES, STATUS, TITLES, areaOf, brl, daISO, ddmm, diaISO, ehDoResponsavel, estagioEmAberto,
  escreverSelecaoDeResponsaveis, fimDaSemana, inicioDaSemana, lerSelecaoDeResponsaveis,
  opcoesDeResponsavel, porTexto, rotuloDaSemana, setAreas, stageLabel, statusLabel, todasAreas,
  type RegistroComResponsavel,
} from "@/lib/domain";
import { caminhoDe, type Rota } from "@/lib/rotas";

const DIAS_CRITICO = 7;

/** Dias inteiros entre hoje e o prazo. Negativo = atrasado, 0 = hoje. */
function diasAtePrazo(prazo: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(prazo + "T00:00:00");
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

/**
 * A partir de quantos dias sem mexer uma oportunidade entra no resumo como parada. Mais
 * folgado que o prazo crítico das atividades de propósito: ciclo comercial anda mais devagar,
 * e uma semana sem novidade em negociação é normal — duas já é sinal.
 */
const DIAS_SEM_MOVIMENTO = 14;

/** Dias inteiros desde a última mexida no card. */
function diasParado(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * O próximo passo cabe em 2000 caracteres no banco, e os que vieram da planilha são frases
 * inteiras. Numa mensagem de WhatsApp com o pipeline todo isso viraria parede de texto —
 * corta na palavra, não no meio dela.
 */
function resumirPasso(texto: string, limite = 80): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= limite) return limpo;
  const corte = limpo.slice(0, limite);
  const espaco = corte.lastIndexOf(" ");
  return (espaco > limite * 0.6 ? corte.slice(0, espaco) : corte) + "…";
}

export default function Ops({ rotaInicial }: { rotaInicial: Rota }) {
  const router = useRouter();
  const [estado, setEstado] = useState<State | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [theme, trocarTema] = useTheme();

  const [view, setView] = useState(rotaInicial.view);
  const [area, setArea] = useState("all");
  // Densidade do kanban comercial: card completo (padrão) ou compacto, guardada no perfil.
  const [densidade, setDensidade] = useState<"completo" | "compacto">("completo");
  // Filtro de responsável, paralelo ao de área: um recorta a vertical, o outro recorta a
  // carteira. Combinam — "só os meus" dentro de Tax é uma pergunta legítima.
  const [responsaveis, setResponsaveis] = useState<string[]>([]);
  const [cadTab, setCadTab] = useState<string>(rotaInicial.tab ?? "pessoas");
  // Produto ou pessoa aberto para edição/exclusão em Cadastros (só administração).
  const [cadEditando, setCadEditando] = useState<{ tipo: "produto"; id: string } | { tipo: "pessoa"; id: number } | null>(null);
  const [waAberto, setWaAberto] = useState(false);
  const [waArea, setWaArea] = useState("all");
  const [copiado, setCopiado] = useState(false);
  const [criando, setCriando] = useState<null | "atividade" | "oportunidade">(null);
  const [importando, setImportando] = useState(false);
  /** Gaveta da navegação. Só tem efeito abaixo de 860px — no desktop a lateral é fixa. */
  const [menuAberto, setMenuAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  /** Confirmação de operação concluída. Separado do erro: sucesso não pode ser vermelho. */
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const s = await api.estado();
      // O cadastro de áreas alimenta o registro que `areaOf` consulta — precisa estar em pé
      // antes de qualquer view renderizar, por isso acontece aqui e não num efeito.
      setAreas(s.areas);
      setEstado(s);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, []);

  // Carga inicial. O setState acontece no callback da promessa, não no corpo do efeito, e a
  // trava `vivo` evita atualizar um componente que já saiu da tela.
  useEffect(() => {
    let vivo = true;
    api.estado().then(
      (s) => {
        if (!vivo) return;
        setAreas(s.areas);
        setEstado(s);

        /**
         * Aplica o que a pessoa deixou guardado no perfil. O tema também vive no
         * localStorage, que é quem pinta antes do primeiro paint; o perfil é a fonte
         * durável, e sincronizar os dois aqui faz a escolha atravessar máquina e limpeza
         * de cache. Só na carga inicial — recarregar depois de uma escrita não pode
         * desfazer um filtro que a pessoa acabou de trocar.
         */
        const { tema, area: areaSalva, responsaveis: respSalvos, densidade: densSalva } = s.me.preferencias ?? {};
        if (densSalva === "compacto") setDensidade("compacto");
        // O leitor descarta chave inválida, então preferência antiga ou corrompida volta
        // como "todos" em vez de virar um filtro que não casa com nada.
        const resp = lerSelecaoDeResponsaveis(respSalvos);
        if (resp.length) setResponsaveis(resp);
        if (tema === "dark" || tema === "light") writeTheme(tema);
        // A área só volta se ainda for visível: permissão pode ter mudado desde a última
        // sessão, e restaurar um filtro que não mostra nada pareceria dado sumido.
        if (areaSalva && (areaSalva === "all" || s.areasVisiveis.includes(areaSalva))) setArea(areaSalva);
      },
      (e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Falha ao carregar.");
      }
    );
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * Único caminho de navegação: muda o estado e a barra de endereço na mesma ação, para as
   * duas nunca discordarem. Sem isto, o link copiado apontaria para a tela anterior.
   */
  const navegar = useCallback(
    (destino: Rota, { substituir = false } = {}) => {
      setView(destino.view);
      if (destino.view === "cadastros" && destino.tab) setCadTab(destino.tab);
      const caminho = caminhoDe(destino);
      if (caminho !== window.location.pathname) {
        if (substituir) router.replace(caminho);
        else router.push(caminho);
      }
    },
    [router]
  );

  /**
   * A view acompanha a URL quando ela muda por fora — voltar, avançar, ou um link colado numa
   * aba já aberta. O ajuste acontece DURANTE o render, não num efeito: é o padrão do React
   * para estado que segue uma prop, e evita o passe extra de renderização que o efeito
   * causaria (a tela pintaria uma vez com a seção antiga antes de corrigir).
   *
   * `view` não é derivada direto da prop porque a rota é `force-dynamic`: derivar faria cada
   * clique de menu esperar uma ida ao servidor, num app que já tem todos os dados em mãos.
   */
  const caminhoAtual = caminhoDe(rotaInicial);
  const [caminhoVisto, setCaminhoVisto] = useState(caminhoAtual);
  if (caminhoVisto !== caminhoAtual) {
    setCaminhoVisto(caminhoAtual);
    setView(rotaInicial.view);
    if (rotaInicial.tab) setCadTab(rotaInicial.tab);
  }

  /** Guarda a escolha no perfil. Falhar aqui não pode atrapalhar a navegação. */
  const lembrar = useCallback((patch: { tema?: string; area?: string; responsaveis?: string; densidade?: string }) => {
    void api.salvarPreferencias(patch).catch(() => {});
  }, []);

  const trocarArea = useCallback(
    (id: string) => {
      setArea(id);
      lembrar({ area: id });
    },
    [lembrar]
  );

  const trocarResponsaveis = useCallback(
    (sel: string[]) => {
      setResponsaveis(sel);
      // Texto e não array: `preferencias` é JSONB de string para string e o resto do mapa já
      // é texto. A forma canônica vem do domínio, então o que vai ao banco é sempre válido.
      lembrar({ responsaveis: escreverSelecaoDeResponsaveis(sel) });
    },
    [lembrar]
  );

  const trocarTemaSalvando = useCallback(
    (t: Theme) => {
      trocarTema(t);
      lembrar({ tema: t });
    },
    [trocarTema, lembrar]
  );

  // Esc fecha a gaveta — comportamento esperado de qualquer sobreposição, e o que salva
  // quem está numa janela estreita no desktop, onde o toque fora não é o gesto natural.
  useEffect(() => {
    if (!menuAberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [menuAberto]);

  /** Executa uma escrita e recarrega; erro vira aviso no topo, sem perder a tela. */
  const acao = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await carregar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha na operação.");
      }
    },
    [carregar]
  );

  // ---------- recortes ----------
  /**
   * Um link para um card fora do filtro salvo abriria o drawer sobre um quadro onde o card
   * não aparece. Nesse caso o filtro cede — só para esta visita, sem gravar no perfil.
   */
  const areaEfetiva = useMemo(() => {
    const ref = rotaInicial.ref;
    if (!ref || !estado || area === "all") return area;
    const alvo =
      estado.activities.find((a) => a.ref === ref) ?? estado.deals.find((d) => d.ref === ref);
    return alvo && alvo.area !== area ? "all" : area;
  }, [rotaInicial.ref, estado, area]);

  const dados = useMemo(() => {
    if (!estado) return null;
    const noEscopo = <T extends { area: string }>(l: T[]) =>
      l.filter((x) => areaEfetiva === "all" || x.area === areaEfetiva);

    /**
     * O recorte por responsável entra AQUI, no mesmo ponto do recorte por área: o painel, o
     * pipeline e o quadro operacional todos derivam destas duas listas, então uma mudança
     * só vale para as três telas. Filtrar em cada view convidaria a esquecer uma.
     */
    const atividadesEmArea = noEscopo(estado.activities);
    const oportunidadesEmArea = noEscopo(estado.deals);

    /**
     * As opções saem das listas ANTES do filtro por responsável. Depois dele, escolher uma
     * pessoa deixaria só ela na lista — e não haveria como trocar para outra nem voltar.
     *
     * A lista de pessoas vai junto porque o filtro resolve texto livre de planilha
     * ("Bianka") para quem está cadastrado, e precisa dos outros nomes para saber se um
     * primeiro nome solto identifica alguém sem ambiguidade.
     */
    const pessoas = estado.pessoas.map((p) => ({ id: p.id, nome: p.nome }));
    const opcoesResponsavel = opcoesDeResponsavel([...atividadesEmArea, ...oportunidadesEmArea], pessoas);

    const porResponsavel = <T extends RegistroComResponsavel>(l: T[]) =>
      l.filter((x) => ehDoResponsavel(x, responsaveis, pessoas));

    const atividades = porResponsavel(atividadesEmArea);
    const oportunidades = porResponsavel(oportunidadesEmArea);
    const logs = estado.logs.filter((l) => areaEfetiva === "all" || l.area === areaEfetiva);
    const areasVisiveis = todasAreas().filter((a) => estado.areasVisiveis.includes(a.id));
    /**
     * Painel inicial, no desenho novo. Tudo deriva do que já vem em `/api/state` — nenhuma
     * consulta nova: o recorte por permissão já aconteceu no servidor.
     */
    const me = estado.me;
    const abertas = atividades.filter((a) => a.status !== "concluido");
    const minhas = abertas.filter((a) => a.responsavelId === me.id);
    const comPrazo = abertas.filter((a) => a.prazo);
    const hoje = comPrazo.filter((a) => diasAtePrazo(a.prazo!) === 0);
    const proximos7 = comPrazo.filter((a) => {
      const d = diasAtePrazo(a.prazo!);
      return d > 0 && d <= DIAS_CRITICO;
    });
    const emAtraso = comPrazo.filter((a) => diasAtePrazo(a.prazo!) < 0);
    // Aberto = no funil e ainda não ganho. On hold e Lost ficam fora do pipeline aberto.
    const emAberto = oportunidades.filter((d) => estagioEmAberto(d.estagio));
    const ganhas = oportunidades.filter((d) => d.estagio === "ganho");
    const somaAberto = emAberto.reduce((s, d) => s + d.valorCentavos, 0);
    const somaGanho = ganhas.reduce((s, d) => s + d.valorCentavos, 0);

    const painel: PainelDados = {
      escopoFrase:
        `${me.nome.split(" ")[0]}, você vê ${areasVisiveis.length} de ${estado.areas.length} ` +
        `áreas — ${atividades.length} atividades e ${oportunidades.length} oportunidades.`,
      // O sufixo "(ver)" marca onde a pessoa só lê. É a informação que evita descobrir a
      // falta de permissão só na hora de tentar salvar.
      escopoAreas: areasVisiveis
        .map((a) => a.short + (estado.perms[a.id] === "edit" || estado.isAdmin ? "" : " (ver)"))
        .join(" · "),

      hero: [
        {
          label: "ABERTAS NO ESCOPO",
          valor: String(abertas.length),
          hint: `${atividades.length - abertas.length} concluídas no período`,
          cor: C.ink,
        },
        {
          label: "MINHA RESPONSABILIDADE",
          valor: String(minhas.length),
          hint: `${minhas.filter((a) => a.prioridade === "alta").length} de prioridade alta`,
          cor: C.accent,
        },
        {
          label: `HOJE / ${DIAS_CRITICO} DIAS`,
          valor: `${hoje.length} / ${proximos7.length}`,
          hint: emAtraso.length ? `${emAtraso.length} em atraso` : "nada em atraso",
          cor: hoje.length || emAtraso.length ? C.error : C.success,
        },
        {
          label: "PIPELINE ABERTO",
          valor: brl(somaAberto),
          hint: `${emAberto.length} oportunidades · ${brl(somaGanho)} ganhos`,
          cor: C.ink,
        },
      ],

      // Atrasadas primeiro, depois por proximidade do prazo. Seis linhas: o painel responde
      // "o que exige atenção agora", e uma lista longa deixaria de responder isso.
      comercial: [
        { label: "TOTAL EM JOGO", valor: brl(somaAberto + somaGanho), cor: C.ink },
        {
          label: "TICKET MÉDIO",
          valor: brl(emAberto.length ? Math.round(somaAberto / emAberto.length) : 0),
          cor: C.dust,
        },
        {
          label: "FASE FINAL",
          valor: brl(
            oportunidades.filter((d) => d.estagio === "contrato").reduce((s, d) => s + d.valorCentavos, 0)
          ),
          cor: C.warning,
        },
        { label: "GANHO", valor: brl(somaGanho), cor: C.success },
      ],

      /**
       * Foco da semana do comercial. Não é "as maiores": é o que exige ação.
       *
       * Parada há muito tempo vem primeiro, e a mais parada antes — é a que corre risco de
       * ser esquecida. Depois as adiantadas no funil, onde a semana rende mais. Ganho e Lost
       * ficam de fora: fechado não é foco. On hold entra por último, sinalizada, porque foi
       * decisão e não esquecimento.
       */
      focoComercial: (() => {
        const posicao = (k: string) => STAGES.findIndex((s) => s.key === k);
        return oportunidades
          .filter((d) => d.estagio !== "ganho" && d.estagio !== "lost")
          .map((d) => {
            const dias = diasParado(d.atualizadoEm);
            const emEspera = d.estagio === "on_hold";
            const parada = !emEspera && dias >= DIAS_SEM_MOVIMENTO;
            return { d, dias, parada, emEspera };
          })
          .sort((x, y) => {
            if (x.parada !== y.parada) return x.parada ? -1 : 1;
            if (x.parada && y.parada) return y.dias - x.dias;
            if (x.emEspera !== y.emEspera) return x.emEspera ? 1 : -1;
            return posicao(y.d.estagio) - posicao(x.d.estagio) || y.d.valorCentavos - x.d.valorCentavos;
          })
          .slice(0, 6)
          .map(({ d, dias, parada, emEspera }) => ({
            ref: d.ref,
            sinal: parada ? `parada ${dias}d` : stageLabel(d.estagio).toLowerCase(),
            sinalCor: parada ? C.error : emEspera ? C.warning : C.faint,
            titulo: d.conta,
            cor: areaOf(d.area).color,
            contexto: [d.responsavelTexto || d.responsavel, resumirPasso(d.proximoPasso, 40)]
              .filter(Boolean)
              .join(" · "),
            meta: brl(d.valorCentavos),
            metaCor: C.accent,
            podeAbrir: d.podeEditar,
          }));
      })(),

      atividades: STATUS.map((s) => ({
        label: s.label.toUpperCase(),
        valor: String(atividades.filter((a) => a.status === s.key).length),
        cor: statusColor(s.key),
      })),

      /**
       * Foco da semana das atividades. Junta as duas leituras que antes eram seções
       * separadas: o que tem prazo apertado E o que está em execução sem prazo nenhum.
       *
       * A separação anterior deixava as atividades importadas de planilha invisíveis — elas
       * não têm data. Aqui a ordem é atraso, hoje, prazo próximo e, no fim, o que está sendo
       * tocado agora, por prioridade.
       */
      focoAtividades: (() => {
        const abertasOrdenadas = abertas
          .map((a) => {
            const dias = a.prazo ? diasAtePrazo(a.prazo) : null;
            const noPrazo = dias !== null && dias <= DIAS_CRITICO;
            const executando = a.status === "andamento" || a.status === "revisao";
            return { a, dias, noPrazo, executando };
          })
          .filter((x) => x.noPrazo || x.executando);

        const peso = (p: string) => (p === "alta" ? 0 : p === "media" ? 1 : 2);
        return abertasOrdenadas
          .sort((x, y) => {
            // Com prazo apertado sempre antes de sem prazo, e o mais urgente primeiro.
            if (x.noPrazo !== y.noPrazo) return x.noPrazo ? -1 : 1;
            if (x.noPrazo && y.noPrazo) return x.dias! - y.dias!;
            return peso(x.a.prioridade) - peso(y.a.prioridade);
          })
          .slice(0, 6)
          .map(({ a, dias, noPrazo }) => ({
            ref: a.ref,
            sinal: noPrazo ? (dias! < 0 ? "atraso" : dias === 0 ? "hoje" : `D+${dias}`) : a.prioridade,
            sinalCor: noPrazo
              ? dias! <= 0
                ? C.error
                : C.warning
              : a.prioridade === "alta"
                ? C.error
                : C.faint,
            titulo: a.titulo,
            contexto: [
              a.produtoId ? (estado.produtos.find((p) => p.id === a.produtoId)?.label ?? null) : areaOf(a.area).label,
              a.responsavel,
            ]
              .filter(Boolean)
              .join(" · "),
            meta: [statusLabel(a.status), a.prazo ? ddmm(a.prazo) : null].filter(Boolean).join(" · "),
            metaCor: statusColor(a.status),
            podeAbrir: a.podeEditar,
          }));
      })(),


      logs: logs.slice(0, 8),
    };

    const colunasDeal = STAGES.map((s) => {
      const cards = oportunidades.filter((d) => d.estagio === s.key);
      return {
        key: s.key,
        label: s.label,
        total: brl(cards.reduce((t, c) => t + c.valorCentavos, 0)),
        cards,
      };
    });

    const colunasBoard = STATUS.map((s) => ({
      key: s.key,
      label: s.label,
      cards: atividades.filter((a) => a.status === s.key),
    }));

    return {
      atividades, oportunidades, logs, areasVisiveis, painel, colunasDeal, colunasBoard,
      opcoesResponsavel,
    };
  }, [estado, areaEfetiva, responsaveis]);

  // ---------- cadastros ----------
  const cadSet: CadSet | null = useMemo(() => {
    if (!estado) return null;
    if (cadTab === "pessoas") {
      return {
        head: ["PESSOA", "PAPEL", "E-MAIL"],
        rows: estado.pessoas.map((u) => ({
          key: `u${u.id}`,
          // Quem não está ativo aparece marcado: senão o cadastro sugere um time maior do
          // que o que de fato entra no sistema.
          a: u.nome + (u.ativo ? "" : " (inativo)"),
          b: u.papel,
          c: u.email,
          abrir: estado.isAdmin ? () => setCadEditando({ tipo: "pessoa", id: u.id }) : undefined,
        })),
        ph: "Nome completo",
      };
    }
    if (cadTab === "origens") {
      return {
        head: ["ORIGEM", "SITUAÇÃO", "OPORTUNIDADES"],
        rows: estado.origens.map((o) => ({
          key: o.id,
          a: o.label,
          b: o.ativo ? "ativa" : "arquivada",
          c: estado.deals.filter((d) => d.origemId === o.id).length + " no pipeline",
          // Arquivar, não excluir: as oportunidades que já apontam para ela continuam
          // mostrando de onde vieram. Só a administração mexe no cadastro.
          abrir: estado.isAdmin
            ? () => {
                if (!window.confirm(`${o.ativo ? "Arquivar" : "Reativar"} a origem ${o.label}?`)) return;
                void acao(() => api.alterarOrigem(o.id, { ativo: !o.ativo }));
              }
            : undefined,
        })),
        ph: "Nome da origem",
      };
    }
    if (cadTab === "areas") {
      return {
        head: ["ÁREA", "VERTICAL", "ATIVIDADES"],
        rows: todasAreas().filter((a) => estado.areasVisiveis.includes(a.id)).map((a) => ({
          key: a.id,
          a: "LIFF " + a.label,
          b: a.short,
          c: estado.activities.filter((x) => x.area === a.id).length + " ativas",
        })),
        ph: "Nome da área",
      };
    }
    return {
      head: ["PRODUTO", "ÁREA", "OPORTUNIDADES"],
      rows: estado.produtos.map((p) => ({
        key: p.id,
        a: p.label + (p.ativo ? "" : " (arquivado)"),
        b: areaOf(p.area).label,
        // Na oportunidade o produto virou "módulo de interesse" — uma pode ter vários.
        c: estado.deals.filter((d) => d.modulos.includes(p.id)).length + " no pipeline",
        abrir: estado.isAdmin ? () => setCadEditando({ tipo: "produto", id: p.id }) : undefined,
      })),
      ph: "Nome do produto",
    };
  }, [estado, cadTab, acao]);

  // ---------- cronograma ----------
  /**
   * Linha do tempo por semana, e dentro dela por área, misturando oportunidade e atividade.
   *
   * A data vem do próximo passo. Quem não tem data entra no fim da semana corrente — é a
   * regra que o formulário anuncia, e ela mantém no cronograma quem escreveu o passo sem
   * saber o dia, em vez de deixar esse trabalho invisível.
   *
   * Já concluído e já ganho ficam de fora: cronograma é o que falta fazer.
   */
  const cronograma: Semana[] = useMemo(() => {
    if (!dados) return [];
    const padrao = fimDaSemana();
    const hojeISO = diaISO(new Date());

    type Bruto = { areaId: string; quando: string; semData: boolean; item: Omit<ItemCronograma, "quando" | "semData" | "atrasado"> };
    const brutos: Bruto[] = [];

    for (const d of dados.oportunidades) {
      // Só o que está em aberto tem próximo passo a cumprir: Ganho, On hold e Lost ficam fora.
      if (!estagioEmAberto(d.estagio)) continue;
      const semData = !d.proximoPassoEm;
      brutos.push({
        areaId: d.area,
        quando: d.proximoPassoEm ?? padrao,
        semData,
        item: {
          ref: d.ref,
          tipo: "oportunidade",
          titulo: d.conta,
          detalhe: [stageLabel(d.estagio), resumirPasso(d.proximoPasso, 60) || "sem próximo passo escrito"]
            .filter(Boolean)
            .join(" · "),
          podeAbrir: d.podeEditar,
        },
      });
    }

    for (const a of dados.atividades) {
      if (a.status === "concluido") continue;
      const semData = !a.proximoPassoEm;
      brutos.push({
        areaId: a.area,
        quando: a.proximoPassoEm ?? padrao,
        semData,
        item: {
          ref: a.ref,
          tipo: "atividade",
          titulo: a.titulo,
          detalhe: [a.responsavel, resumirPasso(a.proximoPasso, 60) || "sem próximo passo escrito"]
            .filter(Boolean)
            .join(" · "),
          podeAbrir: a.podeEditar,
        },
      });
    }

    // Agrupa por semana. O que já passou vai todo para um bloco só no topo — dividir o
    // atraso em semanas antigas encheria a tela de cabeçalhos vazios de utilidade.
    const porSemana = new Map<string, Bruto[]>();
    for (const b of brutos) {
      const chave = b.quando < hojeISO ? "atrasado" : diaISO(inicioDaSemana(daISO(b.quando)));
      const lista = porSemana.get(chave) ?? [];
      lista.push(b);
      porSemana.set(chave, lista);
    }

    return [...porSemana.entries()]
      .sort(([x], [y]) => (x === "atrasado" ? -1 : y === "atrasado" ? 1 : x.localeCompare(y)))
      .map(([chave, lista]) => {
        const porArea = new Map<string, Bruto[]>();
        for (const b of lista) {
          const atual = porArea.get(b.areaId) ?? [];
          atual.push(b);
          porArea.set(b.areaId, atual);
        }
        return {
          chave,
          titulo: chave === "atrasado" ? "ATRASADO" : `SEMANA DE ${rotuloDaSemana(chave).split(" a ")[0]}`,
          rotulo: chave === "atrasado" ? "próximo passo com data já vencida" : rotuloDaSemana(chave),
          total: lista.length,
          areas: [...porArea.entries()]
            .map(([areaId, itens]) => ({
              areaId,
              label: areaOf(areaId).label,
              cor: areaOf(areaId).color,
              itens: itens
                .sort((x, y) => x.quando.localeCompare(y.quando) || porTexto(x.item.titulo, y.item.titulo))
                .map((b) => ({
                  ...b.item,
                  quando: ddmm(b.quando),
                  semData: b.semData,
                  atrasado: b.quando < hojeISO,
                })),
            }))
            .sort((x, y) => porTexto(x.label, y.label)),
        };
      });
  }, [dados]);

  // ---------- resumo para WhatsApp ----------
  const waTexto = useMemo(() => {
    if (!estado) return "";
    const escopo = waArea === "all" ? estado.areasVisiveis : [waArea];
    const atv = estado.activities.filter((a) => escopo.includes(a.area));
    const deals = estado.deals.filter((d) => escopo.includes(d.area));
    const cabecalho = waArea === "all" ? "LIFF — Status geral" : `LIFF ${areaOf(waArea).label} — Status`;
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const hoje = `${p(d.getDate())}/${p(d.getMonth() + 1)}`;

    const L: string[] = [];
    L.push(`*${cabecalho}* (${hoje})`);
    L.push("");
    L.push(
      `Atividades: ${atv.length} - ${atv.filter((a) => a.status === "andamento").length} em andamento, ` +
        `${atv.filter((a) => a.status === "revisao").length} em revisão, ` +
        `${atv.filter((a) => a.status === "concluido").length} concluídas`
    );
    L.push("");

    const foco = atv.filter((a) => a.status === "andamento" || a.status === "revisao").slice(0, 5);
    if (foco.length) {
      L.push("*Em execução*");
      foco.forEach((a) =>
        L.push(
          `- ${a.titulo} - ${a.responsavel.split(" ")[0]} (${statusLabel(a.status).toLowerCase()}, vence ${ddmm(a.prazo)})`
        )
      );
      L.push("");
    }

    if (deals.length) {
      const abertos = deals.filter((x) => estagioEmAberto(x.estagio));
      L.push("*Comercial*");
      L.push(
        `- Pipeline aberto: ${brl(abertos.reduce((s, x) => s + x.valorCentavos, 0))} em ${abertos.length} oportunidades`
      );
      const ganhos = deals.filter((x) => x.estagio === "ganho");
      if (ganhos.length) L.push(`- Ganhos no período: ${ganhos.map((g) => g.conta).join(", ")}`);
      // On hold saiu do pipeline aberto, mas não pode sumir do resumo: foi decisão de esperar,
      // e quem lê precisa saber o que está esperando.
      const emEspera = deals.filter((x) => x.estagio === "on_hold");
      if (emEspera.length) L.push(`- On hold: ${emEspera.map((x) => x.conta).join(", ")}`);

      // Todas as oportunidades abertas, do fim do funil para o começo. Antes eram três, de
      // um trecho do funil — quem lia o resumo não tinha como saber que o resto existia.
      // Desempate por valor: dentro do mesmo estágio, primeiro o que pesa mais.
      const posicao = (k: string) => STAGES.findIndex((s) => s.key === k);
      [...abertos]
        .sort((a, b) => posicao(b.estagio) - posicao(a.estagio) || b.valorCentavos - a.valorCentavos)
        .forEach((x) => {
          const partes = [stageLabel(x.estagio), brl(x.valorCentavos)];
          const dias = diasParado(x.atualizadoEm);
          if (dias >= DIAS_SEM_MOVIMENTO) partes.push(`⚠ parada há ${dias}d`);
          const passo = resumirPasso(x.proximoPasso);
          L.push(`- ${x.conta}: ${partes.join(" · ")}${passo ? ` (${passo})` : ""}`);
        });
      L.push("");
    }

    const concluidas = atv.filter((a) => a.status === "concluido").slice(0, 3);
    if (concluidas.length) {
      L.push("*Concluído recentemente*");
      concluidas.forEach((a) => L.push(`- ${a.titulo}`));
      L.push("");
    }

    const hojeISO = new Date().toISOString().slice(0, 10);
    L.push(`Alterações registradas hoje: ${estado.logs.filter((l) => l.criadoEm.slice(0, 10) === hojeISO).length}`);
    L.push(`Reportado por ${estado.me.nome} via LIFF tasks`);
    return L.join("\n");
  }, [estado, waArea]);

  if (erro && !estado) return <Aviso>{erro}</Aviso>;
  if (!estado || !dados || !cadSet) return <Aviso>carregando…</Aviso>;

  const me = estado.me;
  // Cadastros (que inclui pessoas e permissões) é configuração do sistema — as rotas já exigem
  // admin, e deixar a tela à vista só oferecia caminhos que terminam em 403. No menu, o que é
  // só de admin fica num grupo à parte, no fim.
  const navComum = NAV.filter((n) => !("soAdmin" in n));
  const navAdmin = estado.isAdmin ? NAV.filter((n) => "soAdmin" in n) : [];
  const contagens: Record<string, number> = {
    comercial: dados.oportunidades.length,
    operacoes: dados.atividades.length,
    auditoria: dados.logs.length,
  };
  const chips = [{ id: "all", label: "Todas", color: C.dust }, ...dados.areasVisiveis];
  // Só oferece criar nas áreas onde a pessoa realmente escreve.
  const areasEditaveis = dados.areasVisiveis.filter((a) => estado.perms[a.id] === "edit");
  const pessoasAtivas = estado.pessoas.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome }));

  /** Cria mantendo o modal aberto — o cadastro de produto acontece dentro da importação. */
  const criarSemFechar = async (fn: () => Promise<unknown>) => {
    setSalvando(true);
    setErroForm(null);
    try {
      await fn();
      await carregar();
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Não foi possível criar.");
    } finally {
      setSalvando(false);
    }
  };

  /** Cria e, dando certo, fecha o modal. O erro fica no próprio formulário. */
  const criar = async (fn: () => Promise<unknown>) => {
    setSalvando(true);
    setErroForm(null);
    try {
      await fn();
      await carregar();
      setCriando(null);
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Não foi possível criar.");
    } finally {
      setSalvando(false);
    }
  };
  const rotuloArea = areaEfetiva === "all" ? "todas as áreas" : areaOf(areaEfetiva).label;
  /**
   * O card aberto é DERIVADO da URL, não guardado em estado. Assim não há o que sincronizar:
   * voltar fecha o drawer, recarregar reabre no mesmo card, e o endereço na barra é sempre o
   * link que a pessoa pode copiar.
   */
  const refAberta = rotaInicial.ref ?? null;
  const selecionadaObj = refAberta ? (estado.activities.find((a) => a.ref === refAberta) ?? null) : null;
  const dealEmEdicao = refAberta ? (estado.deals.find((d) => d.ref === refAberta) ?? null) : null;
  const cardAberto = selecionadaObj ?? dealEmEdicao;
  // Referência que não resolve: ou não existe, ou está em área fora do acesso desta pessoa.
  // O aviso não distingue as duas — distinguir confirmaria a existência do registro.
  const refPerdida = refAberta && !cardAberto;

  const conteudo = () => {
    // Rede de segurança: o menu já esconde estas telas de quem não é admin, mas um estado
    // antigo não pode virar uma tela vazia sem explicação.
    if (NAV.some((n) => n.key === view && "soAdmin" in n) && !estado.isAdmin) {
      return <Overview
          dados={dados.painel}
          onAbrirAtividade={(ref) => navegar({ view: "operacoes", ref })}
          onAbrirDeal={(ref) => navegar({ view: "comercial", ref })}
          onVerPipeline={() => navegar({ view: "comercial" })}
          onVerQuadro={() => navegar({ view: "operacoes" })}
          onVerAuditoria={() => navegar({ view: "auditoria" })}
        />;
    }
    switch (view) {
      case "comercial":
        return (
          <Comercial
            colunas={dados.colunasDeal}
            densidade={densidade}
            produtos={estado.produtos}
            pessoas={estado.pessoas}
            onMover={(id, dir) => void acao(() => api.moverOportunidade(id, dir))}
            // Arrastar manda o destino direto: a rota valida o estágio contra STAGE_KEYS e
            // registra o par anterior/novo, igual ao movimento pelas setas.
            onSoltar={(id, estagio) => void acao(() => api.alterarOportunidade(id, { estagio }))}
            onAbrir={(id) => {
              setErroForm(null);
              const d = estado.deals.find((x) => x.id === id);
              if (d) navegar({ view: "comercial", ref: d.ref });
            }}
          />
        );
      case "operacoes":
        return (
          <Operacoes
            colunas={dados.colunasBoard}
            produtos={estado.produtos}
            onSoltar={(id, status) => void acao(() => api.alterarAtividade(id, { status }))}
            onAbrir={(id) => {
              const a = estado.activities.find((x) => x.id === id);
              if (a) navegar({ view: "operacoes", ref: a.ref });
            }}
          />
        );
      case "cronograma":
        return (
          <Cronograma
            semanas={cronograma}
            onAbrir={(ref, tipo) =>
              navegar({ view: tipo === "oportunidade" ? "comercial" : "operacoes", ref })
            }
          />
        );
      case "cadastros": {
        const prodEdit = cadEditando?.tipo === "produto" ? estado.produtos.find((p) => p.id === cadEditando.id) : undefined;
        const pessoaEdit = cadEditando?.tipo === "pessoa" ? estado.pessoas.find((p) => p.id === cadEditando.id) : undefined;
        return (
          <>
          {prodEdit && (
            <EditarProduto
              key={prodEdit.id}
              produto={prodEdit}
              areas={dados.areasVisiveis.map((a) => ({ id: a.id, label: a.label }))}
              onFechar={() => setCadEditando(null)}
              onMudou={carregar}
            />
          )}
          {pessoaEdit && (
            <EditarPessoa
              key={pessoaEdit.id}
              pessoa={pessoaEdit}
              meuId={me.id}
              dominio={estado.dominioLogin}
              onFechar={() => setCadEditando(null)}
              onMudou={carregar}
            />
          )}
          <Cadastros
            tab={cadTab}
            onTab={(tab) => navegar({ view: "cadastros", tab })}
            set={cadSet}
            pessoas={estado.pessoas}
            meuId={me.id}
            onCiclarPermissao={(uid, a) => void acao(() => api.ciclarPermissao(uid, a))}
            onAtivoPessoa={(uid, v) => void acao(() => api.definirAtivo(uid, v))}
            onEditarPessoa={(id) => setCadEditando({ tipo: "pessoa", id })}
            areas={estado.areas.filter((a) => estado.areasVisiveis.includes(a.id))}
            contagemPorArea={(id) => estado.activities.filter((x) => x.area === id).length}
            podeEditarAreas={estado.isAdmin}
            salvandoArea={salvando}
            areasEditaveis={dados.areasVisiveis.map((a) => ({ id: a.id, label: a.label }))}
            dominio={estado.dominioLogin}
            onCriarPessoa={(d) => {
              setSalvando(true);
              void acao(() => api.criarPessoa(d)).finally(() => setSalvando(false));
            }}
            onCriarProduto={(d) => {
              setSalvando(true);
              void acao(() => api.criarProduto(d)).finally(() => setSalvando(false));
            }}
            onCriarOrigem={(d) => {
              setSalvando(true);
              void acao(() => api.criarOrigem(d)).finally(() => setSalvando(false));
            }}
            onCorArea={(id, cor) => void acao(() => api.alterarArea(id, { cor }))}
            onNomeArea={(id, patch) => void acao(() => api.alterarArea(id, patch))}
            onCriarArea={(d) => {
              setSalvando(true);
              void acao(() => api.criarArea(d)).finally(() => setSalvando(false));
            }}
            onExcluirArea={(id, label) => {
              // Exclusão é irreversível e some com as permissões concedidas naquela área.
              if (!window.confirm(`Excluir a vertical ${label}? As permissões nela também caem.`)) return;
              void acao(() => api.excluirArea(id));
            }}
          />
          </>
        );
      }
      case "auditoria":
        return <Auditoria logs={dados.logs} />;
      case "conexoes":
        return <Conexoes mcpHabilitado={estado.mcpHabilitado} />;
      default:
        return <Overview
          dados={dados.painel}
          onAbrirAtividade={(ref) => navegar({ view: "operacoes", ref })}
          onAbrirDeal={(ref) => navegar({ view: "comercial", ref })}
          onVerPipeline={() => navegar({ view: "comercial" })}
          onVerQuadro={() => navegar({ view: "operacoes" })}
          onVerAuditoria={() => navegar({ view: "auditoria" })}
        />;
    }
  };

  return (
    <div className="liff-shell" data-menu={menuAberto ? "aberto" : "fechado"}>
      <CoresDasAreas areas={estado.areas} />

      {/* Fundo da gaveta: fecha ao tocar fora, que é o gesto esperado no celular. */}
      {menuAberto && (
        <div className="liff-menu-fundo" onClick={() => setMenuAberto(false)} aria-hidden="true" />
      )}

      {/* ---- barra lateral ---- */}
      <aside className="liff-aside">
        <div style={{ padding: "0 22px 26px" }}>
          <LiffMark height={24} tone={markTone(theme)} />
          <div style={{ ...eyebrow(10, C.accent, "0.18em"), marginTop: 10 }}>OPS · GESTÃO INTERNA</div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column" }}>
          {[navComum, navAdmin].map((grupo, gi) =>
            grupo.length === 0 ? null : (
              <Fragment key={gi}>
                {gi > 0 && (
                  <div className="liff-nav-grupo" aria-hidden>
                    <span style={eyebrow(9, C.faint, "0.16em")}>só admin</span>
                  </div>
                )}
              {grupo.map((n) => {
                const on = view === n.key;
                return (
                  <div
                    key={n.key}
                    className="liff-nav-item"
                    onClick={() => {
                      navegar({ view: n.key, tab: n.key === "cadastros" ? cadTab : undefined });
                      // Escolher um item é a razão de a gaveta existir; ela se fecha sozinha.
                      setMenuAberto(false);
                    }}
                    style={{
                      padding: "11px 22px",
                      cursor: "pointer",
                      ...eyebrow(12, on ? C.ink : C.dust, "0.1em"),
                      borderLeft: `2px solid ${on ? C.accent : "transparent"}`,
                      background: on ? C.panel : "transparent",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>/ {n.label}</span>
                    <span style={{ fontSize: 10, color: C.faint }}>{contagens[n.key] ?? ""}</span>
                  </div>
                );
              })}
              </Fragment>
            )
          )}
        </nav>

        <div style={{ marginTop: "auto", padding: "26px 22px 0" }}>
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 18, marginBottom: 18 }}>
            <div style={{ ...eyebrow(10, C.faint, "0.14em"), marginBottom: 9 }}>FUNDO</div>
            <ThemeToggle theme={theme} onChange={trocarTemaSalvando} />
          </div>
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={avatarStyle(32)}>{me.iniciais}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{me.nome}</div>
                <div style={eyebrow(10, C.faint, "0.1em")}>{me.papel}</div>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void api.sair().then(() => {
                    window.location.href = "/login";
                  })
                }
                style={{ width: "100%", justifyContent: "center", ...GHOST_FIX }}
              >
                sair
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* ---- conteúdo ---- */}
      <div style={{ background: C.canvas, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header className="liff-header">
          <button
            type="button"
            className="liff-menu-botao"
            onClick={() => setMenuAberto((v) => !v)}
            aria-label={menuAberto ? "Fechar navegação" : "Abrir navegação"}
            aria-expanded={menuAberto}
            style={{
              // `alignItems` faltava: sem ele o flex cai em `stretch`, que não se aplica a
              // filho com largura definida, e as barras iam parar coladas na borda esquerda
              // com 20px de vazio à direita — o ícone torto dentro do quadrado.
              alignItems: "center",
              justifyContent: "center",
              width: 38,
              height: 38,
              padding: 0,
              flexShrink: 0,
              background: "transparent",
              border: `1px solid ${C.line}`,
              color: C.ink,
              cursor: "pointer",
            }}
          >
            {/* SVG com retângulos em coordenadas inteiras, e não três spans espaçados por
                `gap`: 18×12 dentro da caixa de 36×36 centraliza em 9 e 12, sem meio pixel
                para o navegador arredondar de um jeito em cada barra. */}
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" focusable="false">
              {[0, 5, 10].map((y) => (
                <rect key={y} x="0" y={y} width="18" height="1" fill="currentColor" />
              ))}
            </svg>
          </button>

          <div style={{ minWidth: 200 }}>
            <div style={eyebrow(10, C.faint)}>
              {view === "conexoes"
                ? "LIFF/ CONEXÕES"
                : `LIFF/ ${view === "overview" ? "PAINEL" : view.toUpperCase()} · ${rotuloArea.toUpperCase()}`}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink }}>{TITLES[view]}</div>
          </div>

          {/* Os dois filtros do cabeçalho moram juntos: área recorta a vertical, "meus"
              recorta a carteira. Separá-los faria parecer que um é filtro e o outro é modo. */}
          <div className="liff-filtros" style={{ marginLeft: "auto" }}>
            {/* Conexão não pertence a área nenhuma: na tela delas o recorte por área só
                confundiria. */}
            {view !== "conexoes" && (
              <div className="liff-area-chips">
                <SeletorArea opcoes={chips} valor={area} onChange={trocarArea} />
              </div>
            )}
            {/* O seletor de responsável fica ao lado do de área porque os dois recortam a
                mesma lista. "Só eu" só aparece quando a pessoa tem algo em escopo — um
                atalho que esvazia a tela sem dizer por quê não ajuda ninguém. */}
            {["overview", "comercial", "operacoes"].includes(view) && (
              <SeletorResponsaveis
                className="liff-filtro-quem"
                opcoes={dados.opcoesResponsavel}
                selecao={responsaveis}
                onChange={trocarResponsaveis}
                chaveDoUsuario={
                  dados.opcoesResponsavel.some((o) => o.chave === `u:${estado.me.id}`)
                    ? `u:${estado.me.id}`
                    : undefined
                }
              />
            )}
          </div>

          {/* As ações ficam num grupo próprio para quebrarem juntas quando o cabeçalho
              não couber, em vez de uma delas cair sozinha para a linha de baixo. */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: "auto" }}>
            {/* Densidade do kanban comercial. Fica no perfil: abre do jeito que a pessoa deixou. */}
            {view === "comercial" && (
              <div role="group" aria-label="Densidade dos cards" className="liff-densidade">
                {(["completo", "compacto"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={densidade === d}
                    onClick={() => {
                      setDensidade(d);
                      lembrar({ densidade: d });
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}

            {/* Criar aparece onde a coisa vive: atividade no quadro operacional,
                oportunidade no pipeline. Desabilita quando não há área com permissão de
                edição — o servidor recusaria de todo jeito. */}
            {["operacoes", "comercial"].includes(view) && (
              <Button
                variant="outline"
                size="sm"
                disabled={areasEditaveis.length === 0}
                title={
                  areasEditaveis.length === 0 ? "Você não tem permissão de edição em nenhuma área" : undefined
                }
                onClick={() => {
                  setErroForm(null);
                  setCriando(view === "comercial" ? "oportunidade" : "atividade");
                }}
              >
                + {view === "comercial" ? "oportunidade" : "atividade"}
              </Button>
            )}

            {/* Também no quadro operacional: a importação passou a ler abas de to-dos, e
                seria estranho ter de ir ao pipeline para trazer atividades. */}
            {["comercial", "operacoes"].includes(view) && (
              <Button
                variant="outline"
                size="sm"
                disabled={areasEditaveis.length === 0}
                onClick={() => {
                  setErroForm(null);
                  setImportando(true);
                }}
              >
                importar planilha
              </Button>
            )}

            <Button
              variant="solid"
              size="sm"
              onClick={() => {
                setWaArea(area);
                setCopiado(false);
                setWaAberto(true);
              }}
            >
              resumo p/ whatsapp
            </Button>
          </div>
        </header>

        <main className="liff-main">
          {aviso && (
            <div
              onClick={() => setAviso(null)}
              style={{
                border: `1px solid ${C.success}`,
                color: C.success,
                fontFamily: "var(--liff-font-mono)",
                fontSize: 12,
                padding: "10px 14px",
                marginBottom: 18,
                cursor: "pointer",
              }}
              title="Clique para dispensar"
            >
              {aviso}
            </div>
          )}
          {refPerdida && (
            <div
              style={{
                border: `1px solid ${C.warning}`,
                color: C.warning,
                fontFamily: "var(--liff-font-mono)",
                fontSize: 12,
                padding: "10px 14px",
                marginBottom: 18,
                lineHeight: 1.6,
              }}
            >
              Não encontrei {refAberta}. O registro pode ter sido excluído, ou estar numa área
              fora do seu acesso.
            </div>
          )}
          {erro && (
            <div
              style={{
                border: `1px solid ${C.error}`,
                color: C.error,
                fontFamily: "var(--liff-font-mono)",
                fontSize: 12,
                padding: "10px 14px",
                marginBottom: 18,
              }}
            >
              {erro}
            </div>
          )}
          {conteudo()}
        </main>
      </div>

      {/* ---- sobreposições ---- */}
      {selecionadaObj && (
        <Drawer
          act={selecionadaObj}
          pessoas={estado.pessoas}
          onFechar={() => navegar({ view: "operacoes" })}
          areasEditaveis={areasEditaveis}
          onArea={(id) => void acao(() => api.alterarAtividade(selecionadaObj.id, { area: id }))}
          onTitulo={(t) => void acao(() => api.alterarAtividade(selecionadaObj.id, { titulo: t }))}
          onStatus={(k) => void acao(() => api.alterarAtividade(selecionadaObj.id, { status: k }))}
          onResponsavel={(id) => void acao(() => api.alterarAtividade(selecionadaObj.id, { responsavelId: id }))}
          onPrioridade={(p) => void acao(() => api.alterarAtividade(selecionadaObj.id, { prioridade: p }))}
          onSituacao={(v) => void acao(() => api.alterarAtividade(selecionadaObj.id, { situacao: v }))}
          onProximo={(v) => void acao(() => api.alterarAtividade(selecionadaObj.id, { proximoPasso: v }))}
          onProduto={(id) => void acao(() => api.alterarAtividade(selecionadaObj.id, { produtoId: id }))}
          oportunidades={[...estado.deals].sort((x, y) => x.ref.localeCompare(y.ref, "pt-BR", { numeric: true }))}
          onOportunidade={(id) => void acao(() => api.alterarAtividade(selecionadaObj.id, { oportunidade: id }))}
          onProximoEm={(d) => void acao(() => api.alterarAtividade(selecionadaObj.id, { proximoPassoEm: d }))}
          onPrazo={(d) => void acao(() => api.alterarAtividade(selecionadaObj.id, { prazo: d }))}
          produtos={estado.produtos}
          onExcluir={() => {
            if (
              !window.confirm(
                `Excluir a atividade "${selecionadaObj.titulo}"?\n\nO card e seus campos somem. O histórico de alterações continua na auditoria.`
              )
            )
              return;
            void acao(() => api.excluirAtividade(selecionadaObj.id)).then(() => navegar({ view: "operacoes" }));
          }}
        />
      )}

      {criando === "atividade" && (
        <NovaAtividade
          areasEditaveis={areasEditaveis}
          pessoas={pessoasAtivas}
          produtos={estado.produtos}
          salvando={salvando}
          erro={erroForm}
          onFechar={() => setCriando(null)}
          onSalvar={(d) => void criar(() => api.criarAtividade(d))}
        />
      )}

      {criando === "oportunidade" && (
        <FormOportunidade
          origens={estado.origens}
          areasEditaveis={areasEditaveis}
          pessoas={pessoasAtivas}
          produtos={estado.produtos}
          salvando={salvando}
          erro={erroForm}
          onFechar={() => setCriando(null)}
          onSalvar={(d) => void criar(() => api.criarOportunidade(d))}
        />
      )}

      {dealEmEdicao && (
        <FormOportunidade
          origens={estado.origens}
          inicial={dealEmEdicao}
          tarefas={estado.activities.filter((a) => a.oportunidadeId === dealEmEdicao.id)}
          onAbrirTarefa={(ref) => navegar({ view: "operacoes", ref })}
          onExcluir={() => {
            if (
              !window.confirm(
                `Excluir a oportunidade ${dealEmEdicao.conta}?\n\nO card e seus campos somem. O histórico de alterações continua na auditoria.`
              )
            )
              return;
            void acao(() => api.excluirOportunidade(dealEmEdicao.id)).then(() => navegar({ view: "comercial" }));
          }}
          areasEditaveis={areasEditaveis}
          pessoas={pessoasAtivas}
          produtos={estado.produtos}
          salvando={salvando}
          erro={erroForm}
          onFechar={() => navegar({ view: "comercial" })}
          onSalvar={(d) => {
            setSalvando(true);
            setErroForm(null);
            api
              .alterarOportunidade(dealEmEdicao.id, d)
              .then(() => carregar())
              .then(() => navegar({ view: "comercial" }))
              .catch((e: unknown) => setErroForm(e instanceof Error ? e.message : "Não foi possível salvar."))
              .finally(() => setSalvando(false));
          }}
        />
      )}

      {importando && (
        <ImportarPlanilha
          areasEditaveis={areasEditaveis}
          produtos={estado.produtos}
          deals={estado.deals}
          atividades={estado.activities}
          areasComPlanilha={new Set(estado.areas.filter((a) => a.planilhaUrl).map((a) => a.id))}
          sheetsConectado={estado.sheetsConectado}
          salvando={salvando}
          erro={erroForm}
          onFechar={() => setImportando(false)}
          onCriarProduto={async (label, areaProduto) => {
            await criarSemFechar(() => api.criarProduto({ label, area: areaProduto }));
          }}
          onImportar={(areaDestino, { deals: linhasDeal, atividades: linhasAtiv }) => {
            setSalvando(true);
            setErroForm(null);
            // Sequencial, e acumulando o que já entrou: se a segunda chamada falhar, a
            // primeira já gravou, e a mensagem de erro precisa dizer isso — senão a pessoa
            // reimporta tudo achando que nada passou.
            const feito: string[] = [];
            void (async () => {
              try {
                if (linhasDeal.length) {
                  const r = await api.importarOportunidades(areaDestino, linhasDeal);
                  feito.push(
                    `${r.criadas} oportunidade(s) criada(s), ${r.atualizadas} atualizada(s)` +
                      (r.ignoradas.length
                        ? `, ${r.ignoradas.length} ignorada(s) (${r.ignoradas.slice(0, 3).map((x) => x.motivo).join("; ")}${r.ignoradas.length > 3 ? "…" : ""})`
                        : "") +
                      (r.avisos?.length ? `, ${r.avisos.length} aviso(s): ${r.avisos.slice(0, 3).map((x) => x.aviso).join("; ")}${r.avisos.length > 3 ? "…" : ""}` : "")
                  );
                }
                if (linhasAtiv.length) {
                  const r = await api.importarAtividades(areaDestino, linhasAtiv);
                  feito.push(
                    `${r.criadas} atividade(s) criada(s), ${r.atualizadas} atualizada(s)` +
                      (r.ignoradas.length ? `, ${r.ignoradas.length} ignorada(s)` : "")
                  );
                }
                await carregar();
                setImportando(false);
                setAviso(`Importação concluída: ${feito.join(" · ")}.`);
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Falha na importação.";
                await carregar();
                setErroForm(feito.length ? `${msg} Antes disso já entraram: ${feito.join(" · ")}.` : msg);
              } finally {
                setSalvando(false);
              }
            })();
          }}
        />
      )}

      {waAberto && (
        <WaModal
          tabs={[{ id: "all", label: "Geral", color: C.dust }, ...dados.areasVisiveis.map((a) => ({ id: a.id, label: a.label, color: a.color }))]}
          areaAtiva={waArea}
          texto={waTexto}
          copiado={copiado}
          onArea={(id) => {
            setWaArea(id);
            setCopiado(false);
          }}
          onCopiar={() => {
            if (navigator.clipboard) void navigator.clipboard.writeText(waTexto).catch(() => {});
            setCopiado(true);
          }}
          onFechar={() => {
            setWaAberto(false);
            setCopiado(false);
          }}
        />
      )}
    </div>
  );
}
