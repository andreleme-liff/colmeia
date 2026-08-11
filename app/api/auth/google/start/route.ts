import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { googleAuthUrl } from "@/lib/google-oauth";

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
  return res;
}
