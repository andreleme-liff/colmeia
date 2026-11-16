// Cadastros das despesas: cria um registro do tipo da URL (categorias, favorecidos,
// recorrencias). Só financeiro e administração; auditado.

import { getDb } from "@/lib/db";
import { requireFinanceiro } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { TIPOS_CADASTRO, salvarCadastro, type TipoCadastro } from "@/lib/despesas-db";

export async function POST(req: Request, ctxRoute: RouteContext<"/api/despesas/cadastros/[tipo]">) {
  const ctx = await requireFinanceiro();
  if (ctx instanceof Response) return ctx;
  const { tipo } = await ctxRoute.params;
  if (!(TIPOS_CADASTRO as readonly string[]).includes(tipo)) return err("Tipo inválido.", 404);
  const body = await lerCorpo(req);
  const sql = await getDb();
  const r = await sql.begin((tx) => salvarCadastro(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, tipo as TipoCadastro, null, body));
  if ("erro" in r) return err(r.erro, r.status);
  return json(r);
}
