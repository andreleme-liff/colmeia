// Cadastros das despesas: altera ou exclui um registro. Só administração; auditado.
// Excluir só vale para o que nunca foi usado: o resto se desativa (ver lib/despesas-db.ts).

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { TIPOS_CADASTRO, excluirCadastro, salvarCadastro, type TipoCadastro } from "@/lib/despesas-db";

type Rota = RouteContext<"/api/despesas/cadastros/[tipo]/[id]">;

async function alvo(ctxRoute: Rota): Promise<{ tipo: TipoCadastro; id: number } | null> {
  const { tipo, id } = await ctxRoute.params;
  if (!(TIPOS_CADASTRO as readonly string[]).includes(tipo)) return null;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? { tipo: tipo as TipoCadastro, id: n } : null;
}

export async function PATCH(req: Request, ctxRoute: Rota) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const a = await alvo(ctxRoute);
  if (!a) return err("Registro inválido.", 404);
  const body = await lerCorpo(req);
  const sql = await getDb();
  const r = await sql.begin((tx) => salvarCadastro(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, a.tipo, a.id, body));
  if ("erro" in r) return err(r.erro, r.status);
  return json(r);
}

export async function DELETE(_req: Request, ctxRoute: Rota) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const a = await alvo(ctxRoute);
  if (!a) return err("Registro inválido.", 404);
  const sql = await getDb();
  const r = await sql.begin((tx) => excluirCadastro(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, a.tipo, a.id));
  if ("erro" in r) return err(r.erro, r.status);
  return json(r);
}
