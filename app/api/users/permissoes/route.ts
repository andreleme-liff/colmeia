// Permissões em lote: define o nível de várias pessoas em vários produtos de uma vez, ou
// copia o acesso de uma pessoa para outras. Restrito a admin.
//
// Existe porque clicar célula por célula (a rota de uma pessoa só alterna sem acesso → ver →
// editar) não escala: entrar um time de dez pessoas em seis produtos eram até 120 cliques.
// Aqui o nível é dito por extenso, tudo é validado antes e gravado numa transação só, e cada
// célula que de fato mudou ganha a sua linha de auditoria — igual à alteração feita uma a uma.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json } from "@/lib/http";
import { registrar } from "@/lib/log";

type Nivel = "edit" | "view" | null;
type Body = {
  usuarios?: unknown;
  /** Produto → nível. `null` tira o acesso. Só os produtos citados mudam. */
  permissoes?: unknown;
  /** Em vez de `permissoes`: deixa o acesso dos `usuarios` igual ao desta pessoa. */
  copiarDe?: unknown;
};

const MAX_USUARIOS = 500;
const rotulo = (n: Nivel) => (n === "edit" ? "editar" : n === "view" ? "ver" : "sem acesso");

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  if (!Array.isArray(body.usuarios) || !body.usuarios.length) return err("Escolha ao menos uma pessoa.", 400);
  if (body.usuarios.length > MAX_USUARIOS) return err(`No máximo ${MAX_USUARIOS} pessoas por vez.`, 400);
  if (body.usuarios.some((u) => !Number.isInteger(u))) return err("Usuário inválido.", 400);
  const ids = [...new Set(body.usuarios as number[])];

  const sql = await getDb();
  const alvos = await sql<{ id: number; nome: string; papel: string }[]>`
    SELECT id, nome, papel FROM users WHERE id = ANY(${ids}) AND excluido_em IS NULL
  `;
  if (alvos.length !== ids.length) return err("Usuário não encontrado.", 404);

  // O que se quer gravar: produto → nível, igual para todas as pessoas escolhidas.
  let desejado: Record<string, Nivel>;
  if (body.copiarDe !== undefined) {
    if (body.permissoes !== undefined) return err("Envie as permissões ou a pessoa de origem, não os dois.", 400);
    if (!Number.isInteger(body.copiarDe)) return err("Pessoa de origem inválida.", 400);
    const origem = await sql<{ papel: string }[]>`
      SELECT papel FROM users WHERE id = ${body.copiarDe as number} AND excluido_em IS NULL
    `;
    if (!origem.length) return err("Pessoa de origem não encontrada.", 404);
    const linhas = await sql<{ area: string; nivel: string }[]>`
      SELECT area, nivel FROM user_area_perms WHERE user_id = ${body.copiarDe as number}
    `;
    // Copiar é deixar IGUAL: o que a origem não tem, o destino perde. Admin vale edição em tudo.
    desejado = Object.fromEntries(
      ctx.areasExistentes.map((a) => [
        a,
        origem[0].papel === "admin" ? "edit" : ((linhas.find((l) => l.area === a)?.nivel as Nivel) ?? null),
      ])
    );
  } else {
    const p = body.permissoes;
    if (!p || typeof p !== "object" || Array.isArray(p) || !Object.keys(p).length) {
      return err("Diga o nível de ao menos um produto.", 400);
    }
    desejado = {};
    for (const [area, nivel] of Object.entries(p as Record<string, unknown>)) {
      if (!ctx.areasExistentes.includes(area)) return err("Produto inválido.", 400);
      if (nivel !== "edit" && nivel !== "view" && nivel !== null) return err("Nível inválido.", 400);
      desejado[area] = nivel;
    }
  }

  // Admin tem edição em tudo por definição do papel; a matriz não se aplica a ele. Num lote ele
  // é pulado em vez de derrubar o pedido — "selecionar todos" quase sempre inclui um admin.
  const editaveis = alvos.filter((a) => a.papel !== "admin");
  const ignorados = alvos.length - editaveis.length;
  if (!editaveis.length) return err("Permissões de admin não são editáveis.", 409);

  const areas = Object.keys(desejado);
  const mudancas = await sql.begin(async (tx) => {
    const atuais = await tx<{ user_id: number; area: string; nivel: string }[]>`
      SELECT user_id, area, nivel FROM user_area_perms
      WHERE user_id = ANY(${editaveis.map((a) => a.id)}) AND area = ANY(${areas})
      FOR UPDATE
    `;
    let n = 0;
    for (const alvo of editaveis) {
      for (const area of areas) {
        const de = (atuais.find((x) => x.user_id === alvo.id && x.area === area)?.nivel as Nivel) ?? null;
        const para = desejado[area];
        if (de === para) continue;
        if (para === null) {
          await tx`DELETE FROM user_area_perms WHERE user_id = ${alvo.id} AND area = ${area}`;
        } else {
          await tx`
            INSERT INTO user_area_perms (user_id, area, nivel) VALUES (${alvo.id}, ${area}, ${para})
            ON CONFLICT (user_id, area) DO UPDATE SET nivel = EXCLUDED.nivel
          `;
        }
        await registrar(tx, {
          actorUserId: ctx.user.userId,
          area,
          entidade: `U-${alvo.id}`,
          campo: "permissao",
          de: rotulo(de),
          para: rotulo(para),
          texto: `Definiu permissão de ${alvo.nome} em ${ctx.labelArea(area)} para ${rotulo(para)}`,
        });
        n++;
      }
    }
    return n;
  });

  return json({ ok: true, mudancas, ignorados });
}
