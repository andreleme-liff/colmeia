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
 * O funil. `validacao` é onde a conta já topou explorar e os dois lados estão provando que dá
 * para fazer, antes de existir preço: NDA, transferência de dados, POC, refinamento de escopo.
 * Fica antes de `proposta` de propósito — sem ela, um card em NDA ficava obrigado a se declarar
 * em Proposta ou Negociação, adiantando o pipeline sobre trabalho que ainda é técnico e jurídico.
 *
 * A ordem desta lista é o funil: mover ±1 anda por ela, e o CHECK do banco é gerado a partir
 * das chaves (ver `lib/db.ts`).
 */
export const STAGES = [
  { key: "lead", label: "Lead" },
  { key: "qualificacao", label: "Qualificação" },
  { key: "validacao", label: "Validação" },
  { key: "proposta", label: "Proposta" },
  { key: "negociacao", label: "Negociação" },
  { key: "ganho", label: "Ganho" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];
export const STAGE_KEYS = STAGES.map((s) => s.key) as readonly string[];

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
export const PAPEIS = ["admin", "gestor", "membro", "leitura"] as const;
export type Papel = (typeof PAPEIS)[number];

// "atividades" saiu: era a mesma coleção de Operações em forma de tabela plana. Duas
// entradas de menu para o mesmo dado obrigam a escolher antes de olhar, e o quadro já
// mostra área, responsável, prazo e prioridade em cada card.
export const NAV = [
  { key: "overview", label: "visão geral" },
  { key: "comercial", label: "comercial" },
  { key: "operacoes", label: "operações" },
  { key: "cronograma", label: "cronograma" },
  { key: "cadastros", label: "cadastros" },
  { key: "admin", label: "administração" },
  { key: "auditoria", label: "auditoria" },
] as const;

export const TITLES: Record<string, string> = {
  overview: "Visão geral",
  comercial: "Pipeline comercial",
  operacoes: "Quadro operacional",
  cronograma: "Cronograma",
  cadastros: "Cadastros",
  admin: "Administração",
  auditoria: "Auditoria",
};

export const ADMIN_CARDS = [
  {
    title: "PAPÉIS",
    body: "Admin, Gestor, Membro e Leitura. O papel define o teto de permissão; a matriz acima refina por área.",
  },
  {
    title: "SSO GOOGLE",
    body: "Login restrito ao domínio getliff.ai. Novos usuários entram sem área atribuída até liberação.",
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

export type Area = { id: string; label: string; short: string; color: string };

/**
 * Registro em memória do cadastro de áreas, preenchido pelo cliente com o que vem do banco.
 * A cor devolvida é sempre a variável CSS `--liff-app-area-<id>` — quem define o valor dela é
 * o bloco de estilo que o cliente injeta a partir do cadastro, e é por isso que o tema claro
 * continua derivando a variante escurecida sozinho.
 *
 * O padrão abaixo vale para o servidor e para o primeiro render, antes de o estado carregar.
 */
let registroAreas: Area[] = AREAS.map((a) => ({ ...a }));

export function setAreas(lista: { id: string; label: string; short: string }[]): void {
  if (!lista?.length) return;
  registroAreas = lista.map((a) => ({ ...a, color: `var(--liff-app-area-${a.id})` }));
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
