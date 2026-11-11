// Funding AWS: altera ou exclui um registro. Só administração; auditado.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { TIPOS, alterar, excluir, type Tipo } from "@/lib/funding-db";

async function alvo(ctxRoute: RouteContext<"/api/funding/[tipo]/[id]">): Promise<{ tipo: Tipo; id: string } | null> {
  const { tipo, id } = await ctxRoute.params;
  if (!(TIPOS as readonly string[]).includes(tipo)) return null;
  const limpo = decodeURIComponent(id).slice(0, 80);
  return limpo ? { tipo: tipo as Tipo, id: limpo } : null;
}

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/funding/[tipo]/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const a = await alvo(ctxRoute);
  if (!a) return err("Registro inválido.", 404);
  const body = await lerCorpo(req);
  const sql = await getDb();
  const r = await sql.begin((tx) => alterar(tx, ctx.user.userId, a.tipo, a.id, body));
  if ("erro" in r) return err(r.erro, r.status);
  return json(r);
}

export async function DELETE(_req: Request, ctxRoute: RouteContext<"/api/funding/[tipo]/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const a = await alvo(ctxRoute);
  if (!a) return err("Registro inválido.", 404);
  const sql = await getDb();
  const r = await sql.begin((tx) => excluir(tx, ctx.user.userId, a.tipo, a.id));
  if ("erro" in r) return err(r.erro, r.status);
  return json(r);
}
