// Funding AWS: regras puras, sem banco.
//
// Três cadastros e um controle:
//  · PASTA — agrupa os arquétipos de um Módulo / Produto (ex.: LIFF Tax Reform).
//  · ARQUÉTIPO — como o produto roda para um tipo de cliente: SaaS 100% na LIFF, dedicado,
//    híbrido (control plane na LIFF, data plane no cliente) ou 100% no cliente. Cada um tem as
//    suas CALCULADORAS oficiais da AWS (Pricing Calculator), por região, porte e conta que paga
//    (a da LIFF ou a do cliente), com o custo mensal que a calculadora deu.
//  · PROGRAMA — as formas de funding da AWS (POC Cash, POC Credits, MAP, Sandbox…).
//  · ESTIMATIVA — o consumo previsto de uma oportunidade (por conta, mais IA) e as LINHAS de
//    funding pedidas para ela, com o andamento de cada uma.
//
// Valores em dólar, guardados em centavos de dólar. A estimativa já tem lugar para o card do
// pipeline (`dealId`), mas a ligação com o comercial ainda não está na tela.

export const MODELOS_OPERACAO = [
  { key: "saas_liff", label: "SaaS 100% LIFF", descricao: "Tudo roda na conta da LIFF, compartilhado com outros clientes." },
  { key: "dedicado_liff", label: "Dedicado na LIFF", descricao: "Estrutura só do cliente, numa conta operada e paga pela LIFF." },
  { key: "hibrido", label: "Híbrido", descricao: "Control plane na conta da LIFF; data plane na conta do cliente." },
  { key: "cliente", label: "100% no cliente", descricao: "Tudo roda na conta AWS do cliente; a LIFF opera à distância." },
] as const;
export type ModeloOperacao = (typeof MODELOS_OPERACAO)[number]["key"];
export const MODELO_KEYS = MODELOS_OPERACAO.map((m) => m.key) as readonly string[];
export const rotuloModelo = (k: string) => MODELOS_OPERACAO.find((m) => m.key === k)?.label ?? k;

export const CONTAS = [
  { key: "liff", label: "Conta LIFF" },
  { key: "cliente", label: "Conta do cliente" },
] as const;
export type Conta = (typeof CONTAS)[number]["key"];
export const rotuloConta = (k: string) => CONTAS.find((c) => c.key === k)?.label ?? k;

export const REGIOES = [
  { key: "us-east-1", label: "Virgínia (us-east-1)" },
  { key: "sa-east-1", label: "São Paulo (sa-east-1)" },
] as const;
export const REGIAO_KEYS = REGIOES.map((r) => r.key) as readonly string[];
export const rotuloRegiao = (k: string) => REGIOES.find((r) => r.key === k)?.label ?? k;

export const PORTES = ["P", "M", "G"] as const;

export const STATUS_FUNDING = [
  { key: "planejado", label: "Planejado", tom: "neutro" },
  { key: "solicitado", label: "Solicitado", tom: "info" },
  { key: "aprovado", label: "Aprovado", tom: "sucesso" },
  { key: "recebido", label: "Recebido", tom: "sucesso" },
  { key: "negado", label: "Negado", tom: "erro" },
  { key: "expirado", label: "Expirado", tom: "neutro" },
] as const;
export type StatusFunding = (typeof STATUS_FUNDING)[number]["key"];
export const STATUS_FUNDING_KEYS = STATUS_FUNDING.map((s) => s.key) as readonly string[];
export const rotuloStatusFunding = (k: string) => STATUS_FUNDING.find((s) => s.key === k)?.label ?? k;
/** Garantido = já aprovado ou recebido. Em andamento = planejado ou solicitado. */
export const GARANTIDO: readonly string[] = ["aprovado", "recebido"];
export const EM_ANDAMENTO: readonly string[] = ["planejado", "solicitado"];

/** Como o funding chega: crédito na conta AWS ou dinheiro (reembolso/pagamento). */
export const FORMAS_FUNDING = [
  { key: "credito", label: "Crédito AWS" },
  { key: "cash", label: "Cash" },
] as const;

