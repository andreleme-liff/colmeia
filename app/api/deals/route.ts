// Criação de oportunidade no pipeline. Mesma regra da atividade: a área vem do corpo, então
// a permissão é checada antes de qualquer escrita.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { STAGE_KEYS, areaOf, brl, stageLabel } from "@/lib/domain";

type Body = {
  conta?: string;
  escopo?: string;
  area?: string;
  estagio?: string;
  valorReais?: number;
  proximoPasso?: string;
  responsavelId?: number | null;
};

export async function POST(req: Request) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const conta = String(body.conta ?? "").trim();
  if (!conta) return err("A oportunidade precisa de uma conta.", 400);
  if (conta.length > 200) return err("Nome de conta longo demais.", 400);

  const area = String(body.area ?? "");
  if (!ctx.areasExistentes.includes(area)) return err("Área inválida.", 400);
  if (!ctx.podeEditar(area)) return err(`Sem permissão de edição em ${areaOf(area).label}.`, 403);

  const estagio = body.estagio ?? "lead";
  if (!STAGE_KEYS.includes(estagio)) return err("Estágio inválido.", 400);

  const valorReais = Number(body.valorReais ?? 0);
  if (!Number.isFinite(valorReais) || valorReais < 0) return err("Valor inválido.", 400);
  // Guarda em centavos, como o resto do sistema.
  const valorCentavos = Math.round(valorReais * 100);

  const sql = await getDb();

  let responsavelId: number | null = null;
  if (body.responsavelId != null) {
    const alvo = await sql<{ id: number }[]>`SELECT id FROM users WHERE id = ${body.responsavelId}`;
    if (!alvo.length) return err("Responsável inválido.", 400);
    responsavelId = alvo[0].id;
  }

  const [{ ref }] = await sql<{ ref: string }[]>`SELECT 'D-' || nextval('deals_ref_seq') AS ref`;

  const [nova] = await sql<{ id: number }[]>`
    INSERT INTO deals (ref, conta, escopo, area, estagio, valor_centavos, responsavel_user_id, proximo_passo)
    VALUES (${ref}, ${conta}, ${String(body.escopo ?? "").trim()}, ${area}, ${estagio},
            ${valorCentavos}, ${responsavelId}, ${String(body.proximoPasso ?? "").trim()})
    RETURNING id
  `;

  await registrar(sql, {
    actorUserId: ctx.user.userId,
    area,
    entidade: ref,
    campo: "criacao",
    de: null,
    para: stageLabel(estagio),
    texto: `Criou a oportunidade ${conta} (${brl(valorCentavos)}) em ${areaOf(area).label}`,
  });

  return json({ ok: true, id: nova.id, ref }, 201);
}
