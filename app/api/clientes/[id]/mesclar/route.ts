// Mescla o cliente da URL em outro (`em`): oportunidades, contratos, contatos e nomes passam
// para o destino, e este cadastro deixa de existir. Só administração.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { mesclarClientes } from "@/lib/clientes-db";

const inteiro = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);

export async function POST(req: Request, ctxRoute: RouteContext<"/api/clientes/[id]/mesclar">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const { id } = await ctxRoute.params;
  const origem = inteiro(Number(id));
  const corpo = await lerCorpo(req);
  const destino = corpo && typeof corpo === "object" ? inteiro((corpo as Record<string, unknown>).em) : null;
  if (origem == null || destino == null) return err("Informe os dois clientes.", 400);

  const sql = await getDb();
  const r = await sql.begin((tx) => mesclarClientes(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, origem, destino));
  if ("erro" in r) return err(r.erro, r.status);
  return json({ ok: true, ref: r.ref });
}
