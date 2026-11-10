// Metadados do servidor de autorização (RFC 8414). Anuncia CIMD + `none` — o par que faz o
// Claude se identificar pelo documento dele em vez de registro dinâmico — e PKCE S256.

import { lerConfig, metadadosServidor } from "@/lib/oauth/protocolo";

export const dynamic = "force-dynamic";

export function GET() {
  const cfg = lerConfig(process.env);
  if (!cfg.habilitado) return new Response(null, { status: 404 });
  return Response.json(metadadosServidor(cfg), { headers: { "Cache-Control": "public, max-age=300" } });
}
