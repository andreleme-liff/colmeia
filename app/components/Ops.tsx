"use client";

// Casca do sistema: carrega o estado já recortado pela permissão, deriva as visões e
// despacha as alterações. Depois de cada escrita o estado é recarregado do servidor — o
// conjunto é pequeno e assim a tela nunca mostra algo que o banco não confirmou.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LiffSig, Button } from "./ds";
import { IconeLua, IconeMenu, IconeRecolher, IconeSair, IconeSol } from "./IconesMenu";
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
  WaModal,
  type CadSet,
  type PainelDados,
  type ItemCronograma,
  type Semana,
} from "./views";
import { C, avatarStyle, eyebrow, markTone, statusColor, useTheme, writeTheme, type Theme, R } from "./tokens";
import CoresDasAreas from "./CoresDasAreas";
import SeletorArea from "./SeletorArea";
import SeletorResponsaveis from "./SeletorResponsaveis";
import CampoBusca from "./CampoBusca";
import Receita from "./Receita";
import Painel from "./Painel";
import Faturamento from "./Faturamento";
import Funding from "./Funding";
import Clientes from "./Clientes";
import Conexoes from "./Conexoes";
import Agenda, { type ItemAgenda } from "./Agenda";
import { EditarPessoa, EditarProduto } from "./EditarCadastro";
import { api, type State } from "./api";
import type { LinhaAuditoria } from "./views";
import {
  NAV, STAGES, STAGE_KEYS, STATUS, STATUS_KEYS, TITLES, areaOf, brl, daISO, ddmm, diaISO, ehDoResponsavel, estagioEmAberto,
  escreverSelecaoDeResponsaveis, inicioDaSemana, lerSelecaoDeResponsaveis,
  CHAVE_SEM_RESPONSAVEL, aplicarBusca, opcoesDeResponsavel, porTexto, prepararBusca, rotuloDaSemana, setAreas, stageLabel, statusLabel, todasAreas,
  type RegistroComResponsavel,
} from "@/lib/domain";
import { caminhoDe, type Rota } from "@/lib/rotas";
import { saudar } from "@/lib/saudacao";

/**
 * Dias desde a última vez que a pessoa abriu o sistema neste navegador (e marca a de agora).
 * Lido uma vez por carga da página: é o que permite o "bom te ver de volta". `null` quando não
 * dá para saber (primeira vez, navegação privada).
 */
function diasDesdeAUltimaVisita(userId: number): number | null {
  const chave = `liff-go-visto-${userId}`;
  try {
    const antes = Number(window.localStorage.getItem(chave));
    window.localStorage.setItem(chave, String(Date.now()));
    return antes > 0 ? Math.floor((Date.now() - antes) / 86400000) : null;
  } catch {
    return null;
  }
}

/** Etapas que o resumo de status reporta quando a pessoa ainda não escolheu: tudo menos Prospecção e Lost. */
const ETAPAS_DO_RESUMO_PADRAO: string[] = STAGE_KEYS.filter((k) => k !== "prospeccao" && k !== "lost");

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

/**
 * A busca sobrevive à troca de tela. Cada clique no menu remonta este componente (a rota é
 * dinâmica e a página é renderizada de novo), e o estado local voltaria vazio: guardar aqui,
 * no módulo, mantém o termo enquanto a aba estiver aberta. Recarregar a página limpa, de
 * propósito — busca é coisa do momento, não preferência do perfil.
 */
let buscaGuardada = "";

