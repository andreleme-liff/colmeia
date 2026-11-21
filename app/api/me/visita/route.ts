// Registro de visita: a pessoa abriu a Colméia, mesmo sem alterar nada.
//
// A regra é a de sessão do Google Analytics: uma visita é uma sequência de atividade sem
// intervalo maior que 30 minutos. O navegador avisa aqui quando a pessoa abre o sistema e,
// de tempos em tempos, enquanto ela usa; o servidor só escreve uma linha no changelog quando
// o aviso chega mais de 30 minutos depois do anterior (ou é o primeiro). Uso contínuo de três
// horas é UMA visita; voltar depois do almoço é outra.
//
// A linha vai com a referência da pessoa (U-…), que só a administração enxerga no changelog.
// Chamadas pelo MCP não contam: visita é gente olhando a tela.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, lerCorpo } from "@/lib/http";
import { registrar } from "@/lib/log";
import { NAV } from "@/lib/domain";

/** Inatividade que encerra a visita, como no Google Analytics. */
const INTERVALO_MIN = 30;

export async function POST(req: Request) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;
  const corpo = await lerCorpo(req);
  // Só o nome da seção, e só se for uma que existe: nada do que o navegador manda vira texto livre no log.
  const pedida = typeof corpo?.secao === "string" ? corpo.secao : "";
  const secao = NAV.find((n) => n.key === pedida)?.label ?? null;

  const sql = await getDb();
  const nova = await sql.begin(async (tx) => {
    const [u] = await tx<{ ultima: Date | null; nova: boolean }[]>`
      SELECT ultima_atividade_em AS ultima,
             (ultima_atividade_em IS NULL OR ultima_atividade_em < now() - make_interval(mins => ${INTERVALO_MIN})) AS nova
      FROM users WHERE id = ${ctx.user.userId} FOR UPDATE
    `;
    await tx`UPDATE users SET ultima_atividade_em = now() WHERE id = ${ctx.user.userId}`;
    if (!u?.nova) return false;
    await registrar(tx, {
      actorUserId: ctx.user.userId,
      area: null,
      entidade: `U-${ctx.user.userId}`,
      campo: "visita",
      de: u.ultima ? u.ultima.toISOString() : null,
      para: secao,
      texto: `${ctx.user.nome} visitou a Colméia${secao ? ` (entrou por ${secao})` : ""}`,
    });
    return true;
  });
  return json({ ok: true, novaVisita: nova });
}
