// Renomear, mover de área, arquivar ou excluir um produto. Restrito a admin.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";


type Body = { label?: string; area?: string; ativo?: boolean };

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/produtos/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const sql = await getDb();
  const atuais = await sql<{ label: string; area: string; ativo: boolean }[]>`
    SELECT label, area, ativo FROM produtos WHERE id = ${id}
  `;
  if (!atuais.length) return err("Produto não encontrado.", 404);
  const atual = atuais[0];

  const mudancas: { campo: string; de: string; para: string; texto: string }[] = [];

  if (body.label !== undefined && body.label.trim() && body.label.trim() !== atual.label) {
    const label = body.label.trim().slice(0, 80);
    mudancas.push({ campo: "label", de: atual.label, para: label, texto: `Renomeou o produto ${atual.label} para ${label}` });
    await sql`UPDATE produtos SET label = ${label} WHERE id = ${id}`;
  }

  if (body.area !== undefined && body.area !== atual.area) {
    if (!ctx.areasExistentes.includes(body.area)) return err("Área inválida.", 400);
    mudancas.push({
      campo: "area",
      de: atual.area,
      para: body.area,
      texto: `Moveu o produto ${atual.label} de ${ctx.labelArea(atual.area)} para ${ctx.labelArea(body.area)}`,
    });
    await sql`UPDATE produtos SET area = ${body.area} WHERE id = ${id}`;
  }

  if (body.ativo !== undefined && body.ativo !== atual.ativo) {
    mudancas.push({
      campo: "ativo",
      de: String(atual.ativo),
      para: String(body.ativo),
      texto: `${body.ativo ? "Reativou" : "Arquivou"} o produto ${atual.label}`,
    });
    await sql`UPDATE produtos SET ativo = ${body.ativo} WHERE id = ${id}`;
  }

  for (const m of mudancas) {
    await registrar(sql, {
      actorUserId: ctx.user.userId,
      area: atual.area,
      entidade: `PROD-${id}`,
      campo: m.campo,
      de: m.de,
      para: m.para,
      texto: m.texto,
    });
  }

  return json({ ok: true, mudancas: mudancas.length });
}

/**
 * Exclusão. Diferente da área, não bloqueia quando há oportunidades: a FK é
 * ON DELETE SET NULL, então os cards sobrevivem sem produto. Perder a classificação é
 * recuperável; perder a oportunidade não seria. Mesmo assim a resposta diz quantos ficaram
 * sem produto, para a decisão não ser cega.
 */
export async function DELETE(_req: Request, ctxRoute: RouteContext<"/api/produtos/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const sql = await getDb();

  const alvos = await sql<{ label: string; area: string }[]>`SELECT label, area FROM produtos WHERE id = ${id}`;
  if (!alvos.length) return err("Produto não encontrado.", 404);

  const [{ usos }] = await sql<{ usos: number }[]>`
    SELECT COUNT(*)::int AS usos FROM deals WHERE produto_id = ${id}
  `;

  await sql`DELETE FROM produtos WHERE id = ${id}`;
  await registrar(sql, {
    actorUserId: ctx.user.userId,
    area: alvos[0].area,
    entidade: `PROD-${id}`,
    campo: "exclusao",
    de: alvos[0].label,
    para: null,
    texto: `Excluiu o produto ${alvos[0].label}${usos > 0 ? `; ${usos} oportunidade(s) ficaram sem produto` : ""}`,
  });

  return json({ ok: true, semProduto: usos });
}
