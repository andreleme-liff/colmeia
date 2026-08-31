// Consentimento incremental do escopo de planilha.
//
// GET  → manda a pessoa ao Google pedindo SÓ o escopo de leitura de planilhas.
// Volta pelo mesmo callback do login, marcado pelo state, que guarda o refresh token.
// DELETE → esquece o token aqui (o consentimento no Google segue até ela tirar lá).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireCtx } from "@/lib/perms";
import { json } from "@/lib/http";
import { urlConsentimentoSheets, esquecerAcessoSheets } from "@/lib/google-sheets";
import { caminhoInternoSeguro } from "@/lib/rotas";

export async function GET(req: Request) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  // O state carrega o marcador `sheets:` para o callback saber que esta volta é de
  // consentimento incremental, e não de login — os dois passam pelo mesmo endereço.
  const state = `sheets:${randomBytes(16).toString("hex")}`;
  const jar = await cookies();
  jar.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  // Para onde voltar depois de consentir — só caminho interno, nunca destino de fora.
  jar.set("google_oauth_voltar", caminhoInternoSeguro(url.searchParams.get("voltar")), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(
    urlConsentimentoSheets(`${url.origin}/api/auth/google/callback`, state, ctx.user.email)
  );
}

export async function DELETE() {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;
  await esquecerAcessoSheets(ctx.user.userId);
  return json({ ok: true });
}
