// Organizações (a rota e as tabelas continuam `clientes`): lista e cadastro.
//
// A lista é para todos, com o recorte de sempre: quem não é admin só recebe as organizações
// com oportunidade num produto que enxerga, e sem os dados de cobrança — receita e faturamento
// continuam só da administração. Cadastrar à mão, mesclar e excluir também.

import { getDb } from "@/lib/db";
import { requireAdmin, requireCtx } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { lerCliente } from "@/lib/cliente";
import { criarCliente, lerClientes } from "@/lib/clientes-db";

export async function GET() {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;
  const sql = await getDb();
  if (ctx.isAdmin) {
    return json({ clientes: (await lerClientes(sql)).map((c) => ({ ...c, podeEditar: true })) });
  }
  const clientes = await lerClientes(sql, undefined, ctx.areasVisiveis);
  const editaveis = ctx.areasEditaveis.length
    ? await sql<{ cliente_id: number }[]>`
        SELECT DISTINCT cliente_id FROM deals WHERE cliente_id IS NOT NULL AND area = ANY(${ctx.areasEditaveis}::text[])
      `
    : [];
  const pode = new Set(editaveis.map((e) => e.cliente_id));
  return json({
    clientes: clientes.map((c) => ({
      ...c,
      emailCobranca: "",
      diaVencimento: null,
      formaCobranca: null,
      podeEditar: pode.has(c.id),
    })),
  });
}

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const e = lerCliente(await lerCorpo(req));
  if (typeof e === "string") return err(e, 400);

  const sql = await getDb();
  const r = await sql.begin((tx) => criarCliente(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, e));
  if ("erro" in r) return err(r.erro, r.status);
  return json({ ok: true, id: r.id, ref: r.ref });
}
