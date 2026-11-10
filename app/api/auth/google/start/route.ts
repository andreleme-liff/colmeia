import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { googleAuthUrl } from "@/lib/google-oauth";
import { caminhoInternoSeguro } from "@/lib/rotas";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Sem credencial configurada, volta para a tela de acesso com a mensagem no lugar certo —
  // um 500 cru só deixaria a pessoa sem saber o que aconteceu.
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    const msg = "Login com Google ainda não está configurado neste ambiente.";
    return NextResponse.redirect(`${url.origin}/login?erro=${encodeURIComponent(msg)}`);
  }

  const redirectUri = `${url.origin}/api/auth/google/callback`;
  const state = randomBytes(16).toString("hex");

  const res = NextResponse.redirect(googleAuthUrl(redirectUri, state));
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  // Para onde voltar depois do login — hoje, a tela de consentimento do OAuth, que manda a
  // pessoa entrar e retomar o pedido. Só caminho interno: `caminhoInternoSeguro` recusa
  // `//host` e afins, então isto não vira redirecionamento aberto.
  const voltar = url.searchParams.get("voltar");
  if (voltar) {
    res.cookies.set("google_oauth_voltar", caminhoInternoSeguro(voltar, "/"), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
  }
  return res;
}
