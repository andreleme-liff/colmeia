"use client";

// Histórico completo de um registro. Serve ao drawer da atividade e ao formulário da
// oportunidade — é a mesma pergunta nos dois casos: quem mudou o quê, quando, e de que
// valor para qual.
//
// Busca sob demanda, ao abrir: carregar o histórico de todo card junto com o estado seria
// desperdício, e ele precisa vir completo, não truncado como o log do painel.

import { useEffect, useState } from "react";
import { C, MONO, eyebrow } from "./tokens";
import { stamp } from "@/lib/domain";
import ViaConexao from "./ViaConexao";

type Entrada = {
  id: number;
  criadoEm: string;
  autor: string;
  via: string | null;
  campo: string | null;
  de: string | null;
  para: string | null;
  texto: string;
};

/** Nome técnico do campo → como a pessoa chama aquilo na tela. */
const ROTULO: Record<string, string> = {
  titulo: "título",
  area: "produto",
  status: "status",
  prioridade: "prioridade",
  responsavel: "responsável",
  estagio: "estágio",
  conta: "conta",
  escopo: "escopo",
  valor: "valor",
  proximo_passo: "próximo passo",
  criacao: "criação",
};

/** Busca o histórico de um registro. `entradas` nulo = carregando. */
function useHistorico(entidade: string): { entradas: Entrada[] | null; erro: string | null } {
  const [entradas, setEntradas] = useState<Entrada[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/logs/${encodeURIComponent(entidade)}`)
      .then(async (r) => {
        const dados = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(dados.error ?? "Não foi possível carregar o histórico.");
        return dados.entradas as Entrada[];
      })
      .then((e) => vivo && setEntradas(e))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : "Falha ao carregar."));
    return () => {
      vivo = false;
    };
  }, [entidade]);

  return { entradas, erro };
}

/** Campos cujo valor novo é o próprio conteúdo da atualização, e vale mostrar por extenso. */
// O próximo passo fica de fora: a frase do log já traz o texto dele.
const COM_TEXTO = new Set(["situacao", "blocker", "notas", "motivo_perda_detalhe"]);

/**
 * Linha do tempo curta: as últimas atualizações do registro, à vista, sem abrir o histórico.
 * Uma linha por alteração, da mais recente para a mais antiga: quando, quem e o quê; nas
 * mudanças de texto (situação, próximo passo), o texto que entrou.
 */
export function LinhaDoTempo({ entidade, limite = 5, onVerTudo }: { entidade: string; limite?: number; onVerTudo?: () => void }) {
  const { entradas, erro } = useHistorico(entidade);
  if (erro) return <div style={{ fontSize: 13, color: C.error }}>{erro}</div>;
  if (!entradas) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>carregando…</div>;
  if (!entradas.length) return <div style={{ fontSize: 13, color: C.faint }}>Nenhuma atualização registrada ainda.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {entradas.slice(0, limite).map((e) => (
        <div key={e.id} style={{ display: "grid", gridTemplateColumns: "92px minmax(0, 1fr)", gap: 12, alignItems: "baseline" }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>{stamp(e.criadoEm)}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.45 }}>{e.texto}</span>
            {e.campo && COM_TEXTO.has(e.campo) && e.para && e.para !== "—" && (
              <span style={{ display: "block", fontSize: 12.5, color: C.body, lineHeight: 1.5, marginTop: 2, overflowWrap: "anywhere" }}>{e.para}</span>
            )}
            {e.campo && !COM_TEXTO.has(e.campo) && !["criacao", "proximo_passo", "ace_aws"].includes(e.campo) && e.de !== null && e.para !== null && (
              <span style={{ display: "block", fontFamily: MONO, fontSize: 11, color: C.faint, marginTop: 2, overflowWrap: "anywhere" }}>
                {e.de} → <span style={{ color: C.body }}>{e.para}</span>
              </span>
            )}
            <span style={{ display: "block", ...eyebrow(10, C.faint, "0.1em"), marginTop: 3 }}>
              {e.autor}
              {e.via && <ViaConexao nome={e.via} />}
            </span>
          </span>
        </div>
      ))}
      {entradas.length > limite && onVerTudo && (
        <div>
          <button type="button" className="rec-link" onClick={onVerTudo}>
            ver as {entradas.length} alterações
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * As últimas alterações de UM campo do registro (a situação do card comercial, por exemplo),
 * com o texto que foi escrito, quem escreveu e quando. Fica logo abaixo do campo.
 */
export function UltimasDoCampo({ entidade, campo, atual, limite = 3, vazio }: {
  entidade: string;
  campo: string;
  /** O valor que está no campo agora: a alteração que o escreveu não se repete na lista. */
  atual?: string;
  limite?: number;
  vazio: string;
}) {
  const { entradas, erro } = useHistorico(entidade);
  if (erro || !entradas) return null;
  const todas = entradas.filter((e) => e.campo === campo);
  // A mais recente é a que escreveu o texto do campo: mostrar de novo seria repetir o que
  // está logo acima. Ficam as anteriores.
  const repetida = atual !== undefined && todas[0]?.para === (atual || "—");
  const doCampo = todas.slice(repetida ? 1 : 0, (repetida ? 1 : 0) + limite);
  if (!doCampo.length) return <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>{vazio}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, borderLeft: `2px solid ${C.line}`, paddingLeft: 12 }}>
      {doCampo.map((e) => (
        <div key={e.id} style={{ minWidth: 0 }}>
          <div style={eyebrow(10, C.faint, "0.1em")}>
            {stamp(e.criadoEm)} · {e.autor}
            {e.via && <ViaConexao nome={e.via} />}
          </div>
          <div style={{ fontSize: 12.5, color: C.body, lineHeight: 1.5, marginTop: 2, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
            {e.para && e.para !== "—" ? e.para : "(apagou o texto)"}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Historico({ entidade }: { entidade: string }) {
  const { entradas, erro } = useHistorico(entidade);

  if (erro) return <div style={{ fontSize: 13, color: C.error }}>{erro}</div>;
  if (!entradas) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>carregando…</div>;
  if (!entradas.length)
    return <div style={{ fontSize: 13, color: C.faint }}>Nenhuma alteração registrada neste registro.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {entradas.map((e) => (
        <div key={e.id} style={{ borderLeft: `1px solid ${C.line}`, paddingLeft: 14 }}>
          <div style={{ fontSize: 13, color: C.body, lineHeight: 1.5 }}>{e.texto}</div>

          {/* O par anterior → novo é o que torna o log auditável; sem ele sobra só a frase. */}
          {e.campo && (e.de !== null || e.para !== null) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
                marginTop: 5,
                fontFamily: MONO,
                fontSize: 11,
              }}
            >
              <span style={{ color: C.faint }}>{ROTULO[e.campo] ?? e.campo}:</span>
              <span
                style={{
                  color: C.ghost,
                  textDecoration: e.de && e.para ? "line-through" : undefined,
                }}
              >
                {e.de ?? "—"}
              </span>
              <span style={{ color: C.faint }}>→</span>
              <span style={{ color: C.ink }}>{e.para ?? "—"}</span>
            </div>
          )}

          <div style={{ ...eyebrow(10, C.faint, "0.1em"), marginTop: 4 }}>
            {e.autor}
            {e.via && <ViaConexao nome={e.via} />} · {stamp(e.criadoEm)}
          </div>
        </div>
      ))}
    </div>
  );
}
