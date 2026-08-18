// Alteração de uma oportunidade. Dois modos:
//
//  · `{ direcao: 1 | -1 }` — o movimento de uma casa no pipeline, feito pelas setas do card.
//    O cliente manda a direção e o servidor calcula o destino, para não dar para pular
//    etapas mandando um estágio arbitrário.
//  · os demais campos — a edição completa, feita pelo formulário.
//
// A permissão é sempre reavaliada a partir da área do registro NO BANCO, nunca do que veio
// no corpo.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { STAGES, STAGE_KEYS, brlExato, stageLabel } from "@/lib/domain";

type Body = {
  direcao?: number;
  conta?: string;
  escopo?: string;
  area?: string;
  estagio?: string;
  valorReais?: number;
  proximoPasso?: string;
  proximoPassoEm?: string | null;
  responsavelId?: number | null;
  situacao?: string;
  contato?: string;
  responsavelTexto?: string;
  produtoId?: string | null;
  pausado?: boolean;
};

/**
 * Exclusão de uma oportunidade. Exige `edit` na área — quem opera o pipeline pode remover um
 * card errado sem depender da administração.
 *
 * O registro some, mas a auditoria fica: o log guarda o texto da entidade, sem chave
 * estrangeira, então a linha da exclusão sobrevive e o histórico anterior continua
 * consultável pela referência. Apagar o rastro junto com o dado esvaziaria o log.
 */
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function DELETE(_req: Request, ctxRoute: RouteContext<"/api/deals/[id]">) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const dealId = Number(id);
  if (!Number.isInteger(dealId)) return err("Oportunidade inválida.", 400);

  const sql = await getDb();
  const linhas = await sql<{ ref: string; conta: string; area: string; valor_centavos: string }[]>`
    SELECT ref, conta, area, valor_centavos FROM deals WHERE id = ${dealId}
  `;
  if (!linhas.length) return err("Oportunidade não encontrada.", 404);
  const alvo = linhas[0];

  if (!ctx.podeVer(alvo.area)) return err("Oportunidade não encontrada.", 404);
  if (!ctx.podeEditar(alvo.area)) return err("Sem permissão de edição nesta área.", 403);

  await sql`DELETE FROM deals WHERE id = ${dealId}`;
  await registrar(sql, {
    actorUserId: ctx.user.userId,
    area: alvo.area,
    entidade: alvo.ref,
    campo: "exclusao",
    de: alvo.conta,
    para: null,
    texto: `Excluiu a oportunidade ${alvo.conta} (${brlExato(Number(alvo.valor_centavos))})`,
  });

  return json({ ok: true });
}

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/deals/[id]">) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const dealId = Number(id);
  if (!Number.isInteger(dealId)) return err("Oportunidade inválida.", 400);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const sql = await getDb();
  const linhas = await sql<
    {
      id: number; ref: string; conta: string; escopo: string; area: string; estagio: string;
      valor_centavos: string; proximo_passo: string; responsavel_user_id: number | null; responsavel: string | null;
      situacao: string; contato: string; responsavel_texto: string; produto_id: string | null;
      pausado: boolean; proximo_passo_em: Date | null;
    }[]
  >`
    SELECT d.id, d.ref, d.conta, d.escopo, d.area, d.estagio, d.valor_centavos, d.proximo_passo,
           d.responsavel_user_id, u.nome AS responsavel,
           d.situacao, d.contato, d.responsavel_texto, d.produto_id, d.pausado, d.proximo_passo_em
    FROM deals d LEFT JOIN users u ON u.id = d.responsavel_user_id
    WHERE d.id = ${dealId}
  `;
  if (!linhas.length) return err("Oportunidade não encontrada.", 404);
  const atual = linhas[0];

  // 404 e não 403: quem não enxerga a área não deve nem saber que o registro existe.
  if (!ctx.podeVer(atual.area)) return err("Oportunidade não encontrada.", 404);
  if (!ctx.podeEditar(atual.area)) return err("Sem permissão de edição nesta área.", 403);

  const mudancas: { campo: string; de: string; para: string; texto: string }[] = [];

  // ---- movimento pelas setas do card ----
  if (body.direcao !== undefined) {
    const direcao = Number(body.direcao);
    if (direcao !== 1 && direcao !== -1) return err("Direção inválida.", 400);

    const i = STAGES.findIndex((s) => s.key === atual.estagio);
    const j = Math.max(0, Math.min(STAGES.length - 1, i + direcao));
    if (i === j) return json({ ok: true, mudancas: 0 });

    await sql`UPDATE deals SET estagio = ${STAGES[j].key}, atualizado_em = now() WHERE id = ${dealId}`;
    await registrar(sql, {
      actorUserId: ctx.user.userId,
      area: atual.area,
      entidade: atual.ref,
      campo: "estagio",
      de: STAGES[i].key,
      para: STAGES[j].key,
      texto: `Moveu ${atual.conta} de ${STAGES[i].label} para ${STAGES[j].label}`,
    });
    return json({ ok: true, mudancas: 1 });
  }

  // ---- edição completa ----

  // Trocar de área exige permissão nas duas pontas: tirar da origem e colocar no destino.
  if (body.area !== undefined && body.area !== atual.area) {
    const destino = body.area;
    if (!ctx.areasExistentes.includes(destino)) return err("Área inválida.", 400);
    if (!ctx.podeEditar(destino)) return err(`Sem permissão de edição em ${ctx.labelArea(destino)}.`, 403);
    mudancas.push({
      campo: "area",
      de: atual.area,
      para: destino,
      texto: `Moveu ${atual.conta} de ${ctx.labelArea(atual.area)} para ${ctx.labelArea(destino)}`,
    });
    await sql`UPDATE deals SET area = ${destino}, atualizado_em = now() WHERE id = ${dealId}`;
  }

  if (body.conta !== undefined) {
    const conta = String(body.conta).trim();
    if (!conta) return err("A oportunidade precisa de uma conta.", 400);
    if (conta.length > 200) return err("Nome de conta longo demais.", 400);
    if (conta !== atual.conta) {
      mudancas.push({
        campo: "conta",
        de: atual.conta,
        para: conta,
        texto: `Renomeou a conta de ${atual.conta} para ${conta}`,
      });
      await sql`UPDATE deals SET conta = ${conta}, atualizado_em = now() WHERE id = ${dealId}`;
    }
  }

  if (body.escopo !== undefined) {
    const escopo = String(body.escopo).trim().slice(0, 300);
    if (escopo !== atual.escopo) {
      mudancas.push({
        campo: "escopo",
        de: atual.escopo || "—",
        para: escopo || "—",
        texto: `Alterou o escopo de ${atual.conta}`,
      });
      await sql`UPDATE deals SET escopo = ${escopo}, atualizado_em = now() WHERE id = ${dealId}`;
    }
  }

  if (body.estagio !== undefined && body.estagio !== atual.estagio) {
    if (!STAGE_KEYS.includes(body.estagio)) return err("Estágio inválido.", 400);
    mudancas.push({
      campo: "estagio",
      de: atual.estagio,
      para: body.estagio,
      texto: `Moveu ${atual.conta} de ${stageLabel(atual.estagio)} para ${stageLabel(body.estagio)}`,
    });
    await sql`UPDATE deals SET estagio = ${body.estagio}, atualizado_em = now() WHERE id = ${dealId}`;
  }

  if (body.valorReais !== undefined) {
    const valorReais = Number(body.valorReais);
    if (!Number.isFinite(valorReais) || valorReais < 0) return err("Valor inválido.", 400);
    const centavos = Math.round(valorReais * 100);
    if (centavos !== Number(atual.valor_centavos)) {
      mudancas.push({
        campo: "valor",
        de: brlExato(Number(atual.valor_centavos)),
        para: brlExato(centavos),
        texto: `Alterou o valor de ${atual.conta} de ${brlExato(Number(atual.valor_centavos))} para ${brlExato(centavos)}`,
      });
      await sql`UPDATE deals SET valor_centavos = ${centavos}, atualizado_em = now() WHERE id = ${dealId}`;
    }
  }

  if (body.proximoPasso !== undefined) {
    const proximo = String(body.proximoPasso).trim().slice(0, 200);
    if (proximo !== atual.proximo_passo) {
      mudancas.push({
        campo: "proximo_passo",
        de: atual.proximo_passo || "—",
        para: proximo || "—",
        texto: `Próximo passo de ${atual.conta}: ${proximo || "—"}`,
      });
      await sql`UPDATE deals SET proximo_passo = ${proximo}, atualizado_em = now() WHERE id = ${dealId}`;
    }
  }

  // Campos de texto livre: mesmo tratamento para todos, e o log guarda o par anterior/novo.
  const TEXTOS: { chave: keyof Body; coluna: string; campo: string; atual: string; rotulo: string; max: number }[] = [
    { chave: "situacao", coluna: "situacao", campo: "situacao", atual: atual.situacao, rotulo: "a situação", max: 4000 },
    { chave: "contato", coluna: "contato", campo: "contato", atual: atual.contato, rotulo: "o contato", max: 300 },
    {
      chave: "responsavelTexto", coluna: "responsavel_texto", campo: "responsavel_texto",
      atual: atual.responsavel_texto, rotulo: "o responsável (texto)", max: 200,
    },
  ];
  for (const t of TEXTOS) {
    const bruto = body[t.chave];
    if (bruto === undefined) continue;
    const valor = String(bruto).trim().slice(0, t.max);
    if (valor === t.atual) continue;
    mudancas.push({
      campo: t.campo,
      de: t.atual || "—",
      para: valor || "—",
      texto: `Alterou ${t.rotulo} de ${atual.conta}`,
    });
    await sql.unsafe(`UPDATE deals SET ${t.coluna} = $1, atualizado_em = now() WHERE id = $2`, [valor, dealId]);
  }


  // Data do próximo passo. `null` explícito limpa a data — é assim que se tira um item do
  // cronograma sem apagar o texto do passo.
  if (body.proximoPassoEm !== undefined) {
    const nova = body.proximoPassoEm && DATA_RE.test(body.proximoPassoEm) ? body.proximoPassoEm : null;
    const antiga = atual.proximo_passo_em ? atual.proximo_passo_em.toISOString().slice(0, 10) : null;
    if (nova !== antiga) {
      mudancas.push({
        campo: "proximo_passo_em",
        de: antiga ?? "—",
        para: nova ?? "—",
        texto: `Alterou a data do próximo passo de ${atual.conta}`,
      });
      await sql`UPDATE deals SET proximo_passo_em = ${nova}, atualizado_em = now() WHERE id = ${dealId}`;
    }
  }

  if (body.produtoId !== undefined && body.produtoId !== atual.produto_id) {
    let novo: string | null = null;
    if (body.produtoId) {
      // Contra a área FINAL, que pode ter acabado de mudar nesta mesma requisição.
      const areaAlvo = mudancas.find((m) => m.campo === "area")?.para ?? atual.area;
      const prod = await sql<{ label: string }[]>`
        SELECT label FROM produtos WHERE id = ${body.produtoId} AND area = ${areaAlvo}
      `;
      if (!prod.length) return err("Produto inválido para esta área.", 400);
      novo = body.produtoId;
    }
    mudancas.push({
      campo: "produto",
      de: atual.produto_id ?? "—",
      para: novo ?? "—",
      texto: `Alterou o produto de ${atual.conta}`,
    });
    await sql`UPDATE deals SET produto_id = ${novo}, atualizado_em = now() WHERE id = ${dealId}`;
  } else if (atual.produto_id) {
    // Mudar SÓ a área deixava o produto da vertical antiga preso ao card: nenhuma tela
    // oferecia aquele produto de volta, e a classificação virava mentira silenciosa.
    const areaFinal = mudancas.find((m) => m.campo === "area")?.para ?? atual.area;
    if (areaFinal !== atual.area) {
      const aindaVale = await sql<{ id: string }[]>`
        SELECT id FROM produtos WHERE id = ${atual.produto_id} AND area = ${areaFinal}
      `;
      if (!aindaVale.length) {
        mudancas.push({
          campo: "produto",
          de: atual.produto_id,
          para: "—",
          texto: `Removeu o produto de ${atual.conta} — não pertence a ${ctx.labelArea(areaFinal)}`,
        });
        await sql`UPDATE deals SET produto_id = NULL, atualizado_em = now() WHERE id = ${dealId}`;
      }
    }
  }

  if (body.pausado !== undefined && body.pausado !== atual.pausado) {
    mudancas.push({
      campo: "pausado",
      de: String(atual.pausado),
      para: String(body.pausado),
      texto: `${body.pausado ? "Pausou" : "Retomou"} ${atual.conta}`,
    });
    await sql`UPDATE deals SET pausado = ${body.pausado}, atualizado_em = now() WHERE id = ${dealId}`;
  }

  if (body.responsavelId !== undefined && body.responsavelId !== atual.responsavel_user_id) {
    let nomeNovo = "—";
    if (body.responsavelId !== null) {
      const alvo = await sql<{ nome: string }[]>`SELECT nome FROM users WHERE id = ${body.responsavelId}`;
      if (!alvo.length) return err("Responsável inválido.", 400);
      nomeNovo = alvo[0].nome;
    }
    mudancas.push({
      campo: "responsavel",
      de: atual.responsavel ?? "—",
      para: nomeNovo,
      texto: `Alterou o responsável de ${atual.conta} de ${atual.responsavel ?? "—"} para ${nomeNovo}`,
    });
    await sql`
      UPDATE deals SET responsavel_user_id = ${body.responsavelId}, atualizado_em = now() WHERE id = ${dealId}
    `;
  }

  // A área do registro pode ter acabado de mudar; a auditoria fica na área de destino.
  const areaFinal = mudancas.find((m) => m.campo === "area")?.para ?? atual.area;
  for (const m of mudancas) {
    await registrar(sql, {
      actorUserId: ctx.user.userId,
      area: areaFinal,
      entidade: atual.ref,
      campo: m.campo,
      de: m.de,
      para: m.para,
      texto: m.texto,
    });
  }

  return json({ ok: true, mudancas: mudancas.length });
}
