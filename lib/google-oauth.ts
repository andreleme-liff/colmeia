// SSO via Google Workspace — authorization code flow direto com o Google (sem lib externa).
// O id_token vem do token endpoint numa chamada server-to-server autenticada com client_secret,
// então seu conteúdo já é confiável — não precisa reverificar assinatura JWT.
// Mesmo desenho usado no mini-todos.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const DOMINIO_PERMITIDO = process.env.GOOGLE_ALLOWED_DOMAIN || "getliff.ai";

export function googleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    hd: DOMINIO_PERMITIDO,
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

/** Único ponto de verdade da restrição de domínio — sempre a partir do e-mail verificado. */
export function dominioPermitido(profile: GoogleProfile): boolean {
  return profile.email_verified && profile.email.toLowerCase().endsWith(`@${DOMINIO_PERMITIDO.toLowerCase()}`);
}
