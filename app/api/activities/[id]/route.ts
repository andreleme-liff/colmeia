// Alteração de uma atividade. A regra mora em `lib/ops` — a mesma que o MCP usa.
//
// A permissão é sempre reavaliada a partir da ÁREA DO REGISTRO NO BANCO, nunca de algo que o
// cliente tenha mandado junto. Validação completa ANTES da primeira escrita, e dado +
// auditoria na mesma transação: ou a alteração entra inteira, com o seu registro, ou nada
// entra. (Antes, um erro no meio deixava campos já gravados sem linha de auditoria.)
//
// A exclusão fica SÓ aqui, fora do núcleo compartilhado: o MCP não exclui nada.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { deFalha, err, json, lerCorpo } from "@/lib/http";
import { excluirAtividade } from "@/lib/exclusao";
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

/**
 * Exclusão de uma atividade. Exige `edit` na área, como a da oportunidade. O registro some e a
 * auditoria fica: o log guarda a referência como texto, então o histórico continua consultável.
 */
export async function DELETE(_req: Request, ctxRoute: RouteContext<"/api/activities/[id]">) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const activityId = Number(id);
  if (!Number.isInteger(activityId)) return err("Atividade inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin(async (tx) => {
    const linhas = await tx<{ ref: string; titulo: string; area: string }[]>`
      SELECT ref, titulo, area FROM activities WHERE id = ${activityId} FOR UPDATE
    `;
    if (!linhas.length) return { ok: false as const, erro: "Atividade não encontrada.", status: 404 };
    const alvo = linhas[0];
    if (!ctx.podeVer(alvo.area)) return { ok: false as const, erro: "Atividade não encontrada.", status: 404 };
    if (!ctx.podeEditar(alvo.area)) return { ok: false as const, erro: "Sem permissão de edição nesta vertical.", status: 403 };

    await excluirAtividade(tx, { id: activityId, ...alvo }, ctx.user.userId);
    return { ok: true as const };
  });
  if (ehFalha(r)) return deFalha(r);
  return json({ ok: true });
}
