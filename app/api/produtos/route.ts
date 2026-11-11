// Cadastro de módulos — o que se vende dentro de um produto ("Regtrack Farma" dentro de
// Regulatório). Restrito a admin, como as áreas: é vocabulário do sistema, não dado
// operacional.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { slugificar } from "@/lib/domain";

type Body = { label?: string; area?: string };

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const label = String(body.label ?? "").trim();
  if (!label) return err("O módulo precisa de um nome.", 400);
  if (label.length > 80) return err("Nome longo demais.", 400);

  const area = String(body.area ?? "");
  if (!ctx.areasExistentes.includes(area)) return err("Produto inválido.", 400);

  const id = slugificar(label);
  if (!id) return err("Nome inválido — use letras ou números.", 400);

  const sql = await getDb();
  const jaExiste = await sql<{ id: string }[]>`SELECT id FROM produtos WHERE id = ${id}`;
  if (jaExiste.length) return err(`Já existe um módulo com esse nome (${id}).`, 409);

  const [{ proxima }] = await sql<{ proxima: number }[]>`
    SELECT COALESCE(MAX(ordem), -1) + 1 AS proxima FROM produtos
  `;
  await sql`INSERT INTO produtos (id, label, area, ordem) VALUES (${id}, ${label}, ${area}, ${proxima})`;

  await registrar(sql, {
    actorUserId: ctx.user.userId,
    area,
    entidade: `PROD-${id}`,
    campo: "criacao",
    de: null,
    para: label,
    texto: `Criou o módulo ${label} em ${ctx.labelArea(area)}`,
  });

  return json({ ok: true, id, label, area }, 201);
}
