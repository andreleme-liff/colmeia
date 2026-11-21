// Cadastro de origens da oportunidade (evento, indicação, outbound…). Restrito a admin, como
// produtos e áreas: é vocabulário do sistema. Parceiro novo vira origem aqui, sem deploy.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { deFalha, err, json, lerCorpo } from "@/lib/http";
import { registrar } from "@/lib/log";
import { slugificar } from "@/lib/domain";

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const body = await lerCorpo(req);
  if (!body) return err("Requisição inválida.", 400);

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return err("A origem precisa de um nome.", 400);
  if (label.length > 60) return err("Nome longo demais.", 400);
  const id = slugificar(label);
  if (!id) return err("Nome inválido — use letras ou números.", 400);

  const sql = await getDb();
  const r = await sql.begin(async (tx) => {
    const [ja] = await tx<{ id: string }[]>`SELECT id FROM origens WHERE id = ${id}`;
    if (ja) return { ok: false as const, erro: `Já existe uma origem com esse nome (${id}).`, status: 409 };
    const [{ proxima }] = await tx<{ proxima: number }[]>`SELECT COALESCE(MAX(ordem), -1) + 1 AS proxima FROM origens`;
    await tx`INSERT INTO origens (id, label, ordem) VALUES (${id}, ${label}, ${proxima})`;
    await registrar(tx, {
      actorUserId: ctx.user.userId, area: null, entidade: `ORIGEM-${id}`, campo: "criacao", de: null, para: label,
      texto: `Criou a origem ${label}`,
    });
    return { ok: true as const };
  });
  if (!r.ok) return deFalha(r);
  return json({ ok: true, id, label }, 201);
}
