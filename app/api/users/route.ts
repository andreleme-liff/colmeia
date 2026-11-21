// Pré-cadastro de pessoa. Restrito a admin.
//
// É este cadastro que dá acesso: só entra pelo Google quem tem o e-mail aqui. O que este
// cadastro faz é deixar a pessoa PREPARADA antes disso — nome, papel e, logo em seguida, as
// permissões por área na tela de Administração. Quando ela entrar com a conta Google desse
// e-mail, `entrarComGoogle` encontra a linha pelo e-mail, adota o registro (preenche
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
import { emailValido } from "@/lib/google-oauth";

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
  // Este cadastro É a lista de quem pode entrar: o login aceita qualquer conta Google cujo
  // e-mail esteja aqui, de qualquer domínio (inclusive @gmail.com).
  if (!emailValido(email)) return err("E-mail inválido. Use o e-mail da conta Google da pessoa.", 400);

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
