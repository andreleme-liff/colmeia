// Preferências da própria pessoa: tema, filtro de área, filtro de responsável e densidade do
// kanban comercial (card completo ou compacto), o menu lateral (expandido ou recolhido) e
// as colunas recolhidas de cada kanban.
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
import { lerSelecaoDeResponsaveis, MAX_RESPONSAVEIS_NA_SELECAO, STAGE_KEYS, STATUS_KEYS } from "@/lib/domain";

type Body = { tema?: string; area?: string; responsaveis?: string; densidade?: string; menu?: string; recolhidasComercial?: string; recolhidasOperacoes?: string; resumoEtapas?: string; ordemCards?: string; cronograma?: string };

const TEMAS = ["dark", "light"];
const DENSIDADES = ["completo", "compacto"];
const MENUS = ["expandido", "recolhido"];
// Ordem dos cards dentro de cada coluna dos kanbans.
const ORDENS = ["antigos", "novos", "alterados", "nome"];

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

  if (body.densidade !== undefined) {
    if (!DENSIDADES.includes(body.densidade)) return err("Densidade inválida.", 400);
    patch.densidade = body.densidade;
  }

  if (body.ordemCards !== undefined) {
    if (!ORDENS.includes(body.ordemCards)) return err("Ordem inválida.", 400);
    patch.ordemCards = body.ordemCards;
  }

  if (body.cronograma !== undefined) {
    if (!["agenda", "lista"].includes(body.cronograma)) return err("Exibição inválida.", 400);
    patch.cronograma = body.cronograma;
  }

  if (body.menu !== undefined) {
    if (!MENUS.includes(body.menu)) return err("Menu inválido.", 400);
    patch.menu = body.menu;
  }

  // Colunas recolhidas de cada kanban: as chaves separadas por vírgula, vazio para nenhuma.
  // Chave fora da lista é recusada, pelo mesmo motivo do filtro de responsável logo abaixo.
  // `resumoEtapas` segue o mesmo formato: as etapas do funil que entram no resumo de status.
  for (const [campo, validas] of [["recolhidasComercial", STAGE_KEYS], ["recolhidasOperacoes", STATUS_KEYS], ["resumoEtapas", STAGE_KEYS]] as const) {
    const v = body[campo];
    if (v === undefined) continue;
    if (typeof v !== "string") return err("Colunas inválidas.", 400);
    const chaves = [...new Set(v.split(",").map((c) => c.trim()).filter(Boolean))];
    if (chaves.some((c) => !validas.includes(c))) return err("Colunas inválidas.", 400);
    patch[campo] = chaves.join(",");
  }

  if (body.area !== undefined) {
    // "all" é o filtro "todas as áreas" e não corresponde a nenhum produto. Qualquer outro
    // valor precisa ser uma área que esta pessoa enxerga — senão a preferência guardaria um
    // filtro que na próxima sessão não mostraria nada e pareceria dado sumido.
    if (body.area !== "all" && !ctx.areasVisiveis.includes(body.area)) {
      return err("Produto inválido.", 400);
    }
    patch.area = body.area;
  }

  /**
   * Filtro por responsável: as chaves escolhidas, separadas por vírgula, ou vazio para
   * "todos". Texto e não array porque a coluna é um JSONB de texto para texto.
   *
   * Recusa em vez de gravar o que sobrou da limpeza. Esta rota tem lista FECHADA de chaves e
   * o que não está nela é descartado sem erro, com a tela achando que gravou — foi o que
   * aconteceu na primeira versão deste filtro, que devolvia 200 com `mudancas: 0`. Descartar
   * chave inválida em silêncio seria a mesma armadilha um nível abaixo: a tela seguiria
   * mostrando um recorte que o banco não tem.
   */
  if (body.responsaveis !== undefined) {
    if (typeof body.responsaveis !== "string") return err("Filtro de responsável inválido.", 400);
    const pedidas = new Set(body.responsaveis.split(",").map((c) => c.trim()).filter(Boolean));
    const limpas = lerSelecaoDeResponsaveis(body.responsaveis);
    if (pedidas.size !== limpas.length) {
      return err(
        `Filtro de responsável inválido: chave fora do formato, ou mais de ${MAX_RESPONSAVEIS_NA_SELECAO} itens.`,
        400
      );
    }
    patch.responsaveis = limpas.join(",");
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
