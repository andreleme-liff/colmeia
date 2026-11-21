// Forecast de receita: regras puras, sem banco. A rota grava e lê; aqui fica o que é conta.
//
// Uma RECEITA (tabela `contratos`) é o que um cliente vai pagar, como uma lista de PARCELAS:
// cada uma com a sua data de vencimento e o seu valor. Não há intervalo fixo nem valor igual —
// três parcelas podem ser 10/12, 15/01 e 30/04, de valores diferentes.
//  · à vista   — uma parcela só;
//  · parcelado — duas ou mais, livres.
//
// A situação diz o quanto a receita é certa:
//  · contratada — negócio fechado (card em Ganho, ou contrato de cliente que já é da casa);
//  · prevista   — card ainda nas etapas finais do pipeline (Proposta, Validação, Contrato),
//                 com chance ALTA (provável) ou BAIXA (possível).
// Prevista ligada a um card que foi para Ganho passa a contar como contratada sozinha — a
// conversão é calculada na leitura, não depende de ninguém lembrar de mudar o cadastro.
//
// As parcelas são também a base do faturamento: cada uma vira uma fatura a emitir.

import { STAGES } from "./domain.ts";

/** Como o valor é dividido. É derivado do número de parcelas; existe para a tela e o histórico. */
export const PAGAMENTOS = [
  { key: "a_vista", label: "À vista" },
  { key: "parcelado", label: "Parcelado" },
] as const;
export type Pagamento = (typeof PAGAMENTOS)[number]["key"];
export const pagamentoDe = (parcelas: { length: number }): Pagamento => (parcelas.length > 1 ? "parcelado" : "a_vista");

/** Por onde o cliente paga. Mora aqui (e não em faturamento.ts) porque é dado do contrato. */
export const FORMAS_COBRANCA = [
  { key: "boleto", label: "Boleto" },
  { key: "pix", label: "PIX" },
  { key: "transferencia", label: "Transferência" },
  { key: "cartao", label: "Cartão" },
] as const;
export type FormaCobranca = (typeof FORMAS_COBRANCA)[number]["key"];
export const FORMA_KEYS = FORMAS_COBRANCA.map((f) => f.key) as readonly string[];

/** Dados de cobrança do contrato: o que o faturamento usa para emitir e cobrar. */
export type Cobranca = {
  cnpj: string;
  emailCobranca: string;
  formaCobranca: FormaCobranca;
};
export const COBRANCA_PADRAO: Cobranca = { cnpj: "", emailCobranca: "", formaCobranca: "boleto" };

export const SITUACOES = ["contratada", "prevista"] as const;
export type Situacao = (typeof SITUACOES)[number];
export const CHANCES = ["alta", "baixa"] as const;
export type Chance = (typeof CHANCES)[number];

/** Etapas do pipeline em que um card pode entrar no forecast como receita prevista. */
export const ETAPAS_FINAIS = ["proposta", "validacao", "contrato"] as const;

/** Tetos aceitos no cadastro. */
export const LIMITES_RECEITA = { parcelas: 120, valorCentavos: 100_000_000_00, notas: 2000, conta: 200 };

export type Parcela = {
  /** Id no banco. Ausente = parcela nova, ainda não gravada. É o que liga a parcela à fatura. */
  id?: number;
  /** Vencimento, "YYYY-MM-DD". */
  data: string;
  valorCentavos: number;
};

export type Contrato = {
  id: number;
  ref: string;
  conta: string;
  area: string;
  dealId: number | null;
  /** Cadastro de cliente a que o contrato pertence (lib/clientes-db.ts). */
  clienteId?: number | null;
  situacao: Situacao;
  chance: Chance | null;
  notas: string;
  /** Na ordem de vencimento. */
  parcelas: Parcela[];
  cobranca: Cobranca;
};

