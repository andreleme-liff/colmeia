"use client";

// Filtro de produto. Sempre um menu suspenso, qualquer que seja o número de produtos: o
// cabeçalho fica do mesmo tamanho com dois ou com vinte. Já foi uma fileira de chips quando
// eram poucos; a forma mudava conforme o cadastro crescia, e isso saiu a pedido.
// O menu é próprio, não um <select> nativo, para manter o ponto de cor ao lado de cada nome.

import { useEffect, useRef, useState } from "react";
import { C, eyebrow, dot, MONO } from "./tokens";

/** `color` é opcional: sem ela a opção não leva o ponto (o seletor de tamanho do card, por exemplo). */
export type OpcaoArea = { id: string; label: string; color?: string };

export default function SeletorArea({
  opcoes,
  valor,
  onChange,
  className,
  larguraTotal = false,
  prefixo,
  larguraMin = 190,
  paraCima = false,
}: {
  opcoes: OpcaoArea[];
  valor: string;
  onChange: (id: string) => void;
  className?: string;
  /** No modal o seletor ocupa a largura toda; no cabeçalho, só o necessário. */
  larguraTotal?: boolean;
  /** Rótulo apagado antes do valor, como o "QUEM" do filtro de responsável. Ex.: "card". */
  prefixo?: string;
  /** Largura mínima do botão; menor para seletores de poucas opções curtas. */
  larguraMin?: number;
  /** Abre a lista para cima: para o seletor que fica no rodapé do menu lateral. */
  paraCima?: boolean;
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
          minWidth: larguraMin,
          justifyContent: "space-between",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          {prefixo && <span style={{ color: C.faint, whiteSpace: "nowrap", flex: "none" }}>{prefixo}</span>}
          {(atual?.color || !prefixo) && <span style={{ ...dot(atual?.color ?? C.dust), borderRadius: 2 }} />}
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
            ...(paraCima ? { bottom: "calc(100% + 4px)" } : { top: "calc(100% + 4px)" }),
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
                {o.color && <span style={{ ...dot(o.color), borderRadius: 2 }} />}
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