/** Semente do catálogo de programas (editável depois, na tela). */
export const PROGRAMAS_SEMENTE = [
  { id: "poc-credits", label: "POC Credits", forma: "credito", descricao: "Créditos AWS para prova de conceito, na conta onde a POC roda." },
  { id: "poc-cash", label: "POC Cash", forma: "cash", descricao: "Funding em dinheiro para o parceiro executar a POC." },
  { id: "map-assess", label: "MAP · Assess", forma: "cash", descricao: "Migration Acceleration Program, fase de avaliação." },
  { id: "map-mobilize", label: "MAP · Mobilize", forma: "cash", descricao: "MAP, fase de preparação (landing zone, piloto)." },
  { id: "map-migrate", label: "MAP · Migrate", forma: "credito", descricao: "MAP, fase de migração: créditos sobre o consumo migrado." },
  { id: "sandbox", label: "Sandbox credits", forma: "credito", descricao: "Créditos para ambiente de experimentação do parceiro." },
  { id: "activate", label: "AWS Activate", forma: "credito", descricao: "Créditos para startups." },
  { id: "isv-accelerate", label: "ISV Accelerate", forma: "credito", descricao: "Co-venda com a AWS para soluções de ISV." },
  { id: "outro", label: "Outro", forma: "credito", descricao: "Programa fora da lista." },
] as const;

/**
 * Semente dos arquétipos e das calculadoras — números do documento "Estimativa de custo AWS ·
 * Liff Tax", porte M, preços de 29/10/2026. As URLs das calculadoras oficiais ficam em branco
 * para serem cadastradas na tela.
 */
export const ARQUETIPOS_SEMENTE: {
  nome: string;
  modelo: ModeloOperacao;
  descricao: string;
  calculadoras: { regiao: string; conta: Conta; porte: string; usd: number; nota: string }[];
}[] = [
  {
    nome: "1 · Compartilhado",
    modelo: "saas_liff",
    descricao: "O cliente usa a plataforma que já temos, junto com outros clientes, e paga só a parte que usa.",
    calculadoras: [
      { regiao: "us-east-1", conta: "liff", porte: "M", usd: 134.89, nota: "Parte de um cliente numa plataforma que já existe." },
      { regiao: "sa-east-1", conta: "liff", porte: "M", usd: 196.16, nota: "Parte de um cliente numa plataforma que já existe." },
    ],
  },
  {
    nome: "2a · Dedicado no nosso ambiente",
    modelo: "dedicado_liff",
    descricao: "Banco de dados, armazenamento, login e endereço só do cliente, rodando nos servidores que já temos.",
    calculadoras: [
      { regiao: "us-east-1", conta: "liff", porte: "M", usd: 362.94, nota: "" },
      { regiao: "sa-east-1", conta: "liff", porte: "M", usd: 496.58, nota: "" },
    ],
  },
  {
    nome: "2b · Conta AWS dedicada",
    modelo: "dedicado_liff",
    descricao: "Conta AWS só do cliente, com servidores, rede e banco próprios, operada pela LIFF, que paga a AWS e repassa no preço.",
    calculadoras: [
      { regiao: "us-east-1", conta: "liff", porte: "M", usd: 581.07, nota: "A LIFF paga e repassa no preço." },
      { regiao: "sa-east-1", conta: "liff", porte: "M", usd: 832.67, nota: "A LIFF paga e repassa no preço." },
    ],
  },
  {
    nome: "3 · No ambiente do cliente (célula)",
    modelo: "hibrido",
    descricao: "Telas, API e login na LIFF (control plane); dados e cálculo na conta AWS do cliente (data plane), que paga a AWS direto por essa parte.",
    calculadoras: [
      { regiao: "us-east-1", conta: "cliente", porte: "M", usd: 645.02, nota: "Célula: 8 endpoints, NLB interno, EKS Auto Mode." },
      { regiao: "us-east-1", conta: "liff", porte: "M", usd: 114.97, nota: "Control plane, por cliente." },
      { regiao: "sa-east-1", conta: "cliente", porte: "M", usd: 971.52, nota: "Célula: 8 endpoints, NLB interno, EKS Auto Mode." },
      { regiao: "sa-east-1", conta: "liff", porte: "M", usd: 139.81, nota: "Control plane, por cliente (inclui transferência SP → Virgínia)." },
    ],
  },
  {
    nome: "4 · 100% no cliente",
    modelo: "cliente",
    descricao: "Implantação inteira na conta AWS do cliente. Calculadoras a cadastrar.",
    calculadoras: [],
  },
];