/** Parcelas em ordem de vencimento (empate: a ordem em que foram cadastradas). */
export function emOrdem<T extends { data: string }>(parcelas: T[]): T[] {
  return parcelas.map((p, i) => ({ p, i })).sort((a, b) => (a.p.data < b.p.data ? -1 : a.p.data > b.p.data ? 1 : a.i - b.i)).map((x) => x.p);
}

/** Vencimento da primeira parcela, ou "" se não há nenhuma. */
export const primeiraData = (c: Pick<Contrato, "parcelas">): string => emOrdem(c.parcelas)[0]?.data ?? "";

/** Soma de todas as parcelas. */
export const totalDoContrato = (c: Pick<Contrato, "parcelas">): number => c.parcelas.reduce((t, p) => t + p.valorCentavos, 0);

/** O card ligado, no que importa para a situação efetiva. */
export type CardLigado = { estagio: string } | null | undefined;

/**
 * Situação que vale para o cálculo:
 *  · contratada        — cadastrada assim, ou prevista cujo card foi para Ganho;
 *  · provavel/possivel — prevista com chance alta/baixa e card ainda nas etapas finais
 *                        (ou sem card ligado);
 *  · fora              — prevista cujo card saiu das etapas finais (voltou no funil, On hold,
 *                        Lost): fica cadastrada, mas não entra na soma.
 */
export type SituacaoEfetiva = "contratada" | "provavel" | "possivel" | "fora";

export function situacaoEfetiva(c: Pick<Contrato, "situacao" | "chance" | "dealId">, card: CardLigado): SituacaoEfetiva {
  if (c.situacao === "contratada") return "contratada";
  if (card && card.estagio === "ganho") return "contratada";
  if (c.dealId != null && card && !(ETAPAS_FINAIS as readonly string[]).includes(card.estagio)) return "fora";
  return c.chance === "baixa" ? "possivel" : "provavel";
}

export const ROTULO_SITUACAO: Record<SituacaoEfetiva, string> = {
  contratada: "Contratada",
  provavel: "Provável",
  possivel: "Possível",
  fora: "Fora do forecast",
};

/* ---------------- meses ---------------- */

