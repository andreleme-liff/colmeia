"use client";

// Casca do sistema: carrega o estado já recortado pela permissão, deriva as visões e
// despacha as alterações. Depois de cada escrita o estado é recarregado do servidor — o
// conjunto é pequeno e assim a tela nunca mostra algo que o banco não confirmou.

import { useCallback, useEffect, useMemo, useState } from "react";
import { LiffMark, Button } from "./ds";
import ThemeToggle from "./ThemeToggle";
import {
  Admin,
  Auditoria,
  Aviso,
  Cadastros,
  Comercial,
  Drawer,
  NovaAtividade,
  FormOportunidade,
  Operacoes,
  Overview,
  WaModal,
  type CadSet,
  type CargaArea,
  type Kpi,
} from "./views";
import { C, GHOST_FIX, avatarStyle, eyebrow, markTone, useTheme, writeTheme, type Theme } from "./tokens";
import CoresDasAreas from "./CoresDasAreas";
import ImportarPlanilha from "./ImportarPlanilha";
import SeletorArea from "./SeletorArea";
import { api, type Activity, type State } from "./api";
import {
  NAV, STAGES, STATUS, TITLES, areaOf, brl, ddmm, setAreas, stageLabel, statusLabel, todasAreas,
} from "@/lib/domain";

const DIAS_CRITICO = 7;

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

