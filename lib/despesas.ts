// Despesas (contas a pagar): regras puras, sem banco. É o espelho do faturamento: lá entra
// dinheiro, aqui sai.
//
// Quatro cadastros:
//   categoria   — o plano de contas, bem enxuto. Cada categoria pertence a um GRUPO (pessoal,
//                 custo do serviço, operacional, impostos, financeira). Hoje o grupo só organiza
//                 a tela; é ele que vai permitir montar a DRE e a margem sem reclassificar nada.
//   favorecido  — quem recebe: colaborador PJ, advisor PJ, o cartão corporativo, um fornecedor.
//   recorrência — compromisso que se repete todo mês (o contrato de um PJ, uma assinatura).
//                 Não grava nada sozinha: gera, em cada competência, uma conta PREVISTA.
//   conta       — a despesa em si (P-0000). Nasce "a pagar" quando é lançada.
//
// Ciclo de vida de uma conta:
//   prevista  — calculada de uma recorrência; ainda não existe no banco. Lançar é confirmar o
//               valor e o vencimento do mês (a nota do PJ chegou);
//   a pagar   — lançada. Passou do vencimento sem pagamento, a tela mostra VENCIDA (derivado);
//   paga      — pagamento registrado: data e valor que saiu;
//   cancelada — com motivo. Se veio de recorrência, a linha do mês volta a ficar prevista.
//
// COMPETÊNCIA x VENCIMENTO: competência é o mês a que a despesa se refere (o serviço de
// novembro); vencimento é quando o dinheiro sai (5 de dezembro). A tela do mês organiza por
// competência, que é o que a DRE vai usar; a aba "a pagar" organiza por vencimento, que é o caixa.
//
// CARTÃO CORPORATIVO: a fatura do cartão é UMA conta a pagar (o favorecido é o cartão), e as
// compras entram como ITENS dela, cada uma com a sua categoria. Assim o caixa enxerga um
// pagamento só e o resumo por categoria enxerga cada compra. Por isso "cartão" não é forma
// de pagamento aqui: uma compra no cartão é item da fatura, nunca uma conta separada.

import { mesDe, somarMeses } from "./forecast.ts";

/* ---------------- listas fechadas ---------------- */

export const GRUPOS = [
  { key: "pessoal", label: "Pessoal" },
  { key: "custo", label: "Custo do serviço" },
  { key: "operacional", label: "Despesa operacional" },
  { key: "imposto", label: "Impostos e taxas" },
  { key: "financeira", label: "Despesa financeira" },
] as const;
export type Grupo = (typeof GRUPOS)[number]["key"];
export const GRUPO_KEYS = GRUPOS.map((g) => g.key) as readonly string[];
export const rotuloGrupo = (k: string) => GRUPOS.find((g) => g.key === k)?.label ?? k;

export const TIPOS_FAVORECIDO = [
  { key: "colaborador_pj", label: "Colaborador PJ" },
  { key: "advisor_pj", label: "Advisor PJ" },
  { key: "cartao", label: "Cartão corporativo" },
  { key: "fornecedor", label: "Fornecedor" },
  { key: "governo", label: "Governo (impostos)" },
] as const;
export type TipoFavorecido = (typeof TIPOS_FAVORECIDO)[number]["key"];
export const TIPO_FAVORECIDO_KEYS = TIPOS_FAVORECIDO.map((t) => t.key) as readonly string[];
export const rotuloTipoFavorecido = (k: string) => TIPOS_FAVORECIDO.find((t) => t.key === k)?.label ?? k;

export const FORMAS_PAGAMENTO = [
  { key: "pix", label: "PIX" },
  { key: "boleto", label: "Boleto" },
  { key: "transferencia", label: "Transferência" },
  { key: "debito", label: "Débito automático" },
] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number]["key"];
export const FORMA_PAGAMENTO_KEYS = FORMAS_PAGAMENTO.map((f) => f.key) as readonly string[];
export const rotuloFormaPagamento = (k: string | null | undefined) => FORMAS_PAGAMENTO.find((f) => f.key === k)?.label ?? "—";

