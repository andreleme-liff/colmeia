// Ações sobre uma fatura emitida. Só administração.
//   pagar    — baixa: data e valor recebido (emitida → paga);
//   estornar — desfaz a baixa (paga → emitida), para corrigir um lançamento errado;
//   editar   — corrige dados da emissão: NF, vencimento, forma, retenções, valor (só emitida);
//   cancelar — com motivo (só emitida; paga precisa ser estornada antes). A linha do
//              cronograma volta a ficar a emitir, para a reemissão.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { agirNaFatura } from "@/lib/faturas";

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/faturamento/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const { id: bruto } = await ctxRoute.params;
  const id = Number(bruto);
  if (!Number.isInteger(id) || id <= 0) return err("Fatura inválida.", 400);
  const body = await lerCorpo(req);
  if (!body) return err("Requisição inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin((tx) => agirNaFatura(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, id, body));
  if ("erro" in r) return err(r.erro, r.status);
  return json({ ok: true });
}