export default function Ops() {
  const [estado, setEstado] = useState<State | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [theme, trocarTema] = useTheme();

  const [view, setView] = useState("overview");
  const [area, setArea] = useState("all");
  const [cadTab, setCadTab] = useState<string>("pessoas");
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [waAberto, setWaAberto] = useState(false);
  const [waArea, setWaArea] = useState("all");
  const [copiado, setCopiado] = useState(false);
  const [criando, setCriando] = useState<null | "atividade" | "oportunidade">(null);
  const [editandoDeal, setEditandoDeal] = useState<number | null>(null);
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
        const { tema, area: areaSalva } = s.me.preferencias ?? {};
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

  /** Guarda a escolha no perfil. Falhar aqui não pode atrapalhar a navegação. */
  const lembrar = useCallback((patch: { tema?: string; area?: string }) => {
    void api.salvarPreferencias(patch).catch(() => {});
  }, []);

  const trocarArea = useCallback(
    (id: string) => {
      setArea(id);
      lembrar({ area: id });
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

  const critico = useCallback((a: Activity) => {
    if (a.status === "concluido" || !a.prazo) return false;
    const limite = new Date();
    limite.setDate(limite.getDate() + DIAS_CRITICO);
    return new Date(a.prazo + "T00:00:00") <= limite;
  }, []);

  // ---------- recortes ----------
  const dados = useMemo(() => {
    if (!estado) return null;
    const noEscopo = <T extends { area: string }>(l: T[]) => l.filter((x) => area === "all" || x.area === area);

    const atividades = noEscopo(estado.activities);
    const oportunidades = noEscopo(estado.deals);
    const logs = estado.logs.filter((l) => area === "all" || l.area === area);
    const areasVisiveis = todasAreas().filter((a) => estado.areasVisiveis.includes(a.id));
    const atrasadas = atividades.filter(critico);

    const kpis: Kpi[] = [
      {
        label: "ATIVIDADES ABERTAS",
        value: atividades.filter((a) => a.status !== "concluido").length,
        hint: "no seu escopo",
        color: C.ink,
      },
      {
        label: "EM ANDAMENTO",
        value: atividades.filter((a) => a.status === "andamento").length,
        hint: "execução ativa",
        color: C.info,
      },
      {
        label: "PIPELINE",
        value: brl(oportunidades.filter((d) => d.estagio !== "ganho").reduce((s, d) => s + d.valorCentavos, 0)),
        hint: oportunidades.length + " oportunidades",
        color: C.accent,
      },
      {
        label: "PRAZO CRÍTICO",
        value: atrasadas.length,
        hint: `vencendo em ${DIAS_CRITICO} dias`,
        color: atrasadas.length ? C.error : C.success,
      },
    ];

    const maxCarga = Math.max(
      1,
      ...areasVisiveis.map((a) => estado.activities.filter((x) => x.area === a.id).length)
    );
    const carga: CargaArea[] = areasVisiveis.map((a) => {
      const lista = estado.activities.filter((x) => x.area === a.id);
      const feitas = lista.filter((x) => x.status === "concluido").length;
      return {
        label: a.label,
        color: a.color,
        meta: `${lista.length} ativ. · ${feitas} concluídas`,
        pct: Math.round((lista.length / maxCarga) * 100) + "%",
      };
    });

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

    return { atividades, oportunidades, logs, areasVisiveis, kpis, carga, colunasDeal, colunasBoard };
  }, [estado, area, critico]);

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
        })),
        ph: "Nome completo",
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
        c: estado.deals.filter((d) => d.produtoId === p.id).length + " no pipeline",
      })),
      ph: "Nome do produto",
    };
  }, [estado, cadTab]);

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
      const abertos = deals.filter((x) => x.estagio !== "ganho");
      L.push("*Comercial*");
      L.push(
        `- Pipeline aberto: ${brl(abertos.reduce((s, x) => s + x.valorCentavos, 0))} em ${abertos.length} oportunidades`
      );
      const ganhos = deals.filter((x) => x.estagio === "ganho");
      if (ganhos.length) L.push(`- Ganhos no período: ${ganhos.map((g) => g.conta).join(", ")}`);

      // Todas as oportunidades abertas, do fim do funil para o começo. Antes eram três, de
      // um trecho do funil — quem lia o resumo não tinha como saber que o resto existia.
      // Desempate por valor: dentro do mesmo estágio, primeiro o que pesa mais.
      const posicao = (k: string) => STAGES.findIndex((s) => s.key === k);
      [...abertos]
        .sort((a, b) => posicao(b.estagio) - posicao(a.estagio) || b.valorCentavos - a.valorCentavos)
        .forEach((x) => {
          const partes = [stageLabel(x.estagio), brl(x.valorCentavos)];
          // Pausa é decisão, parada é esquecimento. Só a segunda merece alarme.
          if (x.pausado) partes.push("em pausa");
          else {
            const dias = diasParado(x.atualizadoEm);
            if (dias >= DIAS_SEM_MOVIMENTO) partes.push(`⚠ parada há ${dias}d`);
          }
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
    L.push(`Reportado por ${estado.me.nome} via LIFF Ops`);
    return L.join("\n");
  }, [estado, waArea]);

  if (erro && !estado) return <Aviso>{erro}</Aviso>;
  if (!estado || !dados || !cadSet) return <Aviso>carregando…</Aviso>;

  const me = estado.me;
  // Cadastros e Administração são configuração do sistema — as três rotas de cadastro já
  // exigem admin, e deixar as telas à vista só oferecia caminhos que terminam em 403.
  const SO_ADMIN = ["admin", "cadastros"];
  const nav = NAV.filter((n) => !SO_ADMIN.includes(n.key) || estado.isAdmin);
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
  const rotuloArea = area === "all" ? "todas as áreas" : areaOf(area).label;
  const selecionadaObj = estado.activities.find((a) => a.id === selecionada) ?? null;
  const dealEmEdicao = estado.deals.find((d) => d.id === editandoDeal) ?? null;

  const conteudo = () => {
    // Rede de segurança: o menu já esconde estas telas de quem não é admin, mas um estado
    // antigo não pode virar uma tela vazia sem explicação.
    if (SO_ADMIN.includes(view) && !estado.isAdmin) {
      return <Overview kpis={dados.kpis} carga={dados.carga} logs={dados.logs.slice(0, 6)} />;
    }
    switch (view) {
      case "comercial":
        return (
          <Comercial
            colunas={dados.colunasDeal}
            produtos={estado.produtos}
            onMover={(id, dir) => void acao(() => api.moverOportunidade(id, dir))}
            // Arrastar manda o destino direto: a rota valida o estágio contra STAGE_KEYS e
            // registra o par anterior/novo, igual ao movimento pelas setas.
            onSoltar={(id, estagio) => void acao(() => api.alterarOportunidade(id, { estagio }))}
            onAbrir={(id) => {
              setErroForm(null);
              setEditandoDeal(id);
            }}
          />
        );
      case "operacoes":
        return (
          <Operacoes
            colunas={dados.colunasBoard}
            onSoltar={(id, status) => void acao(() => api.alterarAtividade(id, { status }))}
            onAbrir={setSelecionada}
          />
        );
      case "cadastros":
        return (
          <Cadastros
            tab={cadTab}
            onTab={setCadTab}
            set={cadSet}
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
        );
      case "admin":
        return (
          <Admin
            pessoas={estado.pessoas}
            meuId={me.id}
            onCiclar={(uid, a) => void acao(() => api.ciclarPermissao(uid, a))}
            onAtivo={(uid, v) => void acao(() => api.definirAtivo(uid, v))}
          />
        );
      case "auditoria":
        return <Auditoria logs={dados.logs} />;
      default:
        return <Overview kpis={dados.kpis} carga={dados.carga} logs={dados.logs.slice(0, 6)} />;
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
          {nav.map((n) => {
            const on = view === n.key;
            return (
              <div
                key={n.key}
                className="liff-nav-item"
                onClick={() => {
                  setView(n.key);
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
              {`LIFF/ ${view === "overview" ? "PAINEL" : view.toUpperCase()} · ${rotuloArea.toUpperCase()}`}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink }}>{TITLES[view]}</div>
          </div>

          <div className="liff-area-chips" style={{ marginLeft: "auto" }}>
            <SeletorArea opcoes={chips} valor={area} onChange={trocarArea} />
          </div>

          {/* As ações ficam num grupo próprio para quebrarem juntas quando o cabeçalho
              não couber, em vez de uma delas cair sozinha para a linha de baixo. */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: "auto" }}>
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
          onFechar={() => setSelecionada(null)}
          areasEditaveis={areasEditaveis}
          onArea={(id) => void acao(() => api.alterarAtividade(selecionadaObj.id, { area: id }))}
          onTitulo={(t) => void acao(() => api.alterarAtividade(selecionadaObj.id, { titulo: t }))}
          onStatus={(k) => void acao(() => api.alterarAtividade(selecionadaObj.id, { status: k }))}
          onResponsavel={(id) => void acao(() => api.alterarAtividade(selecionadaObj.id, { responsavelId: id }))}
          onPrioridade={(p) => void acao(() => api.alterarAtividade(selecionadaObj.id, { prioridade: p }))}
          onSituacao={(v) => void acao(() => api.alterarAtividade(selecionadaObj.id, { situacao: v }))}
          onProximo={(v) => void acao(() => api.alterarAtividade(selecionadaObj.id, { proximoPasso: v }))}
        />
      )}

      {criando === "atividade" && (
        <NovaAtividade
          areasEditaveis={areasEditaveis}
          pessoas={pessoasAtivas}
          salvando={salvando}
          erro={erroForm}
          onFechar={() => setCriando(null)}
          onSalvar={(d) => void criar(() => api.criarAtividade(d))}
        />
      )}

      {criando === "oportunidade" && (
        <FormOportunidade
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
          inicial={dealEmEdicao}
          onExcluir={() => {
            if (
              !window.confirm(
                `Excluir a oportunidade ${dealEmEdicao.conta}?\n\nO card e seus campos somem. O histórico de alterações continua na auditoria.`
              )
            )
              return;
            void acao(() => api.excluirOportunidade(dealEmEdicao.id)).then(() => setEditandoDeal(null));
          }}
          areasEditaveis={areasEditaveis}
          pessoas={pessoasAtivas}
          produtos={estado.produtos}
          salvando={salvando}
          erro={erroForm}
          onFechar={() => setEditandoDeal(null)}
          onSalvar={(d) => {
            setSalvando(true);
            setErroForm(null);
            api
              .alterarOportunidade(dealEmEdicao.id, d)
              .then(() => carregar())
              .then(() => setEditandoDeal(null))
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
                      (r.ignoradas.length ? `, ${r.ignoradas.length} ignorada(s)` : "")
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