/** Categorias que entram quando a tabela nasce. A administração muda à vontade depois. */
export const CATEGORIAS_SEMENTE: { nome: string; grupo: Grupo }[] = [
  { nome: "Colaboradores PJ", grupo: "pessoal" },
  { nome: "Advisors", grupo: "pessoal" },
  { nome: "Infraestrutura de nuvem e IA", grupo: "custo" },
  { nome: "Software e assinaturas", grupo: "operacional" },
  { nome: "Marketing e eventos", grupo: "operacional" },
  { nome: "Viagens e deslocamento", grupo: "operacional" },
  { nome: "Contabilidade e jurídico", grupo: "operacional" },
  { nome: "Escritório e administrativo", grupo: "operacional" },
  { nome: "Outras despesas", grupo: "operacional" },
  { nome: "Impostos e taxas", grupo: "imposto" },
  { nome: "Tarifas bancárias e juros", grupo: "financeira" },
];

export const LIMITES_DESPESA = { valorCentavos: 100_000_000_00, itens: 300, nome: 120, descricao: 300, notas: 1000 };

/* ---------------- tipos ---------------- */

export type Categoria = { id: number; nome: string; grupo: Grupo; ativo: boolean };

export type Favorecido = {
  id: number;
  nome: string;
  tipo: TipoFavorecido;
  /** CNPJ ou CPF, como foi digitado. */
  documento: string;
  contato: string;
  /** Como pagar: chave PIX, banco e conta. Texto livre. */
  pagamento: string;
  notas: string;
  ativo: boolean;
};

export type Recorrencia = {
  id: number;
  favorecidoId: number;
  categoriaId: number;
  /** Produto a que o gasto serve; nulo = da empresa toda. */
  area: string | null;
  descricao: string;
  valorCentavos: number;
  /** 1 a 28, para existir em todo mês. */
  diaVencimento: number;
  /** PJ costuma receber no mês seguinte ao do serviço. */
  venceMesSeguinte: boolean;
  forma: FormaPagamento;
  /** Primeira e última competência ("YYYY-MM"). `fim` nulo = sem data para acabar. */
  inicio: string;
  fim: string | null;
  notas: string;
};

export type ItemDespesa = {
  id: number;
  /** Data da compra, quando se sabe. */
  data: string | null;
  descricao: string;
  categoriaId: number;
  area: string | null;
  valorCentavos: number;
};

export type StatusGravado = "aberta" | "paga" | "cancelada";
export type StatusDespesa = "prevista" | "aberta" | "vencida" | "paga" | "cancelada";
export const ROTULO_STATUS_DESPESA: Record<StatusDespesa, string> = {
  prevista: "Prevista",
  aberta: "A pagar",
  vencida: "Vencida",
  paga: "Paga",
  cancelada: "Cancelada",
};

/** Conta a pagar como está no banco. Datas "YYYY-MM-DD"; competência "YYYY-MM". */
export type Despesa = {
  id: number;
  ref: string;
  favorecidoId: number;
  /** Nome do favorecido copiado no lançamento: renomear o cadastro não reescreve o passado. */
  favorecido: string;
  /** Nulo quando a conta é detalhada em itens (cada item tem a sua). */
  categoriaId: number | null;
  area: string | null;
  recorrenciaId: number | null;
  competencia: string;
  descricao: string;
  valorCentavos: number;
  vencimento: string;
  forma: FormaPagamento;
  /** Número da nota fiscal, do boleto ou da fatura. */
  documento: string;
  status: StatusGravado;
  pagoEm: string | null;
  valorPagoCentavos: number | null;
  canceladaEm: string | null;
  motivoCancelamento: string;
  notas: string;
  itens: ItemDespesa[];
};

/* ---------------- situação ---------------- */

/** Situação que a tela mostra: aberta e já vencida aparece como vencida. */
export function statusDaDespesa(d: Pick<Despesa, "status" | "vencimento">, hoje: string): StatusDespesa {
  if (d.status === "aberta" && d.vencimento < hoje) return "vencida";
  return d.status;
}

/** Dias em atraso (0 se ainda não venceu). */
export function diasVencida(vencimento: string, hoje: string): number {
  if (vencimento >= hoje) return 0;
  return Math.round((Date.parse(hoje + "T00:00:00Z") - Date.parse(vencimento + "T00:00:00Z")) / 86_400_000);
}

