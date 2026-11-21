// Constantes do domínio, compartilhadas entre servidor e cliente.
// As cores das áreas são tokens do design system — o valor real depende do tema.

export const AREAS = [
  { id: "law-firms", label: "Law Firms", short: "LAW", color: "var(--liff-app-area-law-firms)" },
  { id: "corporate", label: "Corporate", short: "CORP", color: "var(--liff-app-area-corporate)" },
  { id: "public-sector", label: "Public Sector", short: "PUB", color: "var(--liff-app-area-public-sector)" },
  { id: "tax", label: "Tax", short: "TAX", color: "var(--liff-app-area-tax)" },
  { id: "labs", label: "Labs", short: "LABS", color: "var(--liff-app-area-labs)" },
  { id: "social", label: "Social", short: "SOC", color: "var(--liff-app-area-social)" },
] as const;

export type AreaId = (typeof AREAS)[number]["id"];
export const AREA_IDS = AREAS.map((a) => a.id) as readonly string[];

export const STATUS = [
  { key: "backlog", label: "Backlog" },
  { key: "andamento", label: "Em andamento" },
  { key: "revisao", label: "Em revisão" },
  { key: "concluido", label: "Concluído" },
] as const;

export type StatusKey = (typeof STATUS)[number]["key"];
export const STATUS_KEYS = STATUS.map((s) => s.key) as readonly string[];

/**
 * Os estágios do pipeline comercial (nov/2026). As sete primeiras casas são o FUNIL, na ordem
 * em que uma venda anda; On hold e Lost ficam fora dele — não são passos, são desvios. On hold
 * substituiu o antigo interruptor "Em pausa" ("não é o momento"): virou coluna própria.
 *
 * O CHECK do banco é gerado a partir destas chaves (ver `lib/db.ts`), e as setas do card andam
 * só pelo FUNIL.
 */
