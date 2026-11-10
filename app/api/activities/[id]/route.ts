// Alteração de uma atividade. A regra mora em `lib/ops` — a mesma que o MCP usa.
//
// A permissão é sempre reavaliada a partir da ÁREA DO REGISTRO NO BANCO, nunca de algo que o
// cliente tenha mandado junto. Validação completa ANTES da primeira escrita, e dado +
// auditoria na mesma transação: ou a alteração entra inteira, com o seu registro, ou nada
// entra. (Antes, um erro no meio deixava campos já gravados sem linha de auditoria.)

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { deFalha, err, json, lerCorpo } from "@/lib/http";
import { ehFalha } from "@/lib/ops/comum";
import { atualizarAtividade } from "@/lib/ops/atividades";

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/activities/[id]">) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const activityId = Number(id);
  if (!Number.isInteger(activityId)) return err("Atividade inválida.", 400);

  const body = await lerCorpo(req);
  if (!body) return err("Requisição inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin((tx) =>
    atualizarAtividade(tx, ctx, activityId, body, { userId: ctx.user.userId, origem: null, concessaoId: null })
  );
  if (ehFalha(r)) return deFalha(r);
  return json({ ok: true, mudancas: r.mudancas });
}
