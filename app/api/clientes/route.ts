// Organizações (a rota e as tabelas continuam `clientes`): lista e cadastro.
//
// A lista é para todos, com o recorte de sempre: quem não é admin só recebe as organizações
// com oportunidade num produto que enxerga (e as sem oportunidade nenhuma), sem os dados de
// cobrança — receita e faturamento continuam só da administração, assim como mesclar e excluir.
// Cadastrar pode quem edita algum produto: a organização é o dado mestre, e a oportunidade é
// que aponta para ela.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
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
  // Edita quem edita algum produto em que a organização tem oportunidade; a que não tem
  // oportunidade nenhuma, qualquer pessoa que edite algum produto.
  const editaveis = ctx.areasEditaveis.length
    ? await sql<{ id: number }[]>`
        SELECT c.id FROM clientes c
        WHERE EXISTS (SELECT 1 FROM deals d WHERE d.cliente_id = c.id AND d.area = ANY(${ctx.areasEditaveis}::text[]))
           OR NOT EXISTS (SELECT 1 FROM deals d WHERE d.cliente_id = c.id)
      `
    : [];
  const pode = new Set(editaveis.map((e) => e.id));
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
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;
  // O cadastro é a origem do dado: organização existe antes (e independente) de oportunidade.
  // Cadastra quem edita algum produto; leitura pura não cadastra.
  if (!ctx.isAdmin && ctx.areasEditaveis.length === 0) return err("Sem permissão para cadastrar organizações.", 403);
  const e = lerCliente(await lerCorpo(req));
  if (typeof e === "string") return err(e, 400);
  if (!ctx.isAdmin) {
    // Cobrança é da administração.
    e.emailCobranca = "";
    e.diaVencimento = null;
    e.formaCobranca = null;
  }

  const sql = await getDb();
  const r = await sql.begin((tx) => criarCliente(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, e));
  if ("erro" in r) return err(r.erro, r.status);
  return json({ ok: true, id: r.id, ref: r.ref });
}
