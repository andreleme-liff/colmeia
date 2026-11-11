// Funding AWS: cria um registro do tipo da URL (programas, arquetipos, calculadoras,
// estimativas, linhas). Só administração; auditado.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { TIPOS, criar, type Tipo } from "@/lib/funding-db";

export async function POST(req: Request, ctxRoute: RouteContext<"/api/funding/[tipo]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const { tipo } = await ctxRoute.params;
  if (!(TIPOS as readonly string[]).includes(tipo)) return err("Tipo inválido.", 404);
  const body = await lerCorpo(req);
  const sql = await getDb();
  const r = await sql.begin((tx) => criar(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, tipo as Tipo, body));
  if ("erro" in r) return err(r.erro, r.status);
  return json(r);
}
