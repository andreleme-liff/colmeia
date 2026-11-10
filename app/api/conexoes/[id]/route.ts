// Revogação de uma conexão externa. A dona revoga a sua; a administração revoga qualquer
// uma. Vale na próxima chamada do cliente: os tokens são apagados aqui, e o MCP confere a
// concessão a cada requisição.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { err, json } from "@/lib/http";
import { revogar } from "@/lib/oauth/servidor";

export async function DELETE(_req: Request, ctxRoute: RouteContext<"/api/conexoes/[id]">) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const concessaoId = Number(id);
  if (!Number.isInteger(concessaoId)) return err("Conexão inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin(async (tx) => {
    const [k] = await tx<{ user_id: number; revogado_em: Date | null }[]>`
      SELECT user_id, revogado_em FROM oauth_concessoes WHERE id = ${concessaoId} FOR UPDATE
    `;
    // A conexão de outra pessoa não existe para quem não administra.
    if (!k || (!ctx.isAdmin && k.user_id !== ctx.user.userId)) return "nao-encontrada" as const;
    if (k.revogado_em) return "ja-revogada" as const;
    const motivo = k.user_id === ctx.user.userId ? "revogada pela própria pessoa" : `revogada pela administração (${ctx.user.nome})`;
    await revogar(tx, concessaoId, ctx.user.userId, motivo);
    return "ok" as const;
  });

  if (r === "nao-encontrada") return err("Conexão não encontrada.", 404);
  return json({ ok: true, jaRevogada: r === "ja-revogada" });
}
