// O que está ligado a uma pessoa: atividades e oportunidades em que ela é a responsável, e os
// blockers que ela resolve. A tela de exclusão mostra isto e oferece como destino as outras
// pessoas ativas.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { json, err } from "@/lib/http";

export async function GET(_req: Request, ctxRoute: RouteContext<"/api/users/[id]/usos">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const userId = Number((await ctxRoute.params).id);
  if (!Number.isInteger(userId)) return err("Usuário inválido.", 400);

  const sql = await getDb();
  const alvo = await sql`SELECT 1 FROM users WHERE id = ${userId} AND excluido_em IS NULL`;
  if (!alvo.length) return err("Usuário não encontrado.", 404);

  const [atividades, oportunidades, blockers, conexoes, destinos] = await Promise.all([
    sql<{ ref: string; titulo: string }[]>`SELECT ref, titulo FROM activities WHERE responsavel_user_id = ${userId} ORDER BY ref`,
    sql<{ ref: string; conta: string }[]>`SELECT ref, conta FROM deals WHERE responsavel_user_id = ${userId} ORDER BY conta`,
    sql<{ ref: string; conta: string }[]>`SELECT ref, conta FROM deals WHERE blocker_dono_id = ${userId} ORDER BY conta`,
    sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM oauth_concessoes WHERE user_id = ${userId} AND revogado_em IS NULL`,
    sql<{ id: number; nome: string }[]>`
      SELECT id, nome FROM users WHERE id <> ${userId} AND ativo AND excluido_em IS NULL ORDER BY nome
    `,
  ]);
  return json({ atividades, oportunidades, blockers, conexoes: conexoes[0].n, destinos });
}
