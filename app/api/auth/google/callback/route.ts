import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGoogleCode, dominioPermitido, DOMINIO_PERMITIDO } from "@/lib/google-oauth";
import { createSession, findOrCreateGoogleUser } from "@/lib/auth";
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
  const voltar = caminhoInternoSeguro(jar.get("google_oauth_voltar")?.value, "/");
  jar.delete("google_oauth_voltar");
  return NextResponse.redirect(new URL(voltar, url.origin));
}