/* ---------------- tipos do banco ---------------- */

export type Programa = { id: string; label: string; forma: string; descricao: string; ativo: boolean };
export type Calculadora = {
  id: number;
  arquetipoId: number;
  regiao: string;
  conta: Conta;
  porte: string;
  url: string;
  custoMensalCentavos: number;
  dataPreco: string | null;
  notas: string;
};
export type Arquetipo = {
  id: number;
  pastaId: number | null;
  nome: string;
  modelo: ModeloOperacao;
  descricao: string;
  ativo: boolean;
  calculadoras: Calculadora[];
};
/** Pasta de arquétipos: um conjunto por Módulo / Produto (ex.: LIFF Tax Reform). */
export type Pasta = { id: number; nome: string; produtoId: string | null; descricao: string };
export type LinhaFunding = {
  id: number;
  estimativaId: number;
  programaId: string;
  beneficiario: Conta;
  valorCentavos: number;
  status: StatusFunding;
  awsId: string;
  solicitadoEm: string | null;
  aprovadoEm: string | null;
  expiraEm: string | null;
  notas: string;
};
export type Estimativa = {
  id: number;
  ref: string;
  conta: string;
  dealId: number | null;
  arquetipoId: number | null;
  regiao: string;
  porte: string;
  liffMensalCentavos: number;
  clienteMensalCentavos: number;
  iaMensalCentavos: number;
  iaPagaPor: Conta;
  inicio: string | null;
  duracaoMeses: number;
  notas: string;
  linhas: LinhaFunding[];
};

/* ---------------- contas ---------------- */

/** Consumo previsto por conta no período inteiro da estimativa (IA soma na conta que paga). */
export function consumo(e: Estimativa): { liff: number; cliente: number; total: number; mensal: { liff: number; cliente: number } } {
  const liffMes = e.liffMensalCentavos + (e.iaPagaPor === "liff" ? e.iaMensalCentavos : 0);
  const clienteMes = e.clienteMensalCentavos + (e.iaPagaPor === "cliente" ? e.iaMensalCentavos : 0);
  const n = Math.max(1, e.duracaoMeses);
  return { liff: liffMes * n, cliente: clienteMes * n, total: (liffMes + clienteMes) * n, mensal: { liff: liffMes, cliente: clienteMes } };
}

/** Funding somado por grupo de status e por beneficiário. */
export function funding(e: Pick<Estimativa, "linhas">) {
  const soma = (f: (l: LinhaFunding) => boolean) => e.linhas.filter(f).reduce((t, l) => t + l.valorCentavos, 0);
  return {
    garantido: soma((l) => GARANTIDO.includes(l.status)),
    emAndamento: soma((l) => EM_ANDAMENTO.includes(l.status)),
    garantidoLiff: soma((l) => GARANTIDO.includes(l.status) && l.beneficiario === "liff"),
    garantidoCliente: soma((l) => GARANTIDO.includes(l.status) && l.beneficiario === "cliente"),
  };
}

/** Quanto do consumo previsto o funding garantido cobre (0 a 1+). Sem consumo: null. */
export function cobertura(e: Estimativa): number | null {
  const c = consumo(e).total;
  return c > 0 ? funding(e).garantido / c : null;
}

