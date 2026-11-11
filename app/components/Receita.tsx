"use client";

// Forecast de receita (só admin, em construção).
//
// De cima para baixo:
//  1. números do horizonte escolhido — contratada, assinatura do mês (MRR), provável, possível;
//  2. gráfico mensal empilhado — contratada por tipo, e por cima o que ainda é previsão;
//     tabela equivalente a um clique (o gráfico sozinho não basta para todo mundo);
//  3. pendências — cards ganhos sem receita, cards nas etapas finais fora do forecast,
//     previsões cujo card saiu das etapas finais;
//  4. contratos — a lista, com o cadastro de cada um (e o cronograma de parcelas, que é a
//     base do faturamento).
//
// A conta mora em `lib/forecast.ts`. Aqui é só tela.

import { useEffect, useState, type CSSProperties } from "react";
import { Button, Field, Input, Select } from "./ds";
import { C, GHOST_FIX, MONO, eyebrow } from "./tokens";
import { api, type Deal } from "./api";
import { CampoData, Modal } from "./views";
import { areaOf, brl, brlExato, hojeISO, porTexto, stageLabel, todasAreas } from "@/lib/domain";
import {
  ETAPAS_FINAIS, FORMAS_COBRANCA, ROTULO_SITUACAO, TIPOS_RECEITA, contratadaDoMes, lancamentos, mesDe, rotuloMes, serieMensal,
  situacaoEfetiva, somarMeses, totalNoPeriodo,
  type Contrato, type LinhaReceita, type MesForecast, type SituacaoEfetiva, type TipoReceita,
} from "@/lib/forecast";

const HORIZONTES = [6, 12, 24, 36] as const;

/** Uma série do gráfico. A cor vem do CSS (`--rec-*`), validada nos dois temas. */
export type Serie = { key: string; label: string; cor: string; textura?: boolean; valor: (m: MesForecast) => number };

const S_ASSINATURA: Serie = { key: "assinatura", label: "Assinatura", cor: "var(--rec-assinatura)", valor: (m) => m.assinatura };
const S_IMPLANTACAO: Serie = { key: "implantacao", label: "Implantação", cor: "var(--rec-implantacao)", valor: (m) => m.implantacao };
const S_CUSTOMIZACAO: Serie = { key: "customizacao", label: "Customização", cor: "var(--rec-customizacao)", valor: (m) => m.customizacao };
export const S_CONTRATADA: Serie = { key: "contratada", label: "Contratada", cor: "var(--rec-contratada)", valor: contratadaDoMes };
export const S_PROVAVEL: Serie = { key: "provavel", label: "Provável", cor: "var(--rec-prevista)", valor: (m) => m.provavel };
export const S_POSSIVEL: Serie = { key: "possivel", label: "Possível", cor: "var(--rec-prevista)", textura: true, valor: (m) => m.possivel };

/** Como a receita contratada aparece: um total só (consolidada), ou aberta nos três tipos. */
type Visao = "consolidada" | "detalhada";

/** Séries de baixo para cima: a contratada e, se pedidas, provável e possível por cima. */
function seriesDe(visao: Visao, provavel: boolean, possivel: boolean): Serie[] {
  const base = visao === "detalhada" ? [S_ASSINATURA, S_IMPLANTACAO, S_CUSTOMIZACAO] : [S_CONTRATADA];
  return [...base, ...(provavel ? [S_PROVAVEL] : []), ...(possivel ? [S_POSSIVEL] : [])];
}

const fundoSerie = (s: Serie): CSSProperties =>
  s.textura
    ? { background: `repeating-linear-gradient(45deg, ${s.cor} 0 2px, transparent 2px 6px)`, boxShadow: `inset 0 0 0 1px ${s.cor}` }
    : { background: s.cor };

