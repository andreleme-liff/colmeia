"use client";

// Filtro por responsável, de seleção múltipla.
//
// Nasceu como um botão "MEUS" de liga-desliga, e isso era pouco: quem coordena quer ver a
// carteira de uma pessoa específica, ou de duas, não só a própria. E um botão solto escrito
// "MEUS" entre os chips de área não se lê como filtro — passa batido.
//
// As opções vêm dos registros em escopo, não da tabela de pessoas: ver `opcoesDeResponsavel`
// em lib/domain.ts para o porquê (texto livre vindo de planilha).

import { useEffect, useRef, useState } from "react";
import { C, eyebrow, dot, MONO, R } from "./tokens";
import { CHAVE_SEM_RESPONSAVEL, type OpcaoResponsavel } from "@/lib/domain";

export default function SeletorResponsaveis({
  opcoes,
  selecao,
  onChange,
  chaveDoUsuario,
  className,
}: {
  opcoes: OpcaoResponsavel[];
  /** Vazio é "todos". */
  selecao: string[];
  onChange: (selecao: string[]) => void;
  /** A chave da pessoa logada, para o atalho "só eu". Ausente quando ela não tem registro. */
  chaveDoUsuario?: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

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

  const alterna = (chave: string) =>
    onChange(selecao.includes(chave) ? selecao.filter((c) => c !== chave) : [...selecao, chave]);

  // O rótulo diz o estado sem precisar abrir: quem está selecionado, ou quantos.
  const escolhidas = opcoes.filter((o) => selecao.includes(o.chave));
  const valor =
    selecao.length === 0
      ? "TODOS"
      : escolhidas.length === 1
        ? escolhidas[0].label.toUpperCase()
        : `${selecao.length} PESSOAS`;

  const soEu = () => chaveDoUsuario && onChange([chaveDoUsuario]);
  const ativo = selecao.length > 0;
  // O nome inteiro fica no title: a largura do gatilho é fixa e nomes longos cortam.
  const titulo = ativo
    ? `Filtrando por ${escolhidas.map((o) => o.label).join(", ")}. Clique para mudar.`
    : "Filtrar por responsável";

  return (
    <div ref={caixa} className={className} style={{ position: "relative" }}>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setAberto((v) => !v);
          }
        }}
        title={titulo}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 34,
          boxSizing: "border-box",
          padding: "0 12px",
          cursor: "pointer",
          ...eyebrow(11, C.ink, "0.1em"),
          // Ligado fica com fundo de painel, como o chip de área selecionado: é o sinal de
          // que a tela está recortada e não mostra tudo.
          background: ativo ? C.panel2 : C.canvas,
          border: `1px solid ${ativo ? C.ink : C.line}`, borderRadius: R,
          whiteSpace: "nowrap",
          // A largura FIXA mora no CSS (`.liff-filtro-quem > [role="button"]`), não aqui:
          // estilo inline vence media query, e no celular o gatilho ficaria preso nos
          // 165px em vez de ocupar a faixa inteira. Já caí nisto uma vez neste mesmo
          // componente — o `flex: none` estava inline e o celular ignorava a regra.
        }}
      >
        <span style={{ color: C.faint, flexShrink: 0 }}>QUEM</span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{valor}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint, flexShrink: 0 }}>{aberto ? "▴" : "▾"}</span>
      </div>

      {aberto && (
        <div
          role="listbox"
          aria-multiselectable
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: 240,
            maxHeight: 340,
            overflowY: "auto",
            background: C.panel,
            border: `1px solid ${C.line}`, borderRadius: R,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", borderBottom: `1px solid ${C.line}` }}>
            <button
              type="button"
              className="liff-hover-cell"
              onClick={() => onChange([])}
              style={{
                flex: 1,
                padding: "9px 13px",
                cursor: "pointer",
                border: "none",
                background: "transparent",
                textAlign: "left",
                ...eyebrow(11, selecao.length === 0 ? C.ink : C.dust, "0.1em"),
              }}
            >
              Todos
            </button>
            {chaveDoUsuario && (
              <button
                type="button"
                className="liff-hover-cell"
                onClick={soEu}
                style={{
                  flex: 1,
                  padding: "9px 13px",
                  cursor: "pointer",
                  border: "none",
                  borderLeft: `1px solid ${C.line}`,
                  background: "transparent",
                  textAlign: "left",
                  ...eyebrow(11, C.dust, "0.1em"),
                }}
              >
                Só eu
              </button>
            )}
          </div>

          {opcoes.length === 0 && (
            <div style={{ padding: "12px 13px", ...eyebrow(11, C.faint, "0.1em") }}>Nada em escopo</div>
          )}

          {opcoes.map((o) => {
            const on = selecao.includes(o.chave);
            return (
              <div
                key={o.chave}
                role="option"
                aria-selected={on}
                className="liff-hover-cell"
                onClick={() => alterna(o.chave)}
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
                {/* Quadrado cheio quando marcado: o mesmo marcador do seletor de área, que
                    aqui funciona como caixa de seleção sem precisar de outro vocabulário. */}
                <span
                  style={{
                    ...dot(on ? C.ink : "transparent"),
                    borderRadius: 2,
                    border: `1px solid ${on ? C.ink : C.line}`,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    // Texto que não é ninguém da equipe fica em itálico: "Agente 2" não é
                    // uma pessoa cadastrada e a lista não deve sugerir que seja.
                    fontStyle: o.cadastrada || o.chave === CHAVE_SEM_RESPONSAVEL ? undefined : "italic",
                  }}
                >
                  {o.label}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{o.qtd}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
