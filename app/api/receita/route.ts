// Forecast de receita: lista e cadastro de contratos. Só administração, por enquanto — a
// tela está em construção e mostra números de toda a empresa.
//
// Toda gravação passa por `lerContrato` (lib/forecast.ts) e entra na auditoria na mesma
// transação.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { registrar } from "@/lib/log";
import { lerContrato, resumoContrato } from "@/lib/forecast";
import { conferir, gravarLinhas, lerContratos } from "@/lib/receita";

export async function GET() {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const sql = await getDb();
  return json({ contratos: await lerContratos(sql) });
}

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const c = lerContrato(await lerCorpo(req));
  if (typeof c === "string") return err(c, 400);

  const sql = await getDb();
  const r = await sql.begin(async (tx) => {
    const erro = await conferir(tx, c, null);
    if (erro) return { erro };
    const [novo] = await tx<{ id: number }[]>`
      INSERT INTO contratos (deal_id, conta, area, situacao, chance, inicio_faturamento, notas)
      VALUES (${c.dealId}, ${c.conta}, ${c.area}, ${c.situacao}, ${c.chance}, ${c.inicioFaturamento}, ${c.notas})
      RETURNING id
    `;
    const ref = `R-${String(novo.id).padStart(4, "0")}`;
    await tx`UPDATE contratos SET ref = ${ref} WHERE id = ${novo.id}`;
    await gravarLinhas(tx, novo.id, c);
    await registrar(tx, {
      actorUserId: ctx.user.userId,
      area: c.area,
      entidade: ref,
      campo: "receita",
      de: null,
      para: resumoContrato(c),
      texto: `Cadastrou a receita de ${c.conta} (${ref}): ${resumoContrato(c)}`,
    });
    return { ref };
  });
  if ("erro" in r) return err(r.erro as string, 400);
  return json({ ok: true, ref: r.ref });
}