/** Dias até o vencimento (negativo = já venceu). */
export function diasAteVencer(vencimento: string, hoje: string): number {
  return Math.round((Date.parse(vencimento + "T00:00:00Z") - Date.parse(hoje + "T00:00:00Z")) / 86_400_000);
}

/* ---------------- recorrências ---------------- */

/** A recorrência vale para esta competência? */
export function recorrenciaAtivaEm(r: Pick<Recorrencia, "inicio" | "fim">, competencia: string): boolean {
  return competencia >= r.inicio && (r.fim == null || competencia <= r.fim);
}

/** Vencimento da conta de uma competência: o dia combinado, no próprio mês ou no seguinte. */
export function vencimentoDaRecorrencia(r: Pick<Recorrencia, "diaVencimento" | "venceMesSeguinte">, competencia: string): string {
  const mes = r.venceMesSeguinte ? somarMeses(competencia, 1) : competencia;
  return `${mes}-${String(r.diaVencimento).padStart(2, "0")}`;
}

/** Quanto as recorrências comprometem numa competência: o gasto fixo do mês. */
export function compromissoMensal(recorrencias: Recorrencia[], competencia: string): number {
  return recorrencias.filter((r) => recorrenciaAtivaEm(r, competencia)).reduce((t, r) => t + r.valorCentavos, 0);
}

/* ---------------- o mês: recorrências + contas lançadas ---------------- */

export type ContaDoMes = {
  /** "r<recorrência>|<competência>" para linha de recorrência; "d<id>" para conta avulsa. */
  chave: string;
  recorrenciaId: number | null;
  favorecidoId: number;
  favorecido: string;
  categoriaId: number | null;
  area: string | null;
  descricao: string;
  competencia: string;
  /** Valor lançado, ou o da recorrência enquanto é previsão. */
  valorCentavos: number;
  vencimento: string;
  status: StatusDespesa;
  despesa: Despesa | null;
  /** Contas canceladas desta mesma linha (histórico de relançamento). */
  canceladas: Despesa[];
};

/**
 * Tudo o que pertence a uma competência: uma linha por recorrência ativa (com a conta viva,
 * se já foi lançada) mais as contas daquele mês que não vêm de recorrência.
 */
export function contasDoMes(
  recorrencias: Recorrencia[],
  favorecidos: Favorecido[],
  despesas: Despesa[],
  competencia: string,
  hoje: string
): ContaDoMes[] {
  const doMes = despesas.filter((d) => d.competencia === competencia);
  const nome = new Map(favorecidos.map((f) => [f.id, f.nome]));
  const usadas = new Set<number>();
  const linhas: ContaDoMes[] = [];

  for (const r of recorrencias) {
    const mesmas = doMes.filter((d) => d.recorrenciaId === r.id);
    mesmas.forEach((d) => usadas.add(d.id));
    const viva = mesmas.find((d) => d.status !== "cancelada") ?? null;
    // Recorrência encerrada some do mês, a não ser que já tenha conta lançada nele.
    if (!viva && !recorrenciaAtivaEm(r, competencia)) continue;
    linhas.push({
      chave: `r${r.id}|${competencia}`,
      recorrenciaId: r.id,
      favorecidoId: r.favorecidoId,
      favorecido: viva?.favorecido ?? nome.get(r.favorecidoId) ?? "—",
      categoriaId: viva ? viva.categoriaId : r.categoriaId,
      area: viva ? viva.area : r.area,
      descricao: viva?.descricao || r.descricao,
      competencia,
      valorCentavos: viva ? viva.valorCentavos : r.valorCentavos,
      vencimento: viva ? viva.vencimento : vencimentoDaRecorrencia(r, competencia),
      status: viva ? statusDaDespesa(viva, hoje) : "prevista",
      despesa: viva,
      canceladas: mesmas.filter((d) => d.status === "cancelada"),
    });
  }

  for (const d of doMes) {
    if (usadas.has(d.id) || d.status === "cancelada") continue;
    linhas.push({
      chave: `d${d.id}`,
      recorrenciaId: d.recorrenciaId,
      favorecidoId: d.favorecidoId,
      favorecido: d.favorecido,
      categoriaId: d.categoriaId,
      area: d.area,
      descricao: d.descricao,
      competencia,
      valorCentavos: d.valorCentavos,
      vencimento: d.vencimento,
      status: statusDaDespesa(d, hoje),
      despesa: d,
      canceladas: [],
    });
  }
  return linhas.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.favorecido.localeCompare(b.favorecido, "pt-BR"));
}

