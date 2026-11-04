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
  return { background: C.line, border: `1px solid ${C.line}`, ...extra };
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
   A fonte de verdade do tema é o atributo data-theme no <html>, que o script inline do
   layout já escreveu antes do primeiro paint. O React apenas se inscreve nele via
   useSyncExternalStore — que é o caminho certo para ler estado que vive fora do React e
   evita divergência entre o HTML do servidor e a primeira renderização no cliente. */

export const THEME_KEY = "liff-tasks-theme";
export const THEME_EVENT = "liff-tasks-theme-change";
export type Theme = "dark" | "light";

function assinar(cb: () => void): () => void {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
}

function noCliente(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

// No servidor não há tema; "dark" é o padrão do design system.
const noServidor = (): Theme => "dark";

export function writeTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
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

/** O wordmark é monocromático: Floral sobre escuro, Obsidiana sobre claro. */
export function markTone(theme: Theme): "light" | "dark" {
  return theme === "light" ? "dark" : "light";
}
