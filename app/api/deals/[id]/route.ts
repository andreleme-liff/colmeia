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
import { STAGES, STAGE_KEYS, areaOf, brl, stageLabel } from "@/lib/domain";

type Body = {
  direcao?: number;
  conta?: string;
  escopo?: string;
  area?: string;
  estagio?: string;
  valorReais?: number;
  proximoPasso?: string;
  responsavelId?: number | null;
};

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
    }[]
  >`
    SELECT d.id, d.ref, d.conta, d.escopo, d.area, d.estagio, d.valor_centavos, d.proximo_passo,
           d.responsavel_user_id, u.nome AS responsavel
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
    if (!ctx.podeEditar(destino)) return err(`Sem permissão de edição em ${areaOf(destino).label}.`, 403);
    mudancas.push({
      campo: "area",
      de: atual.area,
      para: destino,
      texto: `Moveu ${atual.conta} de ${areaOf(atual.area).label} para ${areaOf(destino).label}`,
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
        de: brl(Number(atual.valor_centavos)),
        para: brl(centavos),
        texto: `Alterou o valor de ${atual.conta} de ${brl(Number(atual.valor_centavos))} para ${brl(centavos)}`,
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
