// Administração de um usuário: dados do cadastro (nome, e-mail, papel), matriz de permissão
// por área, o interruptor de ativo e a exclusão. Restrito a admin. O próprio admin não pode se
// rebaixar, se desativar nem se excluir — e a instalação nunca fica sem admin nenhum.

import { getDb, type Queryable } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { deFalha, err, json, lerCorpo } from "@/lib/http";
import { registrar } from "@/lib/log";
import { iniciaisDe } from "@/lib/auth";
import { PAPEIS } from "@/lib/domain";
import { emailValido } from "@/lib/google-oauth";
import { ehFalha, falha } from "@/lib/ops/comum";
import { excluirAtividade, excluirOportunidade, lerDestino } from "@/lib/exclusao";


type Body = {
  /** Alterna sem acesso → ver → editar naquela área. */
  ciclarArea?: string;
  ativo?: boolean;
  nome?: string;
  email?: string;
  papel?: string;
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
  const alvos = await sql<{ id: number; nome: string; email: string; papel: string; ativo: boolean }[]>`
    SELECT id, nome, email, papel, ativo FROM users WHERE id = ${userId} AND excluido_em IS NULL
  `;
  if (!alvos.length) return err("Usuário não encontrado.", 404);
  const alvo = alvos[0];

  if (body.ciclarArea !== undefined) {
    const area = body.ciclarArea;
    if (!ctx.areasExistentes.includes(area)) return err("Produto inválido.", 400);
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
      texto: `Definiu permissão de ${alvo.nome} em ${ctx.labelArea(area)} para ${rotulo(para)}`,
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

  // Dados do cadastro. Tudo validado antes de gravar o primeiro campo.
  if (body.nome !== undefined || body.email !== undefined || body.papel !== undefined) {
    const mudancas: { campo: string; de: string; para: string; texto: string }[] = [];
    const sets: Record<string, string> = {};

    if (body.nome !== undefined) {
      const nome = String(body.nome).trim();
      if (!nome) return err("A pessoa precisa de um nome.", 400);
      if (nome.length > 120) return err("Nome longo demais.", 400);
      if (nome !== alvo.nome) {
        sets.nome = nome;
        sets.iniciais = iniciaisDe(nome);
        mudancas.push({ campo: "nome", de: alvo.nome, para: nome, texto: `Renomeou ${alvo.nome} para ${nome}` });
      }
    }
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!email) return err("A pessoa precisa de um e-mail.", 400);
      if (!emailValido(email)) return err("E-mail inválido. Use o e-mail da conta Google da pessoa.", 400);
      if (email !== alvo.email.toLowerCase()) {
        const outro = await sql<{ nome: string }[]>`SELECT nome FROM users WHERE lower(email) = ${email} AND id <> ${userId}`;
        if (outro.length) return err(`${outro[0].nome} já está cadastrado com esse e-mail.`, 409);
        sets.email = email;
        mudancas.push({ campo: "email", de: alvo.email, para: email, texto: `Trocou o e-mail de ${alvo.nome} para ${email}` });
      }
    }
    if (body.papel !== undefined && body.papel !== alvo.papel) {
      const papel = String(body.papel);
      if (!(PAPEIS as readonly string[]).includes(papel)) return err("Papel inválido.", 400);
      if (alvo.id === ctx.user.userId && alvo.papel === "admin") return err("Você não pode mudar o próprio papel de admin.", 409);
      sets.papel = papel;
      mudancas.push({ campo: "papel", de: alvo.papel, para: papel, texto: `Mudou o papel de ${alvo.nome} de ${alvo.papel} para ${papel}` });
    }

    if (mudancas.length) {
      await sql.begin(async (tx) => {
        await tx`UPDATE users SET ${tx(sets)} WHERE id = ${userId}`;
        for (const m of mudancas) {
          await registrar(tx, { actorUserId: ctx.user.userId, area: null, entidade: `U-${userId}`, ...m });
        }
      });
    }
    return json({ ok: true, mudancas: mudancas.length });
  }

  return json({ ok: true, mudancas: 0 });
}

