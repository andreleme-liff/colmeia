"use client";

// Filtro de área. O sistema nasceu com seis verticais e os chips lado a lado eram a leitura
// certa: você vê todas as cores de uma vez. Com o conjunto aberto isso deixa de escalar —
// doze chips viram três linhas de cabeçalho e param de comunicar.
//
// Então o componente troca de forma conforme o tamanho do conjunto: chips até o limite,
// menu suspenso acima dele. O menu preserva o que os chips davam de melhor — o ponto de cor
// ao lado de cada nome — que um <select> nativo não consegue mostrar.

import { useEffect, useRef, useState } from "react";
import { C, eyebrow, dot, mesh, MONO } from "./tokens";

/** Acima disto os chips deixam de caber num cabeçalho de uma linha. */
export const LIMITE_CHIPS = 7;

export type OpcaoArea = { id: string; label: string; color: string };

export default function SeletorArea({
  opcoes,
  valor,
  onChange,
  className,
  larguraTotal = false,
}: {
  opcoes: OpcaoArea[];
  valor: string;
  onChange: (id: string) => void;
  className?: string;
  /** No modal o seletor ocupa a largura toda; no cabeçalho, só o necessário. */
  larguraTotal?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc — comportamento esperado de qualquer menu.
  useEffect(() => {
    if (!aberto) return;
    const clique = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", clique);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", clique);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const atual = opcoes.find((o) => o.id === valor) ?? opcoes[0];

  if (opcoes.length <= LIMITE_CHIPS) {
    return (
      <div className={className} style={mesh({ display: "flex", gap: 1, flexWrap: "wrap" })}>
        {opcoes.map((o) => {
          const on = valor === o.id;
          return (
            <div
              key={o.id}
              onClick={() => onChange(o.id)}
              style={{
                padding: "8px 13px",
                cursor: "pointer",
                ...eyebrow(11, on ? C.ink : C.faint, "0.1em"),
                background: on ? C.panel2 : C.canvas,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flex: larguraTotal ? 1 : undefined,
                justifyContent: larguraTotal ? "center" : undefined,
              }}
            >
              <span style={{ ...dot(o.color), borderRadius: 2 }} />
              {o.label}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={caixa} className={className} style={{ position: "relative", width: larguraTotal ? "100%" : undefined }}>
      <div
        role="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "8px 13px",
          cursor: "pointer",
          ...eyebrow(11, C.ink, "0.1em"),
          background: C.canvas,
          border: `1px solid ${C.line}`,
          minWidth: 190,
          justifyContent: "space-between",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <span style={{ ...dot(atual?.color ?? C.dust), borderRadius: 2 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {atual?.label ?? "—"}
          </span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{aberto ? "▴" : "▾"}</span>
      </div>

      {aberto && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: "100%",
            maxHeight: 300,
            overflowY: "auto",
            background: C.panel,
            border: `1px solid ${C.line}`,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {opcoes.map((o) => {
            const on = valor === o.id;
            return (
              <div
                key={o.id}
                role="option"
                aria-selected={on}
                className="liff-hover-cell"
                onClick={() => {
                  onChange(o.id);
                  setAberto(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "9px 13px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  ...eyebrow(11, on ? C.ink : C.dust, "0.1em"),
                  background: on ? C.panel2 : C.panel,
                }}
              >
                <span style={{ ...dot(o.color), borderRadius: 2 }} />
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
