import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGoogleCode, dominioPermitido, DOMINIO_PERMITIDO } from "@/lib/google-oauth";
import { createSession, findOrCreateGoogleUser, getSessionUser } from "@/lib/auth";
import { guardarRefreshToken } from "@/lib/google-sheets";
import { caminhoInternoSeguro } from "@/lib/rotas";

export async function GET(req: Request) {
  const url = new URL(req.url);

  function erro(msg: string) {
    return NextResponse.redirect(`${url.origin}/login?erro=${encodeURIComponent(msg)}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const cookieState = jar.get("google_oauth_state")?.value;
  jar.delete("google_oauth_state");

  if (!code || !state || !cookieState || state !== cookieState) {
    return erro("Falha na autenticação com o Google. Tente novamente.");
  }

  /**
   * Duas voltas chegam por aqui. O `state` com prefixo `sheets:` é o consentimento
   * incremental de leitura de planilha, de alguém que JÁ está logado — nesse caso não se
   * cria sessão nem se toca no perfil; só se guarda o refresh token.
   */
  if (state.startsWith("sheets:")) {
    const voltar = caminhoInternoSeguro(jar.get("google_oauth_voltar")?.value);
    jar.delete("google_oauth_voltar");
    const user = await getSessionUser();
    if (!user) return erro("Sua sessão expirou. Entre de novo e tente sincronizar.");

    const ok = await guardarRefreshToken(user.userId, code, `${url.origin}/api/auth/google/callback`);
    const destino = new URL(voltar, url.origin);
    if (!ok) destino.searchParams.set("sheets", "falhou");
    return NextResponse.redirect(destino);
  }

  let profile;
  try {
    profile = await exchangeGoogleCode(code, `${url.origin}/api/auth/google/callback`);
  } catch {
    return erro("Não foi possível confirmar sua conta Google.");
  }

  if (!dominioPermitido(profile)) {
    return erro(`Use uma conta @${DOMINIO_PERMITIDO} para entrar.`);
  }

  const userId = await findOrCreateGoogleUser(profile.email, profile.name, profile.sub, profile.picture);
  await createSession(userId);
  return NextResponse.redirect(`${url.origin}/`);
}
