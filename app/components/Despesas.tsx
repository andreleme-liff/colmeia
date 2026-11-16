"use client";

// Despesas — contas a pagar (só admin). O par do Faturamento: lá entra, aqui sai.
//
// Quatro visões:
//  · POR MÊS (competência): tudo o que pertence àquele mês. As recorrências (PJ, advisors,
//    assinaturas) aparecem sozinhas como PREVISTAS; lançar é confirmar valor e vencimento
//    quando a nota chega. Embaixo, quanto cada categoria pesou no mês.
//  · A PAGAR: tudo o que está lançado e não foi pago, de qualquer mês, por vencimento. É a
//    visão de caixa: o que venceu, o que vence na semana, o que vem depois.
//  · RECORRENTES: os compromissos mensais e o gasto fixo que eles somam.
//  · CADASTROS: favorecidos (quem recebe) e categorias (o plano de contas).
//
// A fatura do cartão corporativo é uma conta só, com as compras como itens, cada uma na sua
// categoria. As regras moram em `lib/despesas.ts`.

import { useEffect, useState, type ReactNode } from "react";
import { useOrdem } from "./ordenacao";
import { Button, Field, Input, Select, Switch } from "./ds";
import { C, GHOST_FIX, MONO, eyebrow, R } from "./tokens";
import { api } from "./api";
import { CampoData, Modal } from "./views";
import { aplicarBusca, areaOf, brl, brlExato, hojeISO, prepararBusca, porTexto, todasAreas } from "@/lib/domain";
import { mesDe, rotuloMes, somarMeses } from "@/lib/forecast";
import type { DadosDespesas } from "@/lib/despesas-db";
import {
  FORMAS_PAGAMENTO, GRUPOS, ROTULO_STATUS_DESPESA, TIPOS_FAVORECIDO, compromissoMensal, contasDoMes, csvDasDespesas, diasVencida,
  faixasAPagar, mediaPaga, porCategoria, recorrenciaAtivaEm, rotuloFormaPagamento, rotuloGrupo, rotuloTipoFavorecido, statusDaDespesa,
  vencimentoDaRecorrencia,
  type Categoria, type ContaDoMes, type Despesa, type Favorecido, type Recorrencia, type StatusDespesa,
} from "@/lib/despesas";

const TOM: Record<StatusDespesa, string> = {
  prevista: "neutro",
  aberta: "info",
  vencida: "erro",
  paga: "sucesso",
  cancelada: "neutro",
};

function Status({ s, dias }: { s: StatusDespesa; dias?: number }) {
  return (
    <span className={`cop-tag cop-tag--${TOM[s]}`} style={s === "cancelada" ? { textDecoration: "line-through" } : undefined}>
      {ROTULO_STATUS_DESPESA[s]}
      {s === "vencida" && dias ? ` · ${dias}d` : ""}
    </span>
  );
}

