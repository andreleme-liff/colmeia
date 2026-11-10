// Renomear, mover de área, arquivar ou excluir um produto. Restrito a admin.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { json, err, deFalha, lerCorpo } from "@/lib/http";
import { registrar } from "@/lib/log";
import { ehFalha, falha } from "@/lib/ops/comum";
import { excluirAtividade, excluirOportunidade, lerDestino } from "@/lib/exclusao";


type Body = { label?: string; area?: string; ativo?: boolean };

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/produtos/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const sql = await getDb();
  const atuais = await sql<{ label: string; area: string; ativo: boolean }[]>`
    SELECT label, area, ativo FROM produtos WHERE id = ${id}
  `;
  if (!atuais.length) return err("Módulo / produto não encontrado.", 404);
  const atual = atuais[0];

  const mudancas: { campo: string; de: string; para: string; texto: string }[] = [];

  if (body.label !== undefined && body.label.trim() && body.label.trim() !== atual.label) {
    const label = body.label.trim().slice(0, 80);
    mudancas.push({ campo: "label", de: atual.label, para: label, texto: `Renomeou o módulo / produto ${atual.label} para ${label}` });
    await sql`UPDATE produtos SET label = ${label} WHERE id = ${id}`;
  }

  if (body.area !== undefined && body.area !== atual.area) {
    if (!ctx.areasExistentes.includes(body.area)) return err("Vertical inválida.", 400);
    mudancas.push({
      campo: "area",
      de: atual.area,
      para: body.area,
      texto: `Moveu o módulo / produto ${atual.label} de ${ctx.labelArea(atual.area)} para ${ctx.labelArea(body.area)}`,
    });
    await sql`UPDATE produtos SET area = ${body.area} WHERE id = ${id}`;
  }

  if (body.ativo !== undefined && body.ativo !== atual.ativo) {
    mudancas.push({
      campo: "ativo",
      de: String(atual.ativo),
      para: String(body.ativo),
      texto: `${body.ativo ? "Reativou" : "Arquivou"} o módulo / produto ${atual.label}`,
    });
    await sql`UPDATE produtos SET ativo = ${body.ativo} WHERE id = ${id}`;
  }

  for (const m of mudancas) {
    await registrar(sql, {
      actorUserId: ctx.user.userId,
      area: atual.area,
      entidade: `PROD-${id}`,
      campo: m.campo,
      de: m.de,
      para: m.para,
      texto: m.texto,
    });
  }

  return json({ ok: true, mudancas: mudancas.length });
}

/**
 * Exclusão. Quando há registros ligados, o corpo diz o que fazer com eles:
 *  · `{ acao: "migrar", para }` — atividades e oportunidades passam para outro produto da
 *    mesma área (a regra de que o produto pertence à área do registro continua valendo);
 *  · `{ acao: "excluir" }` — as atividades e as oportunidades ligadas são excluídas junto.
 *    Uma oportunidade com vários módulos também vai — a tela avisa antes;
 *  · `{ acao: "desvincular" }` — os registros ficam, só sem este produto.
 * Sem registro ligado, o corpo é dispensável. Tudo numa transação: ou o produto sai com o
 * destino de cada registro resolvido e auditado, ou nada muda.
 */
