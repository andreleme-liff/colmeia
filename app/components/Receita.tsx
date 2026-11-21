"use client";

// Forecast de receita. Todos veem (números, gráfico, parcelas); só a administração decide o
// que entra e altera valores.
//
// De cima para baixo:
//  1. números do horizonte escolhido — contratada, contratada do mês, provável, possível;
//  2. gráfico mensal empilhado — contratada e, por cima, o que ainda é previsão; tabela
//     equivalente a um clique (o gráfico sozinho não basta para todo mundo);
//  3. pendências — cards ganhos sem receita, cards nas etapas finais fora do forecast,
//     previsões cujo card saiu das etapas finais;
//  4. receitas — a lista, com o cadastro de cada uma: as parcelas, cada qual com a sua data
//     e o seu valor, que são a base do faturamento.
//
// A conta mora em `lib/forecast.ts`. Aqui é só tela.

import { useEffect, useState, type CSSProperties } from "react";
import { Button, Field, Input, Select } from "./ds";
import { C, GHOST_FIX, MONO, eyebrow, R } from "./tokens";
import { api, type Deal } from "./api";
import { CampoData, Modal } from "./views";
import { useOrdem } from "./ordenacao";
import { areaOf, brl, brlExato, hojeISO, porTexto, stageLabel, todasAreas } from "@/lib/domain";
import {
  ETAPAS_FINAIS, FORMAS_COBRANCA, LIMITES_RECEITA, PAGAMENTOS, ROTULO_SITUACAO, contratadaDoMes, dataValida, emOrdem, mesDe,
  pagamentoDe, parcelasIguais, rotuloMes, serieMensal, situacaoEfetiva, somarMeses, totalDoContrato, totalNoPeriodo,
  type Contrato, type MesForecast, type Pagamento, type SituacaoEfetiva,
} from "@/lib/forecast";

const HORIZONTES = [6, 12, 24, 36] as const;

/** Uma série do gráfico. A cor vem do CSS (`--rec-*`), validada nos dois temas. */
export type Serie = { key: string; label: string; cor: string; textura?: boolean; valor: (m: MesForecast) => number };

export const S_CONTRATADA: Serie = { key: "contratada", label: "Contratada", cor: "var(--rec-contratada)", valor: contratadaDoMes };
export const S_PROVAVEL: Serie = { key: "provavel", label: "Provável", cor: "var(--rec-prevista)", valor: (m) => m.provavel };
export const S_POSSIVEL: Serie = { key: "possivel", label: "Possível", cor: "var(--rec-prevista)", textura: true, valor: (m) => m.possivel };

