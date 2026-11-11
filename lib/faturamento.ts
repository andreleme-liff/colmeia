// Faturamento (contas a receber): regras puras, sem banco.
//
// De onde vem cada fatura: do cronograma dos contratos de receita (lib/forecast.ts). Cada
// lançamento de um contrato CONTRATADO — parcela de customização ou de implantação, mês de
// assinatura — é uma fatura a emitir na sua competência (o mês a que se refere).
//
// Ciclo de vida:
//   a emitir  — calculada do contrato; ainda não existe no banco;
//   emitida   — nota fiscal e cobrança enviadas; tem vencimento. Passou do vencimento sem
//               pagamento, a tela mostra VENCIDA (derivado, não gravado);
//   paga      — baixa registrada: data e valor recebido;
//   cancelada — com motivo. A linha do cronograma volta a ficar "a emitir" (reemissão).
//
// Ao ser emitida, a fatura grava o próprio valor: mexer no contrato depois não altera o que
// já foi faturado. Fatura avulsa (serviço fora de contrato) nasce emitida, sem cronograma.

import {
  FORMAS_COBRANCA, FORMA_KEYS, TIPOS_RECEITA, lancamentos, somarMeses, type Contrato, type FormaCobranca, type TipoReceita,
} from "./forecast.ts";

export { FORMAS_COBRANCA, FORMA_KEYS, type FormaCobranca };

export const TIPOS_FATURA = [...TIPOS_RECEITA.map((t) => ({ key: t.key as string, label: t.label })), { key: "avulsa", label: "Avulsa" }];
export type TipoFatura = TipoReceita | "avulsa";
export const rotuloTipoFatura = (t: string) => TIPOS_FATURA.find((x) => x.key === t)?.label ?? t;

export const rotuloForma = (k: string | null | undefined) => FORMAS_COBRANCA.find((f) => f.key === k)?.label ?? "—";

export type StatusGravado = "emitida" | "paga" | "cancelada";
export type StatusFatura = "a_emitir" | "emitida" | "vencida" | "paga" | "cancelada";
export const ROTULO_STATUS: Record<StatusFatura, string> = {
  a_emitir: "A emitir",
  emitida: "Emitida",
  vencida: "Vencida",
  paga: "Paga",
  cancelada: "Cancelada",
};

/** Fatura como está no banco. Datas "YYYY-MM-DD"; competência "YYYY-MM". */
export type Fatura = {
  id: number;
  ref: string;
  contratoId: number | null;
  conta: string;
  area: string;
  tipo: TipoFatura;
  parcela: string;
  competencia: string;
  descricao: string;
  valorCentavos: number;
  status: StatusGravado;
  emitidaEm: string | null;
  vencimento: string | null;
  nfNumero: string;
  forma: string | null;
  retencoesCentavos: number;
  pagoEm: string | null;
  valorPagoCentavos: number | null;
  canceladaEm: string | null;
  motivoCancelamento: string;
  notas: string;
};

/** Situação que a tela mostra: emitida e já vencida aparece como vencida. */
export function statusDe(f: Pick<Fatura, "status" | "vencimento">, hoje: string): StatusFatura {
  if (f.status === "emitida" && f.vencimento && f.vencimento < hoje) return "vencida";
  return f.status;
}

/** Valor que se espera receber: bruto menos as retenções que o cliente recolhe por nós. */
export const liquidoEsperado = (f: Pick<Fatura, "valorCentavos" | "retencoesCentavos">) =>
  Math.max(0, f.valorCentavos - f.retencoesCentavos);

/** Dias em atraso (0 se ainda não venceu). */
export function diasDeAtraso(vencimento: string | null, hoje: string): number {
  if (!vencimento || vencimento >= hoje) return 0;
  return Math.round((Date.parse(hoje + "T00:00:00Z") - Date.parse(vencimento + "T00:00:00Z")) / 86_400_000);
}

/** Chave que liga uma linha do cronograma à fatura emitida a partir dela. */
export const chaveDaLinha = (contratoId: number, tipo: string, competencia: string) => `${contratoId}|${tipo}|${competencia}`;

/* ---------------- o mês: cronograma + faturas ---------------- */

