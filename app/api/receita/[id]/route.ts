// Alteração e exclusão de um contrato de receita. Só administração. A alteração substitui o
// contrato inteiro (cabeçalho e linhas): é um formulário só, e o histórico guarda o antes e
// o depois resumidos.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { registrar } from "@/lib/log";
import { lerContrato } from "@/lib/forecast";
import { atualizarContrato } from "@/lib/receita";

async function idDe(ctxRoute: RouteContext<"/api/receita/[id]">): Promise<number | null> {
  const { id } = await ctxRoute.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/receita/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const id = await idDe(ctxRoute);
  if (id == null) return err("Receita inválida.", 400);
  const c = lerContrato(await lerCorpo(req));
  if (typeof c === "string") return err(c, 400);

  const sql = await getDb();
  const r = await sql.begin((tx) => atualizarContrato(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, id, c));
  if ("erro" in r) return err(r.erro, r.status);
  return json({ ok: true });
}

export async function DELETE(_req: Request, ctxRoute: RouteContext<"/api/receita/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const id = await idDe(ctxRoute);
  if (id == null) return err("Receita inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin(async (tx) => {
    const [alvo] = await tx<{ ref: string; conta: string; area: string }[]>`
      SELECT ref, conta, area FROM contratos WHERE id = ${id} FOR UPDATE
    `;
    if (!alvo) return null;
    await tx`DELETE FROM contratos WHERE id = ${id}`;
    await registrar(tx, {
      actorUserId: ctx.user.userId,
      area: alvo.area,
      entidade: alvo.ref,
      campo: "exclusao",
      de: alvo.conta,
      para: null,
      texto: `Excluiu a receita de ${alvo.conta} (${alvo.ref})`,
    });
    return alvo;
  });
  if (!r) return err("Receita não encontrada.", 404);
  return json({ ok: true });
}
