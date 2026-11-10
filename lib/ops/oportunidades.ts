// Execução das regras de oportunidade. Mesma convenção de `atividades.ts`: roda dentro da
// transação de quem chama, com o registro travado por `FOR UPDATE`.
//
// A exclusão NÃO está aqui. Ela continua só na rota HTTP, para a interface; o MCP não exclui
// nada, e manter a operação fora do núcleo compartilhado é o que garante isso.

import type { Queryable } from "../db";
import { registrar } from "../log";
import { formatarRef } from "../domain";
import { carregarFatos } from "./atividades";
import { ehFalha, type Autor, type Falha, type Permissoes } from "./comum";
import {
  planejarAtualizacaoOportunidade, planejarCriacaoOportunidade, planejarMovimento,
  type OportunidadeAtual, type PlanoOportunidade,
} from "./regras-oportunidade";

export async function criarOportunidade(
  tx: Queryable,
  perm: Permissoes,
  body: Record<string, unknown>,
  autor: Autor
): Promise<Falha | { ok: true; id: number; ref: string }> {
  const plano = planejarCriacaoOportunidade(body, perm, await carregarFatos(tx));
  if (ehFalha(plano)) return plano;
  const l = plano.linha;

  const [{ n }] = await tx<{ n: string }[]>`SELECT nextval('deals_ref_seq') AS n`;
  const ref = formatarRef("oportunidade", n);

  const [nova] = await tx<{ id: number }[]>`
    INSERT INTO deals (ref, conta, area, estagio, valor_centavos, responsavel_user_id,
                       proximo_passo, proximo_passo_em, situacao, contato, responsavel_texto, ace_aws,
                       origem_id, ponte, contato_operacional, dor, erp, ultima_interacao,
                       blocker, blocker_tipo, blocker_dono_id, motivo_perda, motivo_perda_detalhe, notas)
    VALUES (${ref}, ${l.conta}, ${l.area}, ${l.estagio}, ${l.valorCentavos}, ${l.responsavelId},
            ${l.proximoPasso}, ${l.proximoPassoEm}, ${l.situacao}, ${l.contato}, ${l.responsavelTexto}, ${l.aceAws},
            ${l.origemId}, ${l.ponte}, ${l.contatoOperacional}, ${l.dor}, ${l.erp}, ${l.ultimaInteracao},
            ${l.blocker}, ${l.blockerTipo}, ${l.blockerDonoId}, ${l.motivoPerda}, ${l.motivoPerdaDetalhe}, ${l.notas})
    RETURNING id
  `;
  await gravarModulos(tx, nova.id, l.modulos);

  await registrar(tx, {
    ...plano.auditoria,
    actorUserId: autor.userId,
    area: l.area,
    entidade: ref,
    origem: autor.origem,
    concessaoId: autor.concessaoId,
  });

  return { ok: true, id: nova.id, ref };
}

/** Troca a lista inteira de módulos da oportunidade. Dentro da transação de quem chama. */
async function gravarModulos(tx: Queryable, dealId: number, modulos: string[]): Promise<void> {
  await tx`DELETE FROM oportunidade_modulos WHERE deal_id = ${dealId}`;
  for (const produtoId of modulos) {
    await tx`INSERT INTO oportunidade_modulos (deal_id, produto_id) VALUES (${dealId}, ${produtoId})`;
  }
}

async function lerAtual(tx: Queryable, dealId: number): Promise<OportunidadeAtual | null> {
  const linhas = await tx<OportunidadeAtual[]>`
    SELECT d.id, d.ref, d.conta, d.area, d.estagio, d.valor_centavos, d.proximo_passo,
           d.responsavel_user_id, u.nome AS responsavel,
           d.situacao, d.contato, d.responsavel_texto, d.proximo_passo_em, d.ace_aws,
           d.origem_id, d.ponte, d.contato_operacional, d.dor, d.erp, d.ultima_interacao,
           d.blocker, d.blocker_tipo, d.blocker_dono_id, d.motivo_perda, d.motivo_perda_detalhe, d.notas,
           COALESCE((SELECT array_agg(m.produto_id ORDER BY m.produto_id) FROM oportunidade_modulos m
                     WHERE m.deal_id = d.id), '{}') AS modulos
    FROM deals d LEFT JOIN users u ON u.id = d.responsavel_user_id
    WHERE d.id = ${dealId}
    FOR UPDATE OF d
  `;
  return linhas[0] ?? null;
}

async function aplicar(
  tx: Queryable,
  dealId: number,
  ref: string,
  plano: PlanoOportunidade,
  autor: Autor
): Promise<void> {
  if (Object.keys(plano.sets).length) {
    // Chaves de `sets` vêm da união `ColunaOportunidade`; valores parametrizados.
    await tx`UPDATE deals SET ${tx(plano.sets)}, atualizado_em = now() WHERE id = ${dealId}`;
  }
  if (plano.modulos) {
    await gravarModulos(tx, dealId, plano.modulos);
    if (!Object.keys(plano.sets).length) await tx`UPDATE deals SET atualizado_em = now() WHERE id = ${dealId}`;
  }
  // A área do registro pode ter acabado de mudar; a auditoria fica na área de destino.
  for (const m of plano.mudancas) {
    await registrar(tx, {
      ...m,
      actorUserId: autor.userId,
      area: plano.areaFinal,
      entidade: ref,
      origem: autor.origem,
      concessaoId: autor.concessaoId,
    });
  }
}

/**
 * Alteração de oportunidade. Com `direcao` no corpo, é o movimento de uma casa pelas setas do
 * card, e TODO o resto do corpo é ignorado — como a rota sempre fez.
 */
export async function atualizarOportunidade(
  tx: Queryable,
  perm: Permissoes,
  dealId: number,
  body: Record<string, unknown>,
  autor: Autor
): Promise<Falha | { ok: true; ref: string; mudancas: number }> {
  const atual = await lerAtual(tx, dealId);
  if (!atual) return { ok: false, erro: "Oportunidade não encontrada.", status: 404 };

  const plano =
    body.direcao !== undefined
      ? planejarMovimento(atual, body.direcao, perm)
      : planejarAtualizacaoOportunidade(atual, body, perm, await carregarFatos(tx));
  if (ehFalha(plano)) return plano;

  await aplicar(tx, dealId, atual.ref, plano, autor);
  return { ok: true, ref: atual.ref, mudancas: plano.mudancas.length };
}
