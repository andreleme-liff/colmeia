// Criação de oportunidade no pipeline. A regra (incluindo a permissão sobre a área, que aqui
// vem do corpo) mora em `lib/ops` — a mesma que o MCP usa.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { deFalha, err, json, lerCorpo } from "@/lib/http";
import { ehFalha } from "@/lib/ops/comum";
import { criarOportunidade } from "@/lib/ops/oportunidades";

export async function POST(req: Request) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const body = await lerCorpo(req);
  if (!body) return err("Requisição inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin((tx) =>
    criarOportunidade(tx, ctx, body, { userId: ctx.user.userId, origem: null, concessaoId: null })
  );
  if (ehFalha(r)) return deFalha(r);
  return json({ ok: true, id: r.id, ref: r.ref }, 201);
}
