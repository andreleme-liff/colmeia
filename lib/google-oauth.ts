// Login social com Google — authorization code flow direto com o Google (sem lib externa).
// Qualquer conta Google serve (Workspace ou @gmail.com): quem decide o acesso NÃO é o domínio,
// é a lista de pessoas cadastradas — ver `entrarComGoogle` em lib/auth.ts.
// O id_token vem do token endpoint numa chamada server-to-server autenticada com client_secret,
// então seu conteúdo já é confiável — não precisa reverificar assinatura JWT.
// Mesmo desenho usado no mini-todos.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * E-mails que entram como admin mesmo sem cadastro: `ADMIN_EMAIL`, um ou mais separados por
 * vírgula. É o que tira a base vazia do impasse — sem isto ninguém poderia cadastrar ninguém.
 */
export function emailsAdmin(): string[] {
  return (process.env.ADMIN_EMAIL ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** Formato mínimo de e-mail para o cadastro: é por ele que a conta Google é reconhecida. */
export function emailValido(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function googleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string | null;
};

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleProfile> {
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
  if (!res.ok) throw new Error("Falha ao trocar código com o Google.");

  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Resposta do Google sem id_token.");

  const payload = data.id_token.split(".")[1];
  const json = Buffer.from(payload, "base64url").toString("utf8");
  const claims = JSON.parse(json) as Partial<GoogleProfile>;
  if (!claims.sub || !claims.email) throw new Error("id_token do Google sem claims esperadas.");

  return {
    sub: claims.sub,
    email: claims.email,
    email_verified: !!claims.email_verified,
    name: claims.name || claims.email,
    picture: (claims as { picture?: string }).picture || null,
  };
}
