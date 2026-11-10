// Forecast de receita: regras puras, sem banco. A rota grava e lê; aqui fica o que é conta.
//
// Um CONTRATO é a receita de um cliente. Tem um início de faturamento e até três linhas:
//  · customização — um total, faturado em N parcelas mensais;
//  · implantação  — um total, faturado em N parcelas mensais;
//  · assinatura   — um valor por mês, por uma duração (ou sem prazo).
// Cada linha pode começar alguns meses depois do início do contrato (ex.: a assinatura só
// começa quando a implantação termina). Mês 0 = o mês do início do faturamento.
//
// A situação diz o quanto a receita é certa:
//  · contratada — negócio fechado (card em Ganho, ou contrato de cliente que já é da casa);
//  · prevista   — card ainda nas etapas finais do pipeline (Proposta, Validação, Contrato),
//                 com chance ALTA (provável) ou BAIXA (possível).
// Prevista ligada a um card que foi para Ganho passa a contar como contratada sozinha — a
// conversão é calculada na leitura, não depende de ninguém lembrar de mudar o cadastro.
//
// O cronograma de parcelas é também a base do faturamento: no futuro, cada lançamento vira
// uma cobrança a disparar para o cliente.

import { STAGES } from "./domain.ts";

export const TIPOS_RECEITA = [
  { key: "assinatura", label: "Assinatura", parcelado: false },
  { key: "implantacao", label: "Implantação", parcelado: true },
  { key: "customizacao", label: "Customização", parcelado: true },
] as const;
export type TipoReceita = (typeof TIPOS_RECEITA)[number]["key"];
export const TIPO_KEYS = TIPOS_RECEITA.map((t) => t.key) as readonly string[];

export const SITUACOES = ["contratada", "prevista"] as const;
export type Situacao = (typeof SITUACOES)[number];
export const CHANCES = ["alta", "baixa"] as const;
export type Chance = (typeof CHANCES)[number];

/** Etapas do pipeline em que um card pode entrar no forecast como receita prevista. */
export const ETAPAS_FINAIS = ["proposta", "validacao", "contrato"] as const;

/** Até onde o cálculo olha, e o teto de parcelas/duração aceitos no cadastro. */
export const LIMITES_RECEITA = { parcelas: 60, inicioMes: 120, duracao: 240, valorCentavos: 100_000_000_00, notas: 2000, conta: 200 };

export type LinhaReceita = {
  tipo: TipoReceita;
  /** Total (customização, implantação) ou valor mensal (assinatura), em centavos. */
  valorCentavos: number;
  /** Parcelas mensais do total. Assinatura ignora (é sempre mensal). */
  parcelas: number;
  /** Meses depois do início do faturamento em que esta linha começa. 0 = no próprio mês. */
  inicioMes: number;
  /** Só assinatura: quantos meses dura. null = sem prazo definido. */
  duracaoMeses: number | null;
};

export type Contrato = {
  id: number;
  ref: string;
  conta: string;
  area: string;
  dealId: number | null;
  situacao: Situacao;
  chance: Chance | null;
  /** "YYYY-MM-DD"; o cálculo usa o mês. */
  inicioFaturamento: string;
  notas: string;
  linhas: LinhaReceita[];
};

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

/* ---------------- cronograma de faturamento ---------------- */

export type Lancamento = {
  mes: string;
  tipo: TipoReceita;
  valorCentavos: number;
  /** "3/6" nas parcelas; "mês 4" na assinatura (contado a partir do primeiro mês dela). */
  rotulo: string;
};

/**
 * Lançamentos de um contrato entre `de` e `ate` (meses, inclusivos). Parcela é o total
 * dividido por N com o resto de centavos na última, para a soma bater exatamente.
 * Assinatura sem prazo segue até `ate`.
 */
