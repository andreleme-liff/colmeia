// Pré-cadastro de pessoa. Restrito a admin.
//
// Ninguém "cria uma conta" aqui: a conta nasce no primeiro login pelo Google. O que este
// cadastro faz é deixar a pessoa PREPARADA antes disso — nome, papel e, logo em seguida, as
// permissões por área na tela de Administração. Quando ela entrar com a conta @getliff.ai,
// `findOrCreateGoogleUser` encontra a linha pelo e-mail, adota o registro (preenche
// google_sub, foto e nome vindos do Google) e a pessoa já entra enxergando o que deve.
//
// Sem isto, todo mundo entra sem área nenhuma e precisa de uma segunda passada da
// administração depois do primeiro login.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { iniciaisDe } from "@/lib/auth";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { PAPEIS } from "@/lib/domain";
import { DOMINIO_PERMITIDO } from "@/lib/google-oauth";

type Body = { nome?: string; email?: string; papel?: string };

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const nome = String(body.nome ?? "").trim();
  if (!nome) return err("A pessoa precisa de um nome.", 400);
  if (nome.length > 120) return err("Nome longo demais.", 400);

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return err("A pessoa precisa de um e-mail.", 400);
  // O login só aceita o domínio da casa. Cadastrar outro domínio produziria uma linha que
  // nunca vira acesso — melhor recusar aqui, onde dá para explicar o motivo.
  if (!email.endsWith(`@${DOMINIO_PERMITIDO.toLowerCase()}`)) {
    return err(`O e-mail precisa ser @${DOMINIO_PERMITIDO} — é o domínio aceito no login.`, 400);
  }

  const papel = String(body.papel ?? "membro");
  if (!(PAPEIS as readonly string[]).includes(papel)) return err("Papel inválido.", 400);

  const sql = await getDb();
  const jaExiste = await sql<{ nome: string }[]>`SELECT nome FROM users WHERE lower(email) = ${email}`;
  if (jaExiste.length) return err(`${jaExiste[0].nome} já está cadastrado com esse e-mail.`, 409);

  // Sem google_sub de propósito: é o que marca a linha como "convidada, ainda não entrou".
  const [nova] = await sql<{ id: number }[]>`
    INSERT INTO users (nome, email, papel, iniciais)
    VALUES (${nome}, ${email}, ${papel}, ${iniciaisDe(nome)})
    RETURNING id
  `;

  await registrar(sql, {
    actorUserId: ctx.user.userId,
    area: null,
    entidade: `U-${nova.id}`,
    campo: "criacao",
    de: null,
    para: email,
    texto: `Cadastrou ${nome} (${email}) como ${papel}; entra no primeiro login pelo Google`,
  });

  return json({ ok: true, id: nova.id }, 201);
}
