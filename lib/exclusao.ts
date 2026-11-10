// Exclusão de oportunidades e atividades, e o destino dos registros ligados a um cadastro
// (produto ou pessoa) que vai ser excluído.
//
// Fica FORA de `lib/ops` de propósito: o núcleo compartilhado é o que o MCP alcança, e o MCP
// não exclui nada. Só as rotas HTTP da interface importam este arquivo.
//
// Tudo aqui roda dentro da transação de quem chama, e cada registro tocado ganha a sua linha
// de auditoria — o histórico da tarefa ou do card diz o que aconteceu com ele e por quê.

import type { Queryable } from "./db";
import { registrar } from "./log";
import { brlExato } from "./domain";
import { rotuloOportunidade } from "./ops/comum";

export type OportunidadeAlvo = { id: number; ref: string; conta: string; area: string; valor_centavos: string | number };
export type AtividadeAlvo = { id: number; ref: string; titulo: string; area: string };

/**
 * Exclui uma oportunidade. As tarefas ligadas ficam; o vínculo cai (SET NULL) e cada uma ganha
 * a linha que conta por quê. `motivo` entra no texto da auditoria ("ao excluir o produto X").
 */
export async function excluirOportunidade(
  tx: Queryable,
  alvo: OportunidadeAlvo,
  actorUserId: number,
  motivo?: string
): Promise<void> {
  const ligadas = await tx<{ ref: string; titulo: string; area: string }[]>`
    SELECT ref, titulo, area FROM activities WHERE oportunidade_id = ${alvo.id}
  `;
  for (const t of ligadas) {
    // A conta só aparece se a oportunidade era da mesma área (ver rotuloOportunidade): quem lê
    // o histórico da tarefa pode não enxergar a venda.
    const rotulo = rotuloOportunidade(alvo, t.area);
    await registrar(tx, {
      actorUserId,
      area: t.area,
      entidade: t.ref,
      campo: "oportunidade",
      de: rotulo,
      para: "—",
      texto: `"${t.titulo}" perdeu o vínculo: a oportunidade ${rotulo} foi excluída`,
    });
  }

  await tx`DELETE FROM deals WHERE id = ${alvo.id}`;
  await registrar(tx, {
    actorUserId,
    area: alvo.area,
    entidade: alvo.ref,
    campo: "exclusao",
    de: alvo.conta,
    para: null,
    texto: `Excluiu a oportunidade ${alvo.conta} (${brlExato(Number(alvo.valor_centavos))})${motivo ? ` ${motivo}` : ""}`,
  });
}

/** Exclui uma atividade. Não há nada pendurado nela além da auditoria, que fica. */
export async function excluirAtividade(
  tx: Queryable,
  alvo: AtividadeAlvo,
  actorUserId: number,
  motivo?: string
): Promise<void> {
  await tx`DELETE FROM activities WHERE id = ${alvo.id}`;
  await registrar(tx, {
    actorUserId,
    area: alvo.area,
    entidade: alvo.ref,
    campo: "exclusao",
    de: alvo.titulo,
    para: null,
    texto: `Excluiu a atividade "${alvo.titulo}"${motivo ? ` ${motivo}` : ""}`,
  });
}

/** O que fazer com o que aponta para o cadastro excluído. */
export type Destino =
  | { acao: "migrar"; para: string | number }
  | { acao: "excluir" }
  | { acao: "desvincular" };

export function lerDestino(body: Record<string, unknown> | null): Destino | null {
  const acao = body?.acao;
  if (acao === "excluir" || acao === "desvincular") return { acao };
  if (acao === "migrar" && (typeof body?.para === "string" || typeof body?.para === "number")) {
    return { acao, para: body.para };
  }
  return null;
}
