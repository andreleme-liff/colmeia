// Funding AWS: tudo de uma vez (programas, arquétipos com calculadoras, estimativas com
// linhas). Só administração.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { json } from "@/lib/http";
import { lerFunding } from "@/lib/funding-db";

export async function GET() {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  return json(await lerFunding(await getDb()));
}