/* ---------------- resumo por categoria ---------------- */

export type TotalCategoria = { categoriaId: number | null; nome: string; grupo: Grupo | null; valor: number };

/**
 * Quanto cada categoria pesa num conjunto de linhas do mês. Conta detalhada em itens (a
 * fatura do cartão) é distribuída pelas categorias dos itens; o que sobrar do valor da conta
 * sem item fica em "Sem categoria", para a soma sempre fechar com o total.
 */
export function porCategoria(linhas: ContaDoMes[], categorias: Categoria[]): TotalCategoria[] {
  const soma = new Map<number | null, number>();
  const mais = (id: number | null, v: number) => v && soma.set(id, (soma.get(id) ?? 0) + v);
  for (const l of linhas) {
    if (l.status === "cancelada") continue;
    const itens = l.despesa?.itens ?? [];
    if (itens.length) {
      let resto = l.valorCentavos;
      for (const i of itens) {
        mais(i.categoriaId, i.valorCentavos);
        resto -= i.valorCentavos;
      }
      mais(null, resto);
    } else {
      mais(l.categoriaId, l.valorCentavos);
    }
  }
  const cat = new Map(categorias.map((c) => [c.id, c]));
  return [...soma.entries()]
    .map(([id, valor]) => {
      const c = id == null ? undefined : cat.get(id);
      return { categoriaId: id, nome: c?.nome ?? "Sem categoria", grupo: c?.grupo ?? null, valor };
    })
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"));
}

/* ---------------- contas a pagar (caixa) ---------------- */

export const FAIXAS_A_PAGAR = [
  { key: "vencidas", label: "Vencidas", de: -Infinity, ate: -1 },
  { key: "7_dias", label: "Hoje e próximos 7 dias", de: 0, ate: 7 },
  { key: "30_dias", label: "De 8 a 30 dias", de: 8, ate: 30 },
  { key: "depois", label: "Mais de 30 dias", de: 31, ate: Infinity },
] as const;

/** Em aberto (lançadas, não pagas), somadas por quando vencem: o que o caixa precisa cobrir. */
export function faixasAPagar(despesas: Despesa[], hoje: string): { key: string; label: string; qtd: number; valor: number }[] {
  const abertas = despesas.filter((d) => d.status === "aberta");
  return FAIXAS_A_PAGAR.map((fx) => {
    const da = abertas.filter((d) => {
      const dias = diasAteVencer(d.vencimento, hoje);
      return dias >= fx.de && dias <= fx.ate;
    });
    return { key: fx.key, label: fx.label, qtd: da.length, valor: da.reduce((t, d) => t + d.valorCentavos, 0) };
  });
}

/** Média do que foi efetivamente pago nos `meses` meses fechados antes de `hoje` (o "burn"). */
export function mediaPaga(despesas: Despesa[], hoje: string, meses = 3): number {
  const atual = mesDe(hoje);
  const de = somarMeses(atual, -meses);
  const total = despesas
    .filter((d) => d.status === "paga" && d.pagoEm && mesDe(d.pagoEm) >= de && mesDe(d.pagoEm) < atual)
    .reduce((t, d) => t + (d.valorPagoCentavos ?? 0), 0);
  return Math.round(total / meses);
}

/* ---------------- validação ---------------- */

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const data = (v: unknown): string | null =>
  typeof v === "string" && DATA.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) ? v : null;
const mes = (v: unknown): string | null => (typeof v === "string" && MES.test(v) ? v : null);
const centavos = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= LIMITES_DESPESA.valorCentavos ? v : null;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** Id de cadastro: inteiro positivo, vindo como número ou como texto de um <select>. */
const idDe = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};
/** Produto opcional: vazio vira nulo. Se o id existe, quem confere é o banco. */
const areaDe = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : null);
type Corpo = Record<string, unknown> | null;

