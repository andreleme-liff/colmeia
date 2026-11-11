// Faturamento (contas a receber): lista de faturas e emissão. Só administração.
//
// Emitir uma linha do cronograma: o servidor confere que o contrato é CONTRATADO (inclusive o
// previsto cujo card foi para Ganho) e que a parcela existe naquela competência, e usa o valor
// do cronograma se o corpo não trouxer outro. Fatura avulsa: cliente, vertical e valor livres.
// Toda gravação entra na auditoria, na mesma transação.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { emitirFatura, lerFaturas } from "@/lib/faturas";

export async function GET() {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const sql = await getDb();
  return json({ faturas: await lerFaturas(sql) });
}

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const body = await lerCorpo(req);
  if (!body) return err("Requisição inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin((tx) => emitirFatura(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, body));
  if ("erro" in r) return err(r.erro, 400);
  return json({ ok: true, ref: r.ref });
}
