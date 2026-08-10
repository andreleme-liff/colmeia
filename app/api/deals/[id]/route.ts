// Movimento de uma oportunidade no pipeline. O cliente manda a direção (-1/+1) e o servidor
// decide o estágio de destino — assim não dá para pular etapas mandando um estágio arbitrário.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { STAGES } from "@/lib/domain";

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/deals/[id]">) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const dealId = Number(id);
  if (!Number.isInteger(dealId)) return err("Oportunidade inválida.", 400);

  let body: { direcao?: number };
  try {
    body = (await req.json()) as { direcao?: number };
  } catch {
    return err("Requisição inválida.", 400);
  }
  const direcao = Number(body.direcao);
  if (direcao !== 1 && direcao !== -1) return err("Direção inválida.", 400);

  const sql = await getDb();
  const linhas = await sql<{ id: number; ref: string; conta: string; area: string; estagio: string }[]>`
    SELECT id, ref, conta, area, estagio FROM deals WHERE id = ${dealId}
  `;
  if (!linhas.length) return err("Oportunidade não encontrada.", 404);
  const atual = linhas[0];

  if (!ctx.podeVer(atual.area)) return err("Oportunidade não encontrada.", 404);
  if (!ctx.podeEditar(atual.area)) return err("Sem permissão de edição nesta área.", 403);

  const i = STAGES.findIndex((s) => s.key === atual.estagio);
  const j = Math.max(0, Math.min(STAGES.length - 1, i + direcao));
  if (i === j) return json({ ok: true, mudancas: 0 });

  await sql`UPDATE deals SET estagio = ${STAGES[j].key}, atualizado_em = now() WHERE id = ${dealId}`;
  await registrar(sql, {
    actorUserId: ctx.user.userId,
    area: atual.area,
    entidade: atual.ref,
    campo: "estagio",
    de: STAGES[i].key,
    para: STAGES[j].key,
    texto: `Moveu ${atual.conta} de ${STAGES[i].label} para ${STAGES[j].label}`,
  });

  return json({ ok: true, mudancas: 1 });
}
