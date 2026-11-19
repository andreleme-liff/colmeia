"use client";

// Segmentado escuro/misto/claro, na mesma linguagem dos chips de área.

import { C, eyebrow, mesh, type Theme } from "./tokens";
import type { CSSProperties } from "react";

export default function ThemeToggle({
  theme,
  onChange,
  style,
}: {
  theme: Theme;
  onChange: (t: Theme) => void;
  style?: CSSProperties;
}) {
  const opcoes: { key: Theme; label: string; title: string }[] = [
    { key: "dark", label: "escuro", title: "Fundo escuro" },
    { key: "misto", label: "misto", title: "Fundo claro com menu escuro" },
    { key: "light", label: "claro", title: "Fundo claro" },
  ];
  return (
    <div style={mesh({ display: "flex", gap: 1, ...style })}>
      {opcoes.map((t) => (
        <div
          key={t.key}
          role="button"
          aria-pressed={theme === t.key}
          title={t.title}
          onClick={() => onChange(t.key)}
          style={{
            flex: 1,
            textAlign: "center",
            padding: "7px 10px",
            cursor: "pointer",
            ...eyebrow(10, theme === t.key ? C.ink : C.faint, "0.12em"),
            background: theme === t.key ? C.panel2 : C.canvas,
          }}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}