/** "30.000,50" → 3000050. Vazio é zero. */
function paraCentavos(texto: string): number {
  const limpo = texto.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
const deCentavos = (c: number) => (c ? (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");

const TOM_SITUACAO: Record<SituacaoEfetiva, string> = {
  contratada: "var(--cop-ink-success)",
  provavel: "var(--cop-ink-warning)",
  possivel: "var(--cop-ink-warning)",
  fora: "var(--liff-text-faint)",
};

export default function Receita({
  deals,
  area,
  gatilho,
  onAbrirDeal,
}: {
  deals: Deal[];
  area: string;
  gatilho: number | undefined;
  onAbrirDeal: (ref: string) => void;
}) {
  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [horizonte, setHorizonte] = useState<(typeof HORIZONTES)[number]>(12);
  const [verTabela, setVerTabela] = useState(false);
  const [visao, setVisao] = useState<Visao>("consolidada");
  const [comProvavel, setComProvavel] = useState(false);
  const [comPossivel, setComPossivel] = useState(false);
  const [editando, setEditando] = useState<Partial<Contrato> | null>(null);

  useEffect(() => {
    let vivo = true;
    api.receitas().then(
      (r) => vivo && (setContratos(r.contratos), setFalha(null)),
      (e: unknown) => vivo && setFalha(e instanceof Error ? e.message : "Não foi possível carregar a receita.")
    );
    return () => {
      vivo = false;
    };
  }, [gatilho, versao]);

  const mesAtual = mesDe(hojeISO());
  const fimHorizonte = somarMeses(mesAtual, horizonte - 1);
  const dealPorId = new Map(deals.map((d) => [d.id, d]));

  // Conta barata (dezenas de contratos): recalcula a cada render, sem memo.
  const calc = (() => {
    const todos = contratos ?? [];
    const naArea = todos.filter((c) => area === "all" || c.area === area);
    const efetivos = naArea.map((c) => ({ contrato: c, efetiva: situacaoEfetiva(c, c.dealId != null ? dealPorId.get(c.dealId) : null) }));
    const serie = serieMensal(efetivos, mesAtual, horizonte);
    const soma = (k: keyof Omit<MesForecast, "mes">) => serie.reduce((t, m) => t + m[k], 0);
    const comContrato = new Set(todos.map((c) => c.dealId).filter((x): x is number => x != null));
    const dealsNaArea = deals.filter((d) => area === "all" || d.area === area);
    return {
      efetivos,
      serie,
      contratada: serie.reduce((t, m) => t + contratadaDoMes(m), 0),
      mrr: serie[0]?.assinatura ?? 0,
      provavel: soma("provavel"),
      possivel: soma("possivel"),
      ganhosSemReceita: dealsNaArea.filter((d) => d.estagio === "ganho" && !comContrato.has(d.id)),
      finaisFora: dealsNaArea.filter((d) => (ETAPAS_FINAIS as readonly string[]).includes(d.estagio) && !comContrato.has(d.id)),
      previsoesFora: efetivos.filter((e) => e.efetiva === "fora"),
    };
  })();

  if (falha && !contratos) return <div style={{ fontSize: 14, color: C.error }}>{falha}</div>;
  if (!contratos) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>carregando receita…</div>;

  const novoDeDeal = (d: Deal): Partial<Contrato> => ({
    conta: d.conta,
    area: d.area,
    dealId: d.id,
    situacao: d.estagio === "ganho" ? "contratada" : "prevista",
    chance: d.estagio === "ganho" ? null : "alta",
    inicioFaturamento: `${somarMeses(mesAtual, 1)}-01`,
    linhas: [],
  });

  const series = seriesDe(visao, comProvavel, comPossivel);
  const pendencias = calc.ganhosSemReceita.length + calc.finaisFora.length + calc.previsoesFora.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={eyebrow(10, C.faint, "0.14em")}>HORIZONTE</span>
        <div role="group" aria-label="Horizonte do forecast" className="liff-densidade">
          {HORIZONTES.map((h) => (
            <button key={h} type="button" aria-pressed={horizonte === h} onClick={() => setHorizonte(h)}>
              {h} meses
            </button>
          ))}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
          {rotuloMes(mesAtual)} a {rotuloMes(fimHorizonte)}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <Button variant="solid" size="sm" onClick={() => setEditando({ situacao: "contratada", inicioFaturamento: `${somarMeses(mesAtual, 1)}-01`, linhas: [] })}>
            + contrato
          </Button>
        </span>
      </div>

      {/* ---------- 1 · números ---------- */}
      <div className="rec-numeros">
        <Numero rotulo={`Contratada · ${horizonte} meses`} valor={calc.contratada} detalhe="Assinatura, implantação e customização já fechadas" />
        <Numero rotulo={`Assinatura em ${rotuloMes(mesAtual)}`} valor={calc.mrr} detalhe="Receita recorrente contratada do mês (MRR)" />
        <Numero rotulo={`Provável · ${horizonte} meses`} valor={calc.provavel} detalhe="Etapas finais com chance alta" />
        <Numero rotulo={`Possível · ${horizonte} meses`} valor={calc.possivel} detalhe="Etapas finais com chance baixa" />
      </div>

      {/* ---------- 2 · gráfico ---------- */}
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={eyebrow(11, C.dust, "0.14em")}>RECEITA POR MÊS</div>
          {/* Contratada sempre aparece: um total (Contratado) ou aberta nos três tipos (Ver detalhes).
              Provável (chance alta) e Possível (chance baixa) entram por cima, cada um com o seu botão. */}
          <div className="rec-controles">
            <div role="group" aria-label="Receita contratada" className="liff-densidade">
              {([["consolidada", "Contratado"], ["detalhada", "Ver detalhes"]] as const).map(([v, rotulo]) => (
                <button key={v} type="button" aria-pressed={visao === v} onClick={() => setVisao(v)}>
                  {rotulo}
                </button>
              ))}
            </div>
            <span style={eyebrow(10, C.faint, "0.12em")}>+</span>
            <button type="button" className="rec-alterna" aria-pressed={comProvavel} onClick={() => setComProvavel((v) => !v)}>
              <span aria-hidden className="rec-legenda__marca" style={fundoSerie(S_PROVAVEL)} />
              {S_PROVAVEL.label}
            </button>
            <button type="button" className="rec-alterna" aria-pressed={comPossivel} onClick={() => setComPossivel((v) => !v)}>
              <span aria-hidden className="rec-legenda__marca" style={fundoSerie(S_POSSIVEL)} />
              {S_POSSIVEL.label}
            </button>
          </div>
          <ul className="rec-legenda" aria-label="Legenda">
            {series.map((s) => (
              <li key={s.key}>
                <span aria-hidden className="rec-legenda__marca" style={fundoSerie(s)} />
                {s.label}
              </li>
            ))}
          </ul>
          <button type="button" className="rec-link" style={{ marginLeft: "auto" }} onClick={() => setVerTabela((v) => !v)}>
            {verTabela ? "ver gráfico" : "ver tabela"}
          </button>
        </div>
        {verTabela ? <TabelaMensal serie={calc.serie} series={series} /> : <Grafico serie={calc.serie} series={series} />}
      </section>

      {/* ---------- 3 · pendências ---------- */}
      {pendencias > 0 && (
        <section>
          <div style={{ ...eyebrow(11, C.dust, "0.14em"), marginBottom: 12 }}>PENDÊNCIAS · {pendencias}</div>
          <div className="rec-pendencias">
            {calc.ganhosSemReceita.length > 0 && (
              <ListaPendencia
                titulo="Ganhos sem receita cadastrada"
                texto="Venda fechada que ainda não entra no forecast. Cadastre os valores e o início do faturamento."
                itens={calc.ganhosSemReceita.map((d) => ({
                  chave: d.ref,
                  rotulo: `${d.ref} · ${d.conta}`,
                  detalhe: `${areaOf(d.area).label} · card ${brl(d.valorCentavos)}`,
                  acao: "cadastrar receita",
                  onAcao: () => setEditando(novoDeDeal(d)),
                  onAbrir: () => onAbrirDeal(d.ref),
                }))}
              />
            )}
            {calc.finaisFora.length > 0 && (
              <ListaPendencia
                titulo="Etapas finais fora do forecast"
                texto="Cards em Proposta, Validação ou Contrato. Inclua com chance alta ou baixa, se fizer sentido contar."
                itens={calc.finaisFora.map((d) => ({
                  chave: d.ref,
                  rotulo: `${d.ref} · ${d.conta}`,
                  detalhe: `${stageLabel(d.estagio)} · card ${brl(d.valorCentavos)}`,
                  acao: "incluir no forecast",
                  onAcao: () => setEditando(novoDeDeal(d)),
                  onAbrir: () => onAbrirDeal(d.ref),
                }))}
              />
            )}
            {calc.previsoesFora.length > 0 && (
              <ListaPendencia
                titulo="Previsões cujo card saiu das etapas finais"
                texto="O card voltou no funil, foi para On hold ou Lost. A previsão fica cadastrada, mas não soma."
                itens={calc.previsoesFora.map(({ contrato: c }) => {
                  const d = c.dealId != null ? dealPorId.get(c.dealId) : undefined;
                  return {
                    chave: c.ref,
                    rotulo: `${c.ref} · ${c.conta}`,
                    detalhe: d ? `card em ${stageLabel(d.estagio)}` : "card fora das etapas finais",
                    acao: "revisar",
                    onAcao: () => setEditando(c),
                    onAbrir: d ? () => onAbrirDeal(d.ref) : undefined,
                  };
                })}
              />
            )}
          </div>
        </section>
      )}

      {/* ---------- 4 · contratos ---------- */}
      <section>
        <div style={{ ...eyebrow(11, C.dust, "0.14em"), marginBottom: 12 }}>CONTRATOS · {calc.efetivos.length}</div>
        {calc.efetivos.length === 0 ? (
          <div style={{ fontSize: 14, color: C.faint, lineHeight: 1.6, maxWidth: 620 }}>
            Nenhum contrato cadastrado{area === "all" ? "" : ` em ${areaOf(area).label}`}. Use “+ contrato”, ou cadastre a
            partir das pendências acima: um card ganho vira receita contratada; um card nas etapas finais pode entrar como
            provável ou possível.
          </div>
        ) : (
          <TabelaContratos
            itens={calc.efetivos}
            dealPorId={dealPorId}
            de={mesAtual}
            ate={fimHorizonte}
            horizonte={horizonte}
            onAbrir={(c) => setEditando(c)}
          />
        )}
      </section>

      {editando && (
        <FormContrato
          key={editando.id ?? `novo-${editando.dealId ?? "x"}`}
          inicial={editando}
          deals={deals}
          contratos={contratos}
          onFechar={() => setEditando(null)}
          onMudou={() => {
            setEditando(null);
            setVersao((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

/* ============================== peças ============================== */

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: number; detalhe: string }) {
  return (
    <div className="rec-numero">
      <div style={eyebrow(10, C.faint, "0.12em")}>{rotulo}</div>
      <div className="rec-numero__valor" title={brlExato(valor)}>
        {brl(valor)}
      </div>
      <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.45 }}>{detalhe}</div>
    </div>
  );
}

/** Escala "redonda" para o eixo: 1, 2 ou 5 × potência de 10 acima do maior total. */
function tetoDoEixo(max: number): number {
  if (max <= 0) return 100_00;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

export function Grafico({ serie, series }: { serie: MesForecast[]; series: Serie[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const totais = serie.map((m) => series.reduce((t, s) => t + s.valor(m), 0));
  const teto = tetoDoEixo(Math.max(...totais));
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * teto);
  const vazio = totais.every((t) => t === 0);
  // Rótulo de mês: todos até 12, um sim um não até 24, um a cada três no de 36.
  const passo = serie.length > 24 ? 3 : serie.length > 12 ? 2 : 1;

  return (
    <div className="rec-grafico">
      <div className="rec-grafico__eixo" aria-hidden>
        {marcas
          .slice()
          .reverse()
          .map((v) => (
            <span key={v}>{brl(v)}</span>
          ))}
      </div>
      <div className="rec-grafico__area" onMouseLeave={() => setFoco(null)}>
        {/* Grade na mesma caixa das barras (acima da faixa dos meses), na mesma escala delas. Sem a
            linha do teto: ela ficava colada embaixo da legenda e só repetia a borda. */}
        <div className="rec-grafico__plot" aria-hidden>
          {marcas.slice(0, -1).map((v) => (
            <div key={v} className="rec-grafico__grade" style={{ bottom: `${(v / teto) * 100}%` }} />
          ))}
        </div>
        {vazio && <div className="rec-grafico__vazio">Sem receita no horizonte.</div>}
        <div className="rec-grafico__barras" style={serie.length > 24 ? { gap: 3 } : undefined}>
          {serie.map((m, i) => {
            const presentes = series.filter((s) => s.valor(m) > 0);
            return (
              <div
                key={m.mes}
                className="rec-grafico__coluna"
                data-foco={foco === i ? "1" : undefined}
                onMouseEnter={() => setFoco(i)}
                onFocus={() => setFoco(i)}
                onBlur={() => setFoco(null)}
                tabIndex={0}
                aria-label={`${rotuloMes(m.mes)}: total ${brlExato(totais[i])}`}
              >
                <div className="rec-grafico__pilha" style={{ height: `${(totais[i] / teto) * 100}%` }}>
                  {presentes
                    .slice()
                    .reverse()
                    .map((s, k) => (
                      <div
                        key={s.key}
                        className="rec-grafico__segmento"
                        data-topo={k === 0 ? "1" : undefined}
                        style={{ flexGrow: s.valor(m), ...fundoSerie(s) }}
                      />
                    ))}
                </div>
                {/* No celular, a metade dos rótulos que a tela larga mostra. */}
                {i % passo === 0 && (
                  <span className="rec-grafico__mes" data-alterno={(i / passo) % 2 === 1 ? "1" : undefined}>
                    {rotuloMes(m.mes)}
                  </span>
                )}
                {foco === i && totais[i] > 0 && (
                  <div className="rec-dica" role="tooltip" data-lado={i > serie.length / 2 ? "esq" : "dir"}>
                    <div style={{ ...eyebrow(10, C.faint, "0.12em"), marginBottom: 8 }}>{rotuloMes(m.mes)}</div>
                    {series.map((s) => (
                      <div key={s.key} className="rec-dica__linha">
                        <span aria-hidden className="rec-legenda__marca" style={fundoSerie(s)} />
                        <span>{s.label}</span>
                        <span className="rec-dica__valor">{brlExato(s.valor(m))}</span>
                      </div>
                    ))}
                    {series.length > 1 && (
                      <div className="rec-dica__linha rec-dica__total">
                        <span />
                        <span>Total</span>
                        <span className="rec-dica__valor">{brlExato(totais[i])}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TabelaMensal({ serie, series }: { serie: MesForecast[]; series: Serie[] }) {
  const comTotal = series.length > 1;
  const cols = `0.8fr repeat(${series.length + (comTotal ? 1 : 0)}, 1fr)`;
  return (
    <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}` }}>
      <div style={{ minWidth: 120 + (series.length + 1) * 130 }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, background: C.canvas, borderBottom: `1px solid ${C.line}` }}>
          {["MÊS", ...series.map((s) => s.label.toUpperCase()), ...(comTotal ? ["TOTAL"] : [])].map((h) => (
            <div key={h} style={{ padding: "10px 12px", ...eyebrow(10, C.faint), textAlign: h === "MÊS" ? "left" : "right" }}>
              {h}
            </div>
          ))}
        </div>
        {serie.map((m) => (
          <div key={m.mes} style={{ display: "grid", gridTemplateColumns: cols, background: C.cell, borderBottom: `1px solid ${C.line}` }}>
            <div style={{ padding: "10px 12px", fontFamily: MONO, fontSize: 12, color: C.body }}>{rotuloMes(m.mes)}</div>
            {[...series.map((s) => s.valor(m)), ...(comTotal ? [series.reduce((t, s) => t + s.valor(m), 0)] : [])].map((v, k) => (
              <div key={k} style={{ padding: "10px 12px", fontFamily: MONO, fontSize: 12, color: v ? C.ink : C.ghost, textAlign: "right" }}>
                {v ? brlExato(v) : "—"}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListaPendencia({
  titulo,
  texto,
  itens,
}: {
  titulo: string;
  texto: string;
  itens: { chave: string; rotulo: string; detalhe: string; acao: string; onAcao: () => void; onAbrir?: () => void }[];
}) {
  return (
    <div className="rec-pendencia">
      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
        {titulo} <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>· {itens.length}</span>
      </div>
      <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, margin: "4px 0 10px" }}>{texto}</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {itens.map((i) => (
          <li key={i.chave} className="rec-pendencia__item">
            <div style={{ minWidth: 0 }}>
              {i.onAbrir ? (
                <button type="button" className="rec-link rec-link--forte" onClick={i.onAbrir} title="Abrir o card">
                  {i.rotulo}
                </button>
              ) : (
                <span style={{ fontSize: 13, color: C.ink }}>{i.rotulo}</span>
              )}
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>{i.detalhe}</div>
            </div>
            <button type="button" className="rec-link" onClick={i.onAcao}>
              {i.acao}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabelaContratos({
  itens,
  dealPorId,
  de,
  ate,
  horizonte,
  onAbrir,
}: {
  itens: { contrato: Contrato; efetiva: SituacaoEfetiva }[];
  dealPorId: Map<number, Deal>;
  de: string;
  ate: string;
  horizonte: number;
  onAbrir: (c: Contrato) => void;
}) {
  const cols = "1.6fr 0.9fr 0.9fr 0.7fr 1fr 1fr 1fr 1fr";
  const linha = (c: Contrato, t: TipoReceita) => c.linhas.find((l) => l.tipo === t);
  const ordenados = [...itens].sort((a, b) => porTexto(a.contrato.conta, b.contrato.conta));
  return (
    <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}` }}>
      <div style={{ minWidth: 980 }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, background: C.canvas, borderBottom: `1px solid ${C.line}` }}>
          {["CLIENTE", "VERTICAL", "SITUAÇÃO", "INÍCIO", "ASSINATURA / MÊS", "IMPLANTAÇÃO", "CUSTOMIZAÇÃO", `TOTAL · ${horizonte} MESES`].map((h, k) => (
            <div key={h} style={{ padding: "12px 14px", ...eyebrow(10, C.faint), textAlign: k >= 4 ? "right" : "left" }}>
              {h}
            </div>
          ))}
        </div>
        {ordenados.map(({ contrato: c, efetiva }) => {
          const d = c.dealId != null ? dealPorId.get(c.dealId) : undefined;
          const a = areaOf(c.area);
          const ass = linha(c, "assinatura");
          const imp = linha(c, "implantacao");
          const cus = linha(c, "customizacao");
          const [ano, mes] = c.inicioFaturamento.split("-");
          return (
            <div
              key={c.id}
              className="liff-hover-row"
              role="button"
              tabIndex={0}
              onClick={() => onAbrir(c)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onAbrir(c))}
              title="Abrir o contrato"
              style={{ display: "grid", gridTemplateColumns: cols, background: C.cell, borderBottom: `1px solid ${C.line}`, cursor: "pointer", alignItems: "center" }}
            >
              <div style={{ padding: "12px 14px", minWidth: 0 }}>
                <div style={{ fontSize: 14, color: C.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.conta}</div>
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>
                  {c.ref}
                  {d ? ` · ${d.ref} · ${stageLabel(d.estagio)}` : ""}
                </div>
              </div>
              <div style={{ padding: "12px 14px", fontSize: 13, color: C.body }}>{a.label}</div>
              <div style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: TOM_SITUACAO[efetiva] }}>
                {ROTULO_SITUACAO[efetiva]}
              </div>
              <div style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 12, color: C.body }}>{`${mes}/${ano}`}</div>
              <Celula>{ass ? `${brlExato(ass.valorCentavos)}${ass.duracaoMeses ? ` · ${ass.duracaoMeses}m` : ""}` : "—"}</Celula>
              <Celula>{imp ? `${brlExato(imp.valorCentavos)}${imp.parcelas > 1 ? ` · ${imp.parcelas}x` : ""}` : "—"}</Celula>
              <Celula>{cus ? `${brlExato(cus.valorCentavos)}${cus.parcelas > 1 ? ` · ${cus.parcelas}x` : ""}` : "—"}</Celula>
              <Celula forte>{efetiva === "fora" ? "—" : brlExato(totalNoPeriodo(c, de, ate))}</Celula>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Celula({ children, forte }: { children: string; forte?: boolean }) {
  return (
    <div style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 12, textAlign: "right", color: children === "—" ? C.ghost : forte ? C.ink : C.body, fontWeight: forte ? 600 : 400 }}>
      {children}
    </div>
  );
}

/* ============================== cadastro ============================== */

type Rascunho = { valor: string; parcelas: string; inicio: string; duracao: string };

function rascunhoDe(l: LinhaReceita | undefined): Rascunho {
  return {
    valor: l ? deCentavos(l.valorCentavos) : "",
    parcelas: l ? String(l.parcelas) : "1",
    inicio: l ? String(l.inicioMes + 1) : "1",
    duracao: l?.duracaoMeses ? String(l.duracaoMeses) : "",
  };
}

function FormContrato({
  inicial,
  deals,
  contratos,
  onFechar,
  onMudou,
}: {
  inicial: Partial<Contrato>;
  deals: Deal[];
  contratos: Contrato[];
  onFechar: () => void;
  onMudou: () => void;
}) {
  const editando = inicial.id != null;
  const [dealId, setDealId] = useState<number | null>(inicial.dealId ?? null);
  const [conta, setConta] = useState(inicial.conta ?? "");
  const [area, setArea] = useState(inicial.area ?? "");
  const [situacao, setSituacao] = useState<"contratada" | "prevista">(inicial.situacao ?? "contratada");
  const [chance, setChance] = useState<"alta" | "baixa">(inicial.chance ?? "alta");
  const [inicio, setInicio] = useState(inicial.inicioFaturamento ?? "");
  const [notas, setNotas] = useState(inicial.notas ?? "");
  const [cnpj, setCnpj] = useState(inicial.cobranca?.cnpj ?? "");
  const [emailCobranca, setEmailCobranca] = useState(inicial.cobranca?.emailCobranca ?? "");
  const [diaVencimento, setDiaVencimento] = useState(String(inicial.cobranca?.diaVencimento ?? 10));
  const [formaCobranca, setFormaCobranca] = useState<string>(inicial.cobranca?.formaCobranca ?? "boleto");
  const [rasc, setRasc] = useState<Record<TipoReceita, Rascunho>>(() => ({
    assinatura: rascunhoDe(inicial.linhas?.find((l) => l.tipo === "assinatura")),
    implantacao: rascunhoDe(inicial.linhas?.find((l) => l.tipo === "implantacao")),
    customizacao: rascunhoDe(inicial.linhas?.find((l) => l.tipo === "customizacao")),
  }));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const deal = dealId != null ? deals.find((d) => d.id === dealId) : undefined;
  const ganho = deal?.estagio === "ganho";
  // Card em Ganho é receita contratada, sem escolha.
  const sitEfetiva = ganho ? "contratada" : situacao;

  // Cards que podem ser ligados: os sem contrato (mais o atual), do mais avançado no funil.
  const ocupados = new Set(contratos.filter((c) => c.id !== inicial.id).map((c) => c.dealId));
  const opcoesDeal = deals
    .filter((d) => !ocupados.has(d.id) && (d.estagio === "ganho" || (ETAPAS_FINAIS as readonly string[]).includes(d.estagio) || d.id === dealId))
    .sort((a, b) => porTexto(a.conta, b.conta));

  const linhas: LinhaReceita[] = TIPOS_RECEITA.map((t) => {
    const r = rasc[t.key];
    return {
      tipo: t.key,
      valorCentavos: paraCentavos(r.valor),
      parcelas: t.parcelado ? Math.max(1, Number(r.parcelas) || 1) : 1,
      inicioMes: Math.max(0, (Number(r.inicio) || 1) - 1),
      duracaoMeses: t.key === "assinatura" && r.duracao.trim() ? Number(r.duracao) || null : null,
    };
  }).filter((l) => l.valorCentavos > 0);

  const previa = inicio ? lancamentos({ inicioFaturamento: inicio, linhas }, mesDe(inicio), somarMeses(mesDe(inicio), 23)) : [];
  const mexe = (t: TipoReceita, campo: keyof Rascunho, v: string) => setRasc((r) => ({ ...r, [t]: { ...r[t], [campo]: v } }));

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    const corpo = {
      conta,
      area,
      dealId,
      situacao: sitEfetiva,
      chance: sitEfetiva === "prevista" ? chance : null,
      inicioFaturamento: inicio,
      notas,
      cobranca: { cnpj, emailCobranca, diaVencimento: Number(diaVencimento) || 0, formaCobranca },
      linhas: TIPOS_RECEITA.map((t) => ({
        tipo: t.key,
        valorCentavos: paraCentavos(rasc[t.key].valor),
        parcelas: t.parcelado ? Number(rasc[t.key].parcelas) || 0 : 1,
        inicioMes: (Number(rasc[t.key].inicio) || 0) - 1,
        duracaoMeses: t.key === "assinatura" && rasc[t.key].duracao.trim() ? Number(rasc[t.key].duracao) : null,
      })),
    };
    try {
      if (editando) await api.alterarReceita(inicial.id!, corpo);
      else await api.criarReceita(corpo);
      onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!window.confirm(`Excluir a receita de ${inicial.conta}?\n\nO contrato e o cronograma de parcelas somem. O histórico continua no changelog.`)) return;
    setSalvando(true);
    try {
      await api.excluirReceita(inicial.id!);
      onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir.");
      setSalvando(false);
    }
  };

  const areas = todasAreas();

  return (
    <Modal
      titulo={editando ? `${inicial.conta} · ${inicial.ref}` : "Novo contrato de receita"}
      eyebrowTexto="LIFF/ RECEITA · CONTRATO"
      onFechar={onFechar}
      largura={760}
    >
      <div className="rec-form">
        <Field label="Oportunidade ligada" hint="Opcional. Card em Ganho entra como contratada; nas etapas finais, como previsão.">
          <Select
            value={dealId == null ? "" : String(dealId)}
            onChange={(v) => {
              const d = deals.find((x) => String(x.id) === v);
              setDealId(d ? d.id : null);
              if (d) {
                if (!conta.trim() || !editando) setConta(d.conta);
                setArea(d.area);
                setSituacao(d.estagio === "ganho" ? "contratada" : "prevista");
              }
            }}
            options={[
              { value: "", label: "— nenhuma (cliente fora do pipeline) —" },
              ...opcoesDeal.map((d) => ({ value: String(d.id), label: `${d.conta} · ${d.ref} · ${stageLabel(d.estagio)}` })),
            ]}
          />
        </Field>
        <div className="rec-form__duas">
          <Field label="Cliente" required>
            <Input value={conta} onChange={setConta} placeholder="Nome do cliente" />
          </Field>
          <Field label="Vertical" required>
            <Select
              value={area}
              onChange={setArea}
              options={[{ value: "", label: "— escolha —" }, ...areas.map((a) => ({ value: a.id, label: a.label }))]}
            />
          </Field>
        </div>
        <div className="rec-form__duas">
          <Field label="Situação" hint={ganho ? "O card está em Ganho: a receita é contratada." : undefined}>
            <div role="group" aria-label="Situação" className="liff-densidade">
              {(["contratada", "prevista"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={sitEfetiva === s} disabled={ganho} onClick={() => setSituacao(s)}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
          {sitEfetiva === "prevista" && (
            <Field label="Chance de fechar" hint="Alta soma como provável; baixa, como possível.">
              <div role="group" aria-label="Chance de fechar" className="liff-densidade">
                {(["alta", "baixa"] as const).map((c) => (
                  <button key={c} type="button" aria-pressed={chance === c} onClick={() => setChance(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>
        <Field label="Início do faturamento" required hint="O mês deste dia é o mês 1 de cada linha. Todo o forecast parte daqui.">
          <CampoData valor={inicio} onChange={setInicio} />
        </Field>

        {deal && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
            Valor no card: {brlExato(deal.valorCentavos)} · {stageLabel(deal.estagio)}
          </div>
        )}

        <div className="rec-linhas">
          {TIPOS_RECEITA.map((t) => (
            <div key={t.key} className="rec-linha">
              <div style={eyebrow(10, C.dust, "0.14em")}>{t.label.toUpperCase()}</div>
              <Field label={t.key === "assinatura" ? "Valor por mês (R$)" : "Valor total (R$)"}>
                <Input value={rasc[t.key].valor} onChange={(v) => mexe(t.key, "valor", v)} placeholder="0,00" size="sm" />
              </Field>
              {t.parcelado ? (
                <Field label="Parcelas">
                  <Input value={rasc[t.key].parcelas} onChange={(v) => mexe(t.key, "parcelas", v.replace(/\D/g, ""))} size="sm" />
                </Field>
              ) : (
                <Field label="Duração (meses)" hint="Em branco: sem prazo.">
                  <Input value={rasc[t.key].duracao} onChange={(v) => mexe(t.key, "duracao", v.replace(/\D/g, ""))} size="sm" />
                </Field>
              )}
              <Field label="Começa no mês">
                <Input value={rasc[t.key].inicio} onChange={(v) => mexe(t.key, "inicio", v.replace(/\D/g, ""))} size="sm" />
              </Field>
            </div>
          ))}
        </div>

        {/* Dados de cobrança: o Faturamento usa para sugerir vencimento e forma, e para o e-mail de cobrança. */}
        <div>
          <div style={{ ...eyebrow(10, C.dust, "0.14em"), marginBottom: 10 }}>COBRANÇA</div>
          <div className="rec-form__quatro">
            <Field label="CNPJ do cliente">
              <Input value={cnpj} onChange={setCnpj} placeholder="00.000.000/0000-00" size="sm" />
            </Field>
            <Field label="E-mail do financeiro">
              <Input value={emailCobranca} onChange={setEmailCobranca} placeholder="financeiro@cliente.com.br" size="sm" />
            </Field>
            <Field label="Vence no dia" hint="1 a 28">
              <Input value={diaVencimento} onChange={(v) => setDiaVencimento(v.replace(/\D/g, "").slice(0, 2))} size="sm" />
            </Field>
            <Field label="Forma de cobrança">
              <Select value={formaCobranca} onChange={setFormaCobranca} options={FORMAS_COBRANCA.map((f) => ({ value: f.key, label: f.label }))} />
            </Field>
          </div>
        </div>

        <Field label="Notas">
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="rec-notas"
            placeholder="Condições, reajuste, observações de faturamento…"
          />
        </Field>

        {/* Cronograma de faturamento: é o que, mais adiante, vira cobrança para o cliente. */}
        <div>
          <div style={{ ...eyebrow(10, C.dust, "0.14em"), marginBottom: 8 }}>
            CRONOGRAMA DE FATURAMENTO {previa.length ? `· PRIMEIROS 24 MESES` : ""}
          </div>
          {previa.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.faint }}>Informe o início do faturamento e ao menos um valor.</div>
          ) : (
            <div className="rec-previa">
              {Object.entries(
                previa.reduce<Record<string, typeof previa>>((acc, l) => ((acc[l.mes] ??= []).push(l), acc), {})
              ).map(([mes, ls]) => (
                <div key={mes} className="rec-previa__mes">
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.body }}>{rotuloMes(mes)}</span>
                  <span style={{ fontSize: 12, color: C.faint }}>
                    {ls.map((l) => `${TIPOS_RECEITA.find((t) => t.key === l.tipo)!.label} ${l.rotulo}`).join(" · ")}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.ink, textAlign: "right" }}>
                    {brlExato(ls.reduce((t, l) => t + l.valorCentavos, 0))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          {editando ? (
            <button type="button" className="rec-link" style={{ color: C.error }} onClick={() => void excluir()} disabled={salvando}>
              excluir contrato
            </button>
          ) : (
            <span />
          )}
          <span style={{ display: "flex", gap: 10 }}>
            <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
              cancelar
            </Button>
            <Button variant="solid" size="sm" disabled={salvando || !conta.trim() || !area || !inicio} onClick={() => void salvar()}>
              {salvando ? "salvando…" : editando ? "salvar alterações" : "cadastrar contrato"}
            </Button>
          </span>
        </div>
      </div>
    </Modal>
  );
}
