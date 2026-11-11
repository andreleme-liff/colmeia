// Sessão em cookie httpOnly (30 dias). Sem senha: o único caminho de entrada é o SSO Google
// restrito ao domínio, como o desenho do sistema define.

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
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
  /** Se já autorizou leitura de planilhas. O TOKEN em si nunca sai da camada de servidor. */
  temSheets: boolean;
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
      tem_sheets: boolean;
    }[]
  >`
    SELECT s.token, s.user_id, s.expires_at, u.nome, u.email, u.papel, u.iniciais, u.ativo,
           u.avatar_url, u.preferencias, (u.google_refresh_token IS NOT NULL) AS tem_sheets
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
    temSheets: !!row.tem_sheets,
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
      avatar_url: string | null; preferencias: Record<string, string> | null; tem_sheets: boolean;
    }[]
  >`
    SELECT id, nome, email, papel, iniciais, ativo, avatar_url, preferencias,
           (google_refresh_token IS NOT NULL) AS tem_sheets
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
    temSheets: !!u.tem_sheets,
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
 * Login via SSO: casa por e-mail. Se a conta já existe (inclusive pré-cadastrada pela
 * administração, sem google_sub), linka e assume nome/foto reais do Google na primeira vez.
 * Conta nova entra como 'leitura': vê todos os produtos e não edita nenhum (nov/2026). A exceção é ADMIN_EMAIL, que entra como admin para
 * a primeira instalação não ficar sem ninguém que possa liberar acesso.
 */
export async function findOrCreateGoogleUser(
  email: string,
  nome: string,
  googleSub: string,
  avatarUrl: string | null
): Promise<number> {
  const sql = await getDb();
  const existente = await sql<{ id: number; google_sub: string | null }[]>`
    SELECT id, google_sub FROM users WHERE lower(email) = lower(${email})
  `;
  if (existente.length) {
    if (!existente[0].google_sub) {
      await sql`
        UPDATE users SET google_sub = ${googleSub}, avatar_url = ${avatarUrl}, nome = ${nome},
                         iniciais = ${iniciaisDe(nome)}
        WHERE id = ${existente[0].id}
      `;
    } else {
      await sql`UPDATE users SET avatar_url = ${avatarUrl} WHERE id = ${existente[0].id}`;
    }
    return existente[0].id;
  }

  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const papel: Papel = adminEmail && email.toLowerCase() === adminEmail ? "admin" : "leitura";

  // Conta nova (primeiro login de alguém do domínio, sem pré-cadastro): entra como `leitura`,
  // que vê todos os produtos e não edita nenhum. Para editar, a administração muda o papel em
  // Cadastros → pessoas. (Não há mais permissão por produto: o papel decide tudo.)
  const id = await sql.begin(async (tx) => {
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO users (nome, email, papel, iniciais, google_sub, avatar_url)
      VALUES (${nome}, ${email}, ${papel}, ${iniciaisDe(nome)}, ${googleSub}, ${avatarUrl})
      RETURNING id
    `;
    if (papel !== "admin") {
      await registrar(tx, {
        actorUserId: null,
        area: null,
        entidade: `U-${row.id}`,
        campo: "papel",
        de: null,
        para: papel,
        texto: `Primeiro acesso de ${nome}: entrou com o papel leitura (vê tudo, não edita)`,
      });
    }
    return row.id;
  });
  return id;
}
