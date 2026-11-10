// Execução das regras de atividade. Sempre DENTRO de uma transação aberta por quem chama —
// a rota HTTP ou o MCP. É isso que garante que dado e auditoria entram juntos ou não entram.
//
// O registro alterado é lido com `FOR UPDATE`: duas edições simultâneas do mesmo card não
// podem ler o mesmo "antes" e gravar dois pares anterior/novo que não se encadeiam.

import type { Queryable } from "../db";
import { registrar } from "../log";
import { ehFalha, type Autor, type Falha, type Fatos, type Permissoes } from "./comum";
import { planejarAtualizacaoAtividade, planejarCriacaoAtividade, type AtividadeAtual } from "./regras-atividade";

export async function carregarFatos(tx: Queryable): Promise<Fatos> {
  const [pessoas, produtos] = await Promise.all([
    tx<{ id: number; nome: string }[]>`SELECT id, nome FROM users`,
    tx<{ id: string; area: string }[]>`SELECT id, area FROM produtos`,
  ]);
  return { pessoas: new Map(pessoas.map((p) => [p.id, p.nome])), produtos: [...produtos] };
}

export async function criarAtividade(
  tx: Queryable,
  perm: Permissoes,
  body: Record<string, unknown>,
  autor: Autor
): Promise<Falha | { ok: true; id: number; ref: string }> {
  const plano = planejarCriacaoAtividade(body, perm, await carregarFatos(tx));
  if (ehFalha(plano)) return plano;
  const l = plano.linha;

  // Ref legível vinda de sequence, para não colidir com as semeadas nem correr risco de
  // duas criações simultâneas gerarem o mesmo código.
  const [{ ref }] = await tx<{ ref: string }[]>`SELECT 'A-' || nextval('activities_ref_seq') AS ref`;

  // A coluna `tipo` fica de fora: continua no banco, com default, mas deixou de ser
  // vocabulário do sistema.
  const [nova] = await tx<{ id: number }[]>`
    INSERT INTO activities (ref, titulo, area, status, responsavel_user_id, prazo, prioridade,
                            situacao, proximo_passo, proximo_passo_em, produto_id)
    VALUES (${ref}, ${l.titulo}, ${l.area}, ${l.status}, ${l.responsavelId}, ${l.prazo}, ${l.prioridade},
            ${l.situacao}, ${l.proximoPasso}, ${l.proximoPassoEm}, ${l.produtoId})
    RETURNING id
  `;

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

export async function atualizarAtividade(
  tx: Queryable,
  perm: Permissoes,
  activityId: number,
  body: Record<string, unknown>,
  autor: Autor
): Promise<Falha | { ok: true; ref: string; mudancas: number }> {
  const linhas = await tx<AtividadeAtual[]>`
    SELECT a.id, a.ref, a.titulo, a.area, a.status, a.prioridade, a.responsavel_user_id,
           a.situacao, a.proximo_passo, a.proximo_passo_em, a.produto_id, a.prazo, u.nome AS responsavel
    FROM activities a LEFT JOIN users u ON u.id = a.responsavel_user_id
    WHERE a.id = ${activityId}
    FOR UPDATE OF a
  `;
  if (!linhas.length) return { ok: false, erro: "Atividade não encontrada.", status: 404 };
  const atual = linhas[0];

  const plano = planejarAtualizacaoAtividade(atual, body, perm, await carregarFatos(tx));
  if (ehFalha(plano)) return plano;

  if (Object.keys(plano.sets).length) {
    // As chaves de `sets` só podem ser as da união `ColunaAtividade` — a regra não monta nome
    // de coluna a partir da entrada. Os valores vão parametrizados.
    await tx`UPDATE activities SET ${tx(plano.sets)}, atualizado_em = now() WHERE id = ${activityId}`;
  }

  for (const m of plano.mudancas) {
    await registrar(tx, {
      ...m,
      actorUserId: autor.userId,
      area: plano.areaFinal,
      entidade: atual.ref,
      origem: autor.origem,
      concessaoId: autor.concessaoId,
    });
  }

  return { ok: true, ref: atual.ref, mudancas: plano.mudancas.length };
}
