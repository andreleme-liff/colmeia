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

export const STAGES = [
  { key: "lead", label: "Lead" },
  { key: "qualificacao", label: "Qualificação" },
  { key: "proposta", label: "Proposta" },
  { key: "negociacao", label: "Negociação" },
  { key: "ganho", label: "Ganho" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];
export const STAGE_KEYS = STAGES.map((s) => s.key) as readonly string[];

export const PRIORIDADES = ["alta", "media", "baixa"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

/** Nível de acesso a uma área. Ausência de registro = sem acesso. */
export type Nivel = "view" | "edit";

/** O papel define o teto de permissão; a matriz por área refina dentro dele. */
export const PAPEIS = ["admin", "gestor", "membro", "leitura"] as const;
export type Papel = (typeof PAPEIS)[number];

export const NAV = [
  { key: "overview", label: "visão geral" },
  { key: "comercial", label: "comercial" },
  { key: "operacoes", label: "operações" },
  { key: "atividades", label: "atividades" },
  { key: "cadastros", label: "cadastros" },
  { key: "admin", label: "administração" },
  { key: "auditoria", label: "auditoria" },
] as const;

export const TITLES: Record<string, string> = {
  overview: "Visão geral",
  comercial: "Pipeline comercial",
  operacoes: "Quadro operacional",
  atividades: "Atividades",
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

/** Valores monetários trafegam em centavos; a UI mostra em milhares de reais. */
export function brl(centavos: number): string {
  return "R$ " + Math.round(centavos / 100 / 1000) + "k";
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
