// Criação de atividade. Exige nível `edit` na área de destino — e a área vem do corpo, então
// é o único lugar onde a permissão é avaliada sobre algo que o cliente escolheu. Por isso a
// checagem acontece antes de qualquer escrita.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { PRIORIDADES, STATUS_KEYS, statusLabel } from "@/lib/domain";

type Body = {
  titulo?: string;
  area?: string;
  status?: string;
  prioridade?: string;
  prazo?: string | null;
  responsavelId?: number | null;
  situacao?: string;
  proximoPasso?: string;
};

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const titulo = String(body.titulo ?? "").trim();
  if (!titulo) return err("A atividade precisa de um título.", 400);
  if (titulo.length > 300) return err("Título longo demais.", 400);

  const area = String(body.area ?? "");
  if (!ctx.areasExistentes.includes(area)) return err("Área inválida.", 400);
  if (!ctx.podeEditar(area)) return err(`Sem permissão de edição em ${ctx.labelArea(area)}.`, 403);

  const status = body.status ?? "backlog";
  if (!STATUS_KEYS.includes(status)) return err("Status inválido.", 400);

  const prioridade = body.prioridade ?? "media";
  if (!(PRIORIDADES as readonly string[]).includes(prioridade)) return err("Prioridade inválida.", 400);

  const prazo = body.prazo && DATA_RE.test(body.prazo) ? body.prazo : null;

  // Mesmos limites da oportunidade: a situação é narrativa e cresce, o próximo passo é curto.
  const situacao = String(body.situacao ?? "").trim().slice(0, 4000);
  const proximoPasso = String(body.proximoPasso ?? "").trim().slice(0, 2000);

  const sql = await getDb();

  let responsavelId: number | null = null;
  if (body.responsavelId != null) {
    const alvo = await sql<{ id: number }[]>`SELECT id FROM users WHERE id = ${body.responsavelId}`;
    if (!alvo.length) return err("Responsável inválido.", 400);
    responsavelId = alvo[0].id;
  }

  // Ref legível vinda de sequence, para não colidir com as semeadas nem correr risco de
  // duas criações simultâneas gerarem o mesmo código.
  const [{ ref }] = await sql<{ ref: string }[]>`SELECT 'A-' || nextval('activities_ref_seq') AS ref`;

  const [nova] = await sql<{ id: number }[]>`
    -- A coluna tipo fica de fora: continua no banco, com default, mas deixou de ser
    -- vocabulário do sistema. Era um rótulo escolhido na criação que ninguém podia
    -- corrigir depois e que não governava nada.
    INSERT INTO activities (ref, titulo, area, status, responsavel_user_id, prazo, prioridade,
                            situacao, proximo_passo)
    VALUES (${ref}, ${titulo}, ${area}, ${status}, ${responsavelId}, ${prazo}, ${prioridade},
            ${situacao}, ${proximoPasso})
    RETURNING id
  `;

  await registrar(sql, {
    actorUserId: ctx.user.userId,
    area,
    entidade: ref,
    campo: "criacao",
    de: null,
    para: statusLabel(status),
    texto: `Criou "${titulo}" em ${ctx.labelArea(area)}`,
  });

  return json({ ok: true, id: nova.id, ref }, 201);
}
