import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGoogleCode } from "@/lib/google-oauth";
import { createSession, entrarComGoogle } from "@/lib/auth";
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

  // E-mail não verificado pelo Google não prova nada sobre quem é a pessoa.
  if (!profile.email_verified) {
    return erro("O Google não confirmou o e-mail desta conta. Use outra conta.");
  }

  // Só entra quem está cadastrado (ou em ADMIN_EMAIL). A mensagem cita o e-mail porque o
  // engano mais comum é escolher a conta Google errada no seletor.
  const userId = await entrarComGoogle(profile.email, profile.name, profile.sub, profile.picture);
  if (userId === null) {
    return erro(`A conta ${profile.email} não tem acesso. Peça à administração para cadastrar este e-mail.`);
  }
  await createSession(userId);
  const voltar = caminhoInternoSeguro(jar.get("google_oauth_voltar")?.value, "/");
  jar.delete("google_oauth_voltar");
  return NextResponse.redirect(new URL(voltar, url.origin));
}
