// Histórico completo de um registro — quem, quando, qual campo e o par anterior/novo.
//
// Rota própria em vez de vir no /api/state porque lá o log é truncado (as 200 alterações
// mais recentes do escopo inteiro): o histórico de um card precisa vir completo, e ninguém
// carrega o de todos os cards de uma vez.
//
// A permissão é a mesma do registro: quem não enxerga a área não vê o histórico, e recebe
// 404 — um 403 já confirmaria que aquela referência existe.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { refCanonica } from "@/lib/domain";
import { json, err } from "@/lib/http";

export type EntradaHistorico = {
  id: number;
  criadoEm: string;
  autor: string;
  campo: string | null;
  de: string | null;
  para: string | null;
  texto: string;
};

export async function GET(_req: Request, ctxRoute: RouteContext<"/api/logs/[entidade]">) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const { entidade } = await ctxRoute.params;
  // Aceita a referência antiga (D-104) e a sem zeros: o histórico é o mesmo registro.
  const ref = refCanonica(decodeURIComponent(entidade));
  if (!ref) return err("Registro não encontrado.", 404);

  const sql = await getDb();

  // A referência precisa ser de um registro que existe E que a pessoa enxerga. Sem esta
  // checagem, qualquer um leria o histórico de qualquer área só sabendo a referência.
  const [dono] = await sql<{ area: string; ref_antiga: string | null }[]>`
    SELECT area, ref_antiga FROM activities WHERE ref = ${ref}
    UNION ALL
    SELECT area, ref_antiga FROM deals WHERE ref = ${ref}
    LIMIT 1
  `;
  if (!dono || !ctx.podeVer(dono.area)) return err("Registro não encontrado.", 404);

  const linhas = await sql<
    {
      id: number; criado_em: Date; autor: string | null; campo: string | null;
      valor_anterior: string | null; valor_novo: string | null; texto: string; via: string | null;
    }[]
  >`
    SELECT l.id, l.criado_em, u.nome AS autor, l.campo, l.valor_anterior, l.valor_novo, l.texto,
           -- Escrita feita por uma conexão externa (MCP): o nome do aplicativo, para a tela
           -- mostrar "via Claude" ao lado do autor.
           CASE WHEN l.origem = 'mcp' THEN COALESCE(k.client_nome, 'conexão externa') END AS via
    FROM audit_log l
    LEFT JOIN users u ON u.id = l.actor_user_id
    LEFT JOIN oauth_concessoes k ON k.id = l.concessao_id
    -- O audit_log guarda a referência que valia quando cada linha foi escrita: o que é de
    -- antes de nov/2026 está como D-104 / A-1012.
    WHERE l.entidade = ${ref} OR (${dono.ref_antiga}::text IS NOT NULL AND l.entidade = ${dono.ref_antiga})
    ORDER BY l.criado_em DESC, l.id DESC
  `;

  return json({
    entradas: linhas.map((l) => ({
      id: l.id,
      criadoEm: l.criado_em.toISOString(),
      autor: l.autor ?? "sistema",
      via: l.via,
      campo: l.campo,
      de: l.valor_anterior,
      para: l.valor_novo,
      texto: l.texto,
    })),
  });
}