export type ItemDoMes = {
  /** Chave do cronograma (contrato|tipo|competência) ou "f<id>" para avulsa/órfã. */
  chave: string;
  contratoId: number | null;
  contratoRef: string | null;
  conta: string;
  area: string;
  tipo: TipoFatura;
  parcela: string;
  competencia: string;
  /** Valor da fatura emitida, ou o do cronograma enquanto está a emitir. */
  valorCentavos: number;
  status: StatusFatura;
  fatura: Fatura | null;
  /** Faturas canceladas desta mesma linha (histórico de reemissão). */
  canceladas: Fatura[];
};

/**
 * Tudo o que pertence a uma competência: as linhas do cronograma dos contratos contratados
 * (cada uma com a fatura viva, se houver) mais as faturas daquele mês que não vêm do
 * cronograma (avulsas, ou de uma linha que o contrato não tem mais).
 */
export function itensDoMes(
  contratos: Contrato[],
  contratado: (c: Contrato) => boolean,
  faturas: Fatura[],
  competencia: string,
  hoje: string
): ItemDoMes[] {
  const doMes = faturas.filter((f) => f.competencia === competencia);
  const usadas = new Set<number>();
  const itens: ItemDoMes[] = [];

  for (const c of contratos) {
    if (!contratado(c)) continue;
    for (const l of lancamentos(c, competencia, competencia)) {
      const mesmas = doMes.filter((f) => f.contratoId === c.id && f.tipo === l.tipo);
      mesmas.forEach((f) => usadas.add(f.id));
      const viva = mesmas.find((f) => f.status !== "cancelada") ?? null;
      itens.push({
        chave: chaveDaLinha(c.id, l.tipo, competencia),
        contratoId: c.id,
        contratoRef: c.ref,
        conta: c.conta,
        area: c.area,
        tipo: l.tipo,
        parcela: l.rotulo,
        competencia,
        valorCentavos: viva ? viva.valorCentavos : l.valorCentavos,
        status: viva ? statusDe(viva, hoje) : "a_emitir",
        fatura: viva,
        canceladas: mesmas.filter((f) => f.status === "cancelada"),
      });
    }
  }

  // Avulsas e órfãs: faturas do mês que nenhuma linha do cronograma reivindicou.
  const refPorId = new Map(contratos.map((c) => [c.id, c.ref]));
  for (const f of doMes) {
    if (usadas.has(f.id) || f.status === "cancelada") continue;
    itens.push({
      chave: `f${f.id}`,
      contratoId: f.contratoId,
      contratoRef: f.contratoId != null ? refPorId.get(f.contratoId) ?? null : null,
      conta: f.conta,
      area: f.area,
      tipo: f.tipo,
      parcela: f.parcela,
      competencia,
      valorCentavos: f.valorCentavos,
      status: statusDe(f, hoje),
      fatura: f,
      canceladas: [],
    });
  }
  return itens.sort((a, b) => a.conta.localeCompare(b.conta, "pt-BR") || a.tipo.localeCompare(b.tipo));
}

/* ---------------- contas a receber ---------------- */

export const FAIXAS_ATRASO = [
  { key: "a_vencer", label: "A vencer", de: -Infinity, ate: 0 },
  { key: "1_30", label: "1–30 dias", de: 1, ate: 30 },
  { key: "31_60", label: "31–60 dias", de: 31, ate: 60 },
  { key: "61_90", label: "61–90 dias", de: 61, ate: 90 },
  { key: "90_mais", label: "Mais de 90", de: 91, ate: Infinity },
] as const;

/** Em aberto (emitidas, não pagas), somadas por faixa de atraso — o "aging" do contas a receber. */
export function aging(faturas: Fatura[], hoje: string): { key: string; label: string; qtd: number; valor: number }[] {
  const abertas = faturas.filter((f) => f.status === "emitida");
  return FAIXAS_ATRASO.map((fx) => {
    const da = abertas.filter((f) => {
      const d = diasDeAtraso(f.vencimento, hoje);
      return d >= fx.de && d <= fx.ate;
    });
    return { key: fx.key, label: fx.label, qtd: da.length, valor: da.reduce((t, f) => t + liquidoEsperado(f), 0) };
  });
}

/* ---------------- vencimento ---------------- */

/** "2026-12-10" para (2026-12, dia 10). Dia é limitado a 28 no cadastro, então sempre existe. */
export function dataNoMes(competencia: string, dia: number): string {
  return `${competencia}-${String(dia).padStart(2, "0")}`;
}

