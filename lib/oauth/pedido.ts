// Preparação de um pedido de autorização — a MESMA função roda quando a tela abre (GET) e
// quando a pessoa clica em Autorizar (Server Action). O POST não confia em nada que veio do
// formulário além da query original e da caixa "gravar": refaz a busca do cliente, a
// validação do redirect, a sessão e a permissão do zero.

import { getSessionUser } from "../auth";
import { requireCtx, type Ctx } from "../perms";
import { buscarCliente } from "./servidor";
import { lerConfig, podeConcederEscrita, validarPedido, type DocumentoCliente, type PedidoAutorizacao } from "./protocolo";

export type Preparo =
  | { tipo: "desligado" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "redirecionar"; url: string }
  | { tipo: "login"; url: string }
  | {
      tipo: "ok";
      doc: DocumentoCliente;
      pedido: PedidoAutorizacao;
      ctx: Ctx;
      /** O cliente pediu gravação E a pessoa pode concedê-la. */
      escritaDisponivel: boolean;
      /** O cliente pediu gravação mas a pessoa não pode concedê-la (papel ou áreas). */
      escritaNegada: boolean;
    };

export async function prepararPedido(q: URLSearchParams): Promise<Preparo> {
  const cfg = lerConfig(process.env);
  if (!cfg.habilitado) return { tipo: "desligado" };

  const clientId = q.get("client_id") ?? "";
  const doc = clientId ? await buscarCliente(clientId, cfg) : null;
  if (!doc) {
    return {
      tipo: "erro",
      mensagem: "Este aplicativo não está autorizado a se conectar ao LIFF go. Peça à administração para incluí-lo.",
    };
  }

  const v = validarPedido(q, doc, cfg);
  if (!v.ok) return "naTela" in v ? { tipo: "erro", mensagem: v.naTela } : { tipo: "redirecionar", url: v.redirect };

  // Sem sessão: entra pelo SSO Google de sempre e volta para esta mesma tela.
  const user = await getSessionUser();
  if (!user) {
    const voltar = `/oauth/autorizar?${q.toString()}`;
    return { tipo: "login", url: `/api/auth/google/start?voltar=${encodeURIComponent(voltar)}` };
  }

  const ctx = await requireCtx();
  if (ctx instanceof Response) return { tipo: "erro", mensagem: "Sua sessão expirou. Entre de novo." };

  const pediuEscrita = v.pedido.escopos.includes("escrita");
  const pode = podeConcederEscrita(ctx.user.papel, ctx.areasEditaveis.length > 0);
  return {
    tipo: "ok",
    doc,
    pedido: v.pedido,
    ctx,
    escritaDisponivel: pediuEscrita && pode,
    escritaNegada: pediuEscrita && !pode,
  };
}
