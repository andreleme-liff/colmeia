// Login por e-mail, SEM SENHA e sem confirmação — provisório, até o sistema de senha existir.
//
// ATENÇÃO: isto identifica, não autentica. Quem souber o e-mail de uma pessoa cadastrada
// entra como ela. Serve enquanto a base está em montagem; antes de haver dado de verdade,
// troque por senha (ou link por e-mail). A resposta de recusa é a mesma para e-mail
// desconhecido e para pessoa desativada, para a tela não virar consulta de quem tem cadastro.

import { createSession, entrarComEmail } from "@/lib/auth";
import { emailValido } from "@/lib/acesso";
import { json, err, lerCorpo } from "@/lib/http";

export async function POST(req: Request) {
  const body = await lerCorpo(req);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!emailValido(email)) return err("Digite um e-mail válido.", 400);

  const userId = await entrarComEmail(email);
  if (userId === null) {
    return err("Este e-mail não tem acesso. Peça à administração para cadastrá-lo.", 403);
  }
  await createSession(userId);
  return json({ ok: true });
}
