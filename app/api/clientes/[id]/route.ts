// Uma organização: histórico (GET) e alteração (PATCH) para quem a enxerga e edita pelo
// produto; exclusão (DELETE) só da administração.
// A alteração substitui o cadastro inteiro, como o formulário; o changelog guarda cada campo.

import { getDb } from "@/lib/db";
import { requireAdmin, requireCtx } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { lerCliente } from "@/lib/cliente";
import { atualizarCliente, excluirCliente, historicoDoCliente, lerClientes } from "@/lib/clientes-db";

async function idDe(ctxRoute: RouteContext<"/api/clientes/[id]">): Promise<number | null> {
  const { id } = await ctxRoute.params;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: Request, ctxRoute: RouteContext<"/api/clientes/[id]">) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;
  const id = await idDe(ctxRoute);
  if (id == null) return err("Organização inválida.", 400);
  const sql = await getDb();
  // Quem não é admin só vê organização com oportunidade num produto que enxerga; fora disso
  // é 404, como todo registro invisível.
  const areas = ctx.isAdmin ? undefined : ctx.areasVisiveis;
  const [existe] = await lerClientes(sql, id, areas);
  if (!existe) return err("Organização não encontrada.", 404);
  return json({ eventos: await historicoDoCliente(sql, id, areas) });
}

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/clientes/[id]">) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;
  const id = await idDe(ctxRoute);
  if (id == null) return err("Organização inválida.", 400);
  const e = lerCliente(await lerCorpo(req));
  if (typeof e === "string") return err(e, 400);

  const sql = await getDb();
  if (!ctx.isAdmin) {
    // Edita o cadastro quem edita algum produto em que a organização tem oportunidade.
    const [atual] = await lerClientes(sql, id, ctx.areasVisiveis);
    if (!atual) return err("Organização não encontrada.", 404);
    const [edita] = ctx.areasEditaveis.length
      ? await sql<{ id: number }[]>`
          SELECT c.id FROM clientes c
          WHERE c.id = ${id}
            AND (EXISTS (SELECT 1 FROM deals d WHERE d.cliente_id = c.id AND d.area = ANY(${ctx.areasEditaveis}::text[]))
                 OR NOT EXISTS (SELECT 1 FROM deals d WHERE d.cliente_id = c.id))
        `
      : [];
    if (!edita) return err("Sem permissão de edição nesta organização.", 403);
    // Cobrança é da administração: o que vier no corpo é ignorado e fica o que já estava.
    e.emailCobranca = atual.emailCobranca;
    e.diaVencimento = atual.diaVencimento;
    e.formaCobranca = atual.formaCobranca;
  }
  const r = await sql.begin((tx) => atualizarCliente(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, id, e));
  if ("erro" in r) return err(r.erro, r.status);
  return json({ ok: true, mudancas: r.mudancas });
}

export async function DELETE(_req: Request, ctxRoute: RouteContext<"/api/clientes/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const id = await idDe(ctxRoute);
  if (id == null) return err("Organização inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin((tx) => excluirCliente(tx, { userId: ctx.user.userId, origem: null, concessaoId: null }, id));
  if ("erro" in r) return err(r.erro, r.status);
  return json({ ok: true });
}
