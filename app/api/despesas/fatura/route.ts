// Paga a fatura de um cartão corporativo: todas as despesas em aberto daquele cartão com
// aquele vencimento, de uma vez. Só financeiro e administração; cada despesa fica auditada.

import { getDb } from "@/lib/db";
import { requireFinanceiro } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { pagarFatura } from "@/lib/despesas-db";

export async function POST(req: Request) {
  const ctx = await requireFinanceiro();
  if (ctx instanceof Response) return ctx;
  const body = await lerCorpo(req);
  const sql = await getDb();
  const r = await sql.begin((tx) => pagarFatura(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, body));
  if ("erro" in r) return err(r.erro, r.status);
  return json(r);
}