function paraCentavos(texto: string): number {
  const n = Number(texto.replace(/[R$\s.]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
const deCentavos = (c: number) => (c ? (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const rotuloArea = (id: string | null) => (id ? areaOf(id).label : "");

type Aba = "mes" | "pagar" | "recorrentes" | "cadastros";
type Filtro = "todas" | "previstas" | "a_pagar" | "vencidas" | "pagas";
const FILTROS: { key: Filtro; label: string; casa: (s: StatusDespesa) => boolean }[] = [
  { key: "todas", label: "Todas", casa: () => true },
  { key: "previstas", label: "Previstas", casa: (s) => s === "prevista" },
  { key: "a_pagar", label: "A pagar", casa: (s) => s === "aberta" || s === "vencida" },
  { key: "vencidas", label: "Vencidas", casa: (s) => s === "vencida" },
  { key: "pagas", label: "Pagas", casa: (s) => s === "paga" },
];

type Acao =
  | { tipo: "nova" }
  | { tipo: "lancar"; linha: ContaDoMes }
  | { tipo: "corrigir"; despesa: Despesa }
  | { tipo: "pagar"; despesa: Despesa }
  | { tipo: "detalhe"; despesa: Despesa }
  | { tipo: "recorrencia"; recorrencia: Recorrencia | null }
  | { tipo: "favorecido"; favorecido: Favorecido | null }
  | { tipo: "categoria"; categoria: Categoria | null };

export default function Despesas({ area, busca, gatilho }: { area: string; busca: string; gatilho: number | undefined }) {
  const hoje = hojeISO();
  const [dados, setDados] = useState<DadosDespesas | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [aba, setAba] = useState<Aba>("mes");
  const [competencia, setCompetencia] = useState(mesDe(hoje));
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [acao, setAcao] = useState<Acao | null>(null);

  useEffect(() => {
    let vivo = true;
    api.despesas().then(
      (d) => {
        if (!vivo) return;
        setDados(d);
        setFalha(null);
      },
      (e: unknown) => vivo && setFalha(e instanceof Error ? e.message : "Não foi possível carregar as despesas.")
    );
    return () => {
      vivo = false;
    };
  }, [gatilho, versao]);

  if (falha && !dados) return <div style={{ fontSize: 14, color: C.error }}>{falha}</div>;
  if (!dados) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>carregando despesas…</div>;

  const { categorias, favorecidos, recorrencias, despesas } = dados;
  const catPorId = new Map(categorias.map((c) => [c.id, c]));
  const favPorId = new Map(favorecidos.map((f) => [f.id, f]));
  const nomeCat = (id: number | null) => (id == null ? "" : catPorId.get(id)?.nome ?? "");
  const termo = prepararBusca(busca);
  // Com um produto escolhido no cabeçalho, ficam só as contas (ou itens) daquele produto.
  const doProduto = (a: string | null, itens: { area: string | null }[] = []) => area === "all" || a === area || itens.some((i) => i.area === area);

  // ---------- visão do mês ----------
  const mesAtual = mesDe(hoje);
  const todasDoMes = contasDoMes(recorrencias, favorecidos, despesas, competencia, hoje).filter((l) => doProduto(l.area, l.despesa?.itens));
  const buscadas = aplicarBusca(todasDoMes, termo, (l) => [
    l.favorecido, l.despesa?.ref, l.descricao, l.despesa?.documento, nomeCat(l.categoriaId), ...(l.despesa?.itens.map((i) => i.descricao) ?? []),
  ]);
  const casa = FILTROS.find((f) => f.key === filtro)!.casa;
  const doMes = buscadas.filter((l) => casa(l.status));
  const soma = (l: { valorCentavos: number }[]) => l.reduce((t, i) => t + i.valorCentavos, 0);
  const pendentesDoMes = todasDoMes.filter((l) => l.status === "prevista" || l.status === "aberta" || l.status === "vencida");
  const previstasDoMes = todasDoMes.filter((l) => l.status === "prevista");

  // ---------- a pagar (todos os meses) ----------
  const despesasDoProduto = despesas.filter((d) => doProduto(d.area, d.itens));
  const abertas = despesasDoProduto.filter((d) => d.status === "aberta").sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const abertasBuscadas = aplicarBusca(abertas, termo, (d) => [d.favorecido, d.ref, d.descricao, d.documento, nomeCat(d.categoriaId), ...d.itens.map((i) => i.descricao)]);
  const vencidas = abertas.filter((d) => statusDaDespesa(d, hoje) === "vencida");
  const pagasNoMes = despesasDoProduto.filter((d) => d.status === "paga" && d.pagoEm && mesDe(d.pagoEm) === mesAtual);
  const fixo = compromissoMensal(recorrencias.filter((r) => doProduto(r.area)), mesAtual);
  const media = mediaPaga(despesasDoProduto, hoje);

  const mudou = () => {
    setAcao(null);
    setVersao((v) => v + 1);
  };

  const exportar = () => {
    const csv = csvDasDespesas(todasDoMes, categorias, rotuloArea);
    // BOM para o Excel ler os acentos.
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `despesas-${competencia}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const semCadastro = favorecidos.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ---------- números ---------- */}
      <div className="rec-numeros">
        <Numero
          rotulo={`A pagar · ${rotuloMes(competencia)}`}
          valor={soma(pendentesDoMes)}
          detalhe={
            pendentesDoMes.length
              ? `${plural(pendentesDoMes.length, "conta", "contas")}${previstasDoMes.length ? `, ${plural(previstasDoMes.length, "prevista", "previstas")} a lançar` : ""}`
              : "Nada pendente nesta competência"
          }
        />
        <Numero
          rotulo={`Pago · ${rotuloMes(mesAtual)}`}
          valor={pagasNoMes.reduce((t, d) => t + (d.valorPagoCentavos ?? 0), 0)}
          detalhe={`${plural(pagasNoMes.length, "pagamento", "pagamentos")} neste mês`}
        />
        <Numero
          rotulo="Vencidas"
          valor={soma(vencidas)}
          detalhe={vencidas.length ? `${plural(vencidas.length, "conta", "contas")} em atraso` : "Nada vencido"}
          alerta={vencidas.length > 0}
        />
        <Numero
          rotulo="Gasto fixo mensal"
          valor={fixo}
          detalhe={media ? `Média paga nos últimos 3 meses: ${brl(media)}` : "Soma das despesas recorrentes ativas"}
        />
      </div>

      {/* ---------- barra de controle ---------- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div role="group" aria-label="Visão" className="liff-densidade desp-abas">
          <button type="button" aria-pressed={aba === "mes"} onClick={() => setAba("mes")}>
            por mês
          </button>
          <button type="button" aria-pressed={aba === "pagar"} onClick={() => setAba("pagar")}>
            a pagar · {abertas.length}
          </button>
          <button type="button" aria-pressed={aba === "recorrentes"} onClick={() => setAba("recorrentes")}>
            recorrentes · {recorrencias.filter((r) => recorrenciaAtivaEm(r, mesAtual)).length}
          </button>
          <button type="button" aria-pressed={aba === "cadastros"} onClick={() => setAba("cadastros")}>
            cadastros
          </button>
        </div>
        {aba === "mes" && (
          <>
            <div className="fat-mes">
              <button type="button" aria-label="Mês anterior" onClick={() => setCompetencia((m) => somarMeses(m, -1))}>
                ‹
              </button>
              <span>{rotuloMes(competencia)}</span>
              <button type="button" aria-label="Próximo mês" onClick={() => setCompetencia((m) => somarMeses(m, 1))}>
                ›
              </button>
            </div>
            {competencia !== mesAtual && (
              <button type="button" className="rec-link" onClick={() => setCompetencia(mesAtual)}>
                mês atual
              </button>
            )}
            <div role="group" aria-label="Filtrar por situação" className="liff-densidade desp-abas">
              {FILTROS.map((f) => (
                <button key={f.key} type="button" aria-pressed={filtro === f.key} onClick={() => setFiltro(f.key)}>
                  {f.label} · {todasDoMes.filter((l) => f.casa(l.status)).length}
                </button>
              ))}
            </div>
          </>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          {aba === "mes" && todasDoMes.length > 0 && (
            <button type="button" className="rec-link" onClick={exportar} title="Planilha do mês para a contabilidade, com uma linha por item">
              exportar CSV
            </button>
          )}
          {aba === "recorrentes" ? (
            <Button variant="solid" size="sm" disabled={semCadastro} onClick={() => setAcao({ tipo: "recorrencia", recorrencia: null })}>
              + recorrência
            </Button>
          ) : aba === "cadastros" ? null : (
            <Button variant="solid" size="sm" disabled={semCadastro} onClick={() => setAcao({ tipo: "nova" })}>
              + conta a pagar
            </Button>
          )}
        </span>
      </div>

      {semCadastro && aba !== "cadastros" && (
        <div style={{ fontSize: 14, color: C.body, lineHeight: 1.6, maxWidth: 680 }}>
          Para começar, cadastre quem recebe: cada colaborador PJ, cada advisor e o cartão corporativo.{" "}
          <button type="button" className="rec-link" onClick={() => setAba("cadastros")}>
            abrir cadastros
          </button>
        </div>
      )}

      {aba === "mes" && (
        <>
          <TabelaMes
            linhas={doMes}
            vazio={
              todasDoMes.length === 0
                ? `Nenhuma despesa em ${rotuloMes(competencia)}. As recorrentes aparecem aqui sozinhas, como previstas; as demais entram por "+ conta a pagar".`
                : "Nenhuma conta nesta situação."
            }
            nomeCat={nomeCat}
            favPorId={favPorId}
            hoje={hoje}
            onAcao={setAcao}
          />
          <ResumoCategorias linhas={todasDoMes} categorias={categorias} mes={competencia} />
        </>
      )}

      {aba === "pagar" && (
        <>
          <div className="fat-aging" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            {faixasAPagar(despesasDoProduto, hoje).map((f) => (
              <div key={f.key} className="fat-aging__faixa" data-tom={f.key === "vencidas" ? "erro" : f.key === "7_dias" ? "aviso" : "ok"}>
                <div style={eyebrow(10, C.faint, "0.12em")}>{f.label}</div>
                <div className="fat-aging__valor">{brl(f.valor)}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{plural(f.qtd, "conta", "contas")}</div>
              </div>
            ))}
          </div>
          <TabelaAPagar despesas={abertasBuscadas} nomeCat={nomeCat} hoje={hoje} onAcao={setAcao} />
        </>
      )}

      {aba === "recorrentes" && (
        <TabelaRecorrencias
          recorrencias={recorrencias.filter((r) => doProduto(r.area))}
          favPorId={favPorId}
          nomeCat={nomeCat}
          mesAtual={mesAtual}
          onAbrir={(r) => setAcao({ tipo: "recorrencia", recorrencia: r })}
        />
      )}

      {aba === "cadastros" && <Cadastros dados={dados} onAcao={setAcao} />}

      {/* ---------- modais ---------- */}
      {acao?.tipo === "nova" && (
        <FormConta
          titulo="Nova conta a pagar"
          subtitulo="lançamento"
          dados={dados}
          competenciaInicial={competencia}
          hoje={hoje}
          onFechar={() => setAcao(null)}
          onSalvar={(corpo) => api.lancarDespesa(corpo).then(mudou)}
        />
      )}
      {acao?.tipo === "lancar" && (
        <FormConta
          titulo={`Lançar · ${acao.linha.favorecido}`}
          subtitulo={`recorrente · competência ${rotuloMes(acao.linha.competencia)}`}
          dados={dados}
          linha={acao.linha}
          hoje={hoje}
          onFechar={() => setAcao(null)}
          onSalvar={(corpo) => api.lancarDespesa({ ...corpo, recorrenciaId: acao.linha.recorrenciaId }).then(mudou)}
        />
      )}
      {acao?.tipo === "corrigir" && (
        <FormConta
          titulo={`Corrigir ${acao.despesa.ref} · ${acao.despesa.favorecido}`}
          subtitulo={`competência ${rotuloMes(acao.despesa.competencia)}`}
          dados={dados}
          despesa={acao.despesa}
          hoje={hoje}
          onFechar={() => setAcao(null)}
          onSalvar={(corpo) => api.acaoDespesa(acao.despesa.id, { acao: "editar", ...corpo }).then(mudou)}
        />
      )}
      {acao?.tipo === "pagar" && <FormPagamento despesa={acao.despesa} hoje={hoje} onFechar={() => setAcao(null)} onSalvo={mudou} />}
      {acao?.tipo === "detalhe" && (
        <Detalhe despesa={acao.despesa} nomeCat={nomeCat} favorecido={favPorId.get(acao.despesa.favorecidoId)} hoje={hoje} onFechar={() => setAcao(null)} onAcao={setAcao} onMudou={mudou} />
      )}
      {acao?.tipo === "recorrencia" && <FormRecorrencia recorrencia={acao.recorrencia} dados={dados} hoje={hoje} onFechar={() => setAcao(null)} onSalvo={mudou} />}
      {acao?.tipo === "favorecido" && <FormFavorecido favorecido={acao.favorecido} onFechar={() => setAcao(null)} onSalvo={mudou} />}
      {acao?.tipo === "categoria" && <FormCategoria categoria={acao.categoria} onFechar={() => setAcao(null)} onSalvo={mudou} />}
    </div>
  );
}

/* ============================== peças ============================== */

function Numero({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: number; detalhe: string; alerta?: boolean }) {
  return (
    <div className="rec-numero">
      <div style={eyebrow(10, C.faint, "0.12em")}>{rotulo}</div>
      <div className="rec-numero__valor" title={brlExato(valor)}>
        {brl(valor)}
      </div>
      <div style={{ fontSize: 12, color: alerta ? "var(--cop-ink-error)" : C.faint, lineHeight: 1.45 }}>{detalhe}</div>
    </div>
  );
}

/** "Mensalidade de novembro" ou, sem descrição, a categoria; conta com itens diz quantos tem. */
function oQue(descricao: string, categoria: string, itens: number): string {
  const base = descricao || categoria || "—";
  return itens ? `${base} · ${plural(itens, "item", "itens")}` : base;
}

const COLS_MES = "1.5fr 1.4fr 1.1fr 0.8fr 0.8fr 0.9fr 110px";

function TabelaMes({
  linhas,
  vazio,
  nomeCat,
  favPorId,
  hoje,
  onAcao,
}: {
  linhas: ContaDoMes[];
  vazio: string;
  nomeCat: (id: number | null) => string;
  favPorId: Map<number, Favorecido>;
  hoje: string;
  onAcao: (a: Acao) => void;
}) {
  const ord = useOrdem();
  if (!linhas.length) return <div style={{ fontSize: 14, color: C.faint, lineHeight: 1.6, maxWidth: 680 }}>{vazio}</div>;
  const categoriaDe = (l: ContaDoMes) => (l.despesa?.itens.length ? "Várias" : nomeCat(l.categoriaId) || "—");
  return (
    <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}`, borderRadius: R }}>
      <div style={{ minWidth: 940 }}>
        <div className="fat-linha fat-linha--cab" style={{ gridTemplateColumns: COLS_MES }}>
          {(
            [["favorecido", "FAVORECIDO"], ["oque", "O QUE"], ["categoria", "CATEGORIA"], ["valor", "VALOR"], ["vencimento", "VENCIMENTO"], ["situacao", "SITUAÇÃO"], [null, ""]] as const
          ).map(([chave, h], k) => ord.th(chave, h, { ...eyebrow(10, C.faint), textAlign: h === "VALOR" ? "right" : "left" }, k))}
        </div>
        {ord
          .aplicar(linhas, {
            favorecido: (l) => l.favorecido,
            oque: (l) => l.descricao,
            categoria: categoriaDe,
            valor: (l) => l.valorCentavos,
            vencimento: (l) => l.vencimento,
            situacao: (l) => l.status,
          })
          .map((l) => {
            const d = l.despesa;
            const tipo = favPorId.get(l.favorecidoId)?.tipo;
            return (
              <div
                key={l.chave}
                className={`fat-linha${d ? " liff-hover-row" : ""}`}
                style={{ gridTemplateColumns: COLS_MES, cursor: d ? "pointer" : undefined }}
                onClick={() => d && onAcao({ tipo: "detalhe", despesa: d })}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="fat-cliente">{l.favorecido}</div>
                  <div className="fat-meta">
                    {[d?.ref, tipo && rotuloTipoFavorecido(tipo), l.recorrenciaId != null && "recorrente", rotuloArea(l.area)].filter(Boolean).join(" · ")}
                    {l.canceladas.length ? ` · ${plural(l.canceladas.length, "cancelada", "canceladas")}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: C.body, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {oQue(l.descricao, "", d?.itens.length ?? 0)}
                </div>
                <div style={{ fontSize: 12.5, color: C.body }}>{categoriaDe(l)}</div>
                <div className="fat-num">{brlExato(l.valorCentavos)}</div>
                <div className="fat-meta" style={{ fontSize: 12 }}>
                  {br(l.vencimento)}
                </div>
                <div>
                  <Status s={l.status} dias={diasVencida(l.vencimento, hoje)} />
                </div>
                <div style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                  {l.status === "prevista" && (
                    <Button variant="outline" size="xs" onClick={() => onAcao({ tipo: "lancar", linha: l })} title="Confirma valor e vencimento e passa a conta para a pagar">
                      lançar
                    </Button>
                  )}
                  {d && (l.status === "aberta" || l.status === "vencida") && (
                    <Button variant="outline" size="xs" onClick={() => onAcao({ tipo: "pagar", despesa: d })}>
                      pagar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

/** Quanto cada categoria pesou no mês: barras proporcionais à maior, agrupáveis pelo olho. */
function ResumoCategorias({ linhas, categorias, mes }: { linhas: ContaDoMes[]; categorias: Categoria[]; mes: string }) {
  const totais = porCategoria(linhas, categorias);
  if (!totais.length) return null;
  const total = totais.reduce((t, c) => t + c.valor, 0);
  const maior = totais[0].valor;
  return (
    <div>
      <div style={{ ...eyebrow(10, C.faint, "0.12em"), marginBottom: 10 }}>
        Por categoria · {rotuloMes(mes)} · {brlExato(total)} (previstas, a pagar e pagas)
      </div>
      <div className="desp-cats">
        {totais.map((c) => (
          <div key={c.categoriaId ?? "sem"} className="desp-cat">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</div>
              <div className="fat-meta">{c.grupo ? rotuloGrupo(c.grupo) : "revise os itens da conta"}</div>
            </div>
            <div className="desp-cat__trilho" aria-hidden>
              <div className="desp-cat__barra" style={{ width: `${Math.max(2, (c.valor / maior) * 100)}%` }} />
            </div>
            <div className="fat-num">{brlExato(c.valor)}</div>
            <div className="fat-meta" style={{ fontSize: 12, textAlign: "right" }}>
              {total ? Math.round((c.valor / total) * 100) : 0}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const COLS_PAGAR = "1.5fr 1.5fr 0.9fr 0.9fr 0.8fr 0.9fr 110px";

function TabelaAPagar({ despesas, nomeCat, hoje, onAcao }: { despesas: Despesa[]; nomeCat: (id: number | null) => string; hoje: string; onAcao: (a: Acao) => void }) {
  const ord = useOrdem();
  if (!despesas.length) return <div style={{ fontSize: 14, color: C.faint }}>Nenhuma conta em aberto.</div>;
  return (
    <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}`, borderRadius: R }}>
      <div style={{ minWidth: 940 }}>
        <div className="fat-linha fat-linha--cab" style={{ gridTemplateColumns: COLS_PAGAR }}>
          {(
            [["favorecido", "FAVORECIDO"], ["oque", "O QUE"], ["competencia", "COMPETÊNCIA"], ["valor", "VALOR"], ["vencimento", "VENCIMENTO"], ["situacao", "SITUAÇÃO"], [null, ""]] as const
          ).map(([chave, h], k) => ord.th(chave, h, { ...eyebrow(10, C.faint), textAlign: h === "VALOR" ? "right" : "left" }, k))}
        </div>
        {ord
          .aplicar(despesas, {
            favorecido: (d) => d.favorecido,
            oque: (d) => d.descricao || nomeCat(d.categoriaId),
            competencia: (d) => d.competencia,
            valor: (d) => d.valorCentavos,
            vencimento: (d) => d.vencimento,
            situacao: (d) => statusDaDespesa(d, hoje),
          })
          .map((d) => (
            <div key={d.id} className="fat-linha liff-hover-row" style={{ gridTemplateColumns: COLS_PAGAR, cursor: "pointer" }} onClick={() => onAcao({ tipo: "detalhe", despesa: d })}>
              <div style={{ minWidth: 0 }}>
                <div className="fat-cliente">{d.favorecido}</div>
                <div className="fat-meta">{[d.ref, rotuloFormaPagamento(d.forma), d.documento && `doc. ${d.documento}`].filter(Boolean).join(" · ")}</div>
              </div>
              <div style={{ fontSize: 13, color: C.body, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {oQue(d.descricao, nomeCat(d.categoriaId), d.itens.length)}
              </div>
              <div className="fat-meta" style={{ fontSize: 12 }}>{rotuloMes(d.competencia)}</div>
              <div className="fat-num">{brlExato(d.valorCentavos)}</div>
              <div className="fat-meta" style={{ fontSize: 12 }}>{br(d.vencimento)}</div>
              <div>
                <Status s={statusDaDespesa(d, hoje)} dias={diasVencida(d.vencimento, hoje)} />
              </div>
              <div style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                <Button variant="outline" size="xs" onClick={() => onAcao({ tipo: "pagar", despesa: d })}>
                  pagar
                </Button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

const COLS_REC = "1.5fr 1.4fr 1.1fr 0.8fr 1fr 1.1fr 0.8fr";

function TabelaRecorrencias({
  recorrencias,
  favPorId,
  nomeCat,
  mesAtual,
  onAbrir,
}: {
  recorrencias: Recorrencia[];
  favPorId: Map<number, Favorecido>;
  nomeCat: (id: number | null) => string;
  mesAtual: string;
  onAbrir: (r: Recorrencia) => void;
}) {
  const ord = useOrdem();
  if (!recorrencias.length) {
    return (
      <div style={{ fontSize: 14, color: C.faint, lineHeight: 1.6, maxWidth: 680 }}>
        Nenhuma despesa recorrente. Cadastre aqui o que se repete todo mês (o contrato de cada PJ, cada advisor, assinaturas): a conta
        do mês aparece sozinha como prevista, e a soma vira o gasto fixo mensal.
      </div>
    );
  }
  const situacao = (r: Recorrencia) => (recorrenciaAtivaEm(r, mesAtual) ? "ativa" : r.inicio > mesAtual ? "futura" : "encerrada");
  const nome = (r: Recorrencia) => favPorId.get(r.favorecidoId)?.nome ?? "—";
  return (
    <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}`, borderRadius: R }}>
      <div style={{ minWidth: 940 }}>
        <div className="fat-linha fat-linha--cab" style={{ gridTemplateColumns: COLS_REC }}>
          {(
            [["favorecido", "FAVORECIDO"], ["oque", "O QUE"], ["categoria", "CATEGORIA"], ["valor", "VALOR MENSAL"], ["vencimento", "VENCIMENTO"], ["vigencia", "VIGÊNCIA"], ["situacao", "SITUAÇÃO"]] as const
          ).map(([chave, h], k) => ord.th(chave, h, { ...eyebrow(10, C.faint), textAlign: h === "VALOR MENSAL" ? "right" : "left" }, k))}
        </div>
        {ord
          .aplicar(recorrencias, {
            favorecido: nome,
            oque: (r) => r.descricao,
            categoria: (r) => nomeCat(r.categoriaId),
            valor: (r) => r.valorCentavos,
            vencimento: (r) => r.diaVencimento + (r.venceMesSeguinte ? 31 : 0),
            vigencia: (r) => r.inicio,
            situacao,
          })
          .map((r) => {
            const s = situacao(r);
            const tipo = favPorId.get(r.favorecidoId)?.tipo;
            return (
              <div key={r.id} className="fat-linha liff-hover-row" style={{ gridTemplateColumns: COLS_REC, cursor: "pointer", opacity: s === "encerrada" ? 0.6 : 1 }} onClick={() => onAbrir(r)}>
                <div style={{ minWidth: 0 }}>
                  <div className="fat-cliente">{nome(r)}</div>
                  <div className="fat-meta">{[tipo && rotuloTipoFavorecido(tipo), rotuloArea(r.area)].filter(Boolean).join(" · ")}</div>
                </div>
                <div style={{ fontSize: 13, color: C.body }}>{r.descricao || "—"}</div>
                <div style={{ fontSize: 12.5, color: C.body }}>{nomeCat(r.categoriaId) || "—"}</div>
                <div className="fat-num">{brlExato(r.valorCentavos)}</div>
                <div className="fat-meta" style={{ fontSize: 12 }}>
                  dia {r.diaVencimento}
                  {r.venceMesSeguinte ? " do mês seguinte" : ""} · {rotuloFormaPagamento(r.forma)}
                </div>
                <div className="fat-meta" style={{ fontSize: 12 }}>
                  {rotuloMes(r.inicio)} {r.fim ? `a ${rotuloMes(r.fim)}` : "em diante"}
                </div>
                <div>
                  <span className={`cop-tag cop-tag--${s === "ativa" ? "sucesso" : s === "futura" ? "info" : "neutro"}`}>{s}</span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

const COLS_FAV = "1.6fr 1fr 1fr 1.6fr 0.6fr";

function Cadastros({ dados, onAcao }: { dados: DadosDespesas; onAcao: (a: Acao) => void }) {
  const { favorecidos, categorias } = dados;
  const cab = (titulo: string, texto: string, botao: string, aoClicar: () => void) => (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{titulo}</div>
        <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.5, maxWidth: 620, marginTop: 4 }}>{texto}</div>
      </div>
      <Button variant="outline" size="sm" onClick={aoClicar}>
        {botao}
      </Button>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
      <section>
        {cab(
          "Favorecidos",
          "Quem recebe: cada colaborador PJ, cada advisor, o cartão corporativo e os fornecedores. Quem saiu se desativa, para o histórico continuar inteiro.",
          "+ favorecido",
          () => onAcao({ tipo: "favorecido", favorecido: null })
        )}
        {favorecidos.length === 0 ? (
          <div style={{ fontSize: 14, color: C.faint }}>Nenhum favorecido cadastrado.</div>
        ) : (
          <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}`, borderRadius: R }}>
            <div style={{ minWidth: 820 }}>
              <div className="fat-linha fat-linha--cab" style={{ gridTemplateColumns: COLS_FAV }}>
                {["NOME", "TIPO", "CNPJ / CPF", "COMO PAGAR", "SITUAÇÃO"].map((h) => (
                  <div key={h} style={eyebrow(10, C.faint)}>
                    {h}
                  </div>
                ))}
              </div>
              {favorecidos.map((f) => (
                <div key={f.id} className="fat-linha liff-hover-row" style={{ gridTemplateColumns: COLS_FAV, cursor: "pointer", opacity: f.ativo ? 1 : 0.6 }} onClick={() => onAcao({ tipo: "favorecido", favorecido: f })}>
                  <div style={{ minWidth: 0 }}>
                    <div className="fat-cliente">{f.nome}</div>
                    {f.contato && <div className="fat-meta">{f.contato}</div>}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.body }}>{rotuloTipoFavorecido(f.tipo)}</div>
                  <div className="fat-meta" style={{ fontSize: 12 }}>{f.documento || "—"}</div>
                  <div style={{ fontSize: 12.5, color: C.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.pagamento || "—"}</div>
                  <div>
                    <span className={`cop-tag cop-tag--${f.ativo ? "sucesso" : "neutro"}`}>{f.ativo ? "ativo" : "inativo"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        {cab(
          "Categorias",
          "O plano de contas. Cada categoria pertence a um grupo; hoje ele só organiza a tela, e é o que vai montar a DRE e a margem quando chegar a hora.",
          "+ categoria",
          () => onAcao({ tipo: "categoria", categoria: null })
        )}
        <div className="desp-grupos">
          {GRUPOS.map((g) => {
            const doGrupo = categorias.filter((c) => c.grupo === g.key);
            return (
              <div key={g.key} className="desp-grupo">
                <div style={eyebrow(10, C.faint, "0.12em")}>{g.label}</div>
                {doGrupo.length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>Nenhuma categoria.</div>}
                {doGrupo.map((c) => (
                  <button key={c.id} type="button" className="desp-grupo__item" style={{ opacity: c.ativo ? 1 : 0.55 }} onClick={() => onAcao({ tipo: "categoria", categoria: c })}>
                    {c.nome}
                    {!c.ativo && <span className="fat-meta"> · inativa</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ============================== modais ============================== */

const opcoesProduto = () => [
  { value: "", label: "— da empresa toda —" },
  ...todasAreas().map((a) => ({ value: a.id, label: a.label })).sort((a, b) => porTexto(a.label, b.label)),
];
/**
 * Categorias ativas, mais a que o registro já usa (mesmo inativa), na ordem dos grupos. `curto`
 * tira o grupo do rótulo: na linha de item a coluna é estreita e o nome é o que importa.
 */
function opcoesCategoria(categorias: Categoria[], atual?: number | null, curto = false) {
  return [
    { value: "", label: "— escolha —" },
    ...categorias
      .filter((c) => c.ativo || c.id === atual)
      .sort((a, b) => GRUPOS.findIndex((g) => g.key === a.grupo) - GRUPOS.findIndex((g) => g.key === b.grupo) || porTexto(a.nome, b.nome))
      .map((c) => ({ value: String(c.id), label: curto ? c.nome : `${rotuloGrupo(c.grupo)} · ${c.nome}` })),
  ];
}
function opcoesFavorecido(favorecidos: Favorecido[], atual?: number | null) {
  return [
    { value: "", label: "— escolha —" },
    ...favorecidos
      .filter((f) => f.ativo || f.id === atual)
      .map((f) => ({ value: String(f.id), label: `${f.nome} · ${rotuloTipoFavorecido(f.tipo)}` })),
  ];
}

/** Interruptor com rótulo na tinta do corpo: o rótulo embutido do kit some no tema claro. */
function Alternar({ ligado, onChange, children }: { ligado: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Switch checked={ligado} onChange={onChange} />
      <span style={{ fontSize: 14, color: C.body, lineHeight: 1.4, cursor: "pointer" }} onClick={() => onChange(!ligado)}>
        {children}
      </span>
    </div>
  );
}

function Rodape({ erro, salvando, podeSalvar, rotulo, onFechar, onSalvar, esquerda }: {
  erro: string | null;
  salvando: boolean;
  podeSalvar: boolean;
  rotulo: string;
  onFechar: () => void;
  onSalvar: () => void;
  esquerda?: ReactNode;
}) {
  return (
    <>
      {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>{esquerda}</span>
        <span style={{ display: "flex", gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
            cancelar
          </Button>
          <Button variant="solid" size="sm" disabled={salvando || !podeSalvar} onClick={onSalvar}>
            {salvando ? "salvando…" : rotulo}
          </Button>
        </span>
      </div>
    </>
  );
}

/** Estado de "salvando" e de erro que todo formulário daqui repete. */
function useEnvio() {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const enviar = async (fazer: () => Promise<unknown>) => {
    setSalvando(true);
    setErro(null);
    try {
      await fazer();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      setSalvando(false);
    }
  };
  return { salvando, erro, enviar };
}

type ItemForm = { k: number; data: string; descricao: string; categoriaId: string; valor: string };
let proximoItem = 1;
const itemVazio = (): ItemForm => ({ k: proximoItem++, data: "", descricao: "", categoriaId: "", valor: "" });

/**
 * Lançamento e correção de conta. Três entradas: conta nova (tudo livre), linha prevista de
 * uma recorrência (favorecido e competência travados, o resto vem sugerido) e correção.
 */
function FormConta({
  titulo,
  subtitulo,
  dados,
  linha,
  despesa,
  competenciaInicial,
  hoje,
  onFechar,
  onSalvar,
}: {
  titulo: string;
  subtitulo: string;
  dados: DadosDespesas;
  linha?: ContaDoMes;
  despesa?: Despesa;
  competenciaInicial?: string;
  hoje: string;
  onFechar: () => void;
  onSalvar: (corpo: Record<string, unknown>) => Promise<unknown>;
}) {
  const rec = linha?.recorrenciaId != null ? dados.recorrencias.find((r) => r.id === linha.recorrenciaId) : undefined;
  const travada = !!linha || despesa?.recorrenciaId != null;
  const [favorecidoId, setFavorecidoId] = useState(String(despesa?.favorecidoId ?? linha?.favorecidoId ?? ""));
  const [competencia, setCompetencia] = useState(despesa?.competencia ?? linha?.competencia ?? competenciaInicial ?? mesDe(hoje));
  const [descricao, setDescricao] = useState(despesa?.descricao ?? linha?.descricao ?? "");
  const [categoriaId, setCategoriaId] = useState(String(despesa?.categoriaId ?? linha?.categoriaId ?? ""));
  const [area, setArea] = useState(despesa?.area ?? linha?.area ?? "");
  const [valor, setValor] = useState(deCentavos(despesa?.valorCentavos ?? linha?.valorCentavos ?? 0));
  const [vencimento, setVencimento] = useState(despesa?.vencimento ?? linha?.vencimento ?? "");
  const [forma, setForma] = useState<string>(despesa?.forma ?? rec?.forma ?? "pix");
  const [documento, setDocumento] = useState(despesa?.documento ?? "");
  const [notas, setNotas] = useState(despesa?.notas ?? "");
  const [itens, setItens] = useState<ItemForm[]>(
    () => despesa?.itens.map((i) => ({ k: proximoItem++, data: i.data ?? "", descricao: i.descricao, categoriaId: String(i.categoriaId), valor: deCentavos(i.valorCentavos) })) ?? []
  );
  const [comItens, setComItens] = useState((despesa?.itens.length ?? 0) > 0);
  const { salvando, erro, enviar } = useEnvio();

  const fav = dados.favorecidos.find((f) => String(f.id) === favorecidoId);
  const escolherFavorecido = (id: string) => {
    setFavorecidoId(id);
    // Fatura de cartão nasce já no modo de itens, com a primeira linha aberta.
    const novo = dados.favorecidos.find((f) => String(f.id) === id);
    if (novo?.tipo === "cartao" && !comItens) {
      setComItens(true);
      setItens((l) => (l.length ? l : [itemVazio()]));
      if (!descricao) setDescricao("Fatura do cartão");
      setForma("boleto");
    }
  };
  const alternarItens = (ligado: boolean) => {
    setComItens(ligado);
    if (ligado && !itens.length) setItens([itemVazio()]);
  };
  const mudarItem = (k: number, campo: keyof Omit<ItemForm, "k">, v: string) => setItens((l) => l.map((i) => (i.k === k ? { ...i, [campo]: v } : i)));

  const usados = comItens ? itens.filter((i) => i.descricao.trim() || i.valor.trim() || i.categoriaId) : [];
  const total = comItens ? usados.reduce((t, i) => t + paraCentavos(i.valor), 0) : paraCentavos(valor);
  const podeSalvar = !!favorecidoId && !!vencimento && total > 0 && (comItens ? usados.length > 0 : !!categoriaId);

  const salvar = () =>
    enviar(() =>
      onSalvar({
        favorecidoId: Number(favorecidoId),
        competencia,
        descricao,
        area,
        vencimento,
        forma,
        documento,
        notas,
        ...(comItens
          ? { itens: usados.map((i) => ({ data: i.data || null, descricao: i.descricao, categoriaId: Number(i.categoriaId), valorCentavos: paraCentavos(i.valor) })) }
          : { categoriaId: Number(categoriaId), valorCentavos: paraCentavos(valor), itens: [] }),
      })
    );

  return (
    <Modal titulo={titulo} eyebrowTexto={`LIFF/ DESPESAS · ${subtitulo.toUpperCase()}`} onFechar={onFechar} largura={comItens ? 820 : 640}>
      <div className="rec-form">
        <div className="rec-form__duas">
          <Field label="Favorecido" required hint={travada ? "Vem da recorrência." : undefined}>
            <Select value={favorecidoId} onChange={escolherFavorecido} disabled={travada} options={opcoesFavorecido(dados.favorecidos, despesa?.favorecidoId ?? linha?.favorecidoId)} />
          </Field>
          <Field label="Competência" required hint="Mês a que a despesa se refere, não o do pagamento.">
            <Input value={competencia} onChange={setCompetencia} placeholder="AAAA-MM" disabled={travada} />
          </Field>
        </div>
        <Field label="O que é">
          <Input value={descricao} onChange={setDescricao} placeholder={fav?.tipo === "cartao" ? "Ex.: Fatura do cartão" : "Ex.: Prestação de serviços de novembro"} />
        </Field>

        <Alternar ligado={comItens} onChange={alternarItens}>
          Detalhar em itens (fatura de cartão, nota com mais de uma categoria)
        </Alternar>

        {comItens ? (
          <div>
            <div className="desp-itens desp-itens--cab">
              {["DATA", "COMPRA", "CATEGORIA", "VALOR (R$)", ""].map((h, k) => (
                <div key={k} style={eyebrow(10, C.faint)}>
                  {h}
                </div>
              ))}
            </div>
            {itens.map((i) => (
              <div key={i.k} className="desp-itens">
                <CampoData valor={i.data} onChange={(v) => mudarItem(i.k, "data", v)} />
                <Input size="sm" value={i.descricao} onChange={(v) => mudarItem(i.k, "descricao", v)} placeholder="Ex.: AWS, Notion, Uber" />
                <Select size="sm" value={i.categoriaId} onChange={(v) => mudarItem(i.k, "categoriaId", v)} options={opcoesCategoria(dados.categorias, Number(i.categoriaId) || null, true)} />
                <Input size="sm" value={i.valor} onChange={(v) => mudarItem(i.k, "valor", v)} placeholder="0,00" style={{ textAlign: "right" }} />
                <button type="button" className="rec-link" aria-label="Remover item" title="Remover item" style={{ color: C.error, textAlign: "center" }} onClick={() => setItens((l) => l.filter((x) => x.k !== i.k))}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="rec-link" style={{ marginTop: 10 }} onClick={() => setItens((l) => [...l, itemVazio()])}>
              + item
            </button>
          </div>
        ) : (
          <div className="rec-form__duas">
            <Field label="Categoria" required>
              <Select value={categoriaId} onChange={setCategoriaId} options={opcoesCategoria(dados.categorias, despesa?.categoriaId ?? linha?.categoriaId)} />
            </Field>
            <Field label="Valor (R$)" required hint={rec ? `A recorrência prevê ${brlExato(rec.valorCentavos)}; ajuste se a nota vier diferente.` : undefined}>
              <Input value={valor} onChange={setValor} placeholder="0,00" />
            </Field>
          </div>
        )}

        <div className="rec-form__duas">
          <Field label="Vencimento" required>
            <CampoData valor={vencimento} onChange={setVencimento} />
          </Field>
          <Field label="Forma de pagamento" required hint="Compra feita no cartão corporativo entra como item da fatura do cartão.">
            <Select value={forma} onChange={setForma} options={FORMAS_PAGAMENTO.map((f) => ({ value: f.key, label: f.label }))} />
          </Field>
        </div>
        <div className="rec-form__duas">
          <Field label="Documento" hint="Número da nota fiscal, do boleto ou da fatura.">
            <Input value={documento} onChange={setDocumento} placeholder="Ex.: NF 152" />
          </Field>
          <Field label="Produto" hint="Opcional. Serve para a margem por produto, no futuro.">
            <Select value={area} onChange={setArea} options={opcoesProduto()} />
          </Field>
        </div>
        <Field label="Notas">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="rec-notas" placeholder="Observação para a contabilidade, link da nota…" />
        </Field>
        <div className="fat-resumo">
          <span>{comItens ? `Total · ${plural(usados.length, "item", "itens")}` : "Total a pagar"}</span>
          <strong>{brlExato(total)}</strong>
        </div>
        <Rodape erro={erro} salvando={salvando} podeSalvar={podeSalvar} rotulo={despesa ? "salvar correção" : "lançar conta"} onFechar={onFechar} onSalvar={() => void salvar()} />
      </div>
    </Modal>
  );
}

function FormPagamento({ despesa, hoje, onFechar, onSalvo }: { despesa: Despesa; hoje: string; onFechar: () => void; onSalvo: () => void }) {
  const [pagoEm, setPagoEm] = useState(hoje);
  const [valor, setValor] = useState(deCentavos(despesa.valorCentavos));
  const [notas, setNotas] = useState("");
  const { salvando, erro, enviar } = useEnvio();
  const pago = paraCentavos(valor);
  const dif = pago - despesa.valorCentavos;

  return (
    <Modal titulo={`Pagamento · ${despesa.favorecido}`} eyebrowTexto={`LIFF/ DESPESAS · ${despesa.ref}`} onFechar={onFechar} largura={520}>
      <div className="rec-form">
        <div className="fat-meta">
          {[despesa.descricao, `competência ${rotuloMes(despesa.competencia)}`, `vence ${br(despesa.vencimento)}`, rotuloFormaPagamento(despesa.forma)].filter(Boolean).join(" · ")}
        </div>
        <div className="rec-form__duas">
          <Field label="Data do pagamento" required>
            <CampoData valor={pagoEm} onChange={setPagoEm} />
          </Field>
          <Field label="Valor pago (R$)" required hint={`Lançado: ${brlExato(despesa.valorCentavos)}`}>
            <Input value={valor} onChange={setValor} />
          </Field>
        </div>
        {pago > 0 && dif !== 0 && (
          <div style={{ fontSize: 12.5, color: "var(--cop-ink-warning)", lineHeight: 1.5 }}>
            {dif > 0 ? `Pago ${brlExato(dif)} a mais (juros, multa?)` : `Pago ${brlExato(-dif)} a menos (desconto, imposto retido?)`}. Vale explicar nas notas.
          </div>
        )}
        <Field label="Notas">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="rec-notas" placeholder="Comprovante, conta de saída, diferença de valor…" />
        </Field>
        <Rodape
          erro={erro}
          salvando={salvando}
          podeSalvar={!!pago && !!pagoEm}
          rotulo="registrar pagamento"
          onFechar={onFechar}
          onSalvar={() => void enviar(() => api.acaoDespesa(despesa.id, { acao: "pagar", pagoEm, valorPagoCentavos: pago, notas }).then(onSalvo))}
        />
      </div>
    </Modal>
  );
}

function Detalhe({
  despesa: d,
  nomeCat,
  favorecido,
  hoje,
  onFechar,
  onAcao,
  onMudou,
}: {
  despesa: Despesa;
  nomeCat: (id: number | null) => string;
  favorecido?: Favorecido;
  hoje: string;
  onFechar: () => void;
  onAcao: (a: Acao) => void;
  onMudou: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const s = statusDaDespesa(d, hoje);
  const fazer = async (corpo: Record<string, unknown>) => {
    setErro(null);
    try {
      await api.acaoDespesa(d.id, corpo);
      onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir.");
    }
  };
  const linha = (rotulo: string, valor: string) => (
    <div className="fat-detalhe__linha">
      <span>{rotulo}</span>
      <span>{valor}</span>
    </div>
  );

  return (
    <Modal titulo={`${d.ref} · ${d.favorecido}`} eyebrowTexto="LIFF/ DESPESAS · CONTA A PAGAR" onFechar={onFechar} largura={600}>
      <div className="rec-form">
        <div>
          <Status s={s} dias={diasVencida(d.vencimento, hoje)} />
        </div>
        <div className="fat-detalhe">
          {d.descricao && linha("O que", d.descricao)}
          {favorecido && linha("Favorecido", `${rotuloTipoFavorecido(favorecido.tipo)}${favorecido.documento ? ` · ${favorecido.documento}` : ""}`)}
          {favorecido?.pagamento && s !== "paga" && s !== "cancelada" && linha("Como pagar", favorecido.pagamento)}
          {linha("Competência", rotuloMes(d.competencia))}
          {d.categoriaId != null && linha("Categoria", nomeCat(d.categoriaId))}
          {d.area && linha("Produto", rotuloArea(d.area))}
          {linha("Valor", brlExato(d.valorCentavos))}
          {linha("Vencimento", br(d.vencimento))}
          {linha("Forma", rotuloFormaPagamento(d.forma))}
          {linha("Documento", d.documento || "—")}
          {d.recorrenciaId != null && linha("Origem", "Despesa recorrente")}
          {d.status === "paga" && linha("Pago em", br(d.pagoEm))}
          {d.status === "paga" && linha("Valor pago", brlExato(d.valorPagoCentavos ?? 0))}
          {d.status === "cancelada" && linha("Cancelada em", br(d.canceladaEm))}
          {d.status === "cancelada" && linha("Motivo", d.motivoCancelamento)}
          {d.notas && linha("Notas", d.notas)}
        </div>
        {d.itens.length > 0 && (
          <div>
            <div style={{ ...eyebrow(10, C.faint, "0.12em"), marginBottom: 8 }}>{plural(d.itens.length, "item", "itens")}</div>
            <div className="fat-detalhe">
              {d.itens.map((i) => (
                <div key={i.id} className="desp-item-lido">
                  <span className="fat-meta" style={{ fontSize: 12 }}>{i.data ? br(i.data).slice(0, 5) : "—"}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ color: C.ink }}>{i.descricao}</span>
                    <span className="fat-meta"> · {nomeCat(i.categoriaId)}</span>
                  </span>
                  <span className="fat-num">{brlExato(i.valorCentavos)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ display: "flex", gap: 14 }}>
            {d.status === "aberta" && (
              <button
                type="button"
                className="rec-link"
                style={{ color: C.error }}
                onClick={() => {
                  const motivo = window.prompt(`Cancelar ${d.ref}? Diga o motivo (ex.: lançada em duplicidade).`);
                  if (motivo && motivo.trim()) void fazer({ acao: "cancelar", motivo });
                }}
              >
                cancelar conta
              </button>
            )}
            {d.status === "paga" && (
              <button
                type="button"
                className="rec-link"
                onClick={() => window.confirm(`Estornar o pagamento de ${d.ref}? A conta volta a ficar a pagar.`) && void fazer({ acao: "estornar" })}
              >
                estornar pagamento
              </button>
            )}
          </span>
          <span style={{ display: "flex", gap: 10 }}>
            {d.status === "aberta" && (
              <Button variant="outline" size="xs" onClick={() => onAcao({ tipo: "corrigir", despesa: d })}>
                corrigir
              </Button>
            )}
            {d.status === "aberta" && (
              <Button variant="solid" size="xs" onClick={() => onAcao({ tipo: "pagar", despesa: d })}>
                pagar
              </Button>
            )}
          </span>
        </div>
      </div>
    </Modal>
  );
}

function FormRecorrencia({ recorrencia: r, dados, hoje, onFechar, onSalvo }: { recorrencia: Recorrencia | null; dados: DadosDespesas; hoje: string; onFechar: () => void; onSalvo: () => void }) {
  const [favorecidoId, setFavorecidoId] = useState(String(r?.favorecidoId ?? ""));
  const [categoriaId, setCategoriaId] = useState(String(r?.categoriaId ?? ""));
  const [area, setArea] = useState(r?.area ?? "");
  const [descricao, setDescricao] = useState(r?.descricao ?? "");
  const [valor, setValor] = useState(deCentavos(r?.valorCentavos ?? 0));
  const [dia, setDia] = useState(String(r?.diaVencimento ?? 5));
  const [seguinte, setSeguinte] = useState(r?.venceMesSeguinte ?? true);
  const [forma, setForma] = useState<string>(r?.forma ?? "pix");
  const [inicio, setInicio] = useState(r?.inicio ?? mesDe(hoje));
  const [fim, setFim] = useState(r?.fim ?? "");
  const [notas, setNotas] = useState(r?.notas ?? "");
  const { salvando, erro, enviar } = useEnvio();
  const centavos = paraCentavos(valor);
  const diaN = Number(dia);
  const exemplo = /^\d{4}-\d{2}$/.test(inicio) && diaN >= 1 && diaN <= 28 ? vencimentoDaRecorrencia({ diaVencimento: diaN, venceMesSeguinte: seguinte }, inicio) : null;

  const corpo = { favorecidoId: Number(favorecidoId), categoriaId: Number(categoriaId), area, descricao, valorCentavos: centavos, diaVencimento: diaN, venceMesSeguinte: seguinte, forma, inicio, fim, notas };
  const nome = dados.favorecidos.find((f) => f.id === r?.favorecidoId)?.nome;

  return (
    <Modal titulo={r ? `Recorrente · ${nome ?? ""}` : "Nova despesa recorrente"} eyebrowTexto="LIFF/ DESPESAS · RECORRENTE" onFechar={onFechar} largura={640}>
      <div className="rec-form">
        <div className="rec-form__duas">
          <Field label="Favorecido" required>
            <Select value={favorecidoId} onChange={setFavorecidoId} options={opcoesFavorecido(dados.favorecidos, r?.favorecidoId)} />
          </Field>
          <Field label="Categoria" required>
            <Select value={categoriaId} onChange={setCategoriaId} options={opcoesCategoria(dados.categorias, r?.categoriaId)} />
          </Field>
        </div>
        <div className="rec-form__duas">
          <Field label="O que é">
            <Input value={descricao} onChange={setDescricao} placeholder="Ex.: Prestação de serviços de engenharia" />
          </Field>
          <Field label="Valor mensal (R$)" required hint="No mês em que a nota vier diferente, o valor se ajusta ao lançar.">
            <Input value={valor} onChange={setValor} placeholder="0,00" />
          </Field>
        </div>
        <div className="rec-form__duas">
          <Field label="Dia do vencimento" required hint="De 1 a 28, para existir em todo mês.">
            <Input value={dia} onChange={setDia} placeholder="5" />
          </Field>
          <Field label="Forma de pagamento" required>
            <Select value={forma} onChange={setForma} options={FORMAS_PAGAMENTO.map((f) => ({ value: f.key, label: f.label }))} />
          </Field>
        </div>
        <Alternar ligado={seguinte} onChange={setSeguinte}>
          Paga no mês seguinte ao do serviço (o usual para PJ)
        </Alternar>
        <div className="rec-form__duas">
          <Field label="Primeira competência" required hint={exemplo ? `A conta de ${rotuloMes(inicio)} vence em ${br(exemplo)}.` : "AAAA-MM"}>
            <Input value={inicio} onChange={setInicio} placeholder="AAAA-MM" />
          </Field>
          <Field label="Última competência" hint="Deixe vazio enquanto o contrato valer. Preencha para encerrar.">
            <Input value={fim} onChange={setFim} placeholder="AAAA-MM" />
          </Field>
        </div>
        <Field label="Produto" hint="Opcional. Serve para a margem por produto, no futuro.">
          <Select value={area} onChange={setArea} options={opcoesProduto()} />
        </Field>
        <Field label="Notas">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="rec-notas" placeholder="Reajuste combinado, vigência do contrato…" />
        </Field>
        <Rodape
          erro={erro}
          salvando={salvando}
          podeSalvar={!!favorecidoId && !!categoriaId && centavos > 0}
          rotulo={r ? "salvar" : "cadastrar"}
          onFechar={onFechar}
          onSalvar={() => void enviar(() => api.despesaCadastroSalvar("recorrencias", r?.id ?? null, corpo).then(onSalvo))}
          esquerda={
            r && (
              <button
                type="button"
                className="rec-link"
                style={{ color: C.error }}
                title="Só sai a recorrência que nunca gerou conta; as demais se encerram pela última competência"
                onClick={() => window.confirm("Excluir esta despesa recorrente?") && void enviar(() => api.despesaCadastroExcluir("recorrencias", r.id).then(onSalvo))}
              >
                excluir
              </button>
            )
          }
        />
      </div>
    </Modal>
  );
}

function FormFavorecido({ favorecido: f, onFechar, onSalvo }: { favorecido: Favorecido | null; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(f?.nome ?? "");
  const [tipo, setTipo] = useState<string>(f?.tipo ?? "colaborador_pj");
  const [documento, setDocumento] = useState(f?.documento ?? "");
  const [contato, setContato] = useState(f?.contato ?? "");
  const [pagamento, setPagamento] = useState(f?.pagamento ?? "");
  const [notas, setNotas] = useState(f?.notas ?? "");
  const [ativo, setAtivo] = useState(f?.ativo ?? true);
  const { salvando, erro, enviar } = useEnvio();
  const cartao = tipo === "cartao";

  return (
    <Modal titulo={f ? f.nome : "Novo favorecido"} eyebrowTexto="LIFF/ DESPESAS · FAVORECIDO" onFechar={onFechar} largura={600}>
      <div className="rec-form">
        <div className="rec-form__duas">
          <Field label="Nome" required hint={cartao ? "Ex.: Cartão Itaú final 1234. Só os quatro últimos dígitos, nunca o número inteiro." : "A razão social ou o nome pelo qual todos conhecem."}>
            <Input value={nome} onChange={setNome} placeholder={cartao ? "Cartão corporativo final 1234" : "Nome ou razão social"} />
          </Field>
          <Field label="Tipo" required>
            <Select value={tipo} onChange={setTipo} options={TIPOS_FAVORECIDO.map((t) => ({ value: t.key, label: t.label }))} />
          </Field>
        </div>
        {!cartao && (
          <div className="rec-form__duas">
            <Field label="CNPJ / CPF">
              <Input value={documento} onChange={setDocumento} placeholder="00.000.000/0001-00" />
            </Field>
            <Field label="Contato" hint="E-mail ou telefone de quem manda a nota.">
              <Input value={contato} onChange={setContato} placeholder="financeiro@empresa.com" />
            </Field>
          </div>
        )}
        <Field label="Como pagar" hint={cartao ? "Ex.: boleto que chega por e-mail, débito automático na conta tal." : "Chave PIX ou banco, agência e conta. Aparece na conta enquanto ela está a pagar."}>
          <Input value={pagamento} onChange={setPagamento} placeholder={cartao ? "Débito automático" : "PIX: CNPJ"} />
        </Field>
        <Field label="Notas">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="rec-notas" />
        </Field>
        {f && (
          <Alternar ligado={ativo} onChange={setAtivo}>
            Ativo (inativo some das listas de escolha; o histórico fica)
          </Alternar>
        )}
        <Rodape
          erro={erro}
          salvando={salvando}
          podeSalvar={!!nome.trim()}
          rotulo={f ? "salvar" : "cadastrar"}
          onFechar={onFechar}
          onSalvar={() => void enviar(() => api.despesaCadastroSalvar("favorecidos", f?.id ?? null, { nome, tipo, documento, contato, pagamento, notas, ativo }).then(onSalvo))}
          esquerda={
            f && (
              <button
                type="button"
                className="rec-link"
                style={{ color: C.error }}
                title="Só sai o favorecido que nunca teve conta; os demais se desativam"
                onClick={() => window.confirm(`Excluir ${f.nome}?`) && void enviar(() => api.despesaCadastroExcluir("favorecidos", f.id).then(onSalvo))}
              >
                excluir
              </button>
            )
          }
        />
      </div>
    </Modal>
  );
}

function FormCategoria({ categoria: c, onFechar, onSalvo }: { categoria: Categoria | null; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(c?.nome ?? "");
  const [grupo, setGrupo] = useState<string>(c?.grupo ?? "operacional");
  const [ativo, setAtivo] = useState(c?.ativo ?? true);
  const { salvando, erro, enviar } = useEnvio();

  return (
    <Modal titulo={c ? c.nome : "Nova categoria"} eyebrowTexto="LIFF/ DESPESAS · CATEGORIA" onFechar={onFechar} largura={520}>
      <div className="rec-form">
        <Field label="Nome" required>
          <Input value={nome} onChange={setNome} placeholder="Ex.: Software e assinaturas" />
        </Field>
        <Field
          label="Grupo"
          required
          hint="Custo do serviço é o que existe para entregar o produto ao cliente (nuvem, IA). Despesa operacional é o que mantém a empresa (marketing, contabilidade, ferramentas)."
        >
          <Select value={grupo} onChange={setGrupo} options={GRUPOS.map((g) => ({ value: g.key, label: g.label }))} />
        </Field>
        {c && (
          <Alternar ligado={ativo} onChange={setAtivo}>
            Ativa (inativa some das listas de escolha; o histórico fica)
          </Alternar>
        )}
        <Rodape
          erro={erro}
          salvando={salvando}
          podeSalvar={!!nome.trim()}
          rotulo={c ? "salvar" : "cadastrar"}
          onFechar={onFechar}
          onSalvar={() => void enviar(() => api.despesaCadastroSalvar("categorias", c?.id ?? null, { nome, grupo, ativo }).then(onSalvo))}
          esquerda={
            c && (
              <button
                type="button"
                className="rec-link"
                style={{ color: C.error }}
                title="Só sai a categoria que nunca foi usada; as demais se desativam"
                onClick={() => window.confirm(`Excluir a categoria ${c.nome}?`) && void enviar(() => api.despesaCadastroExcluir("categorias", c.id).then(onSalvo))}
              >
                excluir
              </button>
            )
          }
        />
      </div>
    </Modal>
  );
}
