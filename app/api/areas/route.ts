// Cadastro de novas verticais. O conjunto é aberto — o sistema nasceu com seis, mas nada
// no banco nem na interface depende desse número.
//
// Restrito a admin: criar uma vertical muda o vocabulário do sistema inteiro.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { slugificar } from "@/lib/domain";

type Body = { label?: string; short?: string; cor?: string };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

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
  if (!label) return err("A vertical precisa de um nome.", 400);
  if (label.length > 60) return err("Nome longo demais.", 400);

  const id = slugificar(label);
  if (!id) return err("Nome inválido — use letras ou números.", 400);

  const cor = String(body.cor ?? "").trim();
  if (!HEX_RE.test(cor)) return err("Cor inválida — use HEX de 6 dígitos, como #4B6B9B.", 400);

  const short = (String(body.short ?? "").trim() || label).slice(0, 8).toUpperCase();

  const sql = await getDb();
  const jaExiste = await sql<{ id: string }[]>`SELECT id FROM areas WHERE id = ${id}`;
  if (jaExiste.length) return err(`Já existe uma vertical com esse nome (${id}).`, 409);

  const [{ proxima }] = await sql<{ proxima: number }[]>`
    SELECT COALESCE(MAX(ordem), -1) + 1 AS proxima FROM areas
  `;

  await sql`
    INSERT INTO areas (id, label, short, cor, ordem) VALUES (${id}, ${label}, ${short}, ${cor}, ${proxima})
  `;

  await registrar(sql, {
    actorUserId: ctx.user.userId,
    area: id,
    entidade: `AREA-${id}`,
    campo: "criacao",
    de: null,
    para: label,
    texto: `Criou a vertical ${label} (${short})`,
  });

  return json({ ok: true, id, label, short, cor }, 201);
}
