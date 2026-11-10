// Metadados do recurso protegido (RFC 9728), na raiz. O cliente tenta primeiro o caminho com
// o path do MCP inserido (ver `api/mcp/route.ts` ao lado) e cai aqui se não achar.

import { lerConfig, metadadosRecurso } from "@/lib/oauth/protocolo";

export const dynamic = "force-dynamic";

export function GET() {
  const cfg = lerConfig(process.env);
  if (!cfg.habilitado) return new Response(null, { status: 404 });
  return Response.json(metadadosRecurso(cfg), { headers: { "Cache-Control": "public, max-age=300" } });
}
