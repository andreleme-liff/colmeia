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
  tipo?: string;
  status?: string;
  prioridade?: string;
  prazo?: string | null;
  responsavelId?: number | null;
};

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS = ["Comercial", "Operacional", "Produto", "Institucional"];

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

  const tipo = body.tipo ?? "Operacional";
  if (!TIPOS.includes(tipo)) return err("Tipo inválido.", 400);

  const prazo = body.prazo && DATA_RE.test(body.prazo) ? body.prazo : null;

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
    INSERT INTO activities (ref, titulo, area, tipo, status, responsavel_user_id, prazo, prioridade)
    VALUES (${ref}, ${titulo}, ${area}, ${tipo}, ${status}, ${responsavelId}, ${prazo}, ${prioridade})
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