/** As calculadoras do arquétipo que valem para a região e o porte escolhidos, por conta. */
export function sugestaoDaCalculadora(a: Arquetipo | undefined, regiao: string, porte: string): { liff: number; cliente: number; achou: boolean } {
  if (!a) return { liff: 0, cliente: 0, achou: false };
  const da = a.calculadoras.filter((c) => c.regiao === regiao && (c.porte === porte || !c.porte));
  return {
    liff: da.filter((c) => c.conta === "liff").reduce((t, c) => t + c.custoMensalCentavos, 0),
    cliente: da.filter((c) => c.conta === "cliente").reduce((t, c) => t + c.custoMensalCentavos, 0),
    achou: da.length > 0,
  };
}

/* ---------------- validação ---------------- */

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const centavos = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100_000_000_00 ? v : null;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const data = (v: unknown): string | null | "invalida" =>
  v == null || v === "" ? null : typeof v === "string" && DATA.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z")) ? v : "invalida";
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export type EntradaPasta = Omit<Pasta, "id">;
export function lerPasta(b: Record<string, unknown> | null): EntradaPasta | string {
  if (!b) return "Requisição inválida.";
  const nome = texto(b.nome, 120);
  if (!nome) return "Dê um nome à pasta.";
  const produtoId = texto(b.produtoId, 80) || null;
  return { nome, produtoId, descricao: texto(b.descricao, 2000) };
}

export type EntradaArquetipo = { pastaId: number | null; nome: string; modelo: ModeloOperacao; descricao: string; ativo: boolean };
export function lerArquetipo(b: Record<string, unknown> | null): EntradaArquetipo | string {
  if (!b) return "Requisição inválida.";
  const nome = texto(b.nome, 120);
  if (!nome) return "Dê um nome ao arquétipo.";
  if (typeof b.modelo !== "string" || !MODELO_KEYS.includes(b.modelo)) return "Escolha o modelo de operação.";
  const pastaId = b.pastaId == null || b.pastaId === "" ? null : Number(b.pastaId);
  if (pastaId != null && (!Number.isInteger(pastaId) || pastaId <= 0)) return "Pasta inválida.";
  return { pastaId, nome, modelo: b.modelo as ModeloOperacao, descricao: texto(b.descricao, 2000), ativo: b.ativo !== false };
}