export async function DELETE(req: Request, ctxRoute: RouteContext<"/api/produtos/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const destino = lerDestino(await lerCorpo(req));
  const sql = await getDb();
  const autor = ctx.user.userId;

  const r = await sql.begin(async (tx) => {
    const alvos = await tx<{ label: string; area: string }[]>`SELECT label, area FROM produtos WHERE id = ${id} FOR UPDATE`;
    if (!alvos.length) return falha("Módulo / produto não encontrado.", 404);
    const alvo = alvos[0];
    const motivo = `ao excluir o módulo / produto ${alvo.label}`;

    const atividades = await tx<{ id: number; ref: string; titulo: string; area: string }[]>`
      SELECT id, ref, titulo, area FROM activities WHERE produto_id = ${id} FOR UPDATE
    `;
    const oportunidades = await tx<{ id: number; ref: string; conta: string; area: string; valor_centavos: string }[]>`
      SELECT d.id, d.ref, d.conta, d.area, d.valor_centavos
      FROM deals d JOIN oportunidade_modulos m ON m.deal_id = d.id AND m.produto_id = ${id}
      FOR UPDATE OF d
    `;
    const ligados = atividades.length + oportunidades.length;
    if (ligados && !destino) {
      return falha(`Há ${ligados} registro(s) ligados a ${alvo.label}: escolha migrar, excluir junto ou desvincular.`, 409);
    }

    if (ligados && destino?.acao === "migrar") {
      const para = String(destino.para);
      const novos = await tx<{ label: string; area: string }[]>`SELECT label, area FROM produtos WHERE id = ${para}`;
      if (!novos.length || para === id) return falha("Módulo / produto de destino inválido.", 400);
      if (novos[0].area !== alvo.area) return falha("O módulo / produto de destino precisa ser da mesma vertical.", 400);
      const novo = novos[0];
      for (const a of atividades) {
        await tx`UPDATE activities SET produto_id = ${para}, atualizado_em = now() WHERE id = ${a.id}`;
        await registrar(tx, {
          actorUserId: autor, area: a.area, entidade: a.ref, campo: "produto", de: alvo.label, para: novo.label,
          texto: `Módulo / produto de "${a.titulo}" passou de ${alvo.label} para ${novo.label} ${motivo}`,
        });
      }
      for (const o of oportunidades) {
        await tx`
          INSERT INTO oportunidade_modulos (deal_id, produto_id) VALUES (${o.id}, ${para}) ON CONFLICT DO NOTHING
        `;
        await tx`UPDATE deals SET atualizado_em = now() WHERE id = ${o.id}`;
        await registrar(tx, {
          actorUserId: autor, area: o.area, entidade: o.ref, campo: "modulos", de: alvo.label, para: novo.label,
          texto: `Módulo / produto de ${o.conta} passou de ${alvo.label} para ${novo.label} ${motivo}`,
        });
      }
      // Campo legado (produto único da oportunidade, fora da interface): acompanha a troca.
      await tx`UPDATE deals SET produto_id = ${para} WHERE produto_id = ${id}`;
    } else if (ligados && destino?.acao === "excluir") {
      for (const a of atividades) await excluirAtividade(tx, a, autor, motivo);
      for (const o of oportunidades) await excluirOportunidade(tx, o, autor, motivo);
    } else if (ligados) {
      for (const a of atividades) {
        await registrar(tx, {
          actorUserId: autor, area: a.area, entidade: a.ref, campo: "produto", de: alvo.label, para: "—",
          texto: `"${a.titulo}" ficou sem módulo / produto ${motivo}`,
        });
      }
      for (const o of oportunidades) {
        await registrar(tx, {
          actorUserId: autor, area: o.area, entidade: o.ref, campo: "modulos", de: alvo.label, para: "—",
          texto: `${o.conta} perdeu o módulo / produto ${alvo.label} ${motivo}`,
        });
      }
    }

    // As chaves estrangeiras fazem o resto: atividade fica sem produto (SET NULL) e o módulo
    // sai da oportunidade (CASCADE) — só sobra alguma coisa no caso "desvincular".
    await tx`DELETE FROM produtos WHERE id = ${id}`;
    const resumo =
      !ligados ? "" : destino?.acao === "migrar" ? `; ${ligados} registro(s) migrados` :
      destino?.acao === "excluir" ? `; ${ligados} registro(s) excluídos junto` : `; ${ligados} registro(s) desvinculados`;
    await registrar(tx, {
      actorUserId: autor, area: alvo.area, entidade: `PROD-${id}`, campo: "exclusao", de: alvo.label, para: null,
      texto: `Excluiu o módulo / produto ${alvo.label}${resumo}`,
    });
    return { ok: true as const, ligados };
  });
  if (ehFalha(r)) return deFalha(r);
  return json(r);
}