export type EntradaCategoria = { nome: string; grupo: Grupo; ativo: boolean };
export function lerCategoria(body: Corpo): EntradaCategoria | string {
  if (!body) return "Requisição inválida.";
  const nome = texto(body.nome, LIMITES_DESPESA.nome);
  if (!nome) return "Dê um nome à categoria.";
  if (typeof body.grupo !== "string" || !GRUPO_KEYS.includes(body.grupo)) return "Escolha o grupo da categoria.";
  return { nome, grupo: body.grupo as Grupo, ativo: body.ativo !== false };
}

export type EntradaFavorecido = Omit<Favorecido, "id">;
export function lerFavorecido(body: Corpo): EntradaFavorecido | string {
  if (!body) return "Requisição inválida.";
  const nome = texto(body.nome, LIMITES_DESPESA.nome);
  if (!nome) return "Informe o nome do favorecido.";
  if (typeof body.tipo !== "string" || !TIPO_FAVORECIDO_KEYS.includes(body.tipo)) return "Escolha o tipo do favorecido.";
  return {
    nome,
    tipo: body.tipo as TipoFavorecido,
    documento: texto(body.documento, 30),
    contato: texto(body.contato, 200),
    pagamento: texto(body.pagamento, 300),
    notas: texto(body.notas, LIMITES_DESPESA.notas),
    ativo: body.ativo !== false,
  };
}

export type EntradaRecorrencia = Omit<Recorrencia, "id">;
export function lerRecorrencia(body: Corpo): EntradaRecorrencia | string {
  if (!body) return "Requisição inválida.";
  const favorecidoId = idDe(body.favorecidoId);
  if (!favorecidoId) return "Escolha o favorecido.";
  const categoriaId = idDe(body.categoriaId);
  if (!categoriaId) return "Escolha a categoria.";
  const valor = centavos(body.valorCentavos);
  if (!valor) return "Informe o valor mensal.";
  const dia = typeof body.diaVencimento === "number" ? body.diaVencimento : Number(body.diaVencimento);
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) return "O dia de vencimento vai de 1 a 28.";
  if (typeof body.forma !== "string" || !FORMA_PAGAMENTO_KEYS.includes(body.forma)) return "Escolha a forma de pagamento.";
  const inicio = mes(body.inicio);
  if (!inicio) return "Início inválido (AAAA-MM).";
  const fim = body.fim == null || body.fim === "" ? null : mes(body.fim);
  if (body.fim != null && body.fim !== "" && !fim) return "Fim inválido (AAAA-MM).";
  if (fim && fim < inicio) return "O fim não pode ser antes do início.";
  return {
    favorecidoId,
    categoriaId,
    area: areaDe(body.area),
    descricao: texto(body.descricao, LIMITES_DESPESA.descricao),
    valorCentavos: valor,
    diaVencimento: dia,
    venceMesSeguinte: body.venceMesSeguinte === true,
    forma: body.forma as FormaPagamento,
    inicio,
    fim,
    notas: texto(body.notas, LIMITES_DESPESA.notas),
  };
}

export type EntradaItem = Omit<ItemDespesa, "id">;
export type EntradaDespesa = {
  favorecidoId: number;
  categoriaId: number | null;
  area: string | null;
  competencia: string;
  descricao: string;
  valorCentavos: number;
  vencimento: string;
  forma: FormaPagamento;
  documento: string;
  notas: string;
  itens: EntradaItem[];
};

/**
 * Lê o lançamento (ou a correção) de uma conta. Com itens, o valor da conta é a soma deles e
 * a categoria fica nos itens; sem itens, valor e categoria são da própria conta.
 */
