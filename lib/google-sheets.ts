// Leitura de planilha do Google, usando o acesso da PESSOA logada.
//
// O escopo não entra no login: quem nunca sincroniza nunca vê a tela de permissão do Google.
// Ele é pedido em separado, no primeiro clique em sincronizar — é o "consentimento
// incremental" do OAuth. Isso também faz a permissão seguir a da própria pessoa: quem não
// enxerga a planilha no Drive não consegue sincronizá-la aqui.
//
// Guardamos só o refresh token; o access token é obtido a cada sincronização e descartado.

import { getDb } from "./db";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Só leitura, e só de planilhas — `drive.readonly` daria acesso ao Drive inteiro. Ainda
 * assim é amplo: vale para TODAS as planilhas da pessoa, não só a configurada aqui. O Google
 * não oferece um escopo por arquivo sem passar pelo seletor de arquivos dele.
 */
export const ESCOPO_SHEETS = "https://www.googleapis.com/auth/spreadsheets.readonly";

/** URL de consentimento só do escopo de planilha, sem mexer no login. */
export function urlConsentimentoSheets(redirectUri: string, state: string, email: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ESCOPO_SHEETS,
    // `offline` + `consent` é o que faz o Google devolver refresh token. Sem os dois, ele
    // só manda access token de uma hora, e o botão de sincronizar quebraria no dia seguinte.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: email,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Troca o código pelo refresh token e guarda no perfil. Devolve false se o Google não mandou. */
export async function guardarRefreshToken(userId: number, code: string, redirectUri: string): Promise<boolean> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return false;

  const data = (await res.json()) as { refresh_token?: string };
  if (!data.refresh_token) return false;

  const sql = await getDb();
  await sql`UPDATE users SET google_refresh_token = ${data.refresh_token} WHERE id = ${userId}`;
  return true;
}

export async function temAcessoSheets(userId: number): Promise<boolean> {
  const sql = await getDb();
  const [u] = await sql<{ tem: boolean }[]>`
    SELECT google_refresh_token IS NOT NULL AS tem FROM users WHERE id = ${userId}
  `;
  return !!u?.tem;
}

/** Revoga localmente: o consentimento no Google segue de pé até a pessoa tirá-lo lá. */
export async function esquecerAcessoSheets(userId: number): Promise<void> {
  const sql = await getDb();
  await sql`UPDATE users SET google_refresh_token = NULL WHERE id = ${userId}`;
}

/** Erro que a rota traduz em "reconecte", em vez de num 500 sem explicação. */
export class SemAcessoSheets extends Error {}

async function accessToken(userId: number): Promise<string> {
  const sql = await getDb();
  const [u] = await sql<{ google_refresh_token: string | null }[]>`
    SELECT google_refresh_token FROM users WHERE id = ${userId}
  `;
  if (!u?.google_refresh_token) throw new SemAcessoSheets("Sem acesso à planilha.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: u.google_refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    // Token revogado no Google, ou consentimento retirado. Some com ele daqui para a pessoa
    // poder reconectar do zero em vez de bater no mesmo erro para sempre.
    await esquecerAcessoSheets(userId);
    throw new SemAcessoSheets("O acesso à planilha expirou ou foi revogado.");
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new SemAcessoSheets("O Google não devolveu um token de acesso.");
  return data.access_token;
}

/** Extrai o id da planilha de uma URL do Google Sheets, ou aceita o id puro. */
export function idDaPlanilha(urlOuId: string): string | null {
  const limpo = urlOuId.trim();
  if (!limpo) return null;
  const m = limpo.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9-_]{20,}$/.test(limpo) ? limpo : null;
}

export type AbaBruta = { nome: string; linhas: string[][] };

/**
 * Devolve TODAS as abas como grade de texto — o mesmo formato que o leitor de xlsx produz,
 * para o mapeamento de colunas ser exatamente o mesmo nos dois caminhos.
 *
 * `valueRenderOption=FORMATTED_VALUE` de propósito: queremos o que a pessoa vê na célula,
 * não o número cru por trás. Datas e moedas chegam como estão na planilha.
 */
export async function lerPlanilha(userId: number, planilhaId: string): Promise<AbaBruta[]> {
  const token = await accessToken(userId);
  const auth = { Authorization: `Bearer ${token}` };

  const meta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${planilhaId}?fields=sheets.properties.title`,
    { headers: auth }
  );
  if (meta.status === 403 || meta.status === 404) {
    throw new SemAcessoSheets("Você não tem acesso a essa planilha, ou o endereço está errado.");
  }
  if (!meta.ok) throw new Error("Falha ao ler a planilha no Google.");

  const { sheets = [] } = (await meta.json()) as { sheets?: { properties?: { title?: string } }[] };
  const nomes = sheets.map((s) => s.properties?.title).filter((n): n is string => !!n);
  if (!nomes.length) return [];

  // Uma chamada só para todas as abas; `batchGet` aceita vários intervalos.
  const params = new URLSearchParams({ valueRenderOption: "FORMATTED_VALUE" });
  for (const n of nomes) params.append("ranges", n);
  const vals = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${planilhaId}/values:batchGet?${params}`,
    { headers: auth }
  );
  if (!vals.ok) throw new Error("Falha ao ler os valores da planilha.");

  const { valueRanges = [] } = (await vals.json()) as { valueRanges?: { values?: string[][] }[] };
  return nomes.map((nome, i) => ({
    nome,
    linhas: (valueRanges[i]?.values ?? []).map((linha) => linha.map((c) => String(c ?? ""))),
  }));
}
