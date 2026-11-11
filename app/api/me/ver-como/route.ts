// "Ver como": a administração olha o sistema com outro papel, para conferir o que cada perfil
// enxerga e consegue fazer.
//
// Liga e desliga um cookie que `requireCtx` (lib/perms.ts) respeita. A autorização aqui é pelo
// papel REAL da sessão, lido direto do banco — nunca pelo papel simulado, senão quem entrou no
// modo "leitura" não conseguiria sair dele. Só admin de verdade liga, e só para papéis com
// MENOS acesso que o dele: não existe "ver como admin" para quem não é.

import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { COOKIE_VER_COMO, PAPEIS_SIMULAVEIS } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Não autenticado.", 401);
  if (user.papel !== "admin") return err("Ação restrita à administração.", 403);

  const corpo = await lerCorpo(req);
  const papel = corpo?.papel ?? null;
  const jar = await cookies();
  if (papel === null || papel === "admin") {
    jar.delete(COOKIE_VER_COMO);
    return json({ ok: true, verComo: null });
  }
  if (typeof papel !== "string" || !(PAPEIS_SIMULAVEIS as readonly string[]).includes(papel)) return err("Papel inválido.", 400);
  // Cookie de sessão (sem validade): fechar o navegador desfaz a simulação.
  jar.set(COOKIE_VER_COMO, papel, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return json({ ok: true, verComo: papel });
}
