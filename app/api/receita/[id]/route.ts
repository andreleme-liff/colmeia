// Alteração e exclusão de um contrato de receita. Só administração. A alteração substitui o
// contrato inteiro (cabeçalho e linhas): é um formulário só, e o histórico guarda o antes e
// o depois resumidos.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { registrar } from "@/lib/log";
import { lerContrato, resumoContrato } from "@/lib/forecast";
import { conferir, gravarCobranca, gravarLinhas, lerContratos } from "@/lib/receita";

async function idDe(ctxRoute: RouteContext<"/api/receita/[id]">): Promise<number | null> {
  const { id } = await ctxRoute.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/receita/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const id = await idDe(ctxRoute);
  if (id == null) return err("Contrato inválido.", 400);
  const c = lerContrato(await lerCorpo(req));
  if (typeof c === "string") return err(c, 400);

  const sql = await getDb();
  const r = await sql.begin(async (tx) => {
    const [atual] = await tx<{ ref: string }[]>`SELECT ref FROM contratos WHERE id = ${id} FOR UPDATE`;
    if (!atual) return { erro: "Contrato não encontrado.", status: 404 };
    const antes = (await lerContratos(tx)).find((x) => x.id === id)!;
    const erro = await conferir(tx, c, id);
    if (erro) return { erro, status: 400 };
    await tx`
      UPDATE contratos SET deal_id = ${c.dealId}, conta = ${c.conta}, area = ${c.area}, situacao = ${c.situacao},
             chance = ${c.chance}, inicio_faturamento = ${c.inicioFaturamento}, notas = ${c.notas}, atualizado_em = now()
      WHERE id = ${id}
    `;
    await gravarLinhas(tx, id, c);
    await gravarCobranca(tx, id, c);
    const de = resumoContrato(antes);
    const para = resumoContrato(c);
    if (de !== para || antes.conta !== c.conta || antes.area !== c.area || antes.dealId !== c.dealId || antes.notas !== c.notas) {
      await registrar(tx, {
        actorUserId: ctx.user.userId,
        area: c.area,
        entidade: atual.ref,
        campo: "receita",
        de,
        para,
        texto: `Alterou a receita de ${c.conta} (${atual.ref}): ${para}`,
      });
    }
    return { ok: true as const };
  });
  if ("erro" in r) return err(r.erro as string, r.status as number);
  return json({ ok: true });
}

export async function DELETE(_req: Request, ctxRoute: RouteContext<"/api/receita/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const id = await idDe(ctxRoute);
  if (id == null) return err("Contrato inválido.", 400);

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
  if (!r) return err("Contrato não encontrado.", 404);
  return json({ ok: true });
}