/** "2026-11" a partir de "2026-11-10" ou de "2026-11". */
export function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function mesesEntre(de: string, ate: string): number {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "nov/26". */
export function rotuloMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES_CURTOS[m - 1]}/${String(a).slice(2)}`;
}

/* ---------------- parcelas no tempo ---------------- */

export type Lancamento = {
  mes: string;
  /** Vencimento da parcela. */
  data: string;
  /** Id da parcela no banco (ausente na prévia de um cadastro ainda não gravado). */
  parcelaId?: number;
  valorCentavos: number;
  /** "3/6"; "à vista" quando a receita tem uma parcela só. */
  rotulo: string;
};

/** Parcelas de um contrato que vencem entre `de` e `ate` (meses, inclusivos), em ordem. */
export function lancamentos(c: Pick<Contrato, "parcelas">, de: string, ate: string): Lancamento[] {
  const todas = emOrdem(c.parcelas);
  const n = todas.length;
  const out: Lancamento[] = [];
  todas.forEach((p, k) => {
    const mes = mesDe(p.data);
    if (p.valorCentavos <= 0 || mes < de || mes > ate) return;
    out.push({ mes, data: p.data, parcelaId: p.id, valorCentavos: p.valorCentavos, rotulo: n === 1 ? "à vista" : `${k + 1}/${n}` });
  });
  return out;
}

/** Quanto do contrato vence no período. */
export function totalNoPeriodo(c: Pick<Contrato, "parcelas">, de: string, ate: string): number {
  return lancamentos(c, de, ate).reduce((t, l) => t + l.valorCentavos, 0);
}

/* ---------------- série mensal ---------------- */

export type MesForecast = {
  mes: string;
  contratada: number;
  provavel: number;
  possivel: number;
};

/** Soma por mês, de `de` em diante, `meses` meses, aberta pela certeza da receita. */
export function serieMensal(
  contratos: { contrato: Contrato; efetiva: SituacaoEfetiva }[],
  de: string,
  meses: number
): MesForecast[] {
  const ate = somarMeses(de, meses - 1);
  const linhas: MesForecast[] = Array.from({ length: meses }, (_, i) => ({ mes: somarMeses(de, i), contratada: 0, provavel: 0, possivel: 0 }));
  const idx = new Map(linhas.map((l, i) => [l.mes, i]));
  for (const { contrato, efetiva } of contratos) {
    if (efetiva === "fora") continue;
    for (const l of lancamentos(contrato, de, ate)) linhas[idx.get(l.mes)!][efetiva] += l.valorCentavos;
  }
  return linhas;
}

export const contratadaDoMes = (m: MesForecast) => m.contratada;

/* ---------------- parcelas iguais ---------------- */

/** Dia `dia` do mês `mes`, recuado para o último dia quando o mês é mais curto (31 → 28/02). */
export function diaNoMes(mes: string, dia: number): string {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/**
 * Ponto de partida para o parcelado: `n` parcelas mensais iguais a partir de `primeira`, com
 * o resto de centavos na última para a soma bater. A tela gera isto e deixa editar cada linha.
 */
export function parcelasIguais(totalCentavos: number, n: number, primeira: string): Parcela[] {
  const qtd = Math.max(1, Math.min(LIMITES_RECEITA.parcelas, Math.floor(n) || 1));
  const base = Math.floor(totalCentavos / qtd);
  const dia = Number(primeira.slice(8, 10));
  return Array.from({ length: qtd }, (_, k) => ({
    data: diaNoMes(somarMeses(mesDe(primeira), k), dia),
    valorCentavos: k === qtd - 1 ? totalCentavos - base * (qtd - 1) : base,
  }));
}

/* ---------------- validação do cadastro ---------------- */

export type EntradaContrato = {
  conta: string;
  area: string;
  dealId: number | null;
  situacao: Situacao;
  chance: Chance | null;
  notas: string;
  parcelas: Parcela[];
  cobranca: Cobranca;
};

/** Dados de cobrança; ausentes ficam no padrão (boleto). */
function lerCobranca(v: unknown): Cobranca | string {
  if (v == null) return { ...COBRANCA_PADRAO };
  if (typeof v !== "object") return "Dados de cobrança inválidos.";
  const b = v as Record<string, unknown>;
  const cnpj = typeof b.cnpj === "string" ? b.cnpj.trim().slice(0, 30) : "";
  const email = typeof b.emailCobranca === "string" ? b.emailCobranca.trim().slice(0, 200) : "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "E-mail de cobrança inválido.";
  const forma = b.formaCobranca == null ? COBRANCA_PADRAO.formaCobranca : b.formaCobranca;
  if (typeof forma !== "string" || !FORMA_KEYS.includes(forma)) return "Forma de cobrança inválida.";
  return { cnpj, emailCobranca: email, formaCobranca: forma as FormaCobranca };
}

const inteiro = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * Lê e valida o corpo do cadastro. Devolve o contrato normalizado ou a mensagem de erro
 * (a mesma que a tela mostra). As parcelas saem em ordem de vencimento.
 */
export function lerContrato(body: Record<string, unknown> | null): EntradaContrato | string {
  if (!body) return "Requisição inválida.";
  const conta = typeof body.conta === "string" ? body.conta.trim().slice(0, LIMITES_RECEITA.conta) : "";
  if (!conta) return "Informe o cliente.";
  const area = typeof body.area === "string" ? body.area : "";
  if (!area) return "Escolha o produto.";
  const dealId = body.dealId == null || body.dealId === "" ? null : inteiro(body.dealId, 1, 2_000_000_000);
  if (body.dealId != null && body.dealId !== "" && dealId == null) return "Oportunidade inválida.";
  const situacao = body.situacao;
  if (situacao !== "contratada" && situacao !== "prevista") return "Situação inválida.";
  const chance = situacao === "prevista" ? (body.chance === "baixa" ? "baixa" : body.chance === "alta" ? "alta" : null) : null;
  if (situacao === "prevista" && !chance) return "Diga se a chance de fechar é alta ou baixa.";
  const notas = typeof body.notas === "string" ? body.notas.slice(0, LIMITES_RECEITA.notas) : "";

  if (!Array.isArray(body.parcelas)) return "Parcelas inválidas.";
  if (!body.parcelas.length) return "Informe ao menos uma parcela, com data e valor.";
  if (body.parcelas.length > LIMITES_RECEITA.parcelas) return `No máximo ${LIMITES_RECEITA.parcelas} parcelas.`;
  const parcelas: Parcela[] = [];
  const ids = new Set<number>();
  for (const [i, bruto] of (body.parcelas as Record<string, unknown>[]).entries()) {
    const n = i + 1;
    if (!bruto || typeof bruto !== "object") return `Parcela ${n}: inválida.`;
    const data = typeof bruto.data === "string" ? bruto.data : "";
    if (!dataValida(data)) return `Parcela ${n}: informe a data de vencimento.`;
    const valor = inteiro(bruto.valorCentavos, 0, LIMITES_RECEITA.valorCentavos);
    if (valor == null || valor <= 0) return `Parcela ${n}: informe o valor.`;
    let id: number | undefined;
    if (bruto.id != null && bruto.id !== "") {
      const lido = inteiro(bruto.id, 1, 2_000_000_000);
      if (lido == null || ids.has(lido)) return `Parcela ${n}: inválida.`;
      ids.add(lido);
      id = lido;
    }
    parcelas.push(id == null ? { data, valorCentavos: valor } : { id, data, valorCentavos: valor });
  }
  const cobranca = lerCobranca(body.cobranca);
  if (typeof cobranca === "string") return cobranca;
  return { conta, area, dealId, situacao, chance, notas, parcelas: emOrdem(parcelas), cobranca };
}

/** "YYYY-MM-DD" que existe no calendário (31/02 não passa). */
export function dataValida(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** "Proposta", "Validação"... para mensagens. */
export function rotuloEtapa(k: string): string {
  return STAGES.find((s) => s.key === k)?.label ?? k;
}

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const br = (iso: string) => iso.split("-").reverse().join("/");

/** "R$ 30.000,00 à vista em 10/12/2026" ou "R$ 30.000,00 em 3 parcelas: 10/12/2026 R$ 10.000,00; …". */
export function resumoParcelas(parcelas: Parcela[]): string {
  const ps = emOrdem(parcelas);
  const total = reais(ps.reduce((t, p) => t + p.valorCentavos, 0));
  if (ps.length === 1) return `${total} à vista em ${br(ps[0].data)}`;
  return `${total} em ${ps.length} parcelas: ${ps.map((p) => `${br(p.data)} ${reais(p.valorCentavos)}`).join("; ")}`;
}

/** Resumo do contrato inteiro, para o histórico. */
export function resumoContrato(c: Pick<EntradaContrato, "situacao" | "chance" | "parcelas" | "cobranca">): string {
  const sit = c.situacao === "contratada" ? "contratada" : `prevista, chance ${c.chance}`;
  const cob = c.cobranca ?? COBRANCA_PADRAO;
  const forma = FORMAS_COBRANCA.find((f) => f.key === cob.formaCobranca)?.label ?? cob.formaCobranca;
  const extras = [cob.cnpj && `CNPJ ${cob.cnpj}`, cob.emailCobranca && `cobrança em ${cob.emailCobranca}`].filter(Boolean).join(", ");
  return `${sit}; ${resumoParcelas(c.parcelas)}; ${forma}${extras ? `; ${extras}` : ""}`;
}