export default function Ops({ rotaInicial }: { rotaInicial: Rota }) {
  const router = useRouter();
  const [estado, setEstado] = useState<State | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [theme, trocarTema] = useTheme();

  const [view, setView] = useState(rotaInicial.view);
  const [area, setArea] = useState("all");
  // Densidade do kanban comercial: card completo (padrão) ou compacto, guardada no perfil.
  const [densidade, setDensidade] = useState<"completo" | "compacto">("completo");
  // Ordem dos cards dentro das colunas dos dois kanbans. "antigos" é a ordem em que os
  // cards sempre apareceram (pelo número), por isso é o padrão de quem nunca escolheu.
  const [ordemCards, setOrdemCards] = useState<OrdemCards>("antigos");
  // Cronograma: agenda da semana (padrão) ou a lista por semana.
  const [exibicaoCronograma, setExibicaoCronograma] = useState<"agenda" | "lista">("agenda");
  // Colunas recolhidas de cada kanban, guardadas no perfil como a densidade.
  const [recolhidas, setRecolhidas] = useState<{ comercial: string[]; operacoes: string[] }>({ comercial: [], operacoes: [] });
  // Lateral recolhida mostra só os ícones. Só vale na tela larga: abaixo de 860px a lateral é
  // gaveta, sempre aberta por inteiro (o CSS ignora o atributo lá).
  const [recolhida, setRecolhida] = useState(false);
  // Busca por termo do Comercial, Operações, Cronograma e Auditoria. Uma só para as quatro:
  // procurar "Ambev" no pipeline e ir à auditoria ver o histórico dela é o caminho natural.
  const [busca, setBuscaEstado] = useState(() => buscaGuardada);
  // Auditoria: até 10.000 linhas, buscadas só quando a tela abre (e de novo quando alguém
  // grava algo). Moram aqui, e não na tela, porque o filtro Quem do cabeçalho precisa delas.
  const [auditoria, setAuditoria] = useState<{ logs: LinhaAuditoria[] | null; limite: number; falha: string | null }>({
    logs: null,
    limite: 0,
    falha: null,
  });
  const setBusca = useCallback((v: string) => {
    buscaGuardada = v;
    setBuscaEstado(v);
  }, []);
  // Filtro de responsável, paralelo ao de área: um recorta o produto, o outro recorta a
  // carteira. Combinam — "só os meus" dentro de Tax é uma pergunta legítima.
  const [responsaveis, setResponsaveis] = useState<string[]>([]);
  const [cadTab, setCadTab] = useState<string>(rotaInicial.tab ?? "pessoas");
  // Produto ou pessoa aberto para edição/exclusão em Cadastros (só administração).
  const [cadEditando, setCadEditando] = useState<{ tipo: "produto"; id: string } | { tipo: "pessoa"; id: number } | null>(null);
  const [waAberto, setWaAberto] = useState(false);
  // O "agora" da saudação: fixado quando a página carrega, para a frase não mudar no meio do uso.
  const [agoraMs] = useState(() => Date.now());
  // Dias fora, para a saudação da home. Lido uma vez, quando se sabe quem é a pessoa.
  const [diasFora, setDiasFora] = useState<number | null>(null);
  const idDeQuemOlha = estado?.me.id;
  useEffect(() => {
    if (idDeQuemOlha === undefined) return;
    const dias = diasDesdeAUltimaVisita(idDeQuemOlha);
    // Atualiza depois do efeito, e só se há o que dizer: evita um render a mais no caso comum.
    if (dias !== null && dias >= 3) window.setTimeout(() => setDiasFora(dias), 0);
  }, [idDeQuemOlha]);
  const [waArea, setWaArea] = useState("all");
  // Etapas do funil que entram no resumo. O padrão deixa de fora Prospecção (ainda não houve
  // conversa) e Lost; a escolha fica no perfil, como as outras preferências.
  const [waEtapas, setWaEtapas] = useState<string[]>(ETAPAS_DO_RESUMO_PADRAO);
  const [copiado, setCopiado] = useState(false);
  const [criando, setCriando] = useState<null | "atividade" | "oportunidade">(null);
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
        const { tema, area: areaSalva, responsaveis: respSalvos, densidade: densSalva, menu: menuSalvo } = s.me.preferencias ?? {};
        if (densSalva === "compacto") setDensidade("compacto");
        if (s.me.preferencias?.cronograma === "lista") setExibicaoCronograma("lista");
        const ordemSalva = s.me.preferencias?.ordemCards;
        if (ORDENS_CARDS.some((o) => o.id === ordemSalva)) setOrdemCards(ordemSalva as OrdemCards);
        // Chave que deixou de existir (estágio renomeado) é descartada na leitura.
        const ler = (v: string | undefined, validas: readonly string[]) => (v ?? "").split(",").filter((c) => validas.includes(c));
        setRecolhidas({
          comercial: ler(s.me.preferencias?.recolhidasComercial, STAGE_KEYS),
          operacoes: ler(s.me.preferencias?.recolhidasOperacoes, STATUS_KEYS),
        });
        if (menuSalvo === "recolhido") setRecolhida(true);
        // Só troca o padrão se a pessoa já escolheu alguma vez (a chave existe, mesmo vazia).
        if (s.me.preferencias?.resumoEtapas !== undefined) setWaEtapas(ler(s.me.preferencias.resumoEtapas, STAGE_KEYS));
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
  // Visita: avisa ao abrir e, enquanto a pessoa mexe na tela, no máximo uma vez a cada 5
  // minutos. É o servidor que decide se isso abre uma visita nova no changelog (mais de 30
  // minutos sem atividade) — aba aberta e esquecida não manda nada e não conta como uso.
  const viewAtual = useRef(view);
  useEffect(() => {
    viewAtual.current = view;
  }, [view]);
  useEffect(() => {
    let ultimo = 0;
    const avisar = () => {
      const agora = Date.now();
      if (agora - ultimo < 5 * 60 * 1000) return;
      ultimo = agora;
      void api.visita(viewAtual.current).catch(() => {});
    };
    avisar();
    window.addEventListener("pointerdown", avisar);
    window.addEventListener("keydown", avisar);
    return () => {
      window.removeEventListener("pointerdown", avisar);
      window.removeEventListener("keydown", avisar);
    };
  }, []);

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
  const lembrar = useCallback((patch: Parameters<typeof api.salvarPreferencias>[0]) => {
    void api.salvarPreferencias(patch).catch(() => {});
  }, []);

  const alternarColuna = useCallback(
    (quadro: "comercial" | "operacoes", chave: string) => {
      const atual = recolhidas[quadro];
      const nova = atual.includes(chave) ? atual.filter((c) => c !== chave) : [...atual, chave];
      setRecolhidas({ ...recolhidas, [quadro]: nova });
      lembrar(quadro === "comercial" ? { recolhidasComercial: nova.join(",") } : { recolhidasOperacoes: nova.join(",") });
    },
    [recolhidas, lembrar]
  );

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

    // Busca por termo, somada aos filtros acima. Só para as telas que têm o campo: o painel
    // inicial continua mostrando o recorte inteiro.
    const termo = prepararBusca(busca);
    const rotuloProduto = (id: string | null) => (id ? estado.produtos.find((p) => p.id === id)?.label ?? id : null);
    const oportunidadesBuscadas = aplicarBusca(oportunidades, termo, (d) => [
      d.ref, d.conta, d.situacao, d.proximoPasso, d.blocker, d.responsavel, d.responsavelTexto, d.contato,
      d.dor, d.erp, d.notas, d.propostaUrl, ...d.modulos.map(rotuloProduto),
    ]);
    const atividadesBuscadas = aplicarBusca(atividades, termo, (a) => [
      a.ref, a.titulo, a.situacao, a.proximoPasso, a.responsavel, a.oportunidadeRef, a.oportunidadeConta,
      rotuloProduto(a.produtoId),
    ]);
    const logs = estado.logs.filter((l) => areaEfetiva === "all" || l.area === areaEfetiva);
    const areasVisiveis = todasAreas().filter((a) => estado.areasVisiveis.includes(a.id));
    /**
     * Painel inicial, no desenho novo. Tudo deriva do que já vem em `/api/state` — nenhuma
     * consulta nova: o recorte por permissão já aconteceu no servidor.
     */
    const me = estado.me;
    const abertas = atividades.filter((a) => a.status !== "concluido");
    // Os grandes números e os gráficos do painel são calculados no próprio Painel.tsx.

    // Saudação e linha do dia (lib/saudacao.ts). Os fatos saem do estado INTEIRO, não do
    // recorte dos filtros do cabeçalho: "o que vence hoje para você" não muda com o filtro.
    const agora = new Date(agoraMs);
    const hojeLocal = diaISO(agora);
    const amanhaLocal = diaISO(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1));
    const prazos = [
      ...estado.activities.filter((a) => a.status !== "concluido").map((a) => ({ meu: a.responsavelId === me.id, prazo: a.prazo })),
      ...estado.deals.filter((d) => estagioEmAberto(d.estagio)).map((d) => ({ meu: d.responsavelId === me.id, prazo: d.proximoPassoEm })),
    ];
    const conta = (meu: boolean | null, teste: (p: string) => boolean) =>
      prazos.filter((x) => (meu === null || x.meu === meu) && !!x.prazo && teste(x.prazo.slice(0, 10))).length;
    const ha48h = agoraMs - 48 * 3600 * 1000;
    const ganhosRecentes = [
      ...new Set(
        estado.logs
          .filter((l) => / para Ganho$/.test(l.texto) && Date.parse(l.criadoEm) >= ha48h)
          .map((l) => estado.deals.find((d) => d.ref === l.entidade && d.estagio === "ganho")?.conta)
          .filter((c): c is string => !!c)
      ),
    ];
    const saudacao = saudar(me.nome.split(" ")[0], me.id, agora, {
      ganhosRecentes,
      diasFora,
      meus: {
        vencidos: conta(true, (p) => p < hojeLocal),
        hoje: conta(true, (p) => p === hojeLocal),
        amanha: conta(true, (p) => p === amanhaLocal),
        abertos: prazos.filter((x) => x.meu).length,
      },
      time: { vencidos: conta(null, (p) => p < hojeLocal), hoje: conta(null, (p) => p === hojeLocal) },
    });

    const painel: PainelDados = {
      saudacao,

      // Atrasadas primeiro, depois por proximidade do prazo. Seis linhas: o painel responde
      // "o que exige atenção agora", e uma lista longa deixaria de responder isso.
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


      // Na home, só o que mexeu num card do kanban comercial (C-) ou operacional (T-); as
      // formas antigas D- e A- contam. Cadastros, organizações, receita e o resto ficam no
      // changelog completo.
      logs: logs.filter((l) => /^[CTDA]-\d+$/.test(l.entidade)).slice(0, 8),
    };

    const colunasDeal = STAGES.map((s) => {
      const cards = ordenarCards(oportunidadesBuscadas.filter((d) => d.estagio === s.key), ordemCards, (d) => d.conta);
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
      cards: ordenarCards(atividadesBuscadas.filter((a) => a.status === s.key), ordemCards, (a) => a.titulo),
    }));

    return {
      atividades, oportunidades, logs, areasVisiveis, painel, colunasDeal, colunasBoard,
      opcoesResponsavel, atividadesBuscadas, oportunidadesBuscadas,
    };
  }, [estado, areaEfetiva, responsaveis, busca, diasFora, agoraMs, ordemCards]);

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
        head: ["PRODUTO", "SIGLA", "ATIVIDADES"],
        rows: todasAreas().filter((a) => estado.areasVisiveis.includes(a.id)).map((a) => ({
          key: a.id,
          a: "LIFF " + a.label,
          b: a.short,
          c: estado.activities.filter((x) => x.area === a.id).length + " ativas",
        })),
        ph: "Nome do produto",
      };
    }
    return {
      head: ["MÓDULO", "PRODUTO", "OPORTUNIDADES"],
      rows: estado.produtos.map((p) => ({
        key: p.id,
        a: p.label,
        b: areaOf(p.area).label,
        grupo: p.area,
        arquivado: !p.ativo,
        // Na oportunidade o produto virou "módulo de interesse" — uma pode ter vários.
        qtd: estado.deals.filter((d) => d.modulos.includes(p.id)).length,
        c: estado.deals.filter((d) => d.modulos.includes(p.id)).length + " no pipeline",
        abrir: estado.isAdmin ? () => setCadEditando({ tipo: "produto", id: p.id }) : undefined,
      })),
      ph: "Nome do módulo",
    };
  }, [estado, cadTab, acao]);

  // ---------- cronograma ----------
  /**
   * Linha do tempo por semana, e dentro dela por área, misturando oportunidade e atividade.
   *
   * A data vem do próximo passo. Quem não tem data vai para um bloco próprio, "Sem data", no
   * fim: continua visível, sem fingir que alguém marcou um dia.
   *
   * Já concluído e já ganho ficam de fora: cronograma é o que falta fazer.
   */
  const cronograma: Semana[] = useMemo(() => {
    if (!dados) return [];
    const hojeISO = diaISO(new Date());

    type Bruto = { areaId: string; quando: string; semData: boolean; item: Omit<ItemCronograma, "quando" | "semData" | "atrasado"> };
    const brutos: Bruto[] = [];

    for (const d of dados.oportunidadesBuscadas) {
      // Só o que está em aberto tem próximo passo a cumprir: Ganho, On hold e Lost ficam fora.
      if (!estagioEmAberto(d.estagio)) continue;
      const semData = !d.proximoPassoEm;
      brutos.push({
        areaId: d.area,
        quando: d.proximoPassoEm ?? "",
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

    for (const a of dados.atividadesBuscadas) {
      if (a.status === "concluido") continue;
      const semData = !a.proximoPassoEm;
      brutos.push({
        areaId: a.area,
        quando: a.proximoPassoEm ?? "",
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
      const chave = b.semData ? "semdata" : b.quando < hojeISO ? "atrasado" : diaISO(inicioDaSemana(daISO(b.quando)));
      const lista = porSemana.get(chave) ?? [];
      lista.push(b);
      porSemana.set(chave, lista);
    }

    return [...porSemana.entries()]
      .sort(([x], [y]) => (x === "atrasado" || y === "semdata" ? -1 : y === "atrasado" || x === "semdata" ? 1 : x.localeCompare(y)))
      .map(([chave, lista]) => {
        const porArea = new Map<string, Bruto[]>();
        for (const b of lista) {
          const atual = porArea.get(b.areaId) ?? [];
          atual.push(b);
          porArea.set(b.areaId, atual);
        }
        return {
          chave,
          titulo: chave === "atrasado" ? "ATRASADO" : chave === "semdata" ? "SEM DATA" : `SEMANA DE ${rotuloDaSemana(chave).split(" a ")[0]}`,
          rotulo: chave === "atrasado" ? "próximo passo com data já vencida" : chave === "semdata" ? "próximo passo sem dia marcado" : rotuloDaSemana(chave),
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
                  quando: b.semData ? "—" : ddmm(b.quando),
                  semData: b.semData,
                  atrasado: !b.semData && b.quando < hojeISO,
                })),
            }))
            .sort((x, y) => porTexto(x.label, y.label)),
        };
      });
  }, [dados]);

  /** Os mesmos itens, soltos, para a agenda da semana. */
  const itensAgenda: ItemAgenda[] = useMemo(() => {
    if (!dados) return [];
    const lista: ItemAgenda[] = [];
    for (const d of dados.oportunidadesBuscadas) {
      if (!estagioEmAberto(d.estagio)) continue;
      lista.push({
        ref: d.ref, id: d.id, tipo: "oportunidade", titulo: d.conta,
        passo: resumirPasso(d.proximoPasso, 90),
        meta: [stageLabel(d.estagio), d.responsavel].filter(Boolean).join(" · "),
        areaLabel: areaOf(d.area).label, cor: areaOf(d.area).color,
        quando: d.proximoPassoEm, podeEditar: d.podeEditar,
      });
    }
    for (const a of dados.atividadesBuscadas) {
      if (a.status === "concluido") continue;
      lista.push({
        ref: a.ref, id: a.id, tipo: "atividade", titulo: a.titulo,
        passo: resumirPasso(a.proximoPasso, 90),
        meta: ["Tarefa", a.responsavel].filter(Boolean).join(" · "),
        areaLabel: areaOf(a.area).label, cor: areaOf(a.area).color,
        quando: a.proximoPassoEm, podeEditar: a.podeEditar,
      });
    }
    return lista.sort((x, y) => porTexto(x.titulo, y.titulo));
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

    // Só as etapas escolhidas no próprio resumo. Prospecção, por exemplo, costuma ficar de fora.
    const reportados = deals.filter((x) => waEtapas.includes(x.estagio));
    if (reportados.length) {
      const abertos = reportados.filter((x) => estagioEmAberto(x.estagio));
      const todasAbertas = STAGE_KEYS.filter((k) => estagioEmAberto(k));
      const fora = todasAbertas.filter((k) => !waEtapas.includes(k));
      // Sem nenhuma de fora é o pipeline aberto inteiro; só sem Prospecção é o que está em
      // negociação; qualquer outro recorte diz as etapas, para o número não enganar.
      const recorte =
        fora.length === 0
          ? "Pipeline aberto"
          : fora.length === 1 && fora[0] === "prospeccao"
            ? "Pipeline em negociação"
            : `Pipeline (${todasAbertas.filter((k) => waEtapas.includes(k)).map(stageLabel).join(", ")})`;
      L.push("*Comercial*");
      if (abertos.length) {
        L.push(`- ${recorte}: ${brl(abertos.reduce((s, x) => s + x.valorCentavos, 0))} em ${abertos.length} oportunidades`);
      }
      const ganhos = reportados.filter((x) => x.estagio === "ganho");
      if (ganhos.length) L.push(`- Ganhos no período: ${ganhos.map((g) => g.conta).join(", ")}`);
      // On hold saiu do pipeline aberto, mas não pode sumir do resumo: foi decisão de esperar,
      // e quem lê precisa saber o que está esperando.
      const emEspera = reportados.filter((x) => x.estagio === "on_hold");
      if (emEspera.length) L.push(`- On hold: ${emEspera.map((x) => x.conta).join(", ")}`);
      const perdidas = reportados.filter((x) => x.estagio === "lost");
      if (perdidas.length) L.push(`- Lost: ${perdidas.map((x) => x.conta).join(", ")}`);

      // As oportunidades abertas das etapas escolhidas, do fim do funil para o começo.
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
    L.push(`Reportado por ${estado.me.nome} via LIFF go`);
    return L.join("\n");
  }, [estado, waArea, waEtapas]);

  // Tela só de admin aberta por quem não é (link colado, estado antigo): volta para o início,
  // em vez de mostrar o título da tela sobre o conteúdo de outra.
  const soAdminSemPermissao = !!estado && !estado.isAdmin && NAV.some((n) => n.key === view && "soAdmin" in n);
  // Só troca a URL (sistema externo); a tela acompanha a rota pelo ajuste feito no render.
  useEffect(() => {
    if (soAdminSemPermissao) router.replace("/");
  }, [soAdminSemPermissao, router]);

  const ultimoLog = estado?.logs[0]?.id;
  useEffect(() => {
    if (view !== "auditoria") return;
    let vivo = true;
    api.auditoria().then(
      (r) => vivo && setAuditoria({ logs: r.logs, limite: r.limite, falha: null }),
      (e: unknown) =>
        vivo &&
        setAuditoria((a) => ({ ...a, falha: e instanceof Error ? e.message : "Não foi possível carregar o changelog." }))
    );
    return () => {
      vivo = false;
    };
  }, [view, ultimoLog]);

  /** Quem fez as alterações, no recorte de produto: as opções do filtro Quem na Auditoria. */
  const opcoesAutores = useMemo(() => {
    const acc = new Map<string, { chave: string; label: string; qtd: number; cadastrada: boolean }>();
    for (const l of auditoria.logs ?? []) {
      if (areaEfetiva !== "all" && l.area !== areaEfetiva) continue;
      const chave = l.autorId == null ? CHAVE_SEM_RESPONSAVEL : `u:${l.autorId}`;
      const o = acc.get(chave);
      if (o) o.qtd++;
      else acc.set(chave, { chave, label: l.autorId == null ? "sistema" : l.autor, qtd: 1, cadastrada: l.autorId != null });
    }
    return [...acc.values()].sort(
      (a, b) => Number(b.cadastrada) - Number(a.cadastrada) || a.label.localeCompare(b.label, "pt-BR")
    );
  }, [auditoria.logs, areaEfetiva]);

  if (erro && !estado) return <Aviso>{erro}</Aviso>;
  if (!estado || !dados || !cadSet) return <Aviso>carregando…</Aviso>;

  const me = estado.me;
  // Modo "ver como": admin olhando o sistema com outro papel (o servidor responde como ele).
  const simulando = me.papelReal === "admin" && me.papel !== "admin";
  const verComo = async (papel: string) => {
    try {
      await api.verComo(papel === "admin" ? null : papel);
      // Recarrega tudo: menus, dados e permissões mudam com o papel.
      window.location.assign(papel === "admin" ? window.location.pathname : "/");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível trocar o papel.");
    }
  };
  // Cadastros (que inclui pessoas e permissões) é configuração do sistema — as rotas já exigem
  // admin, e deixar a tela à vista só oferecia caminhos que terminam em 403. No menu, o que é
  // só de admin fica num grupo à parte, no fim.
  const navComum = NAV.filter((n) => !("soAdmin" in n));
  const navAdmin = estado.isAdmin ? NAV.filter((n) => "soAdmin" in n) : [];
  const chips = [{ id: "all", label: "Todas", color: C.dust }, ...dados.areasVisiveis];
  // Só oferece criar nas áreas onde a pessoa realmente escreve.
  const areasEditaveis = dados.areasVisiveis.filter((a) => estado.perms[a.id] === "edit");
  const pessoasAtivas = estado.pessoas.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome }));


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
  const rotuloArea = areaEfetiva === "all" ? "todos os produtos" : areaOf(areaEfetiva).label;
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
      return <Painel
          dados={dados.painel}
          atividades={dados.atividades}
          oportunidades={dados.oportunidades}
          todasOportunidades={estado.deals}
          meId={me.id}
          isAdmin={estado.isAdmin}
          area={areaEfetiva}
          gatilho={estado.logs[0]?.id}
          onAbrirAtividade={(ref) => navegar({ view: "operacoes", ref })}
          onAbrirDeal={(ref) => navegar({ view: "comercial", ref })}
          onIr={(v) => navegar({ view: v })}
        />;
    }
    switch (view) {
      case "comercial":
        return (
          <Comercial
            colunas={dados.colunasDeal}
            recolhidas={recolhidas.comercial}
            onRecolher={(c) => alternarColuna("comercial", c)}
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
            recolhidas={recolhidas.operacoes}
            onRecolher={(c) => alternarColuna("operacoes", c)}
            produtos={estado.produtos}
            onSoltar={(id, status) => void acao(() => api.alterarAtividade(id, { status }))}
            onAbrir={(id) => {
              const a = estado.activities.find((x) => x.id === id);
              if (a) navegar({ view: "operacoes", ref: a.ref });
            }}
          />
        );
      case "cronograma": {
        const abrir = (ref: string, tipo: "oportunidade" | "atividade") =>
          navegar({ view: tipo === "oportunidade" ? "comercial" : "operacoes", ref });
        const lista = <Cronograma semanas={cronograma} onAbrir={abrir} />;
        if (exibicaoCronograma === "lista") return lista;
        return (
          <>
            <div className="liff-so-largo">
              <Agenda
                itens={itensAgenda}
                onAbrir={abrir}
                onReagendar={(item, quando) =>
                  void acao(() =>
                    item.tipo === "oportunidade"
                      ? api.alterarOportunidade(item.id, { proximoPassoEm: quando })
                      : api.alterarAtividade(item.id, { proximoPassoEm: quando })
                  )
                }
              />
            </div>
            <div className="liff-so-estreito">{lista}</div>
          </>
        );
      }
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
            onPapelPessoas={(usuarios, papel) =>
              void acao(async () => {
                // Uma chamada por pessoa: cada troca de papel tem a sua linha no changelog.
                for (const id of usuarios) await api.alterarPessoa(id, { papel });
              })
            }
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
              if (!window.confirm(`Excluir o produto ${label}? As permissões nele também caem.`)) return;
              void acao(() => api.excluirArea(id));
            }}
          />
          </>
        );
      }
      case "receita":
        return (
          <Receita
            deals={estado.deals}
            area={areaEfetiva}
            gatilho={estado.logs[0]?.id}
            podeEditar={estado.isAdmin}
            onAbrirDeal={(ref) => navegar({ view: "comercial", ref })}
          />
        );
      case "clientes":
        return (
          <Clientes
            deals={estado.deals}
            area={areaEfetiva}
            busca={busca}
            gatilho={estado.logs[0]?.id}
            isAdmin={estado.isAdmin}
            podeCriar={estado.isAdmin || areasEditaveis.length > 0}
            onAbrirDeal={(ref) => navegar({ view: "comercial", ref })}
          />
        );
      case "faturamento":
        return <Faturamento deals={estado.deals} area={areaEfetiva} busca={busca} gatilho={estado.logs[0]?.id} />;
      case "funding":
        return <Funding gatilho={estado.logs[0]?.id} />;
      case "auditoria":
        return <Auditoria
            todas={auditoria.logs}
            limite={auditoria.limite}
            falha={auditoria.falha}
            area={areaEfetiva}
            busca={busca}
            autores={responsaveis}
          />;
      case "conexoes":
        return <Conexoes mcpHabilitado={estado.mcpHabilitado} />;
      default:
        return <Painel
          dados={dados.painel}
          atividades={dados.atividades}
          oportunidades={dados.oportunidades}
          todasOportunidades={estado.deals}
          meId={me.id}
          isAdmin={estado.isAdmin}
          area={areaEfetiva}
          gatilho={estado.logs[0]?.id}
          onAbrirAtividade={(ref) => navegar({ view: "operacoes", ref })}
          onAbrirDeal={(ref) => navegar({ view: "comercial", ref })}
          onIr={(v) => navegar({ view: v })}
        />;
    }
  };

  return (
    <div className="liff-shell" data-menu={menuAberto ? "aberto" : "fechado"} data-lateral={recolhida ? "recolhida" : "expandida"}>
      <CoresDasAreas areas={estado.areas} />

      {/* Fundo da gaveta: fecha ao tocar fora, que é o gesto esperado no celular. */}
      {menuAberto && (
        <div className="liff-menu-fundo" onClick={() => setMenuAberto(false)} aria-hidden="true" />
      )}

      {/* ---- barra lateral ---- */}
      <aside className="liff-aside">
        <div className="liff-aside-topo">
          <div className="liff-so-expandida" style={{ minWidth: 0 }}>
            <LiffSig name="go" size={24} tone={markTone(theme)} />
            <div style={{ ...eyebrow(10, C.faint, "0.18em"), marginTop: 12 }}>GESTÃO ORGANIZACIONAL</div>
          </div>
          <button
            type="button"
            className="liff-recolher"
            onClick={() => {
              const nova = !recolhida;
              setRecolhida(nova);
              lembrar({ menu: nova ? "recolhido" : "expandido" });
            }}
            aria-label={recolhida ? "Expandir o menu" : "Recolher o menu"}
            aria-expanded={!recolhida}
            title={recolhida ? "Expandir o menu" : "Recolher o menu"}
          >
            <IconeRecolher recolhido={recolhida} />
          </button>
        </div>

        <nav style={{ display: "flex", flexDirection: "column" }}>
          {[navComum, navAdmin].map((grupo, gi) =>
            grupo.length === 0 ? null : (
              <Fragment key={gi}>
                {gi > 0 && (
                  <div className="liff-nav-grupo" aria-hidden>
                    <span className="liff-so-expandida" style={eyebrow(9, C.faint, "0.16em")}>só admin</span>
                  </div>
                )}
                {grupo.map((n) => {
                  const on = view === n.key;
                  return (
                    <a
                      key={n.key}
                      href={caminhoDe({ view: n.key, tab: n.key === "cadastros" ? cadTab : undefined })}
                      className="liff-nav-item"
                      aria-current={on ? "page" : undefined}
                      // Recolhida, o rótulo some: o nome fica no title (e no aria-label, que o
                      // leitor de tela já leria do texto escondido só por CSS).
                      title={recolhida ? n.label : undefined}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        navegar({ view: n.key, tab: n.key === "cadastros" ? cadTab : undefined });
                        // Escolher um item é a razão de a gaveta existir; ela se fecha sozinha.
                        setMenuAberto(false);
                      }}
                      style={{
                        ...eyebrow(12, on ? C.ink : C.dust, "0.1em"),
                        borderLeft: `2px solid ${on ? C.accent : "transparent"}`,
                        background: on ? C.panel : "transparent",
                        color: on ? C.ink : C.dust,
                      }}
                    >
                      <span className="liff-nav-icone" style={{ color: on ? C.accent : undefined }}>
                        <IconeMenu chave={n.key} />
                      </span>
                      <span className="liff-nav-rotulo liff-so-expandida">{n.label}</span>
                    </a>
                  );
                })}
              </Fragment>
            )
          )}
        </nav>

        <div className="liff-aside-rodape">
          {/* Recolhida: tema e sair viram botões de ícone. Expandida, o de sempre. */}
          <div className="liff-so-recolhida liff-aside-icones">
            <button
              type="button"
              className="liff-recolher"
              onClick={() => trocarTemaSalvando(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Usar fundo claro" : "Usar fundo escuro"}
              title={theme === "dark" ? "Usar fundo claro" : "Usar fundo escuro"}
            >
              {theme === "dark" ? <IconeSol /> : <IconeLua />}
            </button>
            <div style={avatarStyle(32)} title={`${me.nome} · ${me.papel}`}>
              {me.iniciais}
            </div>
            <button
              type="button"
              className="liff-recolher"
              onClick={() =>
                void api.sair().then(() => {
                  window.location.href = "/login";
                })
              }
              aria-label="Sair"
              title="Sair"
            >
              <IconeSair />
            </button>
          </div>

          <div className="liff-so-expandida">
            <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
              {/* Pessoa, tema e sair numa linha só: tema e sair são ícones discretos, como no
                  menu recolhido. O sol aparece no tema escuro (leva ao claro) e a lua no claro. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={avatarStyle(32)}>{me.iniciais}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.nome}</div>
                  <div style={eyebrow(10, simulando ? C.warning : C.faint, "0.1em")}>{simulando ? `vendo como ${me.papel}` : me.papel}</div>
                </div>
                <button
                  type="button"
                  className="liff-recolher"
                  onClick={() => trocarTemaSalvando(theme === "dark" ? "light" : "dark")}
                  aria-label={theme === "dark" ? "Usar fundo claro" : "Usar fundo escuro"}
                  title={theme === "dark" ? "Usar fundo claro" : "Usar fundo escuro"}
                >
                  {theme === "dark" ? <IconeSol /> : <IconeLua />}
                </button>
                <button
                  type="button"
                  className="liff-recolher"
                  onClick={() =>
                    void api.sair().then(() => {
                      window.location.href = "/login";
                    })
                  }
                  aria-label="Sair"
                  title="Sair"
                >
                  <IconeSair />
                </button>
              </div>
              {/* Só para quem é admin de verdade: olhar o sistema com outro papel, para conferir o
                  que cada perfil enxerga. O servidor passa a responder como aquele papel. */}
              {me.papelReal === "admin" && (
                <div style={{ marginTop: 12 }}>
                  <SeletorArea
                    prefixo="ver como"
                    larguraTotal
                    larguraMin={0}
                    paraCima
                    opcoes={[
                      { id: "admin", label: "admin" },
                      { id: "gestor", label: "gestor" },
                      { id: "membro", label: "membro" },
                      { id: "leitura", label: "leitura" },
                    ]}
                    valor={simulando ? me.papel : "admin"}
                    onChange={(v) => void verComo(v)}
                  />
                </div>
              )}
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
              border: `1px solid ${C.line}`, borderRadius: R,
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
                ? "LIFF/ MCP SERVER"
                : `LIFF/ ${view === "overview" ? "PAINEL" : (NAV.find((n) => n.key === view)?.label ?? view).toUpperCase()} · ${rotuloArea.toUpperCase()}`}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink }}>{TITLES[view]}</div>
          </div>

          {/* Os dois filtros do cabeçalho moram juntos: área recorta o produto, "meus"
              recorta a carteira. Separá-los faria parecer que um é filtro e o outro é modo. */}
          <div className="liff-filtros" style={{ marginLeft: "auto" }}>
            {["comercial", "operacoes", "cronograma", "auditoria", "faturamento", "clientes"].includes(view) && (
              <CampoBusca valor={busca} onChange={setBusca} />
            )}
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
            {["overview", "comercial", "operacoes", "cronograma", "auditoria"].includes(view) && (() => {
              // Na Auditoria, Quem é o autor da alteração; nas outras telas, o responsável.
              const opcoes = view === "auditoria" ? opcoesAutores : dados.opcoesResponsavel;
              return (
                <SeletorResponsaveis
                  className="liff-filtro-quem"
                  opcoes={opcoes}
                  selecao={responsaveis}
                  onChange={trocarResponsaveis}
                  chaveDoUsuario={opcoes.some((o) => o.chave === `u:${estado.me.id}`) ? `u:${estado.me.id}` : undefined}
                />
              );
            })()}
          </div>

          {/* As ações ficam num grupo próprio para quebrarem juntas quando o cabeçalho
              não couber, em vez de uma delas cair sozinha para a linha de baixo. */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: "auto" }}>
            {view === "cronograma" && (
              <div role="group" aria-label="Exibição do cronograma" className="liff-densidade liff-so-largo">
                {(["agenda", "lista"] as const).map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={exibicaoCronograma === e}
                    onClick={() => {
                      setExibicaoCronograma(e);
                      lembrar({ cronograma: e });
                    }}
                  >
                    {e === "agenda" ? "Agenda" : "Lista"}
                  </button>
                ))}
              </div>
            )}
            {/* Ordem dos cards nas colunas, a mesma nos dois kanbans. Fica no perfil. */}
            {["operacoes", "comercial"].includes(view) && (
              <SeletorArea
                titulo="Ordenar por"
                icone={
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4.5 13V3M2 5.5L4.5 3 7 5.5M9.5 4h4.5M9.5 8h3.2M9.5 12h1.8" />
                  </svg>
                }
                opcoes={ORDENS_CARDS}
                valor={ordemCards}
                onChange={(o) => {
                  const nova = (ORDENS_CARDS.find((x) => x.id === o)?.id ?? "antigos") as OrdemCards;
                  setOrdemCards(nova);
                  lembrar({ ordemCards: nova });
                }}
              />
            )}

            {/* Densidade do kanban comercial. Fica no perfil: abre do jeito que a pessoa deixou. */}
            {view === "comercial" && (
              <SeletorArea
                prefixo="card"
                larguraMin={0}
                opcoes={[
                  { id: "completo", label: "Completo" },
                  { id: "compacto", label: "Compacto" },
                ]}
                valor={densidade}
                onChange={(d) => {
                  const nova = d === "compacto" ? "compacto" : "completo";
                  setDensidade(nova);
                  lembrar({ densidade: nova });
                }}
              />
            )}

            {/* Criar aparece onde a coisa vive: atividade no quadro operacional,
                oportunidade no pipeline. Desabilita quando não há produto com permissão de
                edição — o servidor recusaria de todo jeito. */}
            {["operacoes", "comercial"].includes(view) && (
              <Button
                variant="solid"
                size="sm"
                disabled={areasEditaveis.length === 0}
                title={
                  areasEditaveis.length === 0 ? "Você não tem permissão de edição em nenhum produto" : undefined
                }
                onClick={() => {
                  setErroForm(null);
                  setCriando(view === "comercial" ? "oportunidade" : "atividade");
                }}
              >
                + card
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setWaArea(area);
                setCopiado(false);
                setWaAberto(true);
              }}
            >
              resumo
            </Button>
          </div>
        </header>

        <main className="liff-main">
          {simulando && (
            <div
              role="status"
              style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16, padding: "10px 14px",
                border: `1px solid ${C.warning}`, borderRadius: R, background: "color-mix(in srgb, var(--liff-warning) 10%, transparent)",
                fontSize: 13, color: C.ink,
              }}
            >
              <span>
                Você está vendo o sistema como <strong>{me.papel}</strong>. Os dados, os menus e o que dá para editar são os
                desse papel; o que você gravar agora vale de verdade e fica no seu nome.
              </span>
              <button type="button" className="rec-link" style={{ marginLeft: "auto" }} onClick={() => void verComo("admin")}>
                voltar a admin
              </button>
            </div>
          )}
          {aviso && (
            <div
              onClick={() => setAviso(null)}
              style={{
                border: `1px solid ${C.success}`, borderRadius: R,
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
                border: `1px solid ${C.warning}`, borderRadius: R,
                color: C.warning,
                fontFamily: "var(--liff-font-mono)",
                fontSize: 12,
                padding: "10px 14px",
                marginBottom: 18,
                lineHeight: 1.6,
              }}
            >
              Não encontrei {refAberta}. O registro pode ter sido excluído, ou estar num produto
              fora do seu acesso.
            </div>
          )}
          {erro && (
            <div
              style={{
                border: `1px solid ${C.error}`, borderRadius: R,
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
                `Excluir a atividade "${selecionadaObj.titulo}"?\n\nO card e seus campos somem. O histórico de alterações continua no changelog.`
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
          organizacoes={estado.organizacoes}
            arquetipos={estado.arquetipos}
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
          organizacoes={estado.organizacoes}
            arquetipos={estado.arquetipos}
          inicial={dealEmEdicao}
          tarefas={estado.activities.filter((a) => a.oportunidadeId === dealEmEdicao.id)}
          onAbrirTarefa={(ref) => navegar({ view: "operacoes", ref })}
          onExcluir={() => {
            if (
              !window.confirm(
                `Excluir a oportunidade ${dealEmEdicao.conta}?\n\nO card e seus campos somem. O histórico de alterações continua no changelog.`
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


      {waAberto && (
        <WaModal
          tabs={[{ id: "all", label: "Geral", color: C.dust }, ...dados.areasVisiveis.map((a) => ({ id: a.id, label: a.label, color: a.color }))]}
          areaAtiva={waArea}
          etapas={waEtapas}
          onEtapa={(k) => {
            const nova = waEtapas.includes(k) ? waEtapas.filter((x) => x !== k) : STAGE_KEYS.filter((x) => x === k || waEtapas.includes(x));
            setWaEtapas(nova);
            setCopiado(false);
            lembrar({ resumoEtapas: nova.join(",") });
          }}
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

type OrdemCards = "antigos" | "novos" | "alterados" | "nome";

const ORDENS_CARDS: { id: OrdemCards; label: string }[] = [
  { id: "antigos", label: "Mais antigos" },
  { id: "novos", label: "Mais novos" },
  { id: "alterados", label: "Última alteração" },
  { id: "nome", label: "Nome (A–Z)" },
];

/** Ordena os cards de uma coluna. Empate cai sempre no número do card, para a ordem não dançar. */
function ordenarCards<T extends { ref: string; criadoEm: string; atualizadoEm: string }>(
  cards: T[],
  ordem: OrdemCards,
  nome: (c: T) => string
): T[] {
  const porRef = (a: T, b: T) => a.ref.localeCompare(b.ref, "pt-BR", { numeric: true });
  const criterio: Record<OrdemCards, (a: T, b: T) => number> = {
    antigos: (a, b) => a.criadoEm.localeCompare(b.criadoEm),
    novos: (a, b) => b.criadoEm.localeCompare(a.criadoEm),
    alterados: (a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm),
    nome: (a, b) => porTexto(nome(a), nome(b)),
  };
  return [...cards].sort((a, b) => criterio[ordem](a, b) || porRef(a, b));
}
