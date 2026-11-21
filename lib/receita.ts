// Leitura e gravação dos contratos de receita no banco. As regras de conta e de validação
// moram em `forecast.ts`. A interface (rotas /api/receita) e o MCP gravam pelas mesmas
// funções daqui, cada uma com a sua linha de auditoria na mesma transação.

import type { Queryable } from "./db";
import { registrar } from "./log";
import { vincularContrato } from "./clientes-db";
import { resumoContrato, type Contrato, type EntradaContrato } from "./forecast";

/** Quem grava: a pessoa, e se foi pela interface (origem null) ou por uma conexão MCP. */
export type Autor = { userId: number; origem: "mcp" | null; concessaoId: number | null };
const marca = (a: Autor) => ({ actorUserId: a.userId, origem: a.origem, concessaoId: a.concessaoId });

type Linha = {
  id: number; ref: string; deal_id: number | null; cliente_id: number | null; conta: string; area: string; situacao: "contratada" | "prevista";
  chance: "alta" | "baixa" | null; notas: string;
  cnpj: string; email_cobranca: string; forma_cobranca: string;
  parcelas: { id: number; data: string; valor_centavos: string | number }[];
};

export async function lerContratos(sql: Queryable): Promise<Contrato[]> {
  const rows = await sql<Linha[]>`
    SELECT c.id, c.ref, c.deal_id, c.cliente_id, c.conta, c.area, c.situacao, c.chance, c.notas,
           c.cnpj, c.email_cobranca, c.forma_cobranca,
           COALESCE((SELECT json_agg(json_build_object('id', p.id, 'data', to_char(p.vencimento, 'YYYY-MM-DD'), 'valor_centavos', p.valor_centavos)
                                     ORDER BY p.vencimento, p.id)
                     FROM contrato_parcelas p WHERE p.contrato_id = c.id), '[]'::json) AS parcelas
    FROM contratos c
    ORDER BY c.conta ASC, c.id ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    ref: r.ref,
    conta: r.conta,
    area: r.area,
    dealId: r.deal_id,
    clienteId: r.cliente_id,
    situacao: r.situacao,
    chance: r.chance,
    notas: r.notas,
    cobranca: {
      cnpj: r.cnpj,
      emailCobranca: r.email_cobranca,
      formaCobranca: r.forma_cobranca as Contrato["cobranca"]["formaCobranca"],
    },
    parcelas: r.parcelas.map((p) => ({ id: p.id, data: p.data, valorCentavos: Number(p.valor_centavos) })),
  }));
}

/** Confere produto e card antes de gravar. Devolve a mensagem de erro, ou null. */
export async function conferir(tx: Queryable, c: EntradaContrato, idAtual: number | null): Promise<string | null> {
  const [area] = await tx<{ id: string }[]>`SELECT id FROM areas WHERE id = ${c.area}`;
  if (!area) return "Produto inválido.";
  if (c.dealId != null) {
    const [deal] = await tx<{ id: number }[]>`SELECT id FROM deals WHERE id = ${c.dealId}`;
    if (!deal) return "Oportunidade não encontrada.";
    const [outro] = await tx<{ ref: string }[]>`
      SELECT ref FROM contratos WHERE deal_id = ${c.dealId} AND (${idAtual}::int IS NULL OR id <> ${idAtual})
    `;
    if (outro) return `Esta oportunidade já tem receita cadastrada (${outro.ref}).`;
  }
  return null;
}

/** Grava os dados de cobrança (faz parte do mesmo formulário do contrato). */
export async function gravarCobranca(tx: Queryable, contratoId: number, c: EntradaContrato): Promise<void> {
  await tx`
    UPDATE contratos SET cnpj = ${c.cobranca.cnpj}, email_cobranca = ${c.cobranca.emailCobranca},
           forma_cobranca = ${c.cobranca.formaCobranca}
    WHERE id = ${contratoId}
  `;
}

/**
 * Grava as parcelas preservando o id das que continuam: é o id que liga a parcela à fatura
 * emitida. Parcela com fatura viva não some nem muda de valor — a fatura guardou o que foi
 * cobrado, e a parcela sumir deixaria a cobrança sem origem. Devolve a mensagem de erro, ou null.
 */
export async function gravarParcelas(tx: Queryable, contratoId: number, c: EntradaContrato): Promise<string | null> {
  const atuais = await tx<{ id: number; valor_centavos: string; fatura: string | null }[]>`
    SELECT p.id, p.valor_centavos,
           (SELECT f.ref FROM faturas f WHERE f.parcela_id = p.id AND f.status <> 'cancelada' LIMIT 1) AS fatura
    FROM contrato_parcelas p WHERE p.contrato_id = ${contratoId}
  `;
  const porId = new Map(atuais.map((p) => [p.id, p]));
  const ficam = new Set<number>();
  for (const p of c.parcelas) {
    if (p.id == null) continue;
    if (!porId.has(p.id)) return "Uma das parcelas não é desta receita. Recarregue a página e tente de novo.";
    ficam.add(p.id);
  }
  for (const p of atuais) {
    if (!ficam.has(p.id) && p.fatura) return `Uma parcela que você removeu já foi faturada (${p.fatura}). Cancele a fatura antes.`;
  }
  for (const p of atuais) if (!ficam.has(p.id)) await tx`DELETE FROM contrato_parcelas WHERE id = ${p.id}`;
  for (const p of c.parcelas) {
    if (p.id == null) {
      await tx`INSERT INTO contrato_parcelas (contrato_id, vencimento, valor_centavos) VALUES (${contratoId}, ${p.data}, ${p.valorCentavos})`;
    } else {
      await tx`UPDATE contrato_parcelas SET vencimento = ${p.data}, valor_centavos = ${p.valorCentavos} WHERE id = ${p.id}`;
    }
  }
  return null;
}

/** Cadastra um contrato (já validado por `lerContrato`). */
export async function criarContrato(tx: Queryable, autor: Autor, c: EntradaContrato): Promise<{ ref: string } | { erro: string }> {
  const erro = await conferir(tx, c, null);
  if (erro) return { erro };
  const [novo] = await tx<{ id: number }[]>`
    INSERT INTO contratos (deal_id, conta, area, situacao, chance, notas)
    VALUES (${c.dealId}, ${c.conta}, ${c.area}, ${c.situacao}, ${c.chance}, ${c.notas})
    RETURNING id
  `;
  const ref = `R-${String(novo.id).padStart(4, "0")}`;
  await tx`UPDATE contratos SET ref = ${ref} WHERE id = ${novo.id}`;
  // Receita nova não tem parcela anterior: ids vindos do corpo seriam de outra receita.
  const semIds = { ...c, parcelas: c.parcelas.map((p) => ({ data: p.data, valorCentavos: p.valorCentavos })) };
  await gravarParcelas(tx, novo.id, semIds);
  await gravarCobranca(tx, novo.id, c);
  await vincularContrato(tx, novo.id, autor);
  await registrar(tx, {
    ...marca(autor),
    area: c.area,
    entidade: ref,
    campo: "receita",
    de: null,
    para: resumoContrato(c),
    texto: `Cadastrou a receita de ${c.conta} (${ref}): ${resumoContrato(c)}`,
  });
  return { ref };
}

/** Substitui o contrato inteiro (cabeçalho, parcelas e cobrança). */
export async function atualizarContrato(
  tx: Queryable,
  autor: Autor,
  id: number,
  c: EntradaContrato
): Promise<{ ref: string } | { erro: string; status: number }> {
  const [atual] = await tx<{ ref: string }[]>`SELECT ref FROM contratos WHERE id = ${id} FOR UPDATE`;
  if (!atual) return { erro: "Receita não encontrada.", status: 404 };
  const antes = (await lerContratos(tx)).find((x) => x.id === id)!;
  const erro = await conferir(tx, c, id);
  if (erro) return { erro, status: 400 };
  // Antes de qualquer outra gravação: a conferência das parcelas acontece toda antes de
  // escrever, então um erro aqui não deixa nada pela metade.
  const erroParcelas = await gravarParcelas(tx, id, c);
  if (erroParcelas) return { erro: erroParcelas, status: 409 };
  await tx`
    UPDATE contratos SET deal_id = ${c.dealId}, conta = ${c.conta}, area = ${c.area}, situacao = ${c.situacao},
           chance = ${c.chance}, notas = ${c.notas}, atualizado_em = now()
    WHERE id = ${id}
  `;
  await gravarCobranca(tx, id, c);
  await vincularContrato(tx, id, autor);
  const de = resumoContrato(antes);
  const para = resumoContrato(c);
  if (de !== para || antes.conta !== c.conta || antes.area !== c.area || antes.dealId !== c.dealId || antes.notas !== c.notas) {
    await registrar(tx, {
      ...marca(autor),
      area: c.area,
      entidade: atual.ref,
      campo: "receita",
      de,
      para,
      texto: `Alterou a receita de ${c.conta} (${atual.ref}): ${para}`,
    });
  }
  return { ref: atual.ref };
}
