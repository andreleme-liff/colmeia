// O que está ligado a um produto: atividades (produto) e oportunidades (módulo de interesse).
// A tela de exclusão mostra isto antes de pedir a decisão — migrar, excluir junto ou só
// desvincular — e oferece como destino os outros produtos da MESMA área, porque produto de
// um registro tem de pertencer à área dele.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { json, err } from "@/lib/http";

export async function GET(_req: Request, ctxRoute: RouteContext<"/api/produtos/[id]/usos">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const { id } = await ctxRoute.params;

  const sql = await getDb();
  const alvo = await sql<{ area: string }[]>`SELECT area FROM produtos WHERE id = ${id}`;
  if (!alvo.length) return err("Módulo não encontrado.", 404);

  const [atividades, oportunidades, destinos] = await Promise.all([
    sql<{ ref: string; titulo: string }[]>`SELECT ref, titulo FROM activities WHERE produto_id = ${id} ORDER BY ref`,
    sql<{ ref: string; conta: string; modulos: number }[]>`
      SELECT d.ref, d.conta, (SELECT COUNT(*)::int FROM oportunidade_modulos x WHERE x.deal_id = d.id) AS modulos
      FROM deals d JOIN oportunidade_modulos m ON m.deal_id = d.id AND m.produto_id = ${id}
      ORDER BY d.conta
    `,
    sql<{ id: string; label: string }[]>`
      SELECT id, label FROM produtos WHERE area = ${alvo[0].area} AND id <> ${id} ORDER BY label
    `,
  ]);
  return json({ atividades, oportunidades, destinos });
}