/**
 * Vencimento sugerido ao emitir: o dia de vencimento do contrato no mês da competência; se
 * esse dia já passou (ou é antes da emissão), o mesmo dia no mês seguinte.
 */
export function vencimentoSugerido(competencia: string, diaVencimento: number, emissao: string): string {
  const noMes = dataNoMes(competencia, diaVencimento);
  return noMes > emissao ? noMes : dataNoMes(somarMeses(emissao.slice(0, 7), 1), diaVencimento);
}

/* ---------------- validação das ações ---------------- */

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const data = (v: unknown): string | null =>
  typeof v === "string" && DATA.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) ? v : null;
const centavos = (v: unknown, max = 100_000_000_00): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export type Emissao = {
  emitidaEm: string;
  vencimento: string;
  nfNumero: string;
  forma: FormaCobranca;
  retencoesCentavos: number;
  valorCentavos: number;
  notas: string;
};

/** Lê os dados de emissão. `valorPadrao` é o do cronograma, usado se o corpo não trouxer valor. */
export function lerEmissao(body: Record<string, unknown> | null, valorPadrao: number | null): Emissao | string {
  if (!body) return "Requisição inválida.";
  const emitidaEm = data(body.emitidaEm);
  if (!emitidaEm) return "Informe a data de emissão.";
  const vencimento = data(body.vencimento);
  if (!vencimento) return "Informe o vencimento.";
  if (vencimento < emitidaEm) return "O vencimento não pode ser antes da emissão.";
  const forma = body.forma;
  if (typeof forma !== "string" || !FORMA_KEYS.includes(forma)) return "Escolha a forma de cobrança.";
  const valor = body.valorCentavos == null ? valorPadrao : centavos(body.valorCentavos);
  if (valor == null || valor <= 0) return "Valor inválido.";
  const retencoes = body.retencoesCentavos == null || body.retencoesCentavos === "" ? 0 : centavos(body.retencoesCentavos);
  if (retencoes == null) return "Retenções inválidas.";
  if (retencoes > valor) return "As retenções não podem passar do valor da fatura.";
  return {
    emitidaEm,
    vencimento,
    nfNumero: texto(body.nfNumero, 60),
    forma: forma as FormaCobranca,
    retencoesCentavos: retencoes,
    valorCentavos: valor,
    notas: texto(body.notas, 1000),
  };
}

export type Baixa = { pagoEm: string; valorPagoCentavos: number; notas: string };

export function lerBaixa(body: Record<string, unknown> | null, emitidaEm: string | null): Baixa | string {
  if (!body) return "Requisição inválida.";
  const pagoEm = data(body.pagoEm);
  if (!pagoEm) return "Informe a data do pagamento.";
  if (emitidaEm && pagoEm < emitidaEm) return "O pagamento não pode ser antes da emissão.";
  const valor = centavos(body.valorPagoCentavos);
  if (valor == null || valor <= 0) return "Informe o valor recebido.";
  return { pagoEm, valorPagoCentavos: valor, notas: texto(body.notas, 1000) };
}

/* ---------------- exportação ---------------- */

const csvCampo = (v: string | number) => {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const reais = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

/** CSV do mês para a contabilidade (separador ";", decimal com vírgula — abre direto no Excel). */
export function csvDoMes(itens: ItemDoMes[], rotuloArea: (id: string) => string): string {
  const cab = [
    "Competência", "Cliente", "Vertical", "Contrato", "Tipo", "Parcela", "Status", "Valor bruto", "Retenções",
    "Valor líquido", "NF", "Emissão", "Vencimento", "Forma", "Pago em", "Valor pago",
  ];
  const linhas = itens.map((i) => {
    const f = i.fatura;
    return [
      i.competencia, i.conta, rotuloArea(i.area), i.contratoRef ?? "", rotuloTipoFatura(i.tipo), i.parcela, ROTULO_STATUS[i.status],
      reais(i.valorCentavos), reais(f?.retencoesCentavos ?? 0), reais(f ? liquidoEsperado(f) : i.valorCentavos),
      f?.nfNumero ?? "", dataBR(f?.emitidaEm ?? null), dataBR(f?.vencimento ?? null), f ? rotuloForma(f.forma) : "",
      dataBR(f?.pagoEm ?? null), reais(f?.valorPagoCentavos ?? null),
    ].map(csvCampo).join(";");
  });
  return [cab.join(";"), ...linhas].join("\n");
}
