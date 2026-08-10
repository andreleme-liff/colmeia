// Alteração de uma atividade: status, responsável ou prioridade.
// A permissão é sempre reavaliada a partir da ÁREA DO REGISTRO NO BANCO — nunca de algo que
// o cliente tenha mandado junto. Cada campo alterado vira uma linha na auditoria.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { PRIORIDADES, STATUS_KEYS, statusLabel } from "@/lib/domain";

type Body = {
  status?: string;
  responsavelId?: number | null;
  prioridade?: string;
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

  for (const m of mudancas) {
    await registrar(sql, {
      actorUserId: ctx.user.userId,
      area: atual.area,
      entidade: atual.ref,
      campo: m.campo,
      de: m.de,
      para: m.para,
      texto: m.texto,
    });
  }

  return json({ ok: true, mudancas: mudancas.length });
}
