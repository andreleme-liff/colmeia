"use client";

// Faturamento — contas a receber (só admin).
//
// Duas visões:
//  · MÊS (competência): tudo o que deve ser faturado naquele mês, saído do cronograma dos
//    contratos contratados, mais as avulsas. É onde se EMITE (nota + cobrança) e se dá BAIXA.
//  · EM ABERTO: tudo o que já foi emitido e não foi pago, de qualquer mês, com os dias de
//    atraso e o "aging" (a vencer, 1–30, 31–60, 61–90, mais de 90). É onde se COBRA.
//
// As regras moram em `lib/faturamento.ts`. A fatura só passa a existir no banco quando é
// emitida; antes disso, "a emitir" é calculada do contrato.

import { useEffect, useState } from "react";
import { Button, Field, Input, Select } from "./ds";
import { C, GHOST_FIX, MONO, eyebrow } from "./tokens";
import { api, type Deal } from "./api";
import { CampoData, Modal } from "./views";
import { aplicarBusca, areaOf, brl, brlExato, hojeISO, prepararBusca, porTexto, todasAreas } from "@/lib/domain";
import { mesDe, rotuloMes, situacaoEfetiva, somarMeses, type Contrato } from "@/lib/forecast";
import {
  FORMAS_COBRANCA, ROTULO_STATUS, aging, csvDoMes, diasDeAtraso, itensDoMes, liquidoEsperado, rotuloForma, rotuloTipoFatura,
  statusDe, vencimentoSugerido, type Fatura, type ItemDoMes, type StatusFatura,
} from "@/lib/faturamento";

const TOM: Record<StatusFatura, string> = {
  a_emitir: "neutro",
  emitida: "info",
  vencida: "erro",
  paga: "sucesso",
  cancelada: "neutro",
};

