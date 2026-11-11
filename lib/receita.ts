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
  chance: "alta" | "baixa" | null; inicio_faturamento: Date; notas: string;
  cnpj: string; email_cobranca: string; dia_vencimento: number; forma_cobranca: string;
  linhas: { tipo: string; valor_centavos: string; parcelas: number; inicio_mes: number; duracao_meses: number | null }[];
};

export async function lerContratos(sql: Queryable): Promise<Contrato[]> {
  const rows = await sql<Linha[]>`
    SELECT c.id, c.ref, c.deal_id, c.cliente_id, c.conta, c.area, c.situacao, c.chance, c.inicio_faturamento, c.notas,
           c.cnpj, c.email_cobranca, c.dia_vencimento, c.forma_cobranca,
           COALESCE((SELECT json_agg(json_build_object('tipo', r.tipo, 'valor_centavos', r.valor_centavos, 'parcelas', r.parcelas,
                                                      'inicio_mes', r.inicio_mes, 'duracao_meses', r.duracao_meses))
                     FROM contrato_receitas r WHERE r.contrato_id = c.id), '[]'::json) AS linhas
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
    inicioFaturamento: r.inicio_faturamento.toISOString().slice(0, 10),
    notas: r.notas,
    cobranca: {
      cnpj: r.cnpj,
      emailCobranca: r.email_cobranca,
      diaVencimento: r.dia_vencimento,
      formaCobranca: r.forma_cobranca as Contrato["cobranca"]["formaCobranca"],
    },
    linhas: r.linhas.map((l) => ({
      tipo: l.tipo as Contrato["linhas"][number]["tipo"],
      valorCentavos: Number(l.valor_centavos),
      parcelas: l.parcelas,
      inicioMes: l.inicio_mes,
      duracaoMeses: l.duracao_meses,
    })),
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
           dia_vencimento = ${c.cobranca.diaVencimento}, forma_cobranca = ${c.cobranca.formaCobranca}
    WHERE id = ${contratoId}
  `;
}

export async function gravarLinhas(tx: Queryable, contratoId: number, c: EntradaContrato): Promise<void> {
  await tx`DELETE FROM contrato_receitas WHERE contrato_id = ${contratoId}`;
  for (const l of c.linhas) {
    await tx`
      INSERT INTO contrato_receitas (contrato_id, tipo, valor_centavos, parcelas, inicio_mes, duracao_meses)
      VALUES (${contratoId}, ${l.tipo}, ${l.valorCentavos}, ${l.parcelas}, ${l.inicioMes}, ${l.duracaoMeses})
    `;
  }
}

/** Cadastra um contrato (já validado por `lerContrato`). */
export async function criarContrato(tx: Queryable, autor: Autor, c: EntradaContrato): Promise<{ ref: string } | { erro: string }> {
  const erro = await conferir(tx, c, null);
  if (erro) return { erro };
  const [novo] = await tx<{ id: number }[]>`
    INSERT INTO contratos (deal_id, conta, area, situacao, chance, inicio_faturamento, notas)
    VALUES (${c.dealId}, ${c.conta}, ${c.area}, ${c.situacao}, ${c.chance}, ${c.inicioFaturamento}, ${c.notas})
    RETURNING id
  `;
  const ref = `R-${String(novo.id).padStart(4, "0")}`;
  await tx`UPDATE contratos SET ref = ${ref} WHERE id = ${novo.id}`;
  await gravarLinhas(tx, novo.id, c);
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

/** Substitui o contrato inteiro (cabeçalho, linhas e cobrança). */
export async function atualizarContrato(
  tx: Queryable,
  autor: Autor,
  id: number,
  c: EntradaContrato
): Promise<{ ref: string } | { erro: string; status: number }> {
  const [atual] = await tx<{ ref: string }[]>`SELECT ref FROM contratos WHERE id = ${id} FOR UPDATE`;
  if (!atual) return { erro: "Contrato não encontrado.", status: 404 };
  const antes = (await lerContratos(tx)).find((x) => x.id === id)!;
  const erro = await conferir(tx, c, id);
  if (erro) return { erro, status: 400 };
  await tx`
    UPDATE contratos SET deal_id = ${c.dealId}, conta = ${c.conta}, area = ${c.area}, situacao = ${c.situacao},
           chance = ${c.chance}, inicio_faturamento = ${c.inicioFaturamento}, notas = ${c.notas}, atualizado_em = now()
    WHERE id = ${id}
  `;
  await gravarLinhas(tx, id, c);
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
