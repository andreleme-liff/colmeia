import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { googleAuthUrl } from "@/lib/google-oauth";

export async function GET(req: Request) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return new Response("Login com Google não está configurado.", { status: 500 });
  }

  const url = new URL(req.url);
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