export function lancamentos(c: Pick<Contrato, "inicioFaturamento" | "linhas">, de: string, ate: string): Lancamento[] {
  const inicio = mesDe(c.inicioFaturamento);
  const out: Lancamento[] = [];
  for (const l of c.linhas) {
    if (l.valorCentavos <= 0) continue;
    const primeiro = somarMeses(inicio, l.inicioMes);
    if (l.tipo === "assinatura") {
      const n = l.duracaoMeses ?? Math.max(0, mesesEntre(primeiro, ate) + 1);
      for (let k = 0; k < n; k++) {
        const mes = somarMeses(primeiro, k);
        if (mes > ate) break;
        if (mes >= de) out.push({ mes, tipo: l.tipo, valorCentavos: l.valorCentavos, rotulo: `mês ${k + 1}` });
      }
    } else {
      const n = Math.max(1, l.parcelas);
      const base = Math.floor(l.valorCentavos / n);
      for (let k = 0; k < n; k++) {
        const mes = somarMeses(primeiro, k);
        if (mes > ate) break;
        const valor = k === n - 1 ? l.valorCentavos - base * (n - 1) : base;
        if (mes >= de) out.push({ mes, tipo: l.tipo, valorCentavos: valor, rotulo: `${k + 1}/${n}` });
      }
    }
  }
  return out.sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : TIPO_KEYS.indexOf(a.tipo) - TIPO_KEYS.indexOf(b.tipo)));
}

/** Valor total do contrato (assinatura sem prazo conta só até `ate`). */
export function totalNoPeriodo(c: Pick<Contrato, "inicioFaturamento" | "linhas">, de: string, ate: string): number {
  return lancamentos(c, de, ate).reduce((t, l) => t + l.valorCentavos, 0);
}

/* ---------------- série mensal ---------------- */

export type MesForecast = {
  mes: string;
  assinatura: number;
  implantacao: number;
  customizacao: number;
  provavel: number;
  possivel: number;
};

/** Soma por mês, de `de` em diante, `meses` meses. Contratada é aberta por tipo; prevista, por chance. */
export function serieMensal(
  contratos: { contrato: Contrato; efetiva: SituacaoEfetiva }[],
  de: string,
  meses: number
): MesForecast[] {
  const ate = somarMeses(de, meses - 1);
  const linhas: MesForecast[] = Array.from({ length: meses }, (_, i) => ({
    mes: somarMeses(de, i), assinatura: 0, implantacao: 0, customizacao: 0, provavel: 0, possivel: 0,
  }));
  const idx = new Map(linhas.map((l, i) => [l.mes, i]));
  for (const { contrato, efetiva } of contratos) {
    if (efetiva === "fora") continue;
    for (const l of lancamentos(contrato, de, ate)) {
      const alvo = linhas[idx.get(l.mes)!];
      if (efetiva === "contratada") alvo[l.tipo] += l.valorCentavos;
      else alvo[efetiva] += l.valorCentavos;
    }
  }
  return linhas;
}

export const contratadaDoMes = (m: MesForecast) => m.assinatura + m.implantacao + m.customizacao;

/* ---------------- validação do cadastro ---------------- */

export type EntradaContrato = {
  conta: string;
  area: string;
  dealId: number | null;
  situacao: Situacao;
  chance: Chance | null;
  inicioFaturamento: string;
  notas: string;
  linhas: LinhaReceita[];
};

const inteiro = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * Lê e valida o corpo do cadastro. Devolve o contrato normalizado ou a mensagem de erro
 * (a mesma que a tela mostra). Linha com valor zero é descartada — é "não tem".
 */
