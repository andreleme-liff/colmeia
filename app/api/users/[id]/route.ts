// Administração de um usuário: matriz de permissão por área e o interruptor de ativo.
// Restrito a admin. O próprio admin não pode se rebaixar nem se desativar por acidente —
// caso contrário a instalação fica sem ninguém capaz de liberar acesso.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { areaOf } from "@/lib/domain";

type Body = {
  /** Alterna sem acesso → ver → editar naquela área. */
  ciclarArea?: string;
  ativo?: boolean;
};

const ORDEM: (string | null)[] = [null, "view", "edit"];
const rotulo = (n: string | null) => (n === "edit" ? "editar" : n === "view" ? "ver" : "sem acesso");

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/users/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;

  const { id } = await ctxRoute.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) return err("Usuário inválido.", 400);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const sql = await getDb();
  const alvos = await sql<{ id: number; nome: string; papel: string; ativo: boolean }[]>`
    SELECT id, nome, papel, ativo FROM users WHERE id = ${userId}
  `;
  if (!alvos.length) return err("Usuário não encontrado.", 404);
  const alvo = alvos[0];

  if (body.ciclarArea !== undefined) {
    const area = body.ciclarArea;
    if (!ctx.areasExistentes.includes(area)) return err("Área inválida.", 400);
    // Admin tem edit em tudo por definição do papel; a matriz não se aplica a ele.
    if (alvo.papel === "admin") return err("Permissões de admin não são editáveis.", 409);

    const atuais = await sql<{ nivel: string }[]>`
      SELECT nivel FROM user_area_perms WHERE user_id = ${userId} AND area = ${area}
    `;
    const de = atuais.length ? atuais[0].nivel : null;
    const para = ORDEM[(ORDEM.indexOf(de) + 1) % ORDEM.length];

    if (para === null) {
      await sql`DELETE FROM user_area_perms WHERE user_id = ${userId} AND area = ${area}`;
    } else {
      await sql`
        INSERT INTO user_area_perms (user_id, area, nivel) VALUES (${userId}, ${area}, ${para})
        ON CONFLICT (user_id, area) DO UPDATE SET nivel = EXCLUDED.nivel
      `;
    }

    await registrar(sql, {
      actorUserId: ctx.user.userId,
      area,
      entidade: `U-${userId}`,
      campo: "permissao",
      de: rotulo(de),
      para: rotulo(para),
      texto: `Definiu permissão de ${alvo.nome} em ${areaOf(area).label} para ${rotulo(para)}`,
    });
    return json({ ok: true, nivel: para });
  }

  if (body.ativo !== undefined && body.ativo !== alvo.ativo) {
    if (alvo.id === ctx.user.userId && body.ativo === false) {
      return err("Você não pode desativar a própria conta.", 409);
    }
    await sql`UPDATE users SET ativo = ${body.ativo} WHERE id = ${userId}`;
    await registrar(sql, {
      actorUserId: ctx.user.userId,
      area: null,
      entidade: `U-${userId}`,
      campo: "ativo",
      de: String(alvo.ativo),
      para: String(body.ativo),
      texto: `${body.ativo ? "Reativou" : "Desativou"} o acesso de ${alvo.nome}`,
    });
    return json({ ok: true, ativo: body.ativo });
  }

  return json({ ok: true, mudancas: 0 });
}
