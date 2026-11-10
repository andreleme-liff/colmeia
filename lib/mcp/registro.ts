// Registro de chamadas do MCP (tabela `mcp_chamadas`) e a contagem para o limite por minuto.
//
// Toda `tools/call` deixa uma linha — leitura inclusive. Gravação bem-sucedida registra
// DENTRO da transação da gravação: não existe registro alterado por uma conexão sem a linha
// que diz qual chamada o alterou.

import type { Queryable } from "../db";

export type Chamada = {
  concessaoId: number;
  userId: number;
  ferramenta: string;
  argumentos: Record<string, unknown>;
  escrita: boolean;
  ok: boolean;
  erro?: string | null;
  ref?: string | null;
  chave?: string | null;
  duracaoMs: number;
};

export async function registrarChamada(sql: Queryable, c: Chamada): Promise<void> {
  await sql`
    INSERT INTO mcp_chamadas (concessao_id, user_id, ferramenta, argumentos, escrita, ok, erro, ref, chave_idempotencia, duracao_ms)
    VALUES (${c.concessaoId}, ${c.userId}, ${c.ferramenta}, ${sql.json(c.argumentos as never)}, ${c.escrita}, ${c.ok},
            ${c.erro ?? null}, ${c.ref ?? null}, ${c.chave ?? null}, ${c.duracaoMs})
  `;
}

export async function contarRecentes(sql: Queryable, concessaoId: number): Promise<{ total: number; escritas: number }> {
  const [r] = await sql<{ total: number; escritas: number }[]>`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE escrita)::int AS escritas
    FROM mcp_chamadas
    WHERE concessao_id = ${concessaoId} AND criado_em > now() - interval '60 seconds'
  `;
  return r ?? { total: 0, escritas: 0 };
}

/** A criação que já aconteceu com esta chave, nesta conexão. */
export async function jaCriado(sql: Queryable, concessaoId: number, chave: string): Promise<string | null> {
  const [r] = await sql<{ ref: string | null }[]>`
    SELECT ref FROM mcp_chamadas
    WHERE concessao_id = ${concessaoId} AND chave_idempotencia = ${chave} AND ok
  `;
  return r?.ref ?? null;
}
