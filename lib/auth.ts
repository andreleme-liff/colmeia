// Sessão em cookie httpOnly (30 dias). Sem senha: o único caminho de entrada é o SSO Google
// restrito ao domínio, como o desenho do sistema define.

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { emailsAdmin } from "./google-oauth";
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
 * Login social: só entra quem está na lista. A lista é o cadastro de pessoas (Cadastros →
 * pessoas, mantido pela administração) mais os e-mails de `ADMIN_EMAIL`.
 *
 * - Pessoa cadastrada e ativa: entra. Na primeira vez a linha é vinculada à conta Google
 *   (google_sub) e assume nome e foto de lá.
 * - E-mail de `ADMIN_EMAIL` ainda sem cadastro: a conta nasce aqui, como admin.
 * - Qualquer outra conta Google: `null`, e nada é gravado. Não existe mais "primeiro acesso
 *   como leitura" — conta desconhecida não entra.
 *
 * Depois de vinculada, a linha só aceita a MESMA conta Google: um e-mail reaproveitado por
 * outra conta (endereço reciclado, alias) não herda o acesso.
 */
export async function entrarComGoogle(
  email: string,
  nome: string,
  googleSub: string,
  avatarUrl: string | null
): Promise<number | null> {
  const sql = await getDb();
  const existente = await sql<{ id: number; google_sub: string | null; ativo: boolean; excluido: boolean }[]>`
    SELECT id, google_sub, ativo, excluido_em IS NOT NULL AS excluido FROM users WHERE lower(email) = lower(${email})
  `;
  if (existente.length) {
    const u = existente[0];
    if (!u.ativo || u.excluido) return null;
    if (u.google_sub && u.google_sub !== googleSub) return null;
    if (!u.google_sub) {
      await sql`
        UPDATE users SET google_sub = ${googleSub}, avatar_url = ${avatarUrl}, nome = ${nome},
                         iniciais = ${iniciaisDe(nome)}
        WHERE id = ${u.id}
      `;
    } else {
      await sql`UPDATE users SET avatar_url = ${avatarUrl} WHERE id = ${u.id}`;
    }
    return u.id;
  }

  if (!emailsAdmin().includes(email.toLowerCase())) return null;

  const [row] = await sql<{ id: number }[]>`
    INSERT INTO users (nome, email, papel, iniciais, google_sub, avatar_url)
    VALUES (${nome}, ${email.toLowerCase()}, 'admin', ${iniciaisDe(nome)}, ${googleSub}, ${avatarUrl})
    RETURNING id
  `;
  await registrar(sql, {
    actorUserId: row.id, area: null, entidade: `U-${row.id}`, campo: "criacao", de: null, para: email.toLowerCase(),
    texto: `Primeiro acesso de ${nome}: entrou como admin por estar em ADMIN_EMAIL`,
  });
  return row.id;
}