/** Séries de baixo para cima: a contratada e, se pedidas, provável e possível por cima. */
function seriesDe(provavel: boolean, possivel: boolean): Serie[] {
  return [S_CONTRATADA, ...(provavel ? [S_PROVAVEL] : []), ...(possivel ? [S_POSSIVEL] : [])];
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

// A situação usa a mesma marca do gráfico: contratada na cor da série, provável em cheio e
// possível hachurado. O texto fica na tinta comum; quem carrega a cor é a marca.
const MARCA_SITUACAO: Record<SituacaoEfetiva, CSSProperties> = {
  contratada: fundoSerie(S_CONTRATADA),
  provavel: fundoSerie(S_PROVAVEL),
  possivel: fundoSerie(S_POSSIVEL),
  fora: { boxShadow: "inset 0 0 0 1px var(--col-text-faint)" },
};

export default function Receita({
  deals,
  area,
  gatilho,
  podeEditar,
  onAbrirDeal,
}: {
  deals: Deal[];
  area: string;
  gatilho: number | undefined;
  /** Só admin decide o que entra no forecast e mexe em valores; os demais leem. */
  podeEditar: boolean;
  onAbrirDeal: (ref: string) => void;
}) {
  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [horizonte, setHorizonte] = useState<(typeof HORIZONTES)[number]>(12);
  const [verTabela, setVerTabela] = useState(false);
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
      doMes: serie[0]?.contratada ?? 0,
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
    // Ponto de partida: o valor do card numa parcela só, no mês que vem. A pessoa ajusta.
    parcelas: d.valorCentavos > 0 ? [{ data: `${somarMeses(mesAtual, 1)}-10`, valorCentavos: d.valorCentavos }] : [],
  });

  const series = seriesDe(comProvavel, comPossivel);
  const pendencias = calc.ganhosSemReceita.length + calc.finaisFora.length + calc.previsoesFora.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={eyebrow(10, C.faint, "0.14em")}>HORIZONTE</span>
        <div role="group" aria-label="Horizonte do forecast" className="col-densidade">
          {HORIZONTES.map((h) => (
            <button key={h} type="button" aria-pressed={horizonte === h} onClick={() => setHorizonte(h)}>
              {h} meses
            </button>
          ))}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
          {rotuloMes(mesAtual)} a {rotuloMes(fimHorizonte)}
        </span>
        {podeEditar && (
          <span style={{ marginLeft: "auto" }}>
            <Button variant="solid" size="sm" onClick={() => setEditando({ situacao: "contratada", parcelas: [] })}>
              + receita
            </Button>
          </span>
        )}
      </div>

      {/* ---------- 1 · números ---------- */}
      <div className="rec-numeros">
        <Numero rotulo={`Contratada · ${horizonte} meses`} valor={calc.contratada} detalhe="Parcelas de receitas já fechadas que vencem no período" />
        <Numero rotulo={`Contratada em ${rotuloMes(mesAtual)}`} valor={calc.doMes} detalhe="Parcelas contratadas que vencem neste mês" />
        <Numero rotulo={`Provável · ${horizonte} meses`} valor={calc.provavel} detalhe="Etapas finais com chance alta" />
        <Numero rotulo={`Possível · ${horizonte} meses`} valor={calc.possivel} detalhe="Etapas finais com chance baixa" />
      </div>

      {/* ---------- 2 · gráfico ---------- */}
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={eyebrow(11, C.dust, "0.14em")}>RECEITA POR MÊS</div>
          {/* Contratada sempre aparece. Provável (chance alta) e Possível (chance baixa) entram por
              cima, cada um com o seu botão. */}
          <div className="rec-controles">
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
                texto="Venda fechada que ainda não entra no forecast. Cadastre as parcelas: datas e valores."
                itens={calc.ganhosSemReceita.map((d) => ({
                  chave: d.ref,
                  rotulo: `${d.ref} · ${d.conta}`,
                  detalhe: `${areaOf(d.area).label} · card ${brl(d.valorCentavos)}`,
                  acao: "cadastrar receita",
                  onAcao: podeEditar ? () => setEditando(novoDeDeal(d)) : undefined,
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
                  onAcao: podeEditar ? () => setEditando(novoDeDeal(d)) : undefined,
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
                    onAcao: podeEditar ? () => setEditando(c) : undefined,
                    onAbrir: d ? () => onAbrirDeal(d.ref) : undefined,
                  };
                })}
              />
            )}
          </div>
        </section>
      )}

      {/* ---------- 4 · receitas cadastradas (contrato é só a contratada) ---------- */}
      <section>
        <div style={{ ...eyebrow(11, C.dust, "0.14em"), marginBottom: 12 }}>RECEITAS CADASTRADAS · {calc.efetivos.length}</div>
        {calc.efetivos.length === 0 ? (
          <div style={{ fontSize: 14, color: C.faint, lineHeight: 1.6, maxWidth: 620 }}>
            Nenhuma receita cadastrada{area === "all" ? "" : ` em ${areaOf(area).label}`}. Use “+ receita”, ou cadastre a
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
          somenteLeitura={!podeEditar}
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
    <div className="col-scroll-x" style={{ border: `1px solid ${C.line}`, borderRadius: R }}>
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
  itens: { chave: string; rotulo: string; detalhe: string; acao: string; onAcao?: () => void; onAbrir?: () => void }[];
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
            {i.onAcao && (
              <button type="button" className="rec-link" onClick={i.onAcao}>
                {i.acao}
              </button>
            )}
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
  const cols = "1.7fr 0.9fr 0.9fr 0.9fr 1.3fr 1fr 1fr";
  const hoje = hojeISO();
  /** A próxima parcela a vencer; se todas já venceram, a última. */
  const proxima = (c: Contrato) => c.parcelas.find((p) => p.data >= hoje) ?? c.parcelas[c.parcelas.length - 1];
  const br = (iso: string) => iso.split("-").reverse().join("/");
  const ord = useOrdem();
  const ordenados = ord.aplicar([...itens].sort((a, b) => porTexto(a.contrato.conta, b.contrato.conta)), {
    conta: (i) => i.contrato.conta,
    produto: (i) => areaOf(i.contrato.area).label,
    situacao: (i) => ROTULO_SITUACAO[i.efetiva],
    pagamento: (i) => i.contrato.parcelas.length,
    proxima: (i) => proxima(i.contrato)?.data ?? null,
    total: (i) => totalDoContrato(i.contrato),
    horizonte: (i) => (i.efetiva === "fora" ? null : totalNoPeriodo(i.contrato, de, ate)),
  });
  return (
    <div className="col-scroll-x" style={{ border: `1px solid ${C.line}`, borderRadius: R }}>
      <div style={{ minWidth: 900 }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, background: C.canvas, borderBottom: `1px solid ${C.line}` }}>
          {(
            [
              ["conta", "CLIENTE"], ["produto", "PRODUTO"], ["situacao", "SITUAÇÃO"], ["pagamento", "PAGAMENTO"], ["proxima", "PRÓXIMA PARCELA"],
              ["total", "TOTAL"], ["horizonte", `EM ${horizonte} MESES`],
            ] as const
          ).map(([chave, h], k) => ord.th(chave, h, { padding: "12px 14px", ...eyebrow(10, C.faint), textAlign: k >= 5 ? "right" : "left" }))}
        </div>
        {ordenados.map(({ contrato: c, efetiva }) => {
          const d = c.dealId != null ? dealPorId.get(c.dealId) : undefined;
          const a = areaOf(c.area);
          const p = proxima(c);
          return (
            <div
              key={c.id}
              className="col-hover-row"
              role="button"
              tabIndex={0}
              onClick={() => onAbrir(c)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onAbrir(c))}
              title="Abrir a receita"
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
              <div style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: efetiva === "fora" ? C.faint : C.body, display: "flex", alignItems: "center", gap: 8 }}>
                <span aria-hidden className="rec-legenda__marca" style={MARCA_SITUACAO[efetiva]} />
                {ROTULO_SITUACAO[efetiva]}
              </div>
              <div style={{ padding: "12px 14px", fontSize: 13, color: C.body }}>
                {c.parcelas.length > 1 ? `${c.parcelas.length} parcelas` : "À vista"}
              </div>
              <div style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 12, color: p && p.data < hoje ? C.faint : C.body }}>
                {p ? `${br(p.data)} · ${brlExato(p.valorCentavos)}` : "—"}
              </div>
              <Celula forte>{brlExato(totalDoContrato(c))}</Celula>
              <Celula>{efetiva === "fora" ? "—" : brlExato(totalNoPeriodo(c, de, ate))}</Celula>
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

/** Uma parcela no formulário: o valor como a pessoa digita. `k` é só a chave da linha na tela. */
type Rascunho = { k: number; id?: number; data: string; valor: string };

let proximaChave = 1;
const rascunhoDe = (p: { id?: number; data: string; valorCentavos: number }): Rascunho => ({
  k: proximaChave++, id: p.id, data: p.data, valor: deCentavos(p.valorCentavos),
});

function FormContrato({
  inicial,
  deals,
  contratos,
  somenteLeitura,
  onFechar,
  onMudou,
}: {
  inicial: Partial<Contrato>;
  deals: Deal[];
  contratos: Contrato[];
  /** Quem não é admin abre para ver as parcelas; não salva nem exclui. */
  somenteLeitura?: boolean;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const editando = inicial.id != null;
  const [dealId, setDealId] = useState<number | null>(inicial.dealId ?? null);
  const [conta, setConta] = useState(inicial.conta ?? "");
  const [area, setArea] = useState(inicial.area ?? "");
  const [situacao, setSituacao] = useState<"contratada" | "prevista">(inicial.situacao ?? "contratada");
  const [chance, setChance] = useState<"alta" | "baixa">(inicial.chance ?? "alta");
  const [notas, setNotas] = useState(inicial.notas ?? "");
  const [cnpj, setCnpj] = useState(inicial.cobranca?.cnpj ?? "");
  const [emailCobranca, setEmailCobranca] = useState(inicial.cobranca?.emailCobranca ?? "");
  const [formaCobranca, setFormaCobranca] = useState<string>(inicial.cobranca?.formaCobranca ?? "boleto");
  const [parcelas, setParcelas] = useState<Rascunho[]>(() => emOrdem(inicial.parcelas ?? []).map(rascunhoDe));
  const [modo, setModo] = useState<Pagamento>(pagamentoDe(inicial.parcelas ?? []));
  // "Gerar parcelas iguais": só um atalho para preencher a lista, que depois se edita linha a linha.
  const [gerTotal, setGerTotal] = useState("");
  const [gerN, setGerN] = useState("3");
  const [gerData, setGerData] = useState("");
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

  // À vista é a lista com uma linha só: a primeira. Parcelado mostra e envia todas.
  const visiveis = modo === "a_vista" ? parcelas.slice(0, 1) : parcelas;
  const total = visiveis.reduce((t, p) => t + paraCentavos(p.valor), 0);
  const incompletas = visiveis.some((p) => !dataValida(p.data) || paraCentavos(p.valor) <= 0);
  const mexe = (k: number, campo: "data" | "valor", v: string) => setParcelas((ps) => ps.map((p) => (p.k === k ? { ...p, [campo]: v } : p)));
  const acrescentar = () => setParcelas((ps) => [...ps, { k: proximaChave++, data: "", valor: "" }]);
  const remover = (k: number) => setParcelas((ps) => ps.filter((p) => p.k !== k));
  const trocarModo = (m: Pagamento) => {
    setModo(m);
    if (m === "parcelado" && parcelas.length < 2) {
      // Parcelado começa com duas linhas; a primeira guarda o que já estava no à vista.
      setParcelas((ps) => [...ps, ...Array.from({ length: 2 - ps.length }, () => ({ k: proximaChave++, data: "", valor: "" }))]);
    }
    if (m === "a_vista" && parcelas.length === 0) acrescentar();
  };
  const gerar = () => {
    const centavos = paraCentavos(gerTotal);
    const n = Number(gerN) || 0;
    if (centavos <= 0 || n < 2 || !dataValida(gerData)) return;
    // As parcelas já gravadas doam o id às novas, na ordem: quem já foi faturada continua ligada.
    const ids = parcelas.map((p) => p.id);
    setParcelas(parcelasIguais(centavos, n, gerData).map((p, i) => rascunhoDe({ ...p, id: ids[i] })));
  };
  const podeGerar = paraCentavos(gerTotal) > 0 && (Number(gerN) || 0) >= 2 && dataValida(gerData);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    const corpo = {
      conta,
      area,
      dealId,
      situacao: sitEfetiva,
      chance: sitEfetiva === "prevista" ? chance : null,
      notas,
      cobranca: { cnpj, emailCobranca, formaCobranca },
      parcelas: visiveis.map((p) => ({ id: p.id, data: p.data, valorCentavos: paraCentavos(p.valor) })),
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
    if (!window.confirm(`Excluir a receita de ${inicial.conta}?\n\nAs parcelas somem; as faturas já emitidas ficam. O histórico continua no changelog.`)) return;
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
      titulo={editando ? `${inicial.conta} · ${inicial.ref}` : "Nova receita"}
      eyebrowTexto="COLMÉIA/ RECEITA"
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
          <Field label="Produto" required>
            <Select
              value={area}
              onChange={setArea}
              options={[{ value: "", label: "— escolha —" }, ...areas.map((a) => ({ value: a.id, label: a.label }))]}
            />
          </Field>
        </div>
        <div className="rec-form__duas">
          <Field label="Situação" hint={ganho ? "O card está em Ganho: a receita é contratada." : undefined}>
            <div role="group" aria-label="Situação" className="col-densidade">
              {(["contratada", "prevista"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={sitEfetiva === s} disabled={ganho} onClick={() => setSituacao(s)}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
          {sitEfetiva === "prevista" && (
            <Field label="Chance de fechar" hint="Alta soma como provável; baixa, como possível.">
              <div role="group" aria-label="Chance de fechar" className="col-densidade">
                {(["alta", "baixa"] as const).map((c) => (
                  <button key={c} type="button" aria-pressed={chance === c} onClick={() => setChance(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </Field>
          )}
        </div>
        {deal && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
            Valor no card: {brlExato(deal.valorCentavos)} · {stageLabel(deal.estagio)}
          </div>
        )}

        {/* Pagamento: à vista é uma parcela só; parcelado é uma lista livre, cada linha com a
            sua data e o seu valor — sem intervalo fixo e sem valor igual. */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={eyebrow(10, C.dust, "0.14em")}>PAGAMENTO</div>
            <div role="group" aria-label="Forma de pagamento" className="col-densidade">
              {PAGAMENTOS.map((m) => (
                <button key={m.key} type="button" aria-pressed={modo === m.key} disabled={somenteLeitura} onClick={() => trocarModo(m.key)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {modo === "a_vista" ? (
            <div className="rec-form__duas">
              <Field label="Valor (R$)" required>
                <Input value={visiveis[0]?.valor ?? ""} onChange={(v) => (visiveis[0] ? mexe(visiveis[0].k, "valor", v) : setParcelas([{ k: proximaChave++, data: "", valor: v }]))} placeholder="0,00" />
              </Field>
              <Field label="Vencimento" required>
                <CampoData valor={visiveis[0]?.data ?? ""} onChange={(v) => (visiveis[0] ? mexe(visiveis[0].k, "data", v) : setParcelas([{ k: proximaChave++, data: v, valor: "" }]))} />
              </Field>
            </div>
          ) : (
            <>
              {!somenteLeitura && (
                <div className="rec-gerar">
                  <Field label="Total (R$)">
                    <Input value={gerTotal} onChange={setGerTotal} placeholder="0,00" size="sm" />
                  </Field>
                  <Field label="Parcelas">
                    <Input value={gerN} onChange={(v) => setGerN(v.replace(/\D/g, "").slice(0, 3))} size="sm" />
                  </Field>
                  <Field label="Primeira em">
                    <CampoData valor={gerData} onChange={setGerData} />
                  </Field>
                  <Button variant="outline" size="sm" disabled={!podeGerar} onClick={gerar}>
                    gerar parcelas iguais
                  </Button>
                </div>
              )}
              <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, margin: "8px 0 10px" }}>
                Atalho opcional: preenche a lista com parcelas mensais iguais. Depois, mude a data e o valor de cada uma à vontade.
              </div>
              <div className="rec-parcelas">
                {parcelas.map((p, i) => (
                  <div key={p.k} className="rec-parcela">
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{i + 1}</span>
                    <CampoData valor={p.data} onChange={(v) => mexe(p.k, "data", v)} />
                    <Input value={p.valor} onChange={(v) => mexe(p.k, "valor", v)} placeholder="0,00" size="sm" />
                    {!somenteLeitura && (
                      <button type="button" className="rec-parcela__remover" onClick={() => remover(p.k)} disabled={parcelas.length <= 2} title="Remover esta parcela" aria-label={`Remover a parcela ${i + 1}`}>
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!somenteLeitura && parcelas.length < LIMITES_RECEITA.parcelas && (
                <button type="button" className="rec-link" style={{ marginTop: 10 }} onClick={acrescentar}>
                  + parcela
                </button>
              )}
            </>
          )}

          <div className="rec-total">
            <span style={eyebrow(10, C.dust, "0.14em")}>TOTAL{modo === "parcelado" ? ` · ${visiveis.length} PARCELAS` : ""}</span>
            <strong>{brlExato(total)}</strong>
          </div>
          {deal && deal.valorCentavos > 0 && total > 0 && total !== deal.valorCentavos && (
            <div style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>
              Diferente do valor no card ({brlExato(deal.valorCentavos)}). Tudo bem se for de propósito.
            </div>
          )}
        </div>

        {/* Dados de cobrança: o Faturamento usa para sugerir a forma e para o e-mail de cobrança. */}
        <div>
          <div style={{ ...eyebrow(10, C.dust, "0.14em"), marginBottom: 10 }}>COBRANÇA</div>
          <div className="rec-form__quatro">
            <Field label="CNPJ do cliente">
              <Input value={cnpj} onChange={setCnpj} placeholder="00.000.000/0000-00" size="sm" />
            </Field>
            <Field label="E-mail do financeiro">
              <Input value={emailCobranca} onChange={setEmailCobranca} placeholder="financeiro@cliente.com.br" size="sm" />
            </Field>
            <Field label="Meio de cobrança">
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

        {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          {somenteLeitura ? (
            <span style={{ fontSize: 12.5, color: C.faint }}>Somente leitura: só a administração altera a receita.</span>
          ) : editando ? (
            <button type="button" className="rec-link" style={{ color: C.error }} onClick={() => void excluir()} disabled={salvando}>
              excluir receita
            </button>
          ) : (
            <span />
          )}
          <span style={{ display: "flex", gap: 10 }}>
            <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
              {somenteLeitura ? "fechar" : "cancelar"}
            </Button>
            {!somenteLeitura && (
              <Button variant="solid" size="sm" disabled={salvando || !conta.trim() || !area || visiveis.length === 0 || incompletas} onClick={() => void salvar()}>
                {salvando ? "salvando…" : editando ? "salvar alterações" : "cadastrar receita"}
              </Button>
            )}
          </span>
        </div>
      </div>
    </Modal>
  );
}
