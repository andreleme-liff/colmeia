// Permissão por área — o ponto onde ela deixa de ser decoração de front.
//
// No protótipo estático a regra morava no navegador, o que só se sustenta porque não havia
// dados de verdade. Aqui TODA leitura filtra pelas áreas visíveis e TODA escrita exige nível
// `edit` na área do registro, sempre a partir da sessão — nunca de algo que o cliente mandou.

import { getSessionUser, type SessionUser } from "./auth";
import { getDb } from "./db";
import { err } from "./http";
import { AREA_IDS, type Nivel } from "./domain";

export type Ctx = {
  user: SessionUser;
  /** Nível efetivo por área, já com o teto do papel aplicado. */
  perms: Record<string, Nivel>;
  areasVisiveis: string[];
  areasEditaveis: string[];
  isAdmin: boolean;
  podeVer: (area: string) => boolean;
  podeEditar: (area: string) => boolean;
};

/**
 * O papel define o teto; a matriz por área refina dentro dele.
 * - admin   → edit em tudo, sem depender da matriz
 * - leitura → nunca passa de view, mesmo que a matriz diga edit
 * - demais  → exatamente o que a matriz disser
 */
export async function carregarPerms(user: SessionUser): Promise<Record<string, Nivel>> {
  const sql = await getDb();
  const linhas = await sql<{ area: string; nivel: Nivel }[]>`
    SELECT area, nivel FROM user_area_perms WHERE user_id = ${user.userId}
  `;

  const perms: Record<string, Nivel> = {};
  if (user.papel === "admin") {
    for (const a of AREA_IDS) perms[a] = "edit";
    return perms;
  }

  for (const l of linhas) {
    perms[l.area] = user.papel === "leitura" ? "view" : l.nivel;
  }
  return perms;
}

export function montarCtx(user: SessionUser, perms: Record<string, Nivel>): Ctx {
  const areasVisiveis = Object.keys(perms);
  const areasEditaveis = areasVisiveis.filter((a) => perms[a] === "edit");
  return {
    user,
    perms,
    areasVisiveis,
    areasEditaveis,
    isAdmin: user.papel === "admin",
    podeVer: (area) => !!perms[area],
    podeEditar: (area) => perms[area] === "edit",
  };
}

/** Contexto da requisição, ou a Response de erro apropriada. */
export async function requireCtx(): Promise<Ctx | Response> {
  const user = await getSessionUser();
  if (!user) return err("Não autenticado.", 401);
  return montarCtx(user, await carregarPerms(user));
}

/** Só admin mexe em permissões e em usuários. */
export async function requireAdmin(): Promise<Ctx | Response> {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;
  if (!ctx.isAdmin) return err("Ação restrita à administração.", 403);
  return ctx;
}
