// Leitura e gravação dos contratos de receita no banco. As regras de conta e de validação
// moram em `forecast.ts`; aqui é só SQL.

import type { Queryable } from "./db";
import type { Contrato, EntradaContrato } from "./forecast";

type Linha = {
  id: number; ref: string; deal_id: number | null; conta: string; area: string; situacao: "contratada" | "prevista";
  chance: "alta" | "baixa" | null; inicio_faturamento: Date; notas: string;
  linhas: { tipo: string; valor_centavos: string; parcelas: number; inicio_mes: number; duracao_meses: number | null }[];
};

export async function lerContratos(sql: Queryable): Promise<Contrato[]> {
  const rows = await sql<Linha[]>`
    SELECT c.id, c.ref, c.deal_id, c.conta, c.area, c.situacao, c.chance, c.inicio_faturamento, c.notas,
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
    situacao: r.situacao,
    chance: r.chance,
    inicioFaturamento: r.inicio_faturamento.toISOString().slice(0, 10),
    notas: r.notas,
    linhas: r.linhas.map((l) => ({
      tipo: l.tipo as Contrato["linhas"][number]["tipo"],
      valorCentavos: Number(l.valor_centavos),
      parcelas: l.parcelas,
      inicioMes: l.inicio_mes,
      duracaoMeses: l.duracao_meses,
    })),
  }));
}

/** Confere vertical e card antes de gravar. Devolve a mensagem de erro, ou null. */
export async function conferir(tx: Queryable, c: EntradaContrato, idAtual: number | null): Promise<string | null> {
  const [area] = await tx<{ id: string }[]>`SELECT id FROM areas WHERE id = ${c.area}`;
  if (!area) return "Vertical inválida.";
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

export async function gravarLinhas(tx: Queryable, contratoId: number, c: EntradaContrato): Promise<void> {
  await tx`DELETE FROM contrato_receitas WHERE contrato_id = ${contratoId}`;
  for (const l of c.linhas) {
    await tx`
      INSERT INTO contrato_receitas (contrato_id, tipo, valor_centavos, parcelas, inicio_mes, duracao_meses)
      VALUES (${contratoId}, ${l.tipo}, ${l.valorCentavos}, ${l.parcelas}, ${l.inicioMes}, ${l.duracaoMeses})
    `;
  }
}
