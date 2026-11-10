// Conexões externas (concessões OAuth do MCP). Cada pessoa vê as suas; a administração vê
// todas. Revogadas nos últimos 30 dias continuam na lista, com motivo e autor da revogação —
// some da lista o que já não diz nada, mas o audit_log guarda tudo para sempre.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json } from "@/lib/http";
import { hostDeRetorno } from "@/lib/oauth/servidor";

export async function GET() {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const sql = await getDb();
  const linhas = await sql<{
    id: number; user_id: number; pessoa: string; client_id: string; client_nome: string; redirect_uri: string;
    escopos: string; criado_em: Date; ultimo_uso_em: Date | null; revogado_em: Date | null;
    motivo_revogacao: string | null; revogado_por: string | null; chamadas: number; gravacoes: number;
  }[]>`
    SELECT k.id, k.user_id, u.nome AS pessoa, k.client_id, k.client_nome, k.redirect_uri, k.escopos,
           k.criado_em, k.ultimo_uso_em, k.revogado_em, k.motivo_revogacao, r.nome AS revogado_por,
           (SELECT count(*)::int FROM mcp_chamadas c
             WHERE c.concessao_id = k.id AND c.criado_em > now() - interval '7 days') AS chamadas,
           (SELECT count(*)::int FROM mcp_chamadas c
             WHERE c.concessao_id = k.id AND c.escrita AND c.ok AND c.criado_em > now() - interval '7 days') AS gravacoes
    FROM oauth_concessoes k
    JOIN users u ON u.id = k.user_id
    LEFT JOIN users r ON r.id = k.revogado_por
    WHERE (${ctx.isAdmin} OR k.user_id = ${ctx.user.userId})
      AND (k.revogado_em IS NULL OR k.revogado_em > now() - interval '30 days')
    ORDER BY (k.revogado_em IS NULL) DESC, k.criado_em DESC
    LIMIT 200
  `;

  return json({
    todas: ctx.isAdmin,
    conexoes: linhas.map((k) => ({
      id: k.id,
      pessoa: k.pessoa,
      minha: k.user_id === ctx.user.userId,
      cliente: k.client_nome,
      clienteHost: new URL(k.client_id).hostname,
      retorno: hostDeRetorno(k.redirect_uri),
      escopos: k.escopos.split(" "),
      criadoEm: k.criado_em.toISOString(),
      ultimoUsoEm: k.ultimo_uso_em?.toISOString() ?? null,
      revogadoEm: k.revogado_em?.toISOString() ?? null,
      motivo: k.motivo_revogacao,
      revogadoPor: k.revogado_por,
      chamadas7d: k.chamadas,
      gravacoes7d: k.gravacoes,
    })),
  });
}
