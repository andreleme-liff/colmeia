// Metadados do recurso protegido para o MCP em /api/mcp — o endereço que o 401 aponta em
// `resource_metadata`, e o primeiro que o cliente tenta (RFC 9728 §3.1).

import { lerConfig, metadadosRecurso } from "@/lib/oauth/protocolo";

export const dynamic = "force-dynamic";

export function GET() {
  const cfg = lerConfig(process.env);
  if (!cfg.habilitado) return new Response(null, { status: 404 });
  return Response.json(metadadosRecurso(cfg), { headers: { "Cache-Control": "public, max-age=300" } });
}
