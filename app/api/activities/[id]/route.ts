// Alteração de uma atividade: área, status, responsável ou prioridade.
// A permissão é sempre reavaliada a partir da ÁREA DO REGISTRO NO BANCO — nunca de algo que
// o cliente tenha mandado junto. Cada campo alterado vira uma linha na auditoria.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { PRIORIDADES, STATUS_KEYS, areaOf, statusLabel } from "@/lib/domain";

type Body = {
  titulo?: string;
  status?: string;
  responsavelId?: number | null;
  prioridade?: string;
  area?: string;
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
    }[]
  >`
    SELECT a.id, a.ref, a.titulo, a.area, a.status, a.prioridade, a.responsavel_user_id, u.nome AS responsavel
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
      return err(`Sem permissão de edição em ${areaOf(destino).label}.`, 403);
    }
    mudancas.push({
      campo: "area",
      de: atual.area,
      para: destino,
      texto: `Moveu de ${areaOf(atual.area).label} para ${areaOf(destino).label}`,
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

  // A área pode ter acabado de mudar; a auditoria fica na de destino, senão o registro da
  // própria mudança sumiria para quem enxerga a área nova.
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
