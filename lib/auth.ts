// Sessão em cookie httpOnly (30 dias). O único caminho de entrada é o login por e-mail de
// pessoa cadastrada (`entrarComEmail`) — provisoriamente sem senha.

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { emailsAdmin } from "./acesso";
import { registrar } from "./log";
import type { Papel } from "./domain";

const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

export type SessionUser = {
  token: string;
  userId: number;
  nome: string;
  email: string;
  papel: Papel;
  iniciais: string;
  ativo: boolean;
  avatarUrl: string | null;
  /** Tema e filtro de área escolhidos por esta pessoa. Vazio até ela escolher. */
  preferencias: Record<string, string>;
  /**
   * Só quando um admin está no modo "ver como": o papel verdadeiro (`admin`), enquanto
   * `papel` leva o simulado. Ausente em todos os outros casos.
   */
  papelReal?: Papel;
};

export async function createSession(userId: number): Promise<void> {
  const sql = await getDb();
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MS).toISOString();

  await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, ${expires})`;

  const jar = await cookies();
  jar.set("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** Lê a sessão do cookie; apaga e retorna null se expirada, ausente ou de usuário inativo. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get("session")?.value;
  if (!token) return null;

  const sql = await getDb();
  const rows = await sql<
    {
      token: string;
      user_id: number;
      expires_at: Date;
      nome: string;
      email: string;
      papel: Papel;
      iniciais: string;
      ativo: boolean;
      avatar_url: string | null;
      preferencias: Record<string, string> | null;
    }[]
  >`
    SELECT s.token, s.user_id, s.expires_at, u.nome, u.email, u.papel, u.iniciais, u.ativo,
           u.avatar_url, u.preferencias
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ${token}
  `;
  if (!rows.length) return null;
  const row = rows[0];

  if (row.expires_at.getTime() < Date.now()) {
    await sql`DELETE FROM sessions WHERE token = ${token}`;
    return null;
  }
  // Desativar alguém na administração corta o acesso na próxima requisição.
  if (!row.ativo) return null;

  return {
    token,
    userId: row.user_id,
    nome: row.nome,
    email: row.email,
    papel: row.papel,
    iniciais: row.iniciais,
    ativo: row.ativo,
    avatarUrl: row.avatar_url,
    preferencias: row.preferencias ?? {},
  };
}

/**
 * A pessoa pelo id, no mesmo formato da sessão — para o MCP, que identifica a pessoa pela
 * concessão e não por cookie. `token` vazio: não há sessão de navegador por trás.
 */
export async function carregarUsuario(userId: number): Promise<SessionUser | null> {
  const sql = await getDb();
  const rows = await sql<
    {
      id: number; nome: string; email: string; papel: Papel; iniciais: string; ativo: boolean;
      avatar_url: string | null; preferencias: Record<string, string> | null;
    }[]
  >`
    SELECT id, nome, email, papel, iniciais, ativo, avatar_url, preferencias
    FROM users WHERE id = ${userId}
  `;
  const u = rows[0];
  if (!u || !u.ativo) return null;
  return {
    token: "",
    userId: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    iniciais: u.iniciais,
    ativo: u.ativo,
    avatarUrl: u.avatar_url,
    preferencias: u.preferencias ?? {},
  };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get("session")?.value;
  if (token) {
    const sql = await getDb();
    await sql`DELETE FROM sessions WHERE token = ${token}`;
  }
  jar.delete("session");
}

export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Login por e-mail: só entra quem está na lista. A lista é o cadastro de pessoas (Cadastros →
 * pessoas, mantido pela administração) mais os e-mails de `ADMIN_EMAIL`.
 *
 * - Pessoa cadastrada e ativa: entra.
 * - E-mail de `ADMIN_EMAIL` ainda sem cadastro: a conta nasce aqui, como admin, com o nome
 *   tirado do e-mail (a pessoa corrige depois em Cadastros).
 * - Qualquer outro e-mail: `null`, e nada é gravado.
 *
 * Não há prova de posse do e-mail — ver o aviso em app/api/auth/email/route.ts.
 */
export async function entrarComEmail(email: string): Promise<number | null> {
  const sql = await getDb();
  const existente = await sql<{ id: number; ativo: boolean; excluido: boolean }[]>`
    SELECT id, ativo, excluido_em IS NOT NULL AS excluido FROM users WHERE lower(email) = ${email}
  `;
  if (existente.length) {
    const u = existente[0];
    return u.ativo && !u.excluido ? u.id : null;
  }

  if (!emailsAdmin().includes(email)) return null;

  const nome = email.split("@")[0].split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(" ") || email;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO users (nome, email, papel, iniciais)
    VALUES (${nome}, ${email}, 'admin', ${iniciaisDe(nome)})
    RETURNING id
  `;
  await registrar(sql, {
    actorUserId: row.id, area: null, entidade: `U-${row.id}`, campo: "criacao", de: null, para: email,
    texto: `Primeiro acesso de ${nome}: entrou como admin por estar em ADMIN_EMAIL`,
  });
  return row.id;
}
