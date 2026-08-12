"use client";

// Casca do sistema: carrega o estado já recortado pela permissão, deriva as visões e
// despacha as alterações. Depois de cada escrita o estado é recarregado do servidor — o
// conjunto é pequeno e assim a tela nunca mostra algo que o banco não confirmou.

import { useCallback, useEffect, useMemo, useState } from "react";
import { LiffMark, Button } from "./ds";
import ThemeToggle from "./ThemeToggle";
import {
  Admin,
  Atividades,
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
import { C, GHOST_FIX, avatarStyle, eyebrow, markTone, useTheme } from "./tokens";
import CoresDasAreas from "./CoresDasAreas";
import SeletorArea from "./SeletorArea";
import { api, type Activity, type State } from "./api";
import {
  NAV, STAGES, STATUS, TITLES, areaOf, brl, ddmm, setAreas, stageLabel, statusLabel, todasAreas,
} from "@/lib/domain";

const DIAS_CRITICO = 7;

export default function Ops() {
  const [estado, setEstado] = useState<State | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [theme, trocarTema] = useTheme();

  const [view, setView] = useState("overview");
  const [area, setArea] = useState("all");
  const [cadTab, setCadTab] = useState<string>("oportunidades");
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [waAberto, setWaAberto] = useState(false);
  const [waArea, setWaArea] = useState("all");
  const [copiado, setCopiado] = useState(false);
  const [criando, setCriando] = useState<null | "atividade" | "oportunidade">(null);
  const [editandoDeal, setEditandoDeal] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

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
      },
      (e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Falha ao carregar.");
      }
    );
    return () => {
      vivo = false;
    };
  }, []);

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
        rows: estado.pessoas.map((u) => ({ key: `u${u.id}`, a: u.nome, b: u.papel, c: u.email })),
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
    if (cadTab === "tipos") {
      const conta = (t: string) => estado.activities.filter((x) => x.tipo === t).length + " registros";
      return {
        head: ["TIPO", "FLUXO", "USO"],
        rows: [
          { key: "Comercial", a: "Comercial", b: "Pipeline CRM", c: conta("Comercial") },
          { key: "Operacional", a: "Operacional", b: "Kanban", c: conta("Operacional") },
          { key: "Produto", a: "Produto", b: "Kanban", c: conta("Produto") },
          { key: "Institucional", a: "Institucional", b: "Kanban", c: conta("Institucional") },
        ],
        ph: "Nome do tipo",
      };
    }
    // Não é cadastro de nada: é a lista das oportunidades do CRM, em formato de tabela.
    // Clicar abre o mesmo formulário do card do pipeline.
    return {
      head: ["OPORTUNIDADE", "ÁREA", "RESPONSÁVEL"],
      rows: estado.deals.map((d) => ({
        key: d.ref,
        a: `${d.conta}${d.escopo ? ` · ${d.escopo}` : ""}`,
        b: areaOf(d.area).label,
        c: d.responsavel,
        abrir: d.podeEditar
          ? () => {
              setErroForm(null);
              setEditandoDeal(d.id);
            }
          : undefined,
      })),
      ph: "Razão social",
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
      deals
        .filter((x) => x.estagio === "negociacao" || x.estagio === "proposta")
        .slice(0, 3)
        .forEach((x) => L.push(`- ${x.conta}: ${stageLabel(x.estagio)} - ${brl(x.valorCentavos)} (${x.proximoPasso})`));
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
  const nav = NAV.filter((n) => n.key !== "admin" || estado.isAdmin);
  const contagens: Record<string, number> = {
    atividades: dados.atividades.length,
    comercial: dados.oportunidades.length,
    operacoes: dados.atividades.length,
    auditoria: dados.logs.length,
  };
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
  const rotuloArea = area === "all" ? "todas as áreas" : areaOf(area).label;
  const selecionadaObj = estado.activities.find((a) => a.id === selecionada) ?? null;
  const dealEmEdicao = estado.deals.find((d) => d.id === editandoDeal) ?? null;

  const conteudo = () => {
    switch (view) {
      case "comercial":
        return (
          <Comercial
            colunas={dados.colunasDeal}
            onMover={(id, dir) => void acao(() => api.moverOportunidade(id, dir))}
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
      case "atividades":
        return <Atividades rows={dados.atividades} critico={critico} onAbrir={setSelecionada} />;
      case "cadastros":
        return (
          <Cadastros
            tab={cadTab}
            onTab={setCadTab}
            set={cadSet}
            areaOptions={dados.areasVisiveis.map((a) => a.label)}
            semEdicao={!dados.areasVisiveis.some((a) => estado.perms[a.id] === "edit")}
            areas={estado.areas.filter((a) => estado.areasVisiveis.includes(a.id))}
            contagemPorArea={(id) => estado.activities.filter((x) => x.area === id).length}
            podeEditarAreas={estado.isAdmin}
            salvandoArea={salvando}
            onCorArea={(id, cor) => void acao(() => api.alterarArea(id, { cor }))}
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
    <div className="liff-shell">
      <CoresDasAreas areas={estado.areas} />
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
                onClick={() => setView(n.key)}
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
            <ThemeToggle theme={theme} onChange={trocarTema} />
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
          <div style={{ minWidth: 200 }}>
            <div style={eyebrow(10, C.faint)}>
              {`LIFF/ ${view === "overview" ? "PAINEL" : view.toUpperCase()} · ${rotuloArea.toUpperCase()}`}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink }}>{TITLES[view]}</div>
          </div>

          <div className="liff-area-chips" style={{ marginLeft: "auto" }}>
            <SeletorArea opcoes={chips} valor={area} onChange={setArea} />
          </div>

          {/* As ações ficam num grupo próprio para quebrarem juntas quando o cabeçalho
              não couber, em vez de uma delas cair sozinha para a linha de baixo. */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: "auto" }}>
            {/* Criar aparece onde a coisa vive: atividade em Atividades e no quadro,
                oportunidade no pipeline. Desabilita quando não há área com permissão de
                edição — o servidor recusaria de todo jeito. */}
            {["atividades", "operacoes", "comercial"].includes(view) && (
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
          logs={estado.logs.filter((l) => l.entidade === selecionadaObj.ref)}
          onFechar={() => setSelecionada(null)}
          areasEditaveis={areasEditaveis}
          onArea={(id) => void acao(() => api.alterarAtividade(selecionadaObj.id, { area: id }))}
          onStatus={(k) => void acao(() => api.alterarAtividade(selecionadaObj.id, { status: k }))}
          onResponsavel={(id) => void acao(() => api.alterarAtividade(selecionadaObj.id, { responsavelId: id }))}
          onPrioridade={(p) => void acao(() => api.alterarAtividade(selecionadaObj.id, { prioridade: p }))}
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
          salvando={salvando}
          erro={erroForm}
          onFechar={() => setCriando(null)}
          onSalvar={(d) => void criar(() => api.criarOportunidade(d))}
        />
      )}

      {dealEmEdicao && (
        <FormOportunidade
          inicial={dealEmEdicao}
          areasEditaveis={areasEditaveis}
          pessoas={pessoasAtivas}
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
