// Um cliente: histórico (GET), alteração (PATCH) e exclusão (DELETE). Só administração.
// A alteração substitui o cadastro inteiro, como o formulário; o changelog guarda cada campo.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { lerCliente } from "@/lib/cliente";
import { atualizarCliente, excluirCliente, historicoDoCliente } from "@/lib/clientes-db";

async function idDe(ctxRoute: RouteContext<"/api/clientes/[id]">): Promise<number | null> {
  const { id } = await ctxRoute.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: Request, ctxRoute: RouteContext<"/api/clientes/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const id = await idDe(ctxRoute);
  if (id == null) return err("Organização inválida.", 400);
  const sql = await getDb();
  const [existe] = await sql<{ id: number }[]>`SELECT id FROM clientes WHERE id = ${id}`;
  if (!existe) return err("Organização não encontrada.", 404);
  return json({ eventos: await historicoDoCliente(sql, id) });
}

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/clientes/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const id = await idDe(ctxRoute);
  if (id == null) return err("Organização inválida.", 400);
  const e = lerCliente(await lerCorpo(req));
  if (typeof e === "string") return err(e, 400);

  const sql = await getDb();
  const r = await sql.begin((tx) => atualizarCliente(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, id, e));
  if ("erro" in r) return err(r.erro, r.status);
  return json({ ok: true, mudancas: r.mudancas });
}

export async function DELETE(_req: Request, ctxRoute: RouteContext<"/api/clientes/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const id = await idDe(ctxRoute);
  if (id == null) return err("Organização inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin((tx) => excluirCliente(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, id));
  if ("erro" in r) return err(r.erro, r.status);
  return json({ ok: true });
}