export type EntradaCalculadora = Omit<Calculadora, "id">;
export function lerCalculadora(b: Record<string, unknown> | null): EntradaCalculadora | string {
  if (!b) return "Requisição inválida.";
  const arquetipoId = Number(b.arquetipoId);
  if (!Number.isInteger(arquetipoId) || arquetipoId <= 0) return "Arquétipo inválido.";
  if (typeof b.regiao !== "string" || !REGIAO_KEYS.includes(b.regiao)) return "Escolha a região.";
  if (b.conta !== "liff" && b.conta !== "cliente") return "Diga qual conta paga (LIFF ou cliente).";
  const porte = texto(b.porte, 10);
  const url = texto(b.url, 2000);
  if (url && !/^https:\/\/calculator\.aws\//.test(url)) return "Use o link da AWS Pricing Calculator (https://calculator.aws/…).";
  const custo = centavos(b.custoMensalCentavos);
  if (custo == null) return "Custo mensal inválido.";
  const dataPreco = data(b.dataPreco);
  if (dataPreco === "invalida") return "Data dos preços inválida.";
  return { arquetipoId, regiao: b.regiao, conta: b.conta, porte, url, custoMensalCentavos: custo, dataPreco, notas: texto(b.notas, 2000) };
}

export type EntradaEstimativa = Omit<Estimativa, "id" | "ref" | "linhas">;
export function lerEstimativa(b: Record<string, unknown> | null): EntradaEstimativa | string {
  if (!b) return "Requisição inválida.";
  const conta = texto(b.conta, 200);
  if (!conta) return "Informe o cliente / oportunidade.";
  const arquetipoId = b.arquetipoId == null || b.arquetipoId === "" ? null : Number(b.arquetipoId);
  if (arquetipoId != null && (!Number.isInteger(arquetipoId) || arquetipoId <= 0)) return "Arquétipo inválido.";
  if (typeof b.regiao !== "string" || !REGIAO_KEYS.includes(b.regiao)) return "Escolha a região.";
  const porte = texto(b.porte, 10);
  const liff = centavos(b.liffMensalCentavos), cliente = centavos(b.clienteMensalCentavos), ia = centavos(b.iaMensalCentavos ?? 0);
  if (liff == null || cliente == null || ia == null) return "Valores de consumo inválidos.";
  if (b.iaPagaPor !== "liff" && b.iaPagaPor !== "cliente") return "Diga quem paga a IA.";
  const inicio = b.inicio == null || b.inicio === "" ? null : typeof b.inicio === "string" && MES.test(b.inicio) ? b.inicio : "x";
  if (inicio === "x") return "Início inválido (AAAA-MM).";
  const duracao = Number(b.duracaoMeses ?? 12);
  if (!Number.isInteger(duracao) || duracao < 1 || duracao > 60) return "Duração entre 1 e 60 meses.";
  const dealId = b.dealId == null || b.dealId === "" ? null : Number(b.dealId);
  return {
    conta, dealId: Number.isInteger(dealId) ? dealId : null, arquetipoId, regiao: b.regiao, porte,
    liffMensalCentavos: liff, clienteMensalCentavos: cliente, iaMensalCentavos: ia, iaPagaPor: b.iaPagaPor,
    inicio, duracaoMeses: duracao, notas: texto(b.notas, 4000),
  };
}

export type EntradaLinha = Omit<LinhaFunding, "id">;
export function lerLinha(b: Record<string, unknown> | null): EntradaLinha | string {
  if (!b) return "Requisição inválida.";
  const estimativaId = Number(b.estimativaId);
  if (!Number.isInteger(estimativaId) || estimativaId <= 0) return "Estimativa inválida.";
  const programaId = texto(b.programaId, 60);
  if (!programaId) return "Escolha o programa.";
  if (b.beneficiario !== "liff" && b.beneficiario !== "cliente") return "Diga quem recebe (LIFF ou cliente).";
  const valor = centavos(b.valorCentavos);
  if (valor == null) return "Valor inválido.";
  if (typeof b.status !== "string" || !STATUS_FUNDING_KEYS.includes(b.status)) return "Status inválido.";
  const datas = { solicitadoEm: data(b.solicitadoEm), aprovadoEm: data(b.aprovadoEm), expiraEm: data(b.expiraEm) };
  if (Object.values(datas).includes("invalida")) return "Data inválida.";
  return {
    estimativaId, programaId, beneficiario: b.beneficiario, valorCentavos: valor, status: b.status as StatusFunding,
    awsId: texto(b.awsId, 120), solicitadoEm: datas.solicitadoEm as string | null, aprovadoEm: datas.aprovadoEm as string | null,
    expiraEm: datas.expiraEm as string | null, notas: texto(b.notas, 2000),
  };
}

export type EntradaPrograma = Programa;
export function lerPrograma(b: Record<string, unknown> | null, idExistente?: string): EntradaPrograma | string {
  if (!b) return "Requisição inválida.";
  const label = texto(b.label, 80);
  if (!label) return "Dê um nome ao programa.";
  const id = idExistente ?? label.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!id) return "Nome inválido.";
  if (b.forma !== "credito" && b.forma !== "cash") return "Diga se é crédito ou cash.";
  return { id, label, forma: b.forma, descricao: texto(b.descricao, 1000), ativo: b.ativo !== false };
}

/** "US$ 1.234,56". */
export const usd = (c: number) => "US$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "US$ 12,3k". */
export function usdCurto(c: number): string {
  const v = c / 100;
  if (Math.abs(v) < 1000) return "US$ " + Math.round(v).toLocaleString("pt-BR");
  if (Math.abs(v) < 1_000_000) return "US$ " + (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k";
  return "US$ " + (v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "M";
}
