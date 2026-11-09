// Preferências da própria pessoa: tema, filtro de área e filtro de responsável.
//
// Guardadas no perfil, e não só no navegador, porque a promessa é "o sistema abre do jeito
// que você deixou" — inclusive em outra máquina, e inclusive depois de limpar o cache.
//
// Não passa por `requireAdmin` nem checa área: ninguém mexe na preferência de outro, o alvo
// é sempre `ctx.user.userId`. E não entra na auditoria: o log existe para alteração de dado
// operacional, não para registrar que alguém trocou o fundo para claro.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, err } from "@/lib/http";

type Body = { tema?: string; area?: string; soMeus?: string };

const TEMAS = ["dark", "light"];

export async function PATCH(req: Request) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const patch: Record<string, string> = {};

  if (body.tema !== undefined) {
    if (!TEMAS.includes(body.tema)) return err("Tema inválido.", 400);
    patch.tema = body.tema;
  }

  if (body.area !== undefined) {
    // "all" é o filtro "todas as áreas" e não corresponde a nenhuma vertical. Qualquer outro
    // valor precisa ser uma área que esta pessoa enxerga — senão a preferência guardaria um
    // filtro que na próxima sessão não mostraria nada e pareceria dado sumido.
    if (body.area !== "all" && !ctx.areasVisiveis.includes(body.area)) {
      return err("Área inválida.", 400);
    }
    patch.area = body.area;
  }

  /**
   * Filtro "só o que é meu". "1" ou "0" e não booleano: a coluna é um JSONB de texto para
   * texto, e misturar tipo aqui convidaria a um `=== true` falhando contra a string "true".
   *
   * A validação é estrita de propósito. Esta rota tem lista FECHADA de chaves — o que não
   * está aqui é descartado sem erro, e a tela acha que gravou. Foi o que quase aconteceu
   * com esta chave: o cliente mandava `soMeus` e a rota devolvia 200 com `mudancas: 0`.
   */
  if (body.soMeus !== undefined) {
    if (body.soMeus !== "0" && body.soMeus !== "1") {
      return err("Valor inválido para o filtro de responsável.", 400);
    }
    patch.soMeus = body.soMeus;
  }

  if (!Object.keys(patch).length) return json({ ok: true, mudancas: 0 });

  const sql = await getDb();
  // Mescla em vez de sobrescrever: gravar só o tema não pode apagar o filtro salvo antes.
  //
  // `sql.json` e não `JSON.stringify(...)::jsonb`: com a string pronta, o driver infere o
  // tipo pelo cast e serializa DE NOVO, entregando o escalar JSON `"{\"tema\":\"light\"}"`.
  // Concatenar objeto com escalar não dá erro no Postgres — dá um array. A preferência
  // virava `[{}, "…", "…"]`, crescendo a cada gravação e nunca lida de volta.
  const [linha] = await sql<{ preferencias: Record<string, string> }[]>`
    UPDATE users SET preferencias = preferencias || ${sql.json(patch)}
    WHERE id = ${ctx.user.userId}
    RETURNING preferencias
  `;

  return json({ ok: true, preferencias: linha.preferencias });
}
