"use server";

// Decisão da tela de consentimento. Server Action e não rota própria: o Next só aceita
// POST aqui e aborta quando o `Origin` não bate com o `Host` — a proteção contra CSRF vem
// do framework, somada ao cookie de sessão `SameSite=Lax`. E nada do formulário é aceito
// sem passar de novo por `prepararPedido`, exatamente como na abertura da tela.

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { prepararPedido } from "@/lib/oauth/pedido";
import { autorizar } from "@/lib/oauth/servidor";
import { escoposConcedidos, lerConfig, urlDeRetorno } from "@/lib/oauth/protocolo";

function queryDo(form: FormData): URLSearchParams {
  const bruto = form.get("q");
  return new URLSearchParams(typeof bruto === "string" ? bruto.slice(0, 8192) : "");
}

export async function autorizarConexao(form: FormData): Promise<void> {
  const p = await prepararPedido(queryDo(form));
  if (p.tipo === "redirecionar" || p.tipo === "login") redirect(p.url);
  if (p.tipo !== "ok") redirect(`/oauth/autorizar?${queryDo(form).toString()}`);

  const cfg = lerConfig(process.env);
  const escopos = escoposConcedidos({
    pedidos: p.pedido.escopos,
    marcouEscrita: form.get("escrita") === "1",
    papel: p.ctx.user.papel,
    editaAlgumaArea: p.ctx.areasEditaveis.length > 0,
  });

  const sql = await getDb();
  const url = await sql.begin((tx) =>
    autorizar(tx, { userId: p.ctx.user.userId, nomePessoa: p.ctx.user.nome, doc: p.doc, pedido: p.pedido, escopos, cfg })
  );
  redirect(url);
}

export async function recusarConexao(form: FormData): Promise<void> {
  const p = await prepararPedido(queryDo(form));
  if (p.tipo === "redirecionar" || p.tipo === "login") redirect(p.url);
  if (p.tipo !== "ok") redirect(`/oauth/autorizar?${queryDo(form).toString()}`);
  const cfg = lerConfig(process.env);
  redirect(
    urlDeRetorno(p.pedido.redirectUri, {
      error: "access_denied",
      error_description: "a pessoa recusou o acesso",
      state: p.pedido.state,
      iss: cfg.issuer,
    })
  );
}
