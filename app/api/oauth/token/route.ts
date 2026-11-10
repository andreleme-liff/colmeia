// Token endpoint (OAuth 2.1). Troca código + PKCE por tokens, e renova com rotação.
//
// Corpo em `application/x-www-form-urlencoded` (RFC 6749 §4.1.3) — é o que o Claude manda,
// e um parser só de JSON devolveria 415. Cliente público: sem segredo; quem prova a posse é
// o `code_verifier`. Erros no vocabulário do RFC 6749 (`invalid_grant` etc.): o Claude decide
// renovar ou pedir login de novo pelo código, não pela mensagem.

import { getDb } from "@/lib/db";
import { lerConfig } from "@/lib/oauth/protocolo";
import { trocarCodigo, trocarRefresh, type ErroToken } from "@/lib/oauth/servidor";

const SEM_CACHE = { "Cache-Control": "no-store", Pragma: "no-cache" };

function erro(e: ErroToken["error"], descricao: string, status = 400): Response {
  return Response.json({ error: e, error_description: descricao }, { status, headers: SEM_CACHE });
}

export async function POST(req: Request) {
  const cfg = lerConfig(process.env);
  if (!cfg.habilitado) return new Response(null, { status: 404 });

  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return erro("invalid_request", "o corpo deve ser application/x-www-form-urlencoded");
  }
  const bruto = await req.text();
  if (bruto.length > 8192) return erro("invalid_request", "corpo grande demais");
  const f = new URLSearchParams(bruto);

  const clientId = f.get("client_id") ?? "";
  if (!clientId) return erro("invalid_request", "client_id é obrigatório");
  const resource = f.get("resource");
  const tipo = f.get("grant_type");

  const sql = await getDb();

  if (tipo === "authorization_code") {
    const code = f.get("code") ?? "";
    const verifier = f.get("code_verifier") ?? "";
    const redirectUri = f.get("redirect_uri") ?? "";
    if (!code || !verifier || !redirectUri) return erro("invalid_request", "code, code_verifier e redirect_uri são obrigatórios");
    const r = await sql.begin((tx) => trocarCodigo(tx, { code, verifier, clientId, redirectUri, resource }, cfg));
    return "error" in r ? erro(r.error, r.error_description) : Response.json(r, { headers: SEM_CACHE });
  }

  if (tipo === "refresh_token") {
    const refresh = f.get("refresh_token") ?? "";
    if (!refresh) return erro("invalid_request", "refresh_token é obrigatório");
    const r = await sql.begin((tx) => trocarRefresh(tx, { refresh, clientId, resource }, cfg));
    return "error" in r ? erro(r.error, r.error_description) : Response.json(r, { headers: SEM_CACHE });
  }

  return erro("unsupported_grant_type", "só authorization_code e refresh_token");
}