/**
 * Exclusão de pessoa. A linha em `users` não é apagada: o histórico (`audit_log`) aponta para
 * ela e precisa continuar dizendo quem fez o quê. Excluir = marcar `excluido_em`, tirar o
 * acesso (sessões, permissões, conexões do Claude) e tirar a pessoa de toda lista e seletor.
 *
 * O que ela tem sob responsabilidade segue o corpo, como no produto:
 *  · `{ acao: "migrar", para }` — atividades, oportunidades e blockers passam para outra pessoa;
 *  · `{ acao: "excluir" }` — atividades e oportunidades dela são excluídas junto;
 *  · `{ acao: "desvincular" }` — ficam sem responsável (na oportunidade, o nome fica em texto).
 * Nos dois últimos, o blocker que ela resolvia fica sem dono.
 */
export async function DELETE(req: Request, ctxRoute: RouteContext<"/api/users/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;

  const userId = Number((await ctxRoute.params).id);
  if (!Number.isInteger(userId)) return err("Usuário inválido.", 400);
  if (userId === ctx.user.userId) return err("Você não pode excluir a própria conta.", 409);
  const destino = lerDestino(await lerCorpo(req));
  const autor = ctx.user.userId;

  const sql = await getDb();
  const r = await sql.begin(async (tx) => {
    const alvos = await tx<{ nome: string; papel: string }[]>`
      SELECT nome, papel FROM users WHERE id = ${userId} AND excluido_em IS NULL FOR UPDATE
    `;
    if (!alvos.length) return falha("Usuário não encontrado.", 404);
    const alvo = alvos[0];
    if (alvo.papel === "admin") {
      const [{ n }] = await tx<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM users WHERE papel = 'admin' AND ativo AND excluido_em IS NULL AND id <> ${userId}
      `;
      if (!n) return falha("Não dá para excluir o último admin.", 409);
    }
    const motivo = `ao excluir ${alvo.nome} do cadastro`;

    const atividades = await tx<{ id: number; ref: string; titulo: string; area: string }[]>`
      SELECT id, ref, titulo, area FROM activities WHERE responsavel_user_id = ${userId} FOR UPDATE
    `;
    const oportunidades = await tx<{ id: number; ref: string; conta: string; area: string; valor_centavos: string }[]>`
      SELECT id, ref, conta, area, valor_centavos FROM deals WHERE responsavel_user_id = ${userId} FOR UPDATE
    `;
    const blockers = await tx<{ id: number; ref: string; conta: string; area: string }[]>`
      SELECT id, ref, conta, area FROM deals WHERE blocker_dono_id = ${userId} FOR UPDATE
    `;
    const ligados = atividades.length + oportunidades.length + blockers.length;
    if (ligados && !destino) {
      return falha(`${alvo.nome} tem ${ligados} registro(s) sob responsabilidade: escolha migrar, excluir junto ou desvincular.`, 409);
    }

    if (ligados && destino?.acao === "migrar") {
      const para = Number(destino.para);
      const novos = await tx<{ nome: string }[]>`
        SELECT nome FROM users WHERE id = ${para} AND id <> ${userId} AND ativo AND excluido_em IS NULL
      `;
      if (!Number.isInteger(para) || !novos.length) return falha("Pessoa de destino inválida.", 400);
      const novo = novos[0].nome;
      for (const a of atividades) {
        await tx`UPDATE activities SET responsavel_user_id = ${para}, atualizado_em = now() WHERE id = ${a.id}`;
        await registrar(tx, {
          actorUserId: autor, area: a.area, entidade: a.ref, campo: "responsavel", de: alvo.nome, para: novo,
          texto: `"${a.titulo}" passou de ${alvo.nome} para ${novo} ${motivo}`,
        });
      }
      for (const o of oportunidades) {
        await tx`UPDATE deals SET responsavel_user_id = ${para}, atualizado_em = now() WHERE id = ${o.id}`;
        await registrar(tx, {
          actorUserId: autor, area: o.area, entidade: o.ref, campo: "responsavel", de: alvo.nome, para: novo,
          texto: `${o.conta} passou de ${alvo.nome} para ${novo} ${motivo}`,
        });
      }
      for (const b of blockers) {
        await tx`UPDATE deals SET blocker_dono_id = ${para}, atualizado_em = now() WHERE id = ${b.id}`;
        await registrar(tx, {
          actorUserId: autor, area: b.area, entidade: b.ref, campo: "blocker_dono", de: alvo.nome, para: novo,
          texto: `O blocker de ${b.conta} passou a ser resolvido por ${novo} ${motivo}`,
        });
      }
    } else if (ligados) {
      if (destino?.acao === "excluir") {
        for (const a of atividades) await excluirAtividade(tx, a, autor, motivo);
        for (const o of oportunidades) await excluirOportunidade(tx, o, autor, motivo);
      } else {
        for (const a of atividades) {
          await tx`UPDATE activities SET responsavel_user_id = NULL, atualizado_em = now() WHERE id = ${a.id}`;
          await registrar(tx, {
            actorUserId: autor, area: a.area, entidade: a.ref, campo: "responsavel", de: alvo.nome, para: "—",
            texto: `"${a.titulo}" ficou sem responsável ${motivo}`,
          });
        }
        for (const o of oportunidades) {
          // O nome continua no card como texto: "de quem era" é informação, mesmo sem cadastro.
          await tx`
            UPDATE deals SET responsavel_user_id = NULL,
              responsavel_texto = CASE WHEN responsavel_texto = '' THEN ${alvo.nome} ELSE responsavel_texto END,
              atualizado_em = now()
            WHERE id = ${o.id}
          `;
          await registrar(tx, {
            actorUserId: autor, area: o.area, entidade: o.ref, campo: "responsavel", de: alvo.nome, para: "—",
            texto: `${o.conta} ficou sem responsável cadastrado ${motivo}`,
          });
        }
      }
      // Blockers de oportunidades que sobreviveram ficam sem quem resolve.
      for (const b of blockers) {
        const existe = await tx`UPDATE deals SET blocker_dono_id = NULL WHERE id = ${b.id} RETURNING 1`;
        if (!existe.length) continue;
        await registrar(tx, {
          actorUserId: autor, area: b.area, entidade: b.ref, campo: "blocker_dono", de: alvo.nome, para: "—",
          texto: `O blocker de ${b.conta} ficou sem quem resolve ${motivo}`,
        });
      }
    }

    await retirarAcesso(tx, userId, autor);
    await tx`UPDATE users SET ativo = false, excluido_em = now() WHERE id = ${userId}`;
    await registrar(tx, {
      actorUserId: autor, area: null, entidade: `U-${userId}`, campo: "exclusao", de: alvo.nome, para: null,
      texto: `Excluiu ${alvo.nome} do cadastro${ligados ? `; ${ligados} registro(s) ${
        destino?.acao === "migrar" ? "migrados" : destino?.acao === "excluir" ? "tratados (excluídos junto)" : "desvinculados"
      }` : ""}`,
    });
    return { ok: true as const, ligados };
  });
  if (ehFalha(r)) return deFalha(r);
  return json(r);
}

/** Sessões, permissões por área e conexões do Claude: nada da pessoa continua valendo. */
async function retirarAcesso(tx: Queryable, userId: number, autor: number): Promise<void> {
  await tx`DELETE FROM sessions WHERE user_id = ${userId}`;
  await tx`DELETE FROM user_area_perms WHERE user_id = ${userId}`;
  await tx`
    UPDATE oauth_concessoes SET revogado_em = now(), revogado_por = ${autor}, motivo_revogacao = 'pessoa excluída'
    WHERE user_id = ${userId} AND revogado_em IS NULL
  `;
}
