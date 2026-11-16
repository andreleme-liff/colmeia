// Ações sobre uma conta a pagar lançada. Só financeiro e administração.
//   pagar    — registra o pagamento: data e valor que saiu (aberta → paga);
//   estornar — desfaz o pagamento (paga → aberta), para corrigir um lançamento errado;
//   editar   — corrige a conta: valor, vencimento, categoria, itens, documento (só aberta);
//   cancelar — com motivo (só aberta; paga precisa ser estornada antes). Se a conta veio de
//              uma recorrência, a linha do mês volta a ficar prevista.

import { getDb } from "@/lib/db";
import { requireFinanceiro } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { agirNaDespesa } from "@/lib/despesas-db";

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/despesas/[id]">) {
  const ctx = await requireFinanceiro();
  if (ctx instanceof Response) return ctx;
  const { id: bruto } = await ctxRoute.params;
  const id = Number(bruto);
  if (!Number.isInteger(id) || id <= 0) return err("Conta inválida.", 400);
  const body = await lerCorpo(req);
  const sql = await getDb();
  const r = await sql.begin((tx) => agirNaDespesa(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, id, body));
  if ("erro" in r) return err(r.erro, r.status);
  return json({ ok: true });
}