export function lerDespesa(body: Corpo): EntradaDespesa | string {
  if (!body) return "Requisição inválida.";
  const favorecidoId = idDe(body.favorecidoId);
  if (!favorecidoId) return "Escolha o favorecido.";
  const competencia = mes(body.competencia);
  if (!competencia) return "Competência inválida (AAAA-MM).";
  const vencimento = data(body.vencimento);
  if (!vencimento) return "Informe o vencimento.";
  if (typeof body.forma !== "string" || !FORMA_PAGAMENTO_KEYS.includes(body.forma)) return "Escolha a forma de pagamento.";

  const brutos = Array.isArray(body.itens) ? body.itens : [];
  if (brutos.length > LIMITES_DESPESA.itens) return `Uma conta aceita até ${LIMITES_DESPESA.itens} itens.`;
  const itens: EntradaItem[] = [];
  for (const [n, b] of brutos.entries()) {
    const i = typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {};
    const onde = `Item ${n + 1}`;
    const descricao = texto(i.descricao, LIMITES_DESPESA.descricao);
    if (!descricao) return `${onde}: descreva a compra.`;
    const categoriaId = idDe(i.categoriaId);
    if (!categoriaId) return `${onde}: escolha a categoria.`;
    const valor = centavos(i.valorCentavos);
    if (!valor) return `${onde}: informe o valor.`;
    const dataItem = i.data == null || i.data === "" ? null : data(i.data);
    if (i.data != null && i.data !== "" && !dataItem) return `${onde}: data inválida.`;
    itens.push({ data: dataItem, descricao, categoriaId, area: areaDe(i.area), valorCentavos: valor });
  }

  let valorCentavos: number;
  let categoriaId: number | null;
  if (itens.length) {
    valorCentavos = itens.reduce((t, i) => t + i.valorCentavos, 0);
    if (valorCentavos > LIMITES_DESPESA.valorCentavos) return "Valor inválido.";
    categoriaId = null;
  } else {
    const valor = centavos(body.valorCentavos);
    if (!valor) return "Informe o valor.";
    valorCentavos = valor;
    categoriaId = idDe(body.categoriaId);
    if (!categoriaId) return "Escolha a categoria.";
  }
  return {
    favorecidoId,
    categoriaId,
    area: areaDe(body.area),
    competencia,
    descricao: texto(body.descricao, LIMITES_DESPESA.descricao),
    valorCentavos,
    vencimento,
    forma: body.forma as FormaPagamento,
    documento: texto(body.documento, 60),
    notas: texto(body.notas, LIMITES_DESPESA.notas),
    itens,
  };
}

export type Pagamento = { pagoEm: string; valorPagoCentavos: number; notas: string };
export function lerPagamento(body: Corpo): Pagamento | string {
  if (!body) return "Requisição inválida.";
  const pagoEm = data(body.pagoEm);
  if (!pagoEm) return "Informe a data do pagamento.";
  const valor = centavos(body.valorPagoCentavos);
  if (!valor) return "Informe o valor pago.";
  return { pagoEm, valorPagoCentavos: valor, notas: texto(body.notas, LIMITES_DESPESA.notas) };
}

/* ---------------- exportação ---------------- */

const csvCampo = (v: string | number) => {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const reais = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

/**
 * CSV do mês para a contabilidade (separador ";", decimal com vírgula). Conta detalhada em
 * itens sai com uma linha por item, que é o nível em que a categoria existe.
 */
export function csvDasDespesas(
  linhas: ContaDoMes[],
  categorias: Categoria[],
  rotuloArea: (id: string | null) => string
): string {
  const cat = new Map(categorias.map((c) => [c.id, c]));
  const cab = [
    "Competência", "Referência", "Favorecido", "Descrição", "Categoria", "Grupo", "Produto", "Situação", "Valor",
    "Vencimento", "Forma", "Documento", "Pago em", "Valor pago",
  ];
  const saida: string[] = [cab.join(";")];
  for (const l of linhas) {
    const d = l.despesa;
    const partes = d?.itens.length
      ? d.itens.map((i) => ({ descricao: i.descricao, categoriaId: i.categoriaId as number | null, area: i.area ?? l.area, valor: i.valorCentavos }))
      : [{ descricao: l.descricao, categoriaId: l.categoriaId, area: l.area, valor: l.valorCentavos }];
    for (const p of partes) {
      const c = p.categoriaId == null ? undefined : cat.get(p.categoriaId);
      saida.push(
        [
          l.competencia, d?.ref ?? "", l.favorecido, p.descricao, c?.nome ?? "", c ? rotuloGrupo(c.grupo) : "", rotuloArea(p.area),
          ROTULO_STATUS_DESPESA[l.status], reais(p.valor), dataBR(l.vencimento), d ? rotuloFormaPagamento(d.forma) : "", d?.documento ?? "",
          dataBR(d?.pagoEm ?? null), d?.itens.length ? "" : reais(d?.valorPagoCentavos ?? null),
        ].map(csvCampo).join(";")
      );
    }
  }
  return saida.join("\n");
}