function Status({ s, dias }: { s: StatusFatura; dias?: number }) {
  return (
    <span className={`cop-tag cop-tag--${TOM[s]}`} style={s === "cancelada" ? { textDecoration: "line-through" } : undefined}>
      {ROTULO_STATUS[s]}
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

type Filtro = "todas" | "a_emitir" | "em_aberto" | "vencidas" | "pagas";
const FILTROS: { key: Filtro; label: string; casa: (s: StatusFatura) => boolean }[] = [
  { key: "todas", label: "Todas", casa: () => true },
  { key: "a_emitir", label: "A emitir", casa: (s) => s === "a_emitir" },
  { key: "em_aberto", label: "Em aberto", casa: (s) => s === "emitida" || s === "vencida" },
  { key: "vencidas", label: "Vencidas", casa: (s) => s === "vencida" },
  { key: "pagas", label: "Pagas", casa: (s) => s === "paga" },
];

type Acao =
  | { tipo: "emitir"; item: ItemDoMes }
  | { tipo: "avulsa" }
  | { tipo: "corrigir"; fatura: Fatura }
  | { tipo: "pagar"; fatura: Fatura }
  | { tipo: "detalhe"; fatura: Fatura };

export default function Faturamento({
  deals,
  area,
  busca,
  gatilho,
}: {
  deals: Deal[];
  area: string;
  busca: string;
  gatilho: number | undefined;
}) {
  const hoje = hojeISO();
  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [faturas, setFaturas] = useState<Fatura[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [aba, setAba] = useState<"mes" | "aberto">("mes");
  const [competencia, setCompetencia] = useState(mesDe(hoje));
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [acao, setAcao] = useState<Acao | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([api.receitas(), api.faturas()]).then(
      ([r, f]) => {
        if (!vivo) return;
        setContratos(r.contratos);
        setFaturas(f.faturas);
        setFalha(null);
      },
      (e: unknown) => vivo && setFalha(e instanceof Error ? e.message : "Não foi possível carregar o faturamento.")
    );
    return () => {
      vivo = false;
    };
  }, [gatilho, versao]);

  if (falha && !faturas) return <div style={{ fontSize: 14, color: C.error }}>{falha}</div>;
  if (!contratos || !faturas) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>carregando faturamento…</div>;

  const dealPorId = new Map(deals.map((d) => [d.id, d]));
  const contratoPorId = new Map(contratos.map((c) => [c.id, c]));
  const contratado = (c: Contrato) => situacaoEfetiva(c, c.dealId != null ? dealPorId.get(c.dealId) : null) === "contratada";
  const naArea = <T extends { area: string }>(l: T[]) => l.filter((x) => area === "all" || x.area === area);
  const termo = prepararBusca(busca);

  // ---------- visão do mês ----------
  const todosDoMes = naArea(itensDoMes(contratos, contratado, faturas, competencia, hoje));
  const buscados = aplicarBusca(todosDoMes, termo, (i) => [
    i.conta, i.contratoRef, i.fatura?.ref, i.fatura?.nfNumero, rotuloTipoFatura(i.tipo), i.fatura?.descricao,
  ]);
  const casa = FILTROS.find((f) => f.key === filtro)!.casa;
  const doMes = buscados.filter((i) => casa(i.status));
  const soma = (l: ItemDoMes[]) => l.reduce((t, i) => t + i.valorCentavos, 0);
  const aEmitir = todosDoMes.filter((i) => i.status === "a_emitir");
  const emitidoNoMes = todosDoMes.filter((i) => i.fatura && i.status !== "a_emitir");

  // ---------- em aberto (todos os meses) ----------
  const faturasNaArea = naArea(faturas);
  const abertas = aplicarBusca(
    faturasNaArea.filter((f) => f.status === "emitida").sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? "")),
    termo,
    (f) => [f.conta, f.ref, f.nfNumero, f.descricao]
  );
  const vencidas = faturasNaArea.filter((f) => statusDe(f, hoje) === "vencida");
  const recebidoNoMes = faturasNaArea.filter((f) => f.status === "paga" && f.pagoEm && mesDe(f.pagoEm) === mesDe(hoje));
  const faixas = aging(faturasNaArea, hoje);

  const mudou = () => {
    setAcao(null);
    setVersao((v) => v + 1);
  };

  const exportar = () => {
    const csv = csvDoMes(todosDoMes, (id) => areaOf(id).label);
    // BOM para o Excel ler os acentos.
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `faturamento-${competencia}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ---------- números ---------- */}
      <div className="rec-numeros">
        <Numero rotulo={`A emitir · ${rotuloMes(competencia)}`} valor={soma(aEmitir)} detalhe={`${aEmitir.length} fatura${aEmitir.length === 1 ? "" : "s"} do cronograma`} />
        <Numero rotulo={`Emitido · ${rotuloMes(competencia)}`} valor={soma(emitidoNoMes)} detalhe="Valor bruto das faturas desta competência" />
        <Numero
          rotulo="Em aberto"
          valor={faturasNaArea.filter((f) => f.status === "emitida").reduce((t, f) => t + liquidoEsperado(f), 0)}
          detalhe={vencidas.length ? `${vencidas.length} vencida${vencidas.length === 1 ? "" : "s"}: ${brl(vencidas.reduce((t, f) => t + liquidoEsperado(f), 0))}` : "Nada vencido"}
          alerta={vencidas.length > 0}
        />
        <Numero
          rotulo={`Recebido · ${rotuloMes(mesDe(hoje))}`}
          valor={recebidoNoMes.reduce((t, f) => t + (f.valorPagoCentavos ?? 0), 0)}
          detalhe={`${recebidoNoMes.length} baixa${recebidoNoMes.length === 1 ? "" : "s"} neste mês`}
        />
      </div>

      {/* ---------- barra de controle ---------- */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div role="group" aria-label="Visão" className="liff-densidade">
          <button type="button" aria-pressed={aba === "mes"} onClick={() => setAba("mes")}>
            por mês
          </button>
          <button type="button" aria-pressed={aba === "aberto"} onClick={() => setAba("aberto")}>
            em aberto · {faturasNaArea.filter((f) => f.status === "emitida").length}
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
            {competencia !== mesDe(hoje) && (
              <button type="button" className="rec-link" onClick={() => setCompetencia(mesDe(hoje))}>
                mês atual
              </button>
            )}
            <div role="group" aria-label="Filtrar por situação" className="liff-densidade">
              {FILTROS.map((f) => (
                <button key={f.key} type="button" aria-pressed={filtro === f.key} onClick={() => setFiltro(f.key)}>
                  {f.label} · {todosDoMes.filter((i) => f.casa(i.status)).length}
                </button>
              ))}
            </div>
          </>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          {aba === "mes" && (
            <button type="button" className="rec-link" onClick={exportar} title="Planilha do mês para a contabilidade">
              exportar CSV
            </button>
          )}
          <Button variant="solid" size="sm" onClick={() => setAcao({ tipo: "avulsa" })}>
            + fatura avulsa
          </Button>
        </span>
      </div>

      {aba === "mes" ? (
        <TabelaMes
          itens={doMes}
          vazio={
            todosDoMes.length === 0
              ? `Nada a faturar em ${rotuloMes(competencia)}. As faturas saem do cronograma dos contratos contratados (página Receita).`
              : "Nenhuma fatura nesta situação."
          }
          hoje={hoje}
          onAcao={setAcao}
        />
      ) : (
        <>
          <div className="fat-aging">
            {faixas.map((f) => (
              <div key={f.key} className="fat-aging__faixa" data-tom={f.key === "a_vencer" ? "ok" : f.key === "1_30" ? "aviso" : "erro"}>
                <div style={eyebrow(10, C.faint, "0.12em")}>{f.label}</div>
                <div className="fat-aging__valor">{brl(f.valor)}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
                  {f.qtd} fatura{f.qtd === 1 ? "" : "s"}
                </div>
              </div>
            ))}
          </div>
          <TabelaAberto faturas={abertas} contratoPorId={contratoPorId} hoje={hoje} onAcao={setAcao} />
        </>
      )}

      {acao?.tipo === "emitir" && (
        <FormEmissao
          titulo={`Emitir · ${acao.item.conta}`}
          subtitulo={`${rotuloTipoFatura(acao.item.tipo)} ${acao.item.parcela} · competência ${rotuloMes(acao.item.competencia)}${acao.item.contratoRef ? ` · ${acao.item.contratoRef}` : ""}`}
          valorInicial={acao.item.valorCentavos}
          contrato={acao.item.contratoId != null ? contratoPorId.get(acao.item.contratoId) : undefined}
          competencia={acao.item.competencia}
          hoje={hoje}
          onFechar={() => setAcao(null)}
          onSalvar={(dados) => api.emitirFatura({ origem: "cronograma", contratoId: acao.item.contratoId, tipo: acao.item.tipo, competencia: acao.item.competencia, ...dados }).then(mudou)}
        />
      )}
      {acao?.tipo === "avulsa" && (
        <FormEmissao
          titulo="Fatura avulsa"
          subtitulo="Serviço fora do cronograma de um contrato"
          avulsa
          competenciaInicial={competencia}
          hoje={hoje}
          onFechar={() => setAcao(null)}
          onSalvar={(dados) => api.emitirFatura({ origem: "avulsa", ...dados }).then(mudou)}
        />
      )}
      {acao?.tipo === "corrigir" && (
        <FormEmissao
          titulo={`Corrigir ${acao.fatura.ref} · ${acao.fatura.conta}`}
          subtitulo={`${rotuloTipoFatura(acao.fatura.tipo)} ${acao.fatura.parcela} · competência ${rotuloMes(acao.fatura.competencia)}`}
          valorInicial={acao.fatura.valorCentavos}
          fatura={acao.fatura}
          competencia={acao.fatura.competencia}
          hoje={hoje}
          onFechar={() => setAcao(null)}
          onSalvar={(dados) => api.acaoFatura(acao.fatura.id, { acao: "editar", ...dados }).then(mudou)}
        />
      )}
      {acao?.tipo === "pagar" && <FormBaixa fatura={acao.fatura} hoje={hoje} onFechar={() => setAcao(null)} onSalvo={mudou} />}
      {acao?.tipo === "detalhe" && (
        <Detalhe
          fatura={acao.fatura}
          contrato={acao.fatura.contratoId != null ? contratoPorId.get(acao.fatura.contratoId) : undefined}
          hoje={hoje}
          onFechar={() => setAcao(null)}
          onAcao={setAcao}
          onMudou={mudou}
        />
      )}
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

const COLS_MES = "1.6fr 1.1fr 0.9fr 0.8fr 0.8fr 0.9fr 140px";

function TabelaMes({ itens, vazio, hoje, onAcao }: { itens: ItemDoMes[]; vazio: string; hoje: string; onAcao: (a: Acao) => void }) {
  if (!itens.length) return <div style={{ fontSize: 14, color: C.faint, lineHeight: 1.6, maxWidth: 640 }}>{vazio}</div>;
  return (
    <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}` }}>
      <div style={{ minWidth: 920 }}>
        <div className="fat-linha fat-linha--cab" style={{ gridTemplateColumns: COLS_MES }}>
          {["CLIENTE", "O QUE", "VALOR", "VENCIMENTO", "NF", "SITUAÇÃO", ""].map((h, k) => (
            <div key={k} style={{ ...eyebrow(10, C.faint), textAlign: h === "VALOR" ? "right" : "left" }}>
              {h}
            </div>
          ))}
        </div>
        {itens.map((i) => {
          const f = i.fatura;
          return (
            <div
              key={i.chave}
              className={`fat-linha${f ? " liff-hover-row" : ""}`}
              style={{ gridTemplateColumns: COLS_MES, cursor: f ? "pointer" : undefined }}
              onClick={() => f && onAcao({ tipo: "detalhe", fatura: f })}
            >
              <div style={{ minWidth: 0 }}>
                <div className="fat-cliente">{i.conta}</div>
                <div className="fat-meta">
                  {[i.contratoRef, f?.ref, areaOf(i.area).label].filter(Boolean).join(" · ")}
                  {i.canceladas.length ? ` · ${i.canceladas.length} cancelada${i.canceladas.length > 1 ? "s" : ""}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 13, color: C.body }}>
                {i.tipo === "avulsa" ? f?.descricao || "Avulsa" : `${rotuloTipoFatura(i.tipo)} ${i.parcela}`}
              </div>
              <div className="fat-num">{brlExato(i.valorCentavos)}</div>
              <div className="fat-meta" style={{ fontSize: 12 }}>
                {br(f?.vencimento ?? null)}
              </div>
              <div className="fat-meta" style={{ fontSize: 12 }}>
                {f?.nfNumero || "—"}
              </div>
              <div>
                <Status s={i.status} dias={diasDeAtraso(f?.vencimento ?? null, hoje)} />
              </div>
              <div style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                {i.status === "a_emitir" && (
                  <Button variant="outline" size="sm" onClick={() => onAcao({ tipo: "emitir", item: i })}>
                    emitir
                  </Button>
                )}
                {f && (i.status === "emitida" || i.status === "vencida") && (
                  <Button variant="outline" size="sm" onClick={() => onAcao({ tipo: "pagar", fatura: f })}>
                    dar baixa
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

const COLS_ABERTO = "1.6fr 0.9fr 1fr 0.8fr 0.9fr 0.9fr 220px";

function TabelaAberto({
  faturas,
  contratoPorId,
  hoje,
  onAcao,
}: {
  faturas: Fatura[];
  contratoPorId: Map<number, Contrato>;
  hoje: string;
  onAcao: (a: Acao) => void;
}) {
  if (!faturas.length) return <div style={{ fontSize: 14, color: C.faint }}>Nenhuma fatura em aberto.</div>;
  return (
    <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}` }}>
      <div style={{ minWidth: 980 }}>
        <div className="fat-linha fat-linha--cab" style={{ gridTemplateColumns: COLS_ABERTO }}>
          {["CLIENTE", "COMPETÊNCIA", "A RECEBER", "VENCIMENTO", "NF", "SITUAÇÃO", ""].map((h, k) => (
            <div key={k} style={{ ...eyebrow(10, C.faint), textAlign: h === "A RECEBER" ? "right" : "left" }}>
              {h}
            </div>
          ))}
        </div>
        {faturas.map((f) => {
          const s = statusDe(f, hoje);
          const email = f.contratoId != null ? contratoPorId.get(f.contratoId)?.cobranca.emailCobranca : "";
          return (
            <div key={f.id} className="fat-linha liff-hover-row" style={{ gridTemplateColumns: COLS_ABERTO, cursor: "pointer" }} onClick={() => onAcao({ tipo: "detalhe", fatura: f })}>
              <div style={{ minWidth: 0 }}>
                <div className="fat-cliente">{f.conta}</div>
                <div className="fat-meta">
                  {f.ref} · {f.tipo === "avulsa" ? f.descricao || "Avulsa" : `${rotuloTipoFatura(f.tipo)} ${f.parcela}`}
                </div>
              </div>
              <div className="fat-meta" style={{ fontSize: 12 }}>{rotuloMes(f.competencia)}</div>
              <div className="fat-num" title={f.retencoesCentavos ? `Bruto ${brlExato(f.valorCentavos)} − retenções ${brlExato(f.retencoesCentavos)}` : undefined}>
                {brlExato(liquidoEsperado(f))}
              </div>
              <div className="fat-meta" style={{ fontSize: 12 }}>{br(f.vencimento)}</div>
              <div className="fat-meta" style={{ fontSize: 12 }}>{f.nfNumero || "—"}</div>
              <div>
                <Status s={s} dias={diasDeAtraso(f.vencimento, hoje)} />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                {email && (
                  <a className="rec-link" href={linkCobranca(f, email, hoje)} title={`Abre um e-mail para ${email} no seu programa de e-mail`}>
                    cobrar
                  </a>
                )}
                <Button variant="outline" size="sm" onClick={() => onAcao({ tipo: "pagar", fatura: f })}>
                  dar baixa
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Rascunho de e-mail de cobrança (abre no programa de e-mail da pessoa; nada é enviado sozinho). */
function linkCobranca(f: Fatura, email: string, hoje: string): string {
  const atraso = diasDeAtraso(f.vencimento, hoje);
  const assunto = `${atraso ? "Fatura em atraso" : "Lembrete de fatura"} ${f.nfNumero ? `NF ${f.nfNumero}` : f.ref} · LIFF`;
  const corpo = [
    "Olá,",
    "",
    atraso
      ? `Consta em aberto a fatura ${f.nfNumero ? `NF ${f.nfNumero}` : f.ref}, com vencimento em ${br(f.vencimento)}, no valor de ${brlExato(liquidoEsperado(f))}.`
      : `Lembramos que a fatura ${f.nfNumero ? `NF ${f.nfNumero}` : f.ref} vence em ${br(f.vencimento)}, no valor de ${brlExato(liquidoEsperado(f))}.`,
    `Referência: ${f.tipo === "avulsa" ? f.descricao : `${rotuloTipoFatura(f.tipo)} ${f.parcela}`}, competência ${rotuloMes(f.competencia)}.`,
    "",
    atraso ? "Se o pagamento já foi feito, por favor desconsidere e nos envie o comprovante." : "Qualquer dúvida, estamos à disposição.",
    "",
    "Obrigado,",
  ].join("\n");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

/* ============================== modais ============================== */

type DadosEmissao = Record<string, unknown>;

function FormEmissao({
  titulo,
  subtitulo,
  valorInicial,
  contrato,
  fatura,
  competencia,
  competenciaInicial,
  avulsa,
  hoje,
  onFechar,
  onSalvar,
}: {
  titulo: string;
  subtitulo: string;
  valorInicial?: number;
  contrato?: Contrato;
  fatura?: Fatura;
  competencia?: string;
  competenciaInicial?: string;
  avulsa?: boolean;
  hoje: string;
  onFechar: () => void;
  onSalvar: (dados: DadosEmissao) => Promise<unknown>;
}) {
  const dia = contrato?.cobranca.diaVencimento ?? 10;
  const [comp, setComp] = useState(competencia ?? competenciaInicial ?? mesDe(hoje));
  const [conta, setConta] = useState("");
  const [area, setArea] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(deCentavos(valorInicial ?? 0));
  const [emitidaEm, setEmitidaEm] = useState(fatura?.emitidaEm ?? hoje);
  const [vencimento, setVencimento] = useState(fatura?.vencimento ?? vencimentoSugerido(comp, dia, hoje));
  const [nf, setNf] = useState(fatura?.nfNumero ?? "");
  const [forma, setForma] = useState<string>(fatura?.forma ?? contrato?.cobranca.formaCobranca ?? "boleto");
  const [retencoes, setRetencoes] = useState(deCentavos(fatura?.retencoesCentavos ?? 0));
  const [notas, setNotas] = useState(fatura?.notas ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const bruto = paraCentavos(valor);
  const ret = paraCentavos(retencoes);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({
        ...(avulsa ? { conta, area, descricao, competencia: comp } : {}),
        valorCentavos: bruto,
        emitidaEm,
        vencimento,
        nfNumero: nf,
        forma,
        retencoesCentavos: ret,
        notas,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={titulo} eyebrowTexto={`LIFF/ FATURAMENTO · ${subtitulo.toUpperCase()}`} onFechar={onFechar} largura={640}>
      <div className="rec-form">
        {avulsa && (
          <>
            <div className="rec-form__duas">
              <Field label="Cliente" required>
                <Input value={conta} onChange={setConta} placeholder="Nome do cliente" />
              </Field>
              <Field label="Vertical" required>
                <Select
                  value={area}
                  onChange={setArea}
                  options={[{ value: "", label: "— escolha —" }, ...todasAreas().map((a) => ({ value: a.id, label: a.label }))].sort((a, b) =>
                    a.value === "" ? -1 : b.value === "" ? 1 : porTexto(a.label, b.label)
                  )}
                />
              </Field>
            </div>
            <div className="rec-form__duas">
              <Field label="O que está sendo faturado" required>
                <Input value={descricao} onChange={setDescricao} placeholder="Ex.: horas adicionais de consultoria" />
              </Field>
              <Field label="Competência" hint="Mês a que o serviço se refere.">
                <Input value={comp} onChange={setComp} placeholder="AAAA-MM" />
              </Field>
            </div>
          </>
        )}
        <div className="rec-form__duas">
          <Field label="Valor bruto (R$)" required hint={avulsa ? undefined : "Vem do cronograma; ajuste se a nota sair diferente."}>
            <Input value={valor} onChange={setValor} placeholder="0,00" />
          </Field>
          <Field label="Retenções (R$)" hint="Impostos que o cliente retém e recolhe (IR, PIS/COFINS/CSLL, ISS). Saem do que entra no caixa.">
            <Input value={retencoes} onChange={setRetencoes} placeholder="0,00" />
          </Field>
        </div>
        <div className="rec-form__duas">
          <Field label="Emissão" required>
            <CampoData valor={emitidaEm} onChange={setEmitidaEm} />
          </Field>
          <Field label="Vencimento" required hint={contrato ? `O contrato vence no dia ${dia}.` : undefined}>
            <CampoData valor={vencimento} onChange={setVencimento} />
          </Field>
        </div>
        <div className="rec-form__duas">
          <Field label="Número da nota fiscal (NFS-e)" hint="Pode preencher depois, ao corrigir a fatura.">
            <Input value={nf} onChange={setNf} placeholder="Ex.: 1234" />
          </Field>
          <Field label="Forma de cobrança" required>
            <Select value={forma} onChange={setForma} options={FORMAS_COBRANCA.map((f) => ({ value: f.key, label: f.label }))} />
          </Field>
        </div>
        <Field label="Notas">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="rec-notas" placeholder="Pedido de compra, observação para a contabilidade…" />
        </Field>
        <div className="fat-resumo">
          <span>Líquido a receber</span>
          <strong>{brlExato(Math.max(0, bruto - ret))}</strong>
        </div>
        {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
            cancelar
          </Button>
          <Button variant="solid" size="sm" disabled={salvando || !bruto || !emitidaEm || !vencimento} onClick={() => void salvar()}>
            {salvando ? "salvando…" : fatura ? "salvar correção" : "emitir fatura"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function FormBaixa({ fatura, hoje, onFechar, onSalvo }: { fatura: Fatura; hoje: string; onFechar: () => void; onSalvo: () => void }) {
  const esperado = liquidoEsperado(fatura);
  const [pagoEm, setPagoEm] = useState(hoje);
  const [valor, setValor] = useState(deCentavos(esperado));
  const [notas, setNotas] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const recebido = paraCentavos(valor);
  const dif = recebido - esperado;

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await api.acaoFatura(fatura.id, { acao: "pagar", pagoEm, valorPagoCentavos: recebido, notas });
      onSalvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível dar baixa.");
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={`Baixa · ${fatura.conta}`} eyebrowTexto={`LIFF/ FATURAMENTO · ${fatura.ref}`} onFechar={onFechar} largura={520}>
      <div className="rec-form">
        <div className="fat-meta">
          {rotuloTipoFatura(fatura.tipo)} {fatura.parcela} · competência {rotuloMes(fatura.competencia)} · vence {br(fatura.vencimento)}
          {fatura.nfNumero ? ` · NF ${fatura.nfNumero}` : ""}
        </div>
        <div className="rec-form__duas">
          <Field label="Data do pagamento" required>
            <CampoData valor={pagoEm} onChange={setPagoEm} />
          </Field>
          <Field label="Valor recebido (R$)" required hint={`Esperado: ${brlExato(esperado)}`}>
            <Input value={valor} onChange={setValor} />
          </Field>
        </div>
        {recebido > 0 && dif !== 0 && (
          <div style={{ fontSize: 12.5, color: "var(--cop-ink-warning)", lineHeight: 1.5 }}>
            {dif > 0 ? `Recebido ${brlExato(dif)} a mais (juros, multa?)` : `Recebido ${brlExato(-dif)} a menos (desconto, retenção não prevista?)`}. Vale explicar nas notas.
          </div>
        )}
        <Field label="Notas">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="rec-notas" placeholder="Comprovante, conta de entrada, diferença de valor…" />
        </Field>
        {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
            cancelar
          </Button>
          <Button variant="solid" size="sm" disabled={salvando || !recebido || !pagoEm} onClick={() => void salvar()}>
            {salvando ? "salvando…" : "registrar pagamento"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Detalhe({
  fatura: f,
  contrato,
  hoje,
  onFechar,
  onAcao,
  onMudou,
}: {
  fatura: Fatura;
  contrato?: Contrato;
  hoje: string;
  onFechar: () => void;
  onAcao: (a: Acao) => void;
  onMudou: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const s = statusDe(f, hoje);
  const fazer = async (corpo: Record<string, unknown>) => {
    setErro(null);
    try {
      await api.acaoFatura(f.id, corpo);
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
    <Modal titulo={`${f.ref} · ${f.conta}`} eyebrowTexto="LIFF/ FATURAMENTO · FATURA" onFechar={onFechar} largura={560}>
      <div className="rec-form">
        <div>
          <Status s={s} dias={diasDeAtraso(f.vencimento, hoje)} />
        </div>
        <div className="fat-detalhe">
          {linha("O que", f.tipo === "avulsa" ? f.descricao || "Avulsa" : `${rotuloTipoFatura(f.tipo)} ${f.parcela}`)}
          {linha("Competência", rotuloMes(f.competencia))}
          {linha("Vertical", areaOf(f.area).label)}
          {contrato && linha("Contrato", `${contrato.ref}${contrato.cobranca.cnpj ? ` · CNPJ ${contrato.cobranca.cnpj}` : ""}`)}
          {linha("Valor bruto", brlExato(f.valorCentavos))}
          {f.retencoesCentavos > 0 && linha("Retenções", brlExato(f.retencoesCentavos))}
          {linha("Líquido a receber", brlExato(liquidoEsperado(f)))}
          {linha("Emissão", br(f.emitidaEm))}
          {linha("Vencimento", br(f.vencimento))}
          {linha("Nota fiscal", f.nfNumero || "—")}
          {linha("Forma", rotuloForma(f.forma))}
          {f.status === "paga" && linha("Pago em", br(f.pagoEm))}
          {f.status === "paga" && linha("Valor recebido", brlExato(f.valorPagoCentavos ?? 0))}
          {f.status === "cancelada" && linha("Cancelada em", br(f.canceladaEm))}
          {f.status === "cancelada" && linha("Motivo", f.motivoCancelamento)}
          {f.notas && linha("Notas", f.notas)}
        </div>
        {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ display: "flex", gap: 14 }}>
            {f.status === "emitida" && (
              <button
                type="button"
                className="rec-link"
                style={{ color: C.error }}
                onClick={() => {
                  const motivo = window.prompt(`Cancelar ${f.ref}? Diga o motivo (ex.: nota emitida com valor errado).`);
                  if (motivo && motivo.trim()) void fazer({ acao: "cancelar", motivo });
                }}
              >
                cancelar fatura
              </button>
            )}
            {f.status === "paga" && (
              <button
                type="button"
                className="rec-link"
                onClick={() => window.confirm(`Estornar a baixa de ${f.ref}? A fatura volta a ficar em aberto.`) && void fazer({ acao: "estornar" })}
              >
                estornar baixa
              </button>
            )}
          </span>
          <span style={{ display: "flex", gap: 10 }}>
            {f.status === "emitida" && (
              <Button variant="outline" size="sm" onClick={() => onAcao({ tipo: "corrigir", fatura: f })}>
                corrigir
              </Button>
            )}
            {f.status === "emitida" && (
              <Button variant="solid" size="sm" onClick={() => onAcao({ tipo: "pagar", fatura: f })}>
                dar baixa
              </Button>
            )}
          </span>
        </div>
      </div>
    </Modal>
  );
}
