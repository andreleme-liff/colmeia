// Clientes: lista e cadastro. Só administração, por enquanto — a visão do cliente junta
// oportunidades de todos os produtos e os dados de faturamento, e ainda não tem o recorte por
// produto que o resto do sistema aplica a quem não é admin.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { lerCliente } from "@/lib/cliente";
import { criarCliente, lerClientes } from "@/lib/clientes-db";

export async function GET() {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const sql = await getDb();
  return json({ clientes: await lerClientes(sql) });
}

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const e = lerCliente(await lerCorpo(req));
  if (typeof e === "string") return err(e, 400);

  const sql = await getDb();
  const r = await sql.begin((tx) => criarCliente(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, e));
  if ("erro" in r) return err(r.erro, r.status);
  return json({ ok: true, id: r.id, ref: r.ref });
}
