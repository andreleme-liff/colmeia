// Alteração de uma atividade: área, status, responsável ou prioridade.
// A permissão é sempre reavaliada a partir da ÁREA DO REGISTRO NO BANCO — nunca de algo que
// o cliente tenha mandado junto. Cada campo alterado vira uma linha na auditoria.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { PRIORIDADES, STATUS_KEYS, statusLabel } from "@/lib/domain";

type Body = {
  titulo?: string;
  status?: string;
  responsavelId?: number | null;
  prioridade?: string;
  area?: string;
  situacao?: string;
  proximoPasso?: string;
  produtoId?: string | null;
};

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/activities/[id]">) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const activityId = Number(id);
  if (!Number.isInteger(activityId)) return err("Atividade inválida.", 400);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const sql = await getDb();
  const linhas = await sql<
    {
      id: number; ref: string; titulo: string; area: string; status: string;
      prioridade: string; responsavel_user_id: number | null; responsavel: string | null;
      situacao: string; proximo_passo: string; produto_id: string | null;
    }[]
  >`
    SELECT a.id, a.ref, a.titulo, a.area, a.status, a.prioridade, a.responsavel_user_id,
           a.situacao, a.proximo_passo, a.produto_id, u.nome AS responsavel
    FROM activities a LEFT JOIN users u ON u.id = a.responsavel_user_id
    WHERE a.id = ${activityId}
  `;
  if (!linhas.length) return err("Atividade não encontrada.", 404);
  const atual = linhas[0];

  // 404 e não 403: quem não enxerga a área não deve nem saber que o registro existe.
  if (!ctx.podeVer(atual.area)) return err("Atividade não encontrada.", 404);
  if (!ctx.podeEditar(atual.area)) return err("Sem permissão de edição nesta área.", 403);

  const mudancas: { campo: string; de: string; para: string; texto: string }[] = [];

  // Mudar de área exige permissão nas DUAS pontas: tirar da origem e colocar no destino.
  // Só a origem deixaria alguém empurrar trabalho para uma área que não administra; só o
  // destino deixaria tirar trabalho de uma área alheia.
  if (body.area !== undefined && body.area !== atual.area) {
    const destino = body.area;
    if (!ctx.areasExistentes.includes(destino)) return err("Área inválida.", 400);
    if (!ctx.podeEditar(destino)) {
      return err(`Sem permissão de edição em ${ctx.labelArea(destino)}.`, 403);
    }
    mudancas.push({
      campo: "area",
      de: atual.area,
      para: destino,
      texto: `Moveu de ${ctx.labelArea(atual.area)} para ${ctx.labelArea(destino)}`,
    });
    await sql`UPDATE activities SET area = ${destino}, atualizado_em = now() WHERE id = ${activityId}`;
  }

  if (body.titulo !== undefined) {
    const titulo = String(body.titulo).trim();
    if (!titulo) return err("A atividade precisa de um título.", 400);
    if (titulo.length > 300) return err("Título longo demais.", 400);
    if (titulo !== atual.titulo) {
      mudancas.push({
        campo: "titulo",
        de: atual.titulo,
        para: titulo,
        texto: `Renomeou a atividade para "${titulo}"`,
      });
      await sql`UPDATE activities SET titulo = ${titulo}, atualizado_em = now() WHERE id = ${activityId}`;
    }
  }

  if (body.status !== undefined && body.status !== atual.status) {
    if (!STATUS_KEYS.includes(body.status)) return err("Status inválido.", 400);
    mudancas.push({
      campo: "status",
      de: atual.status,
      para: body.status,
      texto: `Alterou status de ${statusLabel(atual.status)} para ${statusLabel(body.status)}`,
    });
    await sql`UPDATE activities SET status = ${body.status}, atualizado_em = now() WHERE id = ${activityId}`;
  }

  if (body.prioridade !== undefined && body.prioridade !== atual.prioridade) {
    if (!(PRIORIDADES as readonly string[]).includes(body.prioridade)) return err("Prioridade inválida.", 400);
    mudancas.push({
      campo: "prioridade",
      de: atual.prioridade,
      para: body.prioridade,
      texto: `Alterou prioridade de ${atual.prioridade} para ${body.prioridade}`,
    });
    await sql`UPDATE activities SET prioridade = ${body.prioridade}, atualizado_em = now() WHERE id = ${activityId}`;
  }

  // Texto livre: o log guarda o par anterior/novo, então o que estava escrito antes nunca se
  // perde ao ser sobrescrito — é o mesmo tratamento que a oportunidade recebe.
  const TEXTOS: { chave: "situacao" | "proximoPasso"; coluna: string; atual: string; rotulo: string; max: number }[] = [
    { chave: "situacao", coluna: "situacao", atual: atual.situacao, rotulo: "a situação", max: 4000 },
    { chave: "proximoPasso", coluna: "proximo_passo", atual: atual.proximo_passo, rotulo: "o próximo passo", max: 2000 },
  ];
  for (const t of TEXTOS) {
    const bruto = body[t.chave];
    if (bruto === undefined) continue;
    const valor = String(bruto).trim().slice(0, t.max);
    if (valor === t.atual) continue;
    mudancas.push({
      campo: t.coluna,
      de: t.atual || "—",
      para: valor || "—",
      texto: `Alterou ${t.rotulo} de "${atual.titulo}"`,
    });
    await sql.unsafe(`UPDATE activities SET ${t.coluna} = $1, atualizado_em = now() WHERE id = $2`, [
      valor,
      activityId,
    ]);
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
      texto: `Alterou responsável de ${atual.responsavel ?? "—"} para ${nomeNovo}`,
    });
    await sql`
      UPDATE activities SET responsavel_user_id = ${body.responsavelId}, atualizado_em = now()
      WHERE id = ${activityId}
    `;
  }

  const areaFinal = mudancas.find((m) => m.campo === "area")?.para ?? atual.area;

  /**
   * Produto e área andam juntos: o produto pertence a uma vertical. Duas situações,
   * resolvidas na mesma passagem porque uma requisição pode trazer as duas.
   *
   *  · Produto informado — tem de existir na área FINAL, que pode ter mudado agora mesmo.
   *  · Produto NÃO informado, mas a área mudou — o produto que estava lá pode ter ficado
   *    órfão. Nesse caso ele cai, com registro. Sem isto o card ficaria classificado com um
   *    produto de outra vertical, que nenhuma tela ofereceria de volta.
   */
  if (body.produtoId !== undefined) {
    let novo: string | null = null;
    if (body.produtoId) {
      const prod = await sql<{ id: string }[]>`
        SELECT id FROM produtos WHERE id = ${body.produtoId} AND area = ${areaFinal}
      `;
      if (!prod.length) return err("Produto inválido para esta área.", 400);
      novo = prod[0].id;
    }
    if (novo !== atual.produto_id) {
      mudancas.push({
        campo: "produto",
        de: atual.produto_id ?? "—",
        para: novo ?? "—",
        texto: `Alterou o produto de "${atual.titulo}"`,
      });
      await sql`UPDATE activities SET produto_id = ${novo}, atualizado_em = now() WHERE id = ${activityId}`;
    }
  } else if (areaFinal !== atual.area && atual.produto_id) {
    const aindaVale = await sql<{ id: string }[]>`
      SELECT id FROM produtos WHERE id = ${atual.produto_id} AND area = ${areaFinal}
    `;
    if (!aindaVale.length) {
      mudancas.push({
        campo: "produto",
        de: atual.produto_id,
        para: "—",
        texto: `Removeu o produto de "${atual.titulo}" — não pertence a ${ctx.labelArea(areaFinal)}`,
      });
      await sql`UPDATE activities SET produto_id = NULL, atualizado_em = now() WHERE id = ${activityId}`;
    }
  }

  // A auditoria fica na área de destino, senão o registro da própria mudança sumiria para
  // quem enxerga a área nova.
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
