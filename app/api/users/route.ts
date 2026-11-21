// Pré-cadastro de pessoa. Restrito a admin.
//
// É este cadastro que dá acesso: só entra quem tem o e-mail aqui (`entrarComEmail`).
// Cadastrar a pessoa já com nome e papel é o que a deixa pronta para o primeiro login.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { iniciaisDe } from "@/lib/auth";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { PAPEIS } from "@/lib/domain";
import { emailValido } from "@/lib/acesso";

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
  // Este cadastro É a lista de quem pode entrar, com e-mail de qualquer domínio.
  if (!emailValido(email)) return err("E-mail inválido. Confira o endereço.", 400);

  const papel = String(body.papel ?? "membro");
  if (!(PAPEIS as readonly string[]).includes(papel)) return err("Papel inválido.", 400);

  const sql = await getDb();
  const jaExiste = await sql<{ id: number; nome: string; excluido: boolean }[]>`
    SELECT id, nome, excluido_em IS NOT NULL AS excluido FROM users WHERE lower(email) = ${email}
  `;
  // Quem foi excluído do cadastro continua na tabela (o histórico aponta para a linha). Cadastrar
  // o mesmo e-mail de novo traz a pessoa de volta, sem permissão nenhuma — como um convite novo.
  if (jaExiste.length && jaExiste[0].excluido) {
    const id = jaExiste[0].id;
    await sql`
      UPDATE users SET nome = ${nome}, papel = ${papel}, iniciais = ${iniciaisDe(nome)}, ativo = true, excluido_em = NULL
      WHERE id = ${id}
    `;
    await registrar(sql, {
      actorUserId: ctx.user.userId, area: null, entidade: `U-${id}`, campo: "criacao", de: null, para: email,
      texto: `Cadastrou de novo ${nome} (${email}) como ${papel}, depois de uma exclusão`,
    });
    return json({ ok: true, id }, 201);
  }
  if (jaExiste.length) return err(`${jaExiste[0].nome} já está cadastrado com esse e-mail.`, 409);

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
    texto: `Cadastrou ${nome} (${email}) como ${papel}; já pode entrar com esse e-mail`,
  });

  return json({ ok: true, id: nova.id }, 201);
}
