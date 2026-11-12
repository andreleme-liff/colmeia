// Execução das regras de atividade. Sempre DENTRO de uma transação aberta por quem chama —
// a rota HTTP ou o MCP. É isso que garante que dado e auditoria entram juntos ou não entram.
//
// O registro alterado é lido com `FOR UPDATE`: duas edições simultâneas do mesmo card não
// podem ler o mesmo "antes" e gravar dois pares anterior/novo que não se encadeiam.

import type { Queryable } from "../db";
import { registrar } from "../log";
import { formatarRef } from "../domain";
import { ehFalha, type Autor, type Falha, type Fatos, type Permissoes } from "./comum";
import { planejarAtualizacaoAtividade, planejarCriacaoAtividade, type AtividadeAtual } from "./regras-atividade";

export async function carregarFatos(tx: Queryable): Promise<Fatos> {
  const [pessoas, produtos, oportunidades, origens, arquetipos] = await Promise.all([
    tx<{ id: number; nome: string }[]>`SELECT id, nome FROM users WHERE excluido_em IS NULL`,
    tx<{ id: string; area: string; label: string }[]>`SELECT id, area, label FROM produtos`,
    tx<{ id: number; ref: string; conta: string; area: string }[]>`SELECT id, ref, conta, area FROM deals`,
    tx<{ id: string; label: string; ativo: boolean }[]>`SELECT id, label, ativo FROM origens`,
    tx<{ id: number; nome: string; ativo: boolean; pasta: string | null; area: string | null }[]>`
      SELECT a.id, a.nome, a.ativo, p.nome AS pasta, COALESCE(m.area, p.area) AS area FROM funding_arquetipos a LEFT JOIN funding_pastas p ON p.id = a.pasta_id LEFT JOIN produtos m ON m.id = p.produto_id ORDER BY p.ordem NULLS LAST, a.ordem, a.nome
    `,
  ]);
  return {
    pessoas: new Map(pessoas.map((p) => [p.id, p.nome])),
    produtos: [...produtos],
    oportunidades: [...oportunidades],
    origens: [...origens],
    arquetipos: [...arquetipos],
  };
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
  const [{ n }] = await tx<{ n: string }[]>`SELECT nextval('activities_ref_seq') AS n`;
  const ref = formatarRef("atividade", n);

  // A coluna `tipo` fica de fora: continua no banco, com default, mas deixou de ser
  // vocabulário do sistema.
  const [nova] = await tx<{ id: number }[]>`
    INSERT INTO activities (ref, titulo, area, status, responsavel_user_id, prazo, prioridade,
                            situacao, proximo_passo, proximo_passo_em, produto_id, oportunidade_id)
    VALUES (${ref}, ${l.titulo}, ${l.area}, ${l.status}, ${l.responsavelId}, ${l.prazo}, ${l.prioridade},
            ${l.situacao}, ${l.proximoPasso}, ${l.proximoPassoEm}, ${l.produtoId}, ${l.oportunidadeId})
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
           a.situacao, a.proximo_passo, a.proximo_passo_em, a.produto_id, a.prazo, a.oportunidade_id,
           u.nome AS responsavel
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
