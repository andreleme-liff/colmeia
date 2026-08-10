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

export function areaOf(id: string) {
  return AREAS.find((a) => a.id === id) ?? { id, label: "—", short: "—", color: "var(--liff-text-faint)" };
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
