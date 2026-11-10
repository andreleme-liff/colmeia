// Tela de consentimento do OAuth. Renderizada no servidor: quem pede, para onde o código
// volta, e o que a conexão vai poder — a decisão é da pessoa, aqui.
//
// Cabeçalhos anti-moldura e no-store vêm do next.config: emoldurar esta tela num site
// alheio é o jeito clássico de induzir o clique em "Autorizar".

import { notFound, redirect } from "next/navigation";
import { prepararPedido } from "@/lib/oauth/pedido";
import { hostDeRetorno } from "@/lib/oauth/servidor";
import { redirectEhLoopback } from "@/lib/oauth/protocolo";
import TelaConsentimento from "./TelaConsentimento";
import { autorizarConexao, recusarConexao } from "./acoes";

export const dynamic = "force-dynamic";

export default async function Autorizar(props: PageProps<"/oauth/autorizar">) {
  const sp = await props.searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") q.set(k, v);

  const p = await prepararPedido(q);
  if (p.tipo === "desligado") notFound();
  if (p.tipo === "redirecionar" || p.tipo === "login") redirect(p.url);
  if (p.tipo === "erro") return <TelaConsentimento modo="erro" mensagem={p.mensagem} />;

  const areas = (lista: string[]) => lista.map((a) => p.ctx.labelArea(a));
  return (
    <TelaConsentimento
      modo="pedido"
      query={q.toString()}
      cliente={p.doc.nome}
      clienteHost={new URL(p.doc.clientId).hostname}
      retorno={hostDeRetorno(p.pedido.redirectUri)}
      loopback={redirectEhLoopback(p.pedido.redirectUri)}
      pessoa={p.ctx.user.nome}
      email={p.ctx.user.email}
      areasLeitura={areas(p.ctx.areasVisiveis)}
      areasEscrita={areas(p.ctx.areasEditaveis)}
      escritaDisponivel={p.escritaDisponivel}
      escritaNegada={p.escritaNegada}
      autorizar={autorizarConexao}
      recusar={recusarConexao}
    />
  );
}
