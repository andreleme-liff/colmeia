// Despesas (contas a pagar): tudo de uma vez (categorias, favorecidos, recorrências e contas
// com os itens) e o lançamento de uma conta. Só financeiro e administração; toda gravação é auditada na
// mesma transação.

import { getDb } from "@/lib/db";
import { requireFinanceiro } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { lancarDespesa, lerDespesas } from "@/lib/despesas-db";

export async function GET() {
  const ctx = await requireFinanceiro();
  if (ctx instanceof Response) return ctx;
  return json(await lerDespesas(await getDb()));
}

export async function POST(req: Request) {
  const ctx = await requireFinanceiro();
  if (ctx instanceof Response) return ctx;
  const body = await lerCorpo(req);
  const sql = await getDb();
  const r = await sql.begin((tx) => lancarDespesa(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, body));
  if ("erro" in r) return err(r.erro, r.status);
  return json(r);
}
