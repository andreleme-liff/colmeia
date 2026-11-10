// Renomear ou arquivar uma origem. Arquivar, não excluir: as oportunidades que já apontam
// para ela continuam mostrando de onde vieram; só deixa de ser oferecida nas novas.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { registrar } from "@/lib/log";

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/origens/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const { id } = await ctxRoute.params;
  const body = await lerCorpo(req);
  if (!body) return err("Requisição inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin(async (tx) => {
    const [atual] = await tx<{ label: string; ativo: boolean }[]>`SELECT label, ativo FROM origens WHERE id = ${id} FOR UPDATE`;
    if (!atual) return { status: 404 as const };
    let mudancas = 0;
    if (typeof body.label === "string" && body.label.trim() && body.label.trim() !== atual.label) {
      const label = body.label.trim().slice(0, 60);
      await tx`UPDATE origens SET label = ${label} WHERE id = ${id}`;
      await registrar(tx, {
        actorUserId: ctx.user.userId, area: null, entidade: `ORIGEM-${id}`, campo: "label", de: atual.label, para: label,
        texto: `Renomeou a origem ${atual.label} para ${label}`,
      });
      mudancas++;
    }
    if (typeof body.ativo === "boolean" && body.ativo !== atual.ativo) {
      await tx`UPDATE origens SET ativo = ${body.ativo} WHERE id = ${id}`;
      await registrar(tx, {
        actorUserId: ctx.user.userId, area: null, entidade: `ORIGEM-${id}`, campo: "ativo",
        de: String(atual.ativo), para: String(body.ativo),
        texto: `${body.ativo ? "Reativou" : "Arquivou"} a origem ${atual.label}`,
      });
      mudancas++;
    }
    return { status: 200 as const, mudancas };
  });
  if (r.status === 404) return err("Origem não encontrada.", 404);
  return json({ ok: true, mudancas: r.mudancas });
}
