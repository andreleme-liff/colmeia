// Auditoria: as últimas linhas do log que a pessoa pode ver. Fica fora de `/api/state` porque
// são até 10.000 linhas, e carregar isso a cada tela pesaria o sistema inteiro; o estado leva
// só as 200 mais recentes (painel, resumo do WhatsApp), e a tela de Auditoria busca as suas.
//
// A regra de visibilidade é a mesma do estado: linha sem área (sistema) ou de área visível.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json } from "@/lib/http";

const LIMITE_AUDITORIA = 10_000;

export async function GET() {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const sql = await getDb();
  const linhas = await sql<
    { id: number; criado_em: Date; autor: string | null; area: string | null; entidade: string; texto: string; via: string | null }[]
  >`
    SELECT l.id, l.criado_em, u.nome AS autor, l.area, l.entidade, l.texto,
           CASE WHEN l.origem = 'mcp' THEN COALESCE(k.client_nome, 'conexão externa') END AS via
    FROM audit_log l
    LEFT JOIN users u ON u.id = l.actor_user_id
    LEFT JOIN oauth_concessoes k ON k.id = l.concessao_id
    WHERE l.area IS NULL OR l.area = ANY(${ctx.areasVisiveis})
    ORDER BY l.criado_em DESC, l.id DESC
    LIMIT ${LIMITE_AUDITORIA}
  `;

  return json({
    limite: LIMITE_AUDITORIA,
    logs: linhas.map((l) => ({
      id: l.id,
      criadoEm: l.criado_em.toISOString(),
      autor: l.autor ?? "sistema",
      via: l.via,
      area: l.area,
      entidade: l.entidade,
      texto: l.texto,
    })),
  });
}