export const STAGES = [
  { key: "prospeccao", label: "Prospecção" },
  { key: "primeira_reuniao", label: "1ª Reunião" },
  { key: "qualificado", label: "Qualificado" },
  { key: "proposta", label: "Proposta" },
  { key: "validacao", label: "Validação" },
  { key: "contrato", label: "Contrato" },
  { key: "ganho", label: "Ganho" },
  { key: "on_hold", label: "On hold" },
  { key: "lost", label: "Lost" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];
/** Onde uma oportunidade nasce quando ninguém diz o estágio. */
export const ESTAGIO_INICIAL: StageKey = "prospeccao";
/** As casas por onde as setas andam, em ordem. On hold e Lost ficam de fora. */
export const FUNIL: readonly StageKey[] = ["prospeccao", "primeira_reuniao", "qualificado", "proposta", "validacao", "contrato", "ganho"];
/**
 * PIPELINE (regra de nov/2026, uma só para o sistema inteiro): o que está em negociação, um
 * passo adiante da Prospecção e antes do desfecho, MAIS o On hold (a negociação existe, só
 * está esperando). Prospecção ainda não é pipeline; Ganho já não é; Lost não é. Todo número
 * ou contagem que a tela, o resumo ou o MCP chamam de "pipeline" sai daqui.
 */
export const PIPELINE: readonly StageKey[] = ["primeira_reuniao", "qualificado", "proposta", "validacao", "contrato", "on_hold"];
export function estagioNoPipeline(k: string): boolean {
  return (PIPELINE as readonly string[]).includes(k);
}
/**
 * Em aberto = andando no funil, ainda sem desfecho: da Prospecção ao Contrato. Serve para o
 * que não é número de pipeline: prazo e próximo passo valem para quem está sendo prospectado
 * e não valem para quem está em On hold. Não use para somar "pipeline".
 */
export function estagioEmAberto(k: string): boolean {
  return (FUNIL as readonly string[]).includes(k) && k !== "ganho";
}
export const STAGE_KEYS = STAGES.map((s) => s.key) as readonly string[];

/**
 * Composição da proposta comercial: os mesmos três tipos da receita. Assinatura é o valor POR
 * MÊS; implantação e customização são o total, pago em N parcelas mensais.
 */
export type ComposicaoProposta = {
  assinaturaCentavos: number;
  implantacaoCentavos: number;
  implantacaoParcelas: number;
  customizacaoCentavos: number;
  customizacaoParcelas: number;
};
export const PROPOSTA_VAZIA: ComposicaoProposta = {
  assinaturaCentavos: 0, implantacaoCentavos: 0, implantacaoParcelas: 1, customizacaoCentavos: 0, customizacaoParcelas: 1,
};
/** Registro da oportunidade na AWS: uma ACE ou um pedido de funding, com o link do cadastro. */
export const TIPOS_AWS = [
  { key: "ace", label: "ACE" },
  { key: "funding", label: "Funding" },
] as const;
export type TipoAws = (typeof TIPOS_AWS)[number]["key"];
export type RegistroAws = { tipo: TipoAws; descricao: string; url: string };
export const LIMITES_AWS = { registros: 30, descricao: 160 };
/** "2 ACE, 1 funding" — para o histórico e para a dica do card. */
export function resumoAws(lista: RegistroAws[]): string {
  const n = (t: TipoAws) => lista.filter((r) => r.tipo === t).length;
  const partes = [n("ace") ? `${n("ace")} ACE` : "", n("funding") ? `${n("funding")} funding` : ""].filter(Boolean);
  return partes.join(", ") || "—";
}
export const PARCELAS_MAX = 60;
/** A composição vale a partir do estágio Proposta: antes disso não há proposta para detalhar. */
export function estagioTemProposta(k: string): boolean {
  return FUNIL.indexOf(k as StageKey) >= FUNIL.indexOf("proposta");
}
export function temComposicao(c: ComposicaoProposta): boolean {
  return c.assinaturaCentavos > 0 || c.implantacaoCentavos > 0 || c.customizacaoCentavos > 0;
}
/**
 * O que a proposta soma nos primeiros 12 meses: 12 mensalidades, mais a implantação e a
 * customização — só a parte que cai no primeiro ano quando o parcelamento passa de 12 vezes.
 */
export function totalPrimeiroAno(c: ComposicaoProposta): number {
  const noAno = (total: number, parcelas: number) => Math.round((total * Math.min(12, Math.max(1, parcelas))) / Math.max(1, parcelas));
  return c.assinaturaCentavos * 12 + noAno(c.implantacaoCentavos, c.implantacaoParcelas) + noAno(c.customizacaoCentavos, c.customizacaoParcelas);
}

export const PRIORIDADES = ["alta", "media", "baixa"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

/**
 * Comparador de rótulo em português. `localeCompare` com pt-BR é o que faz "Ática" cair
 * antes de "Atlas" e não depois de "Zurique" — ordenar por code point jogaria tudo que tem
 * acento para o fim da lista.
 *
 * Vale para cadastro: pessoa, área, produto, conta. Não vale para `STAGES`, `STATUS` nem
 * `PRIORIDADES` — essas listas são um funil, um fluxo e uma escala, e em ordem alfabética
 * diriam a coisa errada (Ganho antes de Lead).
 */
export function porTexto(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

/** Nível de acesso a uma área. Ausência de registro = sem acesso. */
export type Nivel = "view" | "edit";

/** O papel define o teto de permissão; a matriz por área refina dentro dele. */
// Do maior para o menor acesso. `financeiro` (nov/2026) fica entre gestor e admin: é o gestor
// que também cuida do dinheiro (edita a receita, opera faturamento e despesas), sem administrar
// pessoas, cadastros, funding nem ver o changelog.
export const PAPEIS = ["admin", "financeiro", "gestor", "membro", "leitura"] as const;
/** Quem opera o dinheiro: edita a receita e usa faturamento e despesas. */
export const PAPEIS_FINANCEIROS: readonly string[] = ["admin", "financeiro"];
export type Papel = (typeof PAPEIS)[number];

// "atividades" saiu: era a mesma coleção de Operações em forma de tabela plana. Duas
// entradas de menu para o mesmo dado obrigam a escolher antes de olhar, e o quadro já
// mostra área, responsável, prazo e prioridade em cada card.
export const NAV = [
  { key: "overview", label: "visão geral" },
  { key: "comercial", label: "comercial" },
  // Organizações (a chave e o endereço continuam `clientes`; o nome mudou em nov/2026, porque o
  // cadastro inclui quem ainda é só prospecção): junta as oportunidades de todos os produtos
  // que a pessoa enxerga. Para todos; receita, faturas e cobrança só aparecem para admin.
  { key: "clientes", label: "organizações" },
  { key: "operacoes", label: "operações" },
  { key: "cronograma", label: "cronograma" },
  // Forecast de receita: gestor, financeiro e admin veem; financeiro e admin alteram.
  { key: "receita", label: "receita", soReceita: true },
  // Aplicativos externos (o Claude) que alguém autorizou a agir em seu nome pelo MCP. Para
  // TODOS, não só admin: cada pessoa revoga as próprias conexões — por isso não mora em
  // Cadastros, que é só da administração.
  { key: "conexoes", label: "mcp server" },
  // Do financeiro e do admin (`soFinanceiro`), e por isso no fim do menu, num grupo separado.
  // Contas a receber: emissão e baixa das faturas que saem dos contratos da receita.
  { key: "faturamento", label: "faturamento", soFinanceiro: true },
  // Contas a pagar: PJ, advisors, cartão corporativo e o que mais sair do caixa. Fica logo
  // depois do faturamento porque é o par dele (o que entra, o que sai).
  { key: "despesas", label: "despesas", soFinanceiro: true },
  // Daqui para baixo, só admin. A antiga "administração" (a matriz de permissões) virou parte
  // de Cadastros → Pessoas; `/admin` redireciona para lá.
  // ACE e Funding (AWS): consumo previsto por oportunidade (conta LIFF e conta do cliente),
  // arquétipos de implantação com as calculadoras oficiais e os programas (POC, MAP, Sandbox…).
  // A chave e o endereço continuam `funding`, para não quebrar links nem o histórico.
  { key: "funding", label: "ace e funding", soAdmin: true },
  // Registro de todas as alterações (a antiga Auditoria). Só admin desde nov/2026; o endereço
  // continua /auditoria para não quebrar links. O histórico de cada card segue no próprio card.
  { key: "auditoria", label: "changelog", soAdmin: true },
  { key: "cadastros", label: "cadastros", soAdmin: true },
] as const;

export const TITLES: Record<string, string> = {
  overview: "Visão geral",
  comercial: "Pipeline comercial",
  operacoes: "Quadro operacional",
  cronograma: "Cronograma",
  cadastros: "Cadastros",
  clientes: "Organizações",
  receita: "Forecast de receita",
  faturamento: "Faturamento · contas a receber",
  despesas: "Despesas · contas a pagar",
  funding: "ACE e Funding",
  auditoria: "Changelog",
  conexoes: "MCP Server",
};

export const ADMIN_CARDS = [
  {
    title: "PAPÉIS",
    body: "Leitura vê tudo e não edita. Membro e Gestor editam os cards de todos os produtos. Financeiro edita a receita e opera faturamento e despesas. Admin também administra cadastros e funding.",
  },
  {
    title: "LOGIN GOOGLE",
    body: "Só entra quem está cadastrado em pessoas, com a conta Google do e-mail cadastrado. Desativar ou excluir a pessoa corta o acesso na hora.",
  },
  {
    title: "RETENÇÃO DE LOG",
    body: "Registro imutável por 24 meses: autor, horário, entidade, campo, valor anterior e novo.",
  },
];

/**
 * Id derivado do nome. O conjunto de caracteres é restrito de propósito: no caso das áreas
 * o id vira nome de variável CSS, e vale manter a mesma regra para produtos.
 */
export function slugificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export type Produto = { id: string; label: string; area: string; ativo: boolean };

/**
 * Chave de comparação de nome de empresa, usada para deduplicar na importação. Ignora
 * caixa, acento, pontuação e sufixo societário — "GLOBE QUIMICA S.A" e "Globe Química SA"
 * são a mesma conta, e a planilha alterna entre as duas grafias.
 */
export function normalizarConta(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(s\.?a\.?|ltda\.?|eireli|me|epp|inc\.?|s\/a)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Chave de comparação de texto livre, usada para deduplicar título de atividade na
 * importação. Diferente de `normalizarConta`: não mexe em sufixo societário, porque um
 * to-do não é razão social — só ignora caixa, acento e espaço repetido.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** `color` é a marca (bolinha, faixa, barra); `ink` é a mesma cor para texto, ajustada ao tema. */
export type Area = { id: string; label: string; short: string; color: string; ink: string };

/**
 * Registro em memória do cadastro de áreas, preenchido pelo cliente com o que vem do banco.
 * A cor devolvida é sempre a variável CSS `--liff-app-area-<id>` — quem define o valor dela é
 * o bloco de estilo que o cliente injeta a partir do cadastro, e é por isso que o tema claro
 * continua derivando a variante escurecida sozinho.
 *
 * O padrão abaixo vale para o servidor e para o primeiro render, antes de o estado carregar.
 */
let registroAreas: Area[] = AREAS.map((a) => ({ ...a, ink: a.color }));

export function setAreas(lista: { id: string; label: string; short: string }[]): void {
  if (!lista?.length) return;
  registroAreas = lista.map((a) => ({ ...a, color: `var(--liff-app-area-${a.id})`, ink: `var(--liff-app-area-${a.id}-ink, var(--liff-app-area-${a.id}))` }));
}

export function todasAreas(): Area[] {
  return registroAreas;
}

export function areaOf(id: string): Area {
  return (
    registroAreas.find((a) => a.id === id) ?? {
      id,
      label: "—",
      short: "—",
      color: "var(--liff-text-faint)",
      ink: "var(--liff-text-faint)",
    }
  );
}

export function statusLabel(k: string): string {
  return STATUS.find((s) => s.key === k)?.label ?? k;
}

export function stageLabel(k: string): string {
  return STAGES.find((s) => s.key === k)?.label ?? k;
}

/** Uma casa decimal só quando ela diz alguma coisa: "1,5k" sim, "420,0k" não. */
function compacto(n: number): string {
  const arredondado = Math.round(n * 10) / 10;
  return Number.isInteger(arredondado)
    ? String(arredondado)
    : arredondado.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Valor para leitura rápida — cabe no card e no total da coluna.
 *
 * A escala muda com a grandeza em vez de ser sempre em milhares. Fixo em "k", tudo abaixo de
 * R$ 500 arredondava para zero: uma oportunidade salva com R$ 200 voltava do banco correta e
 * aparecia no card como "R$ 0k", como se não valesse nada.
 *
 * Continua sendo aproximação acima de mil — para o valor exato existe `brlExato`, que é o que
 * a auditoria usa.
 */
export function brl(centavos: number): string {
  const reais = centavos / 100;
  const grandeza = Math.abs(reais);
  if (grandeza < 1000) return "R$ " + Math.round(reais).toLocaleString("pt-BR");
  if (grandeza < 1_000_000) return "R$ " + compacto(reais / 1000) + "k";
  return "R$ " + compacto(reais / 1_000_000) + "M";
}

/** Valor exato, com centavos. Histórico de dinheiro não arredonda. */
export function brlExato(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Prazo em dd/MM, que é como o quadro sempre mostrou. */
export function ddmm(iso: string | null): string {
  if (!iso) return "—";
  const [, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}`;
}

/** Data e hora curtas para o log: dd/MM HH:mm. */
export function stamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* =========================================================
   Semanas — base do cronograma
   ========================================================= */

/** Data local em ISO (yyyy-mm-dd), sem passar por UTC. `toISOString` desloca o dia. */
export function diaISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Data de um `yyyy-mm-dd` à meia-noite local. */
export function daISO(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

/** Segunda-feira da semana que contém a data. A semana de trabalho começa nela. */
export function inicioDaSemana(d: Date): Date {
  const seg = new Date(d);
  seg.setHours(0, 0, 0, 0);
  // getDay(): 0 é domingo. Domingo pertence à semana que começou na segunda anterior.
  const desloca = (seg.getDay() + 6) % 7;
  seg.setDate(seg.getDate() - desloca);
  return seg;
}

/**
 * Sexta-feira da semana corrente — o "fim da semana" que o cronograma assume para um
 * próximo passo sem data.
 *
 * Se a sexta já passou (estamos no sábado ou domingo), vale a sexta seguinte: jogar o item
 * para uma data no passado o marcaria como atrasado por causa do fim de semana, e não por
 * causa de alguém ter deixado a bola cair.
 */
export function fimDaSemana(hoje = new Date()): string {
  const sexta = inicioDaSemana(hoje);
  sexta.setDate(sexta.getDate() + 4);
  const base = new Date(hoje);
  base.setHours(0, 0, 0, 0);
  if (sexta < base) sexta.setDate(sexta.getDate() + 7);
  return diaISO(sexta);
}

/** "Semana de 18/08" — rótulo do bloco no cronograma. */
export function rotuloDaSemana(segundaISO: string): string {
  const seg = daISO(segundaISO);
  const sex = new Date(seg);
  sex.setDate(sex.getDate() + 4);
  const dm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${dm(seg)} a ${dm(sex)}`;
}

// ---------------------------------------------------------------------------
// Modelo comercial e valor em palavras
//
// O contrato de prestação de serviços tem três componentes de remuneração —
// implantação, customização ("add-on") e assinatura mensal —, os dois primeiros
// cobrados à parte e parceláveis em até 12 vezes. Daqui saem o valor total e o
// texto que vai dentro do contrato.
// ---------------------------------------------------------------------------

/** Teto de parcelas do modelo comercial, nas duas cobranças de uma vez. */
export const MAX_PARCELAS = 12;

/** Teto de duração do contrato em meses. É o mesmo limite que o ACE aceita. */
export const MAX_DURACAO_MESES = 144;

export type ModeloComercial = {
  implantacaoCentavos: number;
  addonCentavos: number;
  mensalCentavos: number;
  duracaoMeses: number;
};

/**
 * Valor total do contrato: as duas cobranças de uma vez mais a assinatura ao
 * longo da vigência. É o número que vira `valor_centavos` do card quando o
 * modelo está preenchido — ter os dois lados editáveis à mão era convite para
 * o card dizer um valor e o contrato outro.
 */
export function tcvCentavos(m: ModeloComercial): number {
  return (
    Math.max(0, m.implantacaoCentavos) +
    Math.max(0, m.addonCentavos) +
    Math.max(0, m.mensalCentavos) * Math.max(0, m.duracaoMeses)
  );
}

/**
 * Parcela de uma cobrança, e o que sobra da divisão.
 *
 * `resto` existe porque a cláusula do contrato diz "parcelas iguais, mensais e
 * sucessivas", e isso só é verdade quando o total divide exato. R$ 25.000,00 em
 * 12 vezes dá R$ 2.083,33, que somadas fecham R$ 24.999,96 — quatro centavos a
 * menos do que a cláusula afirma. Quem chama decide o que fazer; o importante é
 * que a diferença seja visível em vez de aparecer na conciliação do financeiro.
 */
export function parcelaCentavos(totalCentavos: number, parcelas: number): { centavos: number; resto: number } {
  const total = Math.max(0, Math.round(totalCentavos));
  const n = Math.max(1, Math.round(parcelas));
  const centavos = Math.floor(total / n);
  return { centavos, resto: total - centavos * n };
}

const UNIDADES = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
  "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos",
  "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos",
];
/** Escalas, do grupo de três menos significativo para o mais. */
const ESCALAS: { singular: string; plural: string }[] = [
  { singular: "", plural: "" },
  { singular: "mil", plural: "mil" },
  { singular: "milhão", plural: "milhões" },
  { singular: "bilhão", plural: "bilhões" },
];

/** Um grupo de 1 a 999 em palavras. "cem" e "cento e um" são casos distintos. */
function grupoEmPalavras(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(" e ");
}

/**
 * Inteiro em palavras, em português. Usado para os extensos do contrato.
 *
 * A regra do "e" entre grupos não é uniforme: liga-se o último grupo com "e"
 * quando ele é menor que cem ou múltiplo exato de cem ("mil e vinte", "um milhão
 * e quinhentos"), e com vírgula nos demais casos ("mil, duzentos e trinta").
 */
export function inteiroEmPalavras(n: number): string {
  const v = Math.abs(Math.round(n));
  if (v === 0) return "zero";

  const grupos: number[] = [];
  for (let resto = v; resto > 0; resto = Math.floor(resto / 1000)) grupos.push(resto % 1000);

  const ditos: string[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    const escala = ESCALAS[i];
    // Acima de bilhão a tabela de escalas acaba. Num contrato, recusar é melhor que
    // escrever um extenso errado: é o extenso que prevalece em caso de divergência.
    if (!escala) throw new RangeError(`valor fora da faixa com extenso em português: ${v}`);
    // "mil" não leva "um" na frente: 1.000 é "mil", não "um mil".
    const corpo = i === 1 && g === 1 ? "" : grupoEmPalavras(g);
    const nome = i === 0 ? "" : g === 1 ? escala.singular : escala.plural;
    ditos.push([corpo, nome].filter(Boolean).join(" "));
  }
  if (ditos.length === 1) return ditos[0];

  const ultimoGrupo = grupos.find((g) => g > 0) as number;
  const ligaComE = ultimoGrupo < 100 || ultimoGrupo % 100 === 0;
  const cabeca = ditos.slice(0, -1).join(", ");
  return `${cabeca}${ligaComE ? " e " : ", "}${ditos[ditos.length - 1]}`;
}

/**
 * Valor em palavras para dentro do contrato: "sessenta mil reais", "dois mil e
 * oitenta e três reais e trinta e três centavos".
 *
 * É calculado, nunca digitado. Quando o algarismo e o extenso divergem num
 * contrato, prevalece o extenso — então um extenso errado não é erro de
 * digitação, é o valor do contrato.
 *
 * O "de" de "um milhão de reais" só entra quando o valor é múltiplo exato de um
 * milhão: com grupos abaixo, é "um milhão e quinhentos mil reais".
 */
export function reaisEmPalavras(centavos: number): string {
  const total = Math.abs(Math.round(centavos));
  const reais = Math.floor(total / 100);
  const cents = total % 100;

  const partes: string[] = [];
  if (reais || !cents) {
    const milhoesExatos = reais >= 1_000_000 && reais % 1_000_000 === 0;
    const moeda = reais === 1 ? "real" : "reais";
    partes.push(`${inteiroEmPalavras(reais)} ${milhoesExatos ? "de " : ""}${moeda}`);
  }
  if (cents) partes.push(`${inteiroEmPalavras(cents)} ${cents === 1 ? "centavo" : "centavos"}`);
  return partes.join(" e ");
}

// ---------------------------------------------------------------------------
// "Só o que é meu"
//
// O filtro de responsável não pode olhar apenas `responsavelId`. A importação de
// planilha grava SÓ `responsavel_texto` — o responsável vem como texto livre na
// coluna RESPONSÁVEL ("Bruno Santo", "Bianka", "Bruno Santo / Felipe Zambon") e
// nenhuma linha ganha `responsavel_user_id`. Filtrar por id devolveria zero
// oportunidades no pipeline inteiro do Tax, e o filtro pareceria quebrado.
//
// Então: id quando existe, nome quando não existe. O nome é heurística, e por
// isso tem guarda de ambiguidade — ver `textoMencionaPessoa`.
// ---------------------------------------------------------------------------

/**
 * Separadores que a planilha e o cadastro à mão usam para listar mais de uma
 * pessoa no mesmo campo. O " e " cercado de espaço cobre "Vivi e Giordani" sem
 * pegar o "e" dentro de palavra.
 */
const SEPARADORES_DE_NOME = /\s*(?:\/|,|;|&|\+|\se\s)\s*/;

/** Os nomes que um campo de responsável em texto livre contém. */
export function nomesDoTexto(texto: string): string[] {
  return (texto ?? "")
    .split(SEPARADORES_DE_NOME)
    .map((p) => p.trim())
    .filter(Boolean);
}

const palavrasDe = (s: string) => normalizarTexto(s).split(" ").filter(Boolean);
/** `a` contém todas as palavras de `b`. */
const cobre = (a: string[], b: string[]) => b.length > 0 && b.every((w) => a.includes(w));

/**
 * O texto livre de responsável se refere a `nome`?
 *
 * Duas direções, e a segunda é a que precisa de cuidado:
 *
 *  · o trecho contém o nome inteiro — "Bruno Santo Filho" para "Bruno Santo";
 *  · o trecho é PARTE do nome — "Bianka" para "Bianka Moreira". Aqui mora o risco:
 *    com "Bruno Santo" e "Bruno Costa" cadastrados, um "Bruno" solto não decide
 *    de quem é. `outrosNomes` existe para isso — se o trecho couber em mais de
 *    uma pessoa, não é de ninguém. Errar para menos esconde um card do dono;
 *    errar para mais mostra a carteira de outra pessoa como se fosse sua, o que
 *    é pior num filtro em que as pessoas confiam para saber o que lhes cabe.
 */
export function textoMencionaPessoa(texto: string, nome: string, outrosNomes: string[] = []): boolean {
  const meu = palavrasDe(nome);
  if (!meu.length) return false;

  return nomesDoTexto(texto).some((trecho) => {
    const dele = palavrasDe(trecho);
    if (!dele.length) return false;
    if (cobre(dele, meu)) return true;
    if (!cobre(meu, dele)) return false;
    // Parte do meu nome: só vale se não servir para mais ninguém.
    return !outrosNomes.some((o) => cobre(palavrasDe(o), dele));
  });
}

// ---------------------------------------------------------------------------
// Filtro por responsável
//
// A lista de opções sai dos DADOS, e não da tabela de pessoas. A razão é a
// importação de planilha: ela grava `responsavel_texto` e nunca
// `responsavel_user_id`, então o pipeline inteiro é texto livre — "Bianka",
// "Bruno Santo / Felipe Zambon", "Agente 2". Uma lista só com gente cadastrada
// deixaria as linhas de "Agente 2" sem nenhuma opção que as alcance: fora de
// todo filtro e visíveis apenas em "todos", que é a pior maneira de esconder o
// trabalho de alguém.
//
// Daí três tipos de chave:
//   u:<id>    pessoa cadastrada — o texto resolveu para ela, sem ambiguidade
//   t:<slug>  texto que não resolveu: "Agente 2", ou "Bruno" com dois Brunos
//   sem       responsável em branco
// ---------------------------------------------------------------------------

export const CHAVE_SEM_RESPONSAVEL = "sem";
export const ROTULO_SEM_RESPONSAVEL = "Sem responsável";

/** Teto de itens numa seleção gravada, para limitar o que vai à coluna de preferências. */
export const MAX_RESPONSAVEIS_NA_SELECAO = 50;

export type RegistroComResponsavel = { responsavelId?: number | null; responsavelTexto?: string };
export type Pessoa = { id: number; nome: string };

export type OpcaoResponsavel = {
  chave: string;
  label: string;
  /** Quantos registros em escopo caem nesta chave. */
  qtd: number;
  /** Pessoa cadastrada, e não texto solto — ordena a lista e muda o marcador. */
  cadastrada: boolean;
};

const slugDe = (texto: string) =>
  normalizarTexto(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** A chave de um responsável em texto livre. Texto que vira slug vazio é "sem". */
export function chaveDeTexto(texto: string): string {
  const s = slugDe(texto);
  return s ? `t:${s}` : CHAVE_SEM_RESPONSAVEL;
}

/** Chave e rótulo de cada responsável de um registro. */
function resolver(registro: RegistroComResponsavel, pessoas: Pessoa[]): { chave: string; label: string }[] {
  if (registro.responsavelId != null) {
    const p = pessoas.find((x) => x.id === registro.responsavelId);
    return [{ chave: `u:${registro.responsavelId}`, label: p?.nome ?? `#${registro.responsavelId}` }];
  }

  const trechos = nomesDoTexto(registro.responsavelTexto ?? "");
  if (!trechos.length) return [{ chave: CHAVE_SEM_RESPONSAVEL, label: ROTULO_SEM_RESPONSAVEL }];

  return trechos.map((trecho) => {
    const candidatos = pessoas.filter((p) =>
      textoMencionaPessoa(trecho, p.nome, pessoas.filter((o) => o.id !== p.id).map((o) => o.nome))
    );
    // Um candidato resolve. Zero é texto que não é ninguém da equipe; dois ou mais é
    // ambiguidade. Nos dois casos o trecho vale por si mesmo: uma opção "Bruno" é melhor
    // que atribuir o card ao Bruno errado.
    return candidatos.length === 1
      ? { chave: `u:${candidatos[0].id}`, label: candidatos[0].nome }
      : { chave: chaveDeTexto(trecho), label: trecho };
  });
}

/**
 * Para quais chaves de filtro um registro conta.
 *
 * Mais de uma quando o campo traz uma dupla: "Bruno Santo / Felipe Zambon" aparece no
 * filtro do Bruno e no do Felipe, porque o card é dos dois.
 */
export function chavesDoResponsavel(registro: RegistroComResponsavel, pessoas: Pessoa[]): string[] {
  return [...new Set(resolver(registro, pessoas).map((r) => r.chave))];
}

/**
 * As opções do filtro, tiradas dos registros em escopo.
 *
 * Tem de ser chamada ANTES de aplicar o próprio filtro, senão escolher uma pessoa colapsa
 * a lista para ela só e não há como voltar.
 */
export function opcoesDeResponsavel(registros: RegistroComResponsavel[], pessoas: Pessoa[]): OpcaoResponsavel[] {
  const acc = new Map<string, OpcaoResponsavel>();

  for (const r of registros) {
    const vistas = new Set<string>();
    for (const { chave, label } of resolver(r, pessoas)) {
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      const atual = acc.get(chave);
      if (atual) atual.qtd++;
      else acc.set(chave, { chave, label, qtd: 1, cadastrada: chave.startsWith("u:") });
    }
  }

  // Cadastradas primeiro, texto solto depois, "sem responsável" por último — o vazio é o
  // que menos se procura e o que mais polui o topo de uma lista.
  const peso = (o: OpcaoResponsavel) => (o.chave === CHAVE_SEM_RESPONSAVEL ? 2 : o.cadastrada ? 0 : 1);
  return [...acc.values()].sort(
    (a, b) => peso(a) - peso(b) || a.label.localeCompare(b.label, "pt-BR")
  );
}

/** Seleção vazia é "todos" — é o estado inicial e o que o botão "Todos" devolve. */
export function ehDoResponsavel(
  registro: RegistroComResponsavel,
  selecao: readonly string[],
  pessoas: Pessoa[]
): boolean {
  if (!selecao.length) return true;
  return chavesDoResponsavel(registro, pessoas).some((c) => selecao.includes(c));
}

const RE_CHAVE = /^(?:sem|u:[0-9]{1,9}|t:[a-z0-9-]{1,60})$/;

/**
 * Lê a seleção gravada, descartando o que não for chave válida.
 *
 * Sem isto uma preferência antiga ou corrompida viraria um filtro que não casa com nada, e
 * a tela apareceria vazia sem explicação — pior que voltar para "todos".
 */
export function lerSelecaoDeResponsaveis(bruto: string | null | undefined): string[] {
  return [...new Set((bruto ?? "").split(",").map((s) => s.trim()).filter((s) => RE_CHAVE.test(s)))].slice(
    0,
    MAX_RESPONSAVEIS_NA_SELECAO
  );
}

/** Forma canônica para gravar. Passa pelo leitor, então o que vai ao banco é sempre válido. */
export function escreverSelecaoDeResponsaveis(selecao: readonly string[]): string {
  return lerSelecaoDeResponsaveis(selecao.join(",")).join(",");
}

/* =========================================================
   Referências legíveis
   ========================================================= */
/**
 * C-0104 é uma oportunidade COMERCIAL; T-1012 é uma TAREFA (atividade). A letra diz o tipo
 * — sem ela, "104" poderia ser qualquer um dos dois — e o número é o serial do banco, com
 * quatro dígitos no mínimo (passa de 9999 sem cortar).
 *
 * Até nov/2026 eram D-104 e A-1012. A conversão manteve o NÚMERO e trocou a letra, então a
 * referência antiga se resolve sem consultar nada: D-104 → C-0104, A-1012 → T-1012. É o que
 * mantém funcionando um link antigo colado no WhatsApp ou um "D-104" dito ao Claude.
 */
export const PREFIXO_REF = { oportunidade: "C", atividade: "T" } as const;
const PREFIXO_ANTIGO: Record<string, "C" | "T"> = { D: "C", A: "T" };

export function formatarRef(tipo: keyof typeof PREFIXO_REF, numero: number | string): string {
  return `${PREFIXO_REF[tipo]}-${String(Number(numero)).padStart(4, "0")}`;
}

/** A forma canônica de uma referência digitada, colada ou antiga — ou `null` se não é uma. */
export function refCanonica(bruta: string | null | undefined): string | null {
  const m = /^([CTDA])-0*(\d{1,9})$/.exec((bruta ?? "").trim().toUpperCase());
  if (!m) return null;
  const letra = PREFIXO_ANTIGO[m[1]] ?? (m[1] as "C" | "T");
  return `${letra}-${m[2].padStart(4, "0")}`;
}

export function tipoDaRef(ref: string | null | undefined): "oportunidade" | "atividade" | null {
  const r = refCanonica(ref);
  return r === null ? null : r.startsWith("C-") ? "oportunidade" : "atividade";
}

/* =========================================================
   Card comercial v2 (nov/2026) — campos vindos da planilha do LIFF Tax
   ========================================================= */

/** Tipo do que está travando a oportunidade. Lista fechada: é o que permite somar por tipo. */
export const BLOCKER_TIPOS = [
  { key: "operacao", label: "Operação" },
  { key: "seguranca", label: "Segurança" },
  { key: "produto", label: "Módulo" },
  { key: "preco", label: "Preço" },
] as const;
export const BLOCKER_TIPO_KEYS = BLOCKER_TIPOS.map((b) => b.key) as readonly string[];

/**
 * Por que se perde. A planilha tinha só texto livre; os seis motivos já escritos cabem nestes
 * cinco, e lista fechada é o que deixa medir onde o funil vaza. O texto original vai no
 * detalhe.
 */
export const MOTIVOS_PERDA = [
  { key: "sem_budget", label: "Sem budget" },
  { key: "concorrente", label: "Já contratou outra solução" },
  { key: "sem_interesse", label: "Sem interesse" },
  { key: "nao_e_momento", label: "Não é o momento" },
  { key: "outro", label: "Outro" },
] as const;
export const MOTIVO_PERDA_KEYS = MOTIVOS_PERDA.map((m) => m.key) as readonly string[];

/** Sugestões para o ERP. Campo de texto: a lista ajuda a padronizar, não impede um caso novo. */
export const ERP_SUGESTOES = ["SAP ECC", "SAP S/4HANA", "TOTVS Protheus", "Oracle", "Senior", "Sankhya", "Outro"] as const;

/** Origens iniciais (aba Listas da planilha). Viram cadastro editável; isto é só o ponto de partida. */
export const ORIGENS_INICIAIS = [
  "Base Fius", "Maluf", "Ponte/parceiro", "AWS", "Evento", "Outbound", "Indicação", "A definir",
] as const;

export function blockerTipoLabel(k: string | null | undefined): string {
  return BLOCKER_TIPOS.find((b) => b.key === k)?.label ?? "";
}
export function motivoPerdaLabel(k: string | null | undefined): string {
  return MOTIVOS_PERDA.find((m) => m.key === k)?.label ?? "";
}

/**
 * Status do follow-up — CALCULADO, não guardado. A planilha tinha a fórmula numa coluna e
 * errava os rótulos de Ganho e Lost ("7 · Ganho", "8 · Lost" contra "8 · Ganho", "9 · Lost"
 * da lista), calculando FUP para oportunidade fechada. Aqui: fora do aberto, não há FUP.
 */
export type StatusFup = "atrasado" | "proximos7" | "ok" | "sem_data" | null;
export function statusFup(estagio: string, proximoPassoEm: string | null, hoje = new Date()): StatusFup {
  if (!estagioEmAberto(estagio)) return null;
  if (!proximoPassoEm) return "sem_data";
  const d = Date.parse(`${proximoPassoEm}T00:00:00Z`);
  const h = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (d < h) return "atrasado";
  if (d <= h + 7 * 86400000) return "proximos7";
  return "ok";
}
export const STATUS_FUP_LABEL: Record<Exclude<StatusFup, null>, string> = {
  atrasado: "Atrasado",
  proximos7: "Próx. 7 dias",
  ok: "Em dia",
  sem_data: "Sem data",
};

/* =========================================================
   Card do kanban comercial (v4): prazo, data da situação, iniciais, vizinhos no funil.
   Tudo puro e testado em scripts/verificar-card.mjs.
   ========================================================= */

/** Hoje no fuso da operação (São Paulo), como YYYY-MM-DD. Servidor e navegador concordam. */
export function hojeISO(agora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(agora);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}

/** Dias de `de` até `ate` (YYYY-MM-DD). Positivo = `ate` no futuro. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${de.slice(0, 10)}T00:00:00Z`)) / 86400000);
}

const MES_ABREV: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};
const MES_ROTULO = ["", "JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/** "19/OUT" — a data no rótulo "SITUAÇÃO · 19/OUT". */
export function diaMes(iso: string | null): string {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}/${MES_ROTULO[Number(m)] ?? m}`;
}

/**
 * Tira a data do começo da situação — "19/Out: validação feita" → 2026-10-19 + "validação feita".
 * Aceita dia/mês por nome (Out, Set…) ou número (19/10, 19.10, 19/10/2026), seguidos de ":", "-"
 * ou "–". Sem ano, vale o ano que deixa a data no passado (ou hoje): uma situação não é escrita
 * no futuro. Sem prefixo reconhecível, devolve o texto intacto e data nula.
 */
export function separarDataDaSituacao(bruto: string, hoje: string = hojeISO()): { data: string | null; texto: string } {
  const texto = bruto.trim();
  const m = /^(\d{1,2})\s*[/.]\s*(\d{1,2}|[A-Za-zÀ-ÿ]{3,9})(?:\s*[/.]\s*(\d{2}|\d{4}))?\.?\s*[:\-–—]\s*/.exec(texto);
  if (!m) return { data: null, texto };
  const dia = Number(m[1]);
  const mes = /^\d+$/.test(m[2]) ? Number(m[2]) : MES_ABREV[normalizarTexto(m[2]).slice(0, 3)];
  if (!mes || mes < 1 || mes > 12 || dia < 1 || dia > 31) return { data: null, texto };
  const [ah] = hoje.split("-").map(Number);
  let ano = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : ah;
  const iso = (a: number) => `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  if (!m[3] && iso(ano) > hoje) ano -= 1;
  const resto = texto.slice(m[0].length).trim();
  return { data: iso(ano), texto: resto ? resto.charAt(0).toUpperCase() + resto.slice(1) : resto };
}

export type TomPrazo = "erro" | "warning" | "sucesso" | "neutro";

/**
 * Etiqueta do prazo (data do próximo passo). Completo: "Venceu 23/10 · há 18 dias",
 * "Prazo 24/11 · em 14 dias". Curto: "23/10 (−18d)", "24/11 (+14d)". O tom segue o status do
 * FUP: vencido = erro, próximos 7 dias = warning, depois disso = sucesso. Fora do funil aberto
 * (Ganho, On hold, Lost) a data, se houver, é neutra.
 */
export function etiquetaPrazo(
  estagio: string,
  prazo: string | null,
  hoje: string = hojeISO(),
  curto = false
): { texto: string; tom: TomPrazo } | null {
  if (!prazo) return estagioEmAberto(estagio) ? { texto: "Sem prazo", tom: "neutro" } : null;
  const dm = ddmm(prazo);
  if (!estagioEmAberto(estagio)) return { texto: curto ? dm : `Prazo ${dm}`, tom: "neutro" };
  const n = diasEntre(hoje, prazo);
  if (n < 0) {
    const k = -n;
    return { texto: curto ? `${dm} (−${k}d)` : `Venceu ${dm} · há ${k} ${k === 1 ? "dia" : "dias"}`, tom: "erro" };
  }
  const tom: TomPrazo = n <= 7 ? "warning" : "sucesso";
  if (n === 0) return { texto: curto ? `${dm} (hoje)` : `Prazo ${dm} · hoje`, tom };
  return { texto: curto ? `${dm} (+${n}d)` : `Prazo ${dm} · em ${n} ${n === 1 ? "dia" : "dias"}`, tom };
}

/**
 * Data relativa a hoje, sem prefixo: "27/10 (−14d)", "26/11 (+16d)", "10/11 (hoje)" (a tela mostra
 * em maiúsculas). Vencido é erro; até 7 dias, warning; depois, sucesso. Fora de andamento
 * (`aberto` falso) a data fica neutra, sem contagem; sem data, "Sem prazo" só quando aberto.
 */
export function prazoRelativo(
  prazo: string | null,
  hoje: string,
  aberto: boolean
): { texto: string; tom: TomPrazo } | null {
  if (!prazo) return aberto ? { texto: "Sem prazo", tom: "neutro" } : null;
  const dm = ddmm(prazo);
  if (!aberto) return { texto: dm, tom: "neutro" };
  const n = diasEntre(hoje, prazo);
  if (n < 0) return { texto: `${dm} (−${-n}d)`, tom: "erro" };
  const tom: TomPrazo = n <= 7 ? "warning" : "sucesso";
  return { texto: n === 0 ? `${dm} (hoje)` : `${dm} (+${n}d)`, tom };
}

/** Prazo ao lado do rótulo PRÓXIMO PASSO no card do comercial. */
export function prazoDoPasso(
  estagio: string,
  prazo: string | null,
  hoje: string = hojeISO()
): { texto: string; tom: TomPrazo } | null {
  return prazoRelativo(prazo, hoje, estagioEmAberto(estagio));
}

/** "1 módulo", "3 módulos". */
export function rotuloModulos(n: number): string {
  return `${n} ${n === 1 ? "módulo" : "módulos"}`;
}

/** Iniciais para o avatar: primeira e última palavra ("Bruno Santo" → "BS"; "Bruno" → "BR"). */
export function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/[\s/]+/).filter(Boolean);
  if (!partes.length) return "—";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Etapas vizinhas no funil. Fora do funil (On hold, Lost), nenhuma: as setas não tiram o card de lá. */
export function vizinhosNoFunil(estagio: string): { anterior: StageKey | null; proxima: StageKey | null } {
  const i = (FUNIL as readonly string[]).indexOf(estagio);
  if (i < 0) return { anterior: null, proxima: null };
  return { anterior: i > 0 ? FUNIL[i - 1] : null, proxima: i < FUNIL.length - 1 ? FUNIL[i + 1] : null };
}

/* ---------------- busca por termo ---------------- */

/** Minúsculas, sem acento e com espaços colapsados: "Ação  Fiscal" → "acao fiscal". */
export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type Busca = { frase: string; termos: string[] };

/** Lê o que a pessoa digitou. Vazio (ou só espaço) é "sem busca": devolve null. */
export function prepararBusca(consulta: string): Busca | null {
  const frase = normalizarBusca(consulta);
  if (!frase) return null;
  return { frase, termos: [...new Set(frase.split(" "))] };
}

/**
 * Quanto um registro casa com a busca; 0 = não casa. Vale QUALQUER termo (busca por dois
 * termos também mostra quem tem só um), mas a ordem premia, de cima para baixo:
 *  1. a frase inteira, como foi digitada (só conta com dois termos ou mais);
 *  2. todos os termos, em qualquer ordem e campo;
 *  3. mais termos encontrados.
 * Os campos são unidos por um separador que nenhum termo atravessa: a frase "joão silva" não
 * casa com um campo terminado em "joão" seguido de outro começando em "silva".
 */
export function pontuarBusca(busca: Busca, campos: (string | null | undefined)[]): number {
  const alvo = campos
    .filter((c): c is string => !!c)
    .map(normalizarBusca)
    .join(" \u0000 ");
  const achados = busca.termos.filter((t) => alvo.includes(t)).length;
  if (!achados) return 0;
  let pontos = achados;
  if (achados === busca.termos.length) pontos += 100;
  if (busca.termos.length > 1 && alvo.includes(busca.frase)) pontos += 1000;
  return pontos;
}

/**
 * Filtra e ordena pela pontuação; empate mantém a ordem de entrada (o sort é estável), então
 * quem já vinha ordenado por data ou referência continua assim dentro de cada faixa.
 */
export function aplicarBusca<T>(lista: T[], busca: Busca | null, campos: (x: T) => (string | null | undefined)[]): T[] {
  if (!busca) return lista;
  return lista
    .map((x) => ({ x, p: pontuarBusca(busca, campos(x)) }))
    .filter((r) => r.p > 0)
    .sort((a, b) => b.p - a.p)
    .map((r) => r.x);
}

// ---------- link da proposta comercial ----------

/**
 * Normaliza o link da proposta. "" = sem link; `null` = inválido.
 * Só http e https: o valor vira `href` na tela, e um `javascript:` gravado aqui rodaria no
 * clique de outra pessoa.
 */
export function urlDaProposta(bruto: unknown): string | null {
  if (bruto == null) return "";
  if (typeof bruto !== "string") return null;
  const s = bruto.trim();
  if (!s) return "";
  if (s.length > 2000 || /\s/.test(s)) return null;
  // Colar "docs.google.com/..." sem o protocolo é o engano mais comum.
  const comProtocolo = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  let u: URL;
  try {
    u = new URL(comProtocolo);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname.includes(".") || u.username || u.password) return null;
  return u.toString();
}

export type PreviaProposta = { tipo: string; embed: string };

/**
 * Endereço de pré-visualização, só para os serviços que a oferecem num endereço próprio
 * (Google Docs, Slides, Sheets e arquivo do Drive). A lista é fechada de propósito: o que sai
 * daqui vira `src` de iframe. Para qualquer outro link devolve `null` e a tela mostra só o link.
 */
export function previaDaProposta(url: string): PreviaProposta | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const ID = "([A-Za-z0-9_-]{10,})";
  if (u.hostname === "docs.google.com") {
    const m = u.pathname.match(new RegExp(`^/(document|presentation|spreadsheets)/d/${ID}(?:/|$)`));
    if (!m) return null;
    const tipo = m[1] === "document" ? "Google Docs" : m[1] === "presentation" ? "Google Slides" : "Google Sheets";
    return { tipo, embed: `https://docs.google.com/${m[1]}/d/${m[2]}/preview` };
  }
  if (u.hostname === "drive.google.com") {
    const m = u.pathname.match(new RegExp(`^/file/d/${ID}(?:/|$)`));
    const id = m?.[1] ?? (u.pathname === "/open" ? u.searchParams.get("id") : null);
    if (!id || !new RegExp(`^${ID}$`).test(id)) return null;
    return { tipo: "Google Drive", embed: `https://drive.google.com/file/d/${id}/preview` };
  }
  return null;
}

/** "docs.google.com" — o que cabe no card para dizer onde a proposta está. */
export function hostDaUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
