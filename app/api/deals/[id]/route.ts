// Alteração e exclusão de uma oportunidade.
//
// A alteração mora em `lib/ops` — a mesma regra que o MCP usa — e tem dois modos:
//  · `{ direcao: 1 | -1 }` — o movimento de uma casa no pipeline, feito pelas setas do card.
//    O cliente manda a direção e o servidor calcula o destino, para não dar para pular
//    etapas mandando um estágio arbitrário.
//  · os demais campos — a edição completa, feita pelo formulário.
//
// A exclusão fica SÓ aqui, fora do núcleo compartilhado: o MCP não exclui nada, e não ter a
// operação ao alcance dele é a forma mais simples de garantir isso.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { deFalha, err, json, lerCorpo } from "@/lib/http";
import { registrar } from "@/lib/log";
import { brlExato } from "@/lib/domain";
import { ehFalha } from "@/lib/ops/comum";
import { atualizarOportunidade } from "@/lib/ops/oportunidades";

/**
 * Exclusão de uma oportunidade. Exige `edit` na área — quem opera o pipeline pode remover um
 * card errado sem depender da administração.
 *
 * O registro some, mas a auditoria fica: o log guarda o texto da entidade, sem chave
 * estrangeira, então a linha da exclusão sobrevive e o histórico anterior continua
 * consultável pela referência. Apagar o rastro junto com o dado esvaziaria o log.
 */
export async function DELETE(_req: Request, ctxRoute: RouteContext<"/api/deals/[id]">) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const dealId = Number(id);
  if (!Number.isInteger(dealId)) return err("Oportunidade inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin(async (tx) => {
    const linhas = await tx<{ ref: string; conta: string; area: string; valor_centavos: string }[]>`
      SELECT ref, conta, area, valor_centavos FROM deals WHERE id = ${dealId} FOR UPDATE
    `;
    if (!linhas.length) return { ok: false as const, erro: "Oportunidade não encontrada.", status: 404 };
    const alvo = linhas[0];

    if (!ctx.podeVer(alvo.area)) return { ok: false as const, erro: "Oportunidade não encontrada.", status: 404 };
    if (!ctx.podeEditar(alvo.area)) return { ok: false as const, erro: "Sem permissão de edição nesta área.", status: 403 };

    // Exclusão e auditoria na mesma transação: não existe registro apagado sem a linha que
    // conta quem apagou.
    await tx`DELETE FROM deals WHERE id = ${dealId}`;
    await registrar(tx, {
      actorUserId: ctx.user.userId,
      area: alvo.area,
      entidade: alvo.ref,
      campo: "exclusao",
      de: alvo.conta,
      para: null,
      texto: `Excluiu a oportunidade ${alvo.conta} (${brlExato(Number(alvo.valor_centavos))})`,
    });
    return { ok: true as const };
  });
  if (ehFalha(r)) return deFalha(r);
  return json({ ok: true });
}

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/deals/[id]">) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const dealId = Number(id);
  if (!Number.isInteger(dealId)) return err("Oportunidade inválida.", 400);

  const body = await lerCorpo(req);
  if (!body) return err("Requisição inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin((tx) =>
    atualizarOportunidade(tx, ctx, dealId, body, { userId: ctx.user.userId, origem: null, concessaoId: null })
  );
  if (ehFalha(r)) return deFalha(r);
  return json({ ok: true, mudancas: r.mudancas });
}
