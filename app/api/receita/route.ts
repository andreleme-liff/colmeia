// Forecast de receita: lista e cadastro de contratos. Só administração, por enquanto — a
// tela está em construção e mostra números de toda a empresa.
//
// Toda gravação passa por `lerContrato` (lib/forecast.ts) e entra na auditoria na mesma
// transação.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { lerContrato } from "@/lib/forecast";
import { criarContrato, lerContratos } from "@/lib/receita";

export async function GET() {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const sql = await getDb();
  return json({ contratos: await lerContratos(sql) });
}

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const c = lerContrato(await lerCorpo(req));
  if (typeof c === "string") return err(c, 400);

  const sql = await getDb();
  const r = await sql.begin((tx) => criarContrato(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, c));
  if ("erro" in r) return err(r.erro, 400);
  return json({ ok: true, ref: r.ref });
}
