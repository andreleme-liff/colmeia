// Permissão por área — o ponto onde ela deixa de ser decoração de front.
//
// No protótipo estático a regra morava no navegador, o que só se sustenta porque não havia
// dados de verdade. Aqui TODA leitura filtra pelas áreas visíveis e TODA escrita exige nível
// `edit` na área do registro, sempre a partir da sessão — nunca de algo que o cliente mandou.

import { carregarUsuario, getSessionUser, type SessionUser } from "./auth";
import { getDb } from "./db";
import { err } from "./http";
import type { Nivel } from "./domain";

export type Ctx = {
  user: SessionUser;
  /** Nível efetivo por área, já com o teto do papel aplicado. */
  perms: Record<string, Nivel>;
  areasVisiveis: string[];
  areasEditaveis: string[];
  /** Todas as áreas cadastradas — o conjunto é aberto, então vem do banco. */
  areasExistentes: string[];
  /**
   * Nome de exibição de uma área, resolvido pelo BANCO. `areaOf` de domain.ts consulta um
   * registro em memória que só o cliente preenche — no servidor ele devolve a lista semeada
   * e uma área criada depois viraria "—" nas mensagens de erro.
   */
  labelArea: (area: string) => string;
  isAdmin: boolean;
  podeVer: (area: string) => boolean;
  podeEditar: (area: string) => boolean;
};

/**
 * O papel é a permissão inteira; não há mais matriz por produto.
 * - leitura          → vê tudo, não edita
 * - membro, gestor   → veem e editam os registros de todos os produtos
 * - admin            → idem, e administra (o que é só de admin passa por `requireAdmin`)
 */
export async function carregarPerms(user: SessionUser, areasExistentes: string[]): Promise<Record<string, Nivel>> {
  // Não há mais permissão por produto (nov/2026): todo mundo vê todos os produtos que
  // EXISTIREM (inclusive os cadastrados depois), e o papel decide quem edita. A tabela
  // `user_area_perms` continua no banco, sem uso, como registro do que valia antes.
  const nivel: Nivel = user.papel === "leitura" ? "view" : "edit";
  const perms: Record<string, Nivel> = {};
  for (const a of areasExistentes) perms[a] = nivel;
  return perms;
}

export function montarCtx(
  user: SessionUser,
  perms: Record<string, Nivel>,
  cadastro: { id: string; label: string }[]
): Ctx {
  const areasVisiveis = Object.keys(perms);
  const areasEditaveis = areasVisiveis.filter((a) => perms[a] === "edit");
  const areasExistentes = cadastro.map((a) => a.id);
  return {
    user,
    perms,
    areasVisiveis,
    areasEditaveis,
    areasExistentes,
    labelArea: (area) => cadastro.find((a) => a.id === area)?.label ?? area,
    isAdmin: user.papel === "admin",
    podeVer: (area) => !!perms[area],
    podeEditar: (area) => perms[area] === "edit",
  };
}

/** Monta o contexto de permissão de uma pessoa já identificada. */
async function ctxDe(user: SessionUser): Promise<Ctx> {
  const sql = await getDb();
  const cadastro = await sql<{ id: string; label: string }[]>`
    SELECT id, label FROM areas ORDER BY ordem ASC, id ASC
  `;
  return montarCtx(user, await carregarPerms(user, cadastro.map((a) => a.id)), cadastro);
}

/** Contexto da requisição, ou a Response de erro apropriada. */
export async function requireCtx(): Promise<Ctx | Response> {
  const user = await getSessionUser();
  if (!user) return err("Não autenticado.", 401);
  return ctxDe(user);
}

/**
 * O MESMO contexto, para quem chega por um token de acesso do MCP em vez de cookie. A pessoa
 * é a dona da concessão; a permissão por área é recalculada agora, do banco — o token não
 * carrega permissão nenhuma. Pessoa desativada → `null`, como na sessão.
 */
export async function ctxDoUsuario(userId: number): Promise<Ctx | null> {
  const user = await carregarUsuario(userId);
  return user ? ctxDe(user) : null;
}

/** Só admin mexe em permissões e em usuários. */
export async function requireAdmin(): Promise<Ctx | Response> {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;
  if (!ctx.isAdmin) return err("Ação restrita à administração.", 403);
  return ctx;
}
