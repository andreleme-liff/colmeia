"use client";

// Tokens usados na composição das telas. Só aliases semânticos — quem decide o valor de
// cada um é o tema, em globals.css. Nenhum HEX aqui.

import { useSyncExternalStore, type CSSProperties } from "react";

export const C = {
  canvas: "var(--liff-canvas)",
  panel: "var(--liff-surface)",
  panel2: "var(--liff-surface-2)",
  cell: "var(--liff-surface-cell)",
  code: "var(--liff-code-bg)",
  line: "var(--liff-border)", // hairline estrutural
  ghost: "var(--liff-app-ghost)", // texto mais apagado da interface
  ink: "var(--liff-text)",
  body: "var(--liff-text-body)",
  dust: "var(--liff-text-muted)",
  faint: "var(--liff-text-faint)",
  accent: "var(--liff-accent)",
  success: "var(--liff-app-success-ink)",
  warning: "var(--liff-app-warning-ink)",
  error: "var(--liff-app-error-ink)",
  info: "var(--liff-app-info-ink)",
  onState: "var(--liff-app-on-state)", // texto sobre preenchimento de estado
} as const;

/** Raio dos cantos: um valor só para tudo que tem borda. O número mora em globals.css. */
export const R = "var(--liff-radius-sm)";

export const SANS = "var(--liff-font-body)";
export const MONO = "var(--liff-font-mono)";

/** Eyebrow / rótulo técnico: mono, caixa alta, tracking largo. */
export function eyebrow(fontSize: number, color: string, letterSpacing = "0.16em"): CSSProperties {
  return { fontFamily: MONO, fontSize, letterSpacing, textTransform: "uppercase", color };
}

/** Quadradinho de 3px que substitui ícone em tabelas e legendas. */
export function dot(color: string): CSSProperties {
  return { width: 7, height: 7, borderRadius: 3, background: color };
}

/** Malha estrutural: fundo charcoal + gap de 1px = fios entre as células. */
export function mesh(extra: CSSProperties = {}): CSSProperties {
  // `overflow: hidden` para as células de dentro não cobrirem o canto arredondado.
  return { background: C.line, border: `1px solid ${C.line}`, borderRadius: R, overflow: "hidden", ...extra };
}

export function avatarStyle(size: number): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: 999,
    background: C.panel2,
    border: `1px solid ${C.line}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: MONO,
    fontSize: size > 32 ? 12 : 11,
    color: C.dust,
    flex: "none",
  };
}

/** O variant `ghost` do Button fixa texto Floral White — só existe para o canvas escuro.
 *  Como o componente aplica o `style` recebido por último, dá para acertar no tema claro. */
export const GHOST_FIX: CSSProperties = { color: C.ink, borderColor: C.line };

export function statusColor(k: string): string {
  return (
    { backlog: C.faint, andamento: C.info, revisao: C.warning, concluido: C.success }[k] ?? C.faint
  );
}

export function prioColor(p: string): string {
  return p === "alta" ? C.error : p === "media" ? C.warning : C.faint;
}

/* ---------------- tema ----------------
   A fonte de verdade do tema é o <html>, que o script inline do layout já escreveu antes
   do primeiro paint. O React apenas se inscreve nele via useSyncExternalStore — que é o
   caminho certo para ler estado que vive fora do React e evita divergência entre o HTML do
   servidor e a primeira renderização no cliente.

   São três temas (nov/2026): escuro, claro e misto. O misto é o conteúdo do claro com o
   menu lateral em Obsidiana. No <html> ele vira data-theme="light" + data-aside="obsidiana":
   assim todas as regras do claro continuam valendo no conteúdo, e só a lateral volta aos
   tokens do escuro (ver globals.css). */

export const THEME_KEY = "liff-tasks-theme";
export const THEME_EVENT = "liff-tasks-theme-change";
export type Theme = "dark" | "light" | "misto";
export const TEMAS: readonly Theme[] = ["dark", "misto", "light"];

export function eTema(v: unknown): v is Theme {
  return v === "dark" || v === "light" || v === "misto";
}

function assinar(cb: () => void): () => void {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
}

function noCliente(): Theme {
  const el = document.documentElement;
  if (el.dataset.theme !== "light") return "dark";
  return el.dataset.aside === "obsidiana" ? "misto" : "light";
}

// No servidor não há tema; "dark" é o padrão do design system.
const noServidor = (): Theme => "dark";

export function writeTheme(theme: Theme): void {
  const el = document.documentElement;
  el.dataset.theme = theme === "dark" ? "dark" : "light";
  if (theme === "misto") el.dataset.aside = "obsidiana";
  else delete el.dataset.aside;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage bloqueado — o tema vale só para esta sessão */
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(assinar, noCliente, noServidor);
  return [theme, writeTheme];
}

/** O que o botão de tema faz, dito pelo tema para onde ele leva. */
export const ROTULO_TEMA: Record<Theme, string> = {
  dark: "Usar fundo escuro",
  misto: "Usar fundo claro com menu escuro",
  light: "Usar fundo claro",
};

/** Próximo tema no botão da lateral: escuro → misto → claro → escuro. */
export function proximoTema(t: Theme): Theme {
  return TEMAS[(TEMAS.indexOf(t) + 1) % TEMAS.length];
}

/** O wordmark é monocromático: Floral sobre escuro, Obsidiana sobre claro.
 *  `lateral` = o logo está no menu lateral, que no tema misto é escuro. */
export function markTone(theme: Theme, lateral = false): "light" | "dark" {
  const fundoClaro = theme === "light" || (theme === "misto" && !lateral);
  return fundoClaro ? "dark" : "light";
}
