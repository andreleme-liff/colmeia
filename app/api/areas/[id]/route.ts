// Cadastro da vertical: cor e rótulos. Restrito a admin — é configuração do sistema, não
// dado operacional, e muda como todo mundo enxerga o quadro.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { AREA_IDS } from "@/lib/domain";

type Body = { cor?: string; label?: string; short?: string };

/** Só HEX de 6 dígitos: é o que o input de cor produz e o que vira variável CSS sem escape. */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/areas/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  if (!AREA_IDS.includes(id)) return err("Área inválida.", 404);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const sql = await getDb();
  const atuais = await sql<{ label: string; short: string; cor: string }[]>`
    SELECT label, short, cor FROM areas WHERE id = ${id}
  `;
  if (!atuais.length) return err("Área não encontrada.", 404);
  const atual = atuais[0];

  const mudancas: { campo: string; de: string; para: string; texto: string }[] = [];

  if (body.cor !== undefined && body.cor !== atual.cor) {
    const cor = body.cor.trim();
    if (!HEX_RE.test(cor)) return err("Cor inválida — use HEX de 6 dígitos, como #4B6B9B.", 400);
    mudancas.push({
      campo: "cor",
      de: atual.cor,
      para: cor,
      texto: `Alterou a cor de ${atual.label} de ${atual.cor} para ${cor}`,
    });
    await sql`UPDATE areas SET cor = ${cor} WHERE id = ${id}`;
  }

  if (body.label !== undefined && body.label.trim() && body.label.trim() !== atual.label) {
    const label = body.label.trim().slice(0, 60);
    mudancas.push({
      campo: "label",
      de: atual.label,
      para: label,
      texto: `Renomeou a área ${atual.label} para ${label}`,
    });
    await sql`UPDATE areas SET label = ${label} WHERE id = ${id}`;
  }

  if (body.short !== undefined && body.short.trim() && body.short.trim() !== atual.short) {
    const short = body.short.trim().slice(0, 8).toUpperCase();
    mudancas.push({
      campo: "short",
      de: atual.short,
      para: short,
      texto: `Alterou a sigla de ${atual.label} de ${atual.short} para ${short}`,
    });
    await sql`UPDATE areas SET short = ${short} WHERE id = ${id}`;
  }

  for (const m of mudancas) {
    await registrar(sql, {
      actorUserId: ctx.user.userId,
      area: id,
      entidade: `AREA-${id}`,
      campo: m.campo,
      de: m.de,
      para: m.para,
      texto: m.texto,
    });
  }

  return json({ ok: true, mudancas: mudancas.length });
}