export function lerContrato(body: Record<string, unknown> | null): EntradaContrato | string {
  if (!body) return "Requisição inválida.";
  const conta = typeof body.conta === "string" ? body.conta.trim().slice(0, LIMITES_RECEITA.conta) : "";
  if (!conta) return "Informe o cliente.";
  const area = typeof body.area === "string" ? body.area : "";
  if (!area) return "Escolha a vertical.";
  const dealId = body.dealId == null || body.dealId === "" ? null : inteiro(body.dealId, 1, 2_000_000_000);
  if (body.dealId != null && body.dealId !== "" && dealId == null) return "Oportunidade inválida.";
  const situacao = body.situacao;
  if (situacao !== "contratada" && situacao !== "prevista") return "Situação inválida.";
  const chance = situacao === "prevista" ? (body.chance === "baixa" ? "baixa" : body.chance === "alta" ? "alta" : null) : null;
  if (situacao === "prevista" && !chance) return "Diga se a chance de fechar é alta ou baixa.";
  const inicio = typeof body.inicioFaturamento === "string" ? body.inicioFaturamento : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || Number.isNaN(Date.parse(inicio + "T00:00:00Z"))) return "Informe o início do faturamento.";
  const notas = typeof body.notas === "string" ? body.notas.slice(0, LIMITES_RECEITA.notas) : "";

  if (!Array.isArray(body.linhas)) return "Linhas de receita inválidas.";
  const linhas: LinhaReceita[] = [];
  const vistos = new Set<string>();
  for (const bruto of body.linhas as Record<string, unknown>[]) {
    const tipo = bruto?.tipo;
    if (typeof tipo !== "string" || !TIPO_KEYS.includes(tipo)) return "Tipo de receita inválido.";
    if (vistos.has(tipo)) return "Cada tipo de receita aparece uma vez só.";
    vistos.add(tipo);
    const rotulo = TIPOS_RECEITA.find((t) => t.key === tipo)!.label;
    const valor = inteiro(bruto.valorCentavos, 0, LIMITES_RECEITA.valorCentavos);
    if (valor == null) return `${rotulo}: valor inválido.`;
    if (valor === 0) continue;
    const parcelas = tipo === "assinatura" ? 1 : inteiro(bruto.parcelas ?? 1, 1, LIMITES_RECEITA.parcelas);
    if (parcelas == null) return `${rotulo}: parcelas entre 1 e ${LIMITES_RECEITA.parcelas}.`;
    const inicioMes = inteiro(bruto.inicioMes ?? 0, 0, LIMITES_RECEITA.inicioMes);
    if (inicioMes == null) return `${rotulo}: o mês de início vai de 1 a ${LIMITES_RECEITA.inicioMes + 1}.`;
    let duracaoMeses: number | null = null;
    if (tipo === "assinatura" && bruto.duracaoMeses != null && bruto.duracaoMeses !== "") {
      duracaoMeses = inteiro(bruto.duracaoMeses, 1, LIMITES_RECEITA.duracao);
      if (duracaoMeses == null) return `${rotulo}: duração entre 1 e ${LIMITES_RECEITA.duracao} meses, ou em branco.`;
    }
    linhas.push({ tipo: tipo as TipoReceita, valorCentavos: valor, parcelas, inicioMes, duracaoMeses });
  }
  if (!linhas.length) return "Informe ao menos um valor: customização, implantação ou assinatura.";
  return { conta, area, dealId, situacao, chance, inicioFaturamento: inicio, notas, linhas };
}

/** "Proposta", "Validação"... para mensagens. */
export function rotuloEtapa(k: string): string {
  return STAGES.find((s) => s.key === k)?.label ?? k;
}

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Resumo de uma linha para histórico e tela: "Implantação R$ 30.000,00 em 3x a partir do mês 1". */
export function resumoLinha(l: LinhaReceita): string {
  const rotulo = TIPOS_RECEITA.find((t) => t.key === l.tipo)!.label;
  const quando = l.inicioMes > 0 ? ` a partir do mês ${l.inicioMes + 1}` : "";
  if (l.tipo === "assinatura") {
    return `${rotulo} ${reais(l.valorCentavos)}/mês${l.duracaoMeses ? ` por ${l.duracaoMeses} meses` : ""}${quando}`;
  }
  return `${rotulo} ${reais(l.valorCentavos)}${l.parcelas > 1 ? ` em ${l.parcelas}x` : ""}${quando}`;
}

/** Resumo do contrato inteiro, para o histórico. */
export function resumoContrato(c: EntradaContrato): string {
  const sit = c.situacao === "contratada" ? "contratada" : `prevista, chance ${c.chance}`;
  const [a, m] = c.inicioFaturamento.split("-");
  return `${sit}; início do faturamento ${m}/${a}; ${c.linhas.map(resumoLinha).join("; ")}`;
}
