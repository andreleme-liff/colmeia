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
  area: "vertical",
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

export default function Historico({ entidade }: { entidade: string }) {
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
