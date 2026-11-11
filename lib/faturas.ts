// Leitura das faturas no banco. As regras moram em `faturamento.ts`; aqui é só SQL.

import type { Queryable } from "./db";
import type { Fatura } from "./faturamento";

type Linha = {
  id: number; ref: string; contrato_id: number | null; conta: string; area: string; tipo: Fatura["tipo"]; parcela: string;
  competencia: string; descricao: string; valor_centavos: string; status: Fatura["status"]; emitida_em: Date | null;
  vencimento: Date | null; nf_numero: string; forma: string | null; retencoes_centavos: string; pago_em: Date | null;
  valor_pago_centavos: string | null; cancelada_em: Date | null; motivo_cancelamento: string; notas: string;
};

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function deLinha(r: Linha): Fatura {
  return {
    id: r.id,
    ref: r.ref,
    contratoId: r.contrato_id,
    conta: r.conta,
    area: r.area,
    tipo: r.tipo,
    parcela: r.parcela,
    competencia: r.competencia,
    descricao: r.descricao,
    valorCentavos: Number(r.valor_centavos),
    status: r.status,
    emitidaEm: dia(r.emitida_em),
    vencimento: dia(r.vencimento),
    nfNumero: r.nf_numero,
    forma: r.forma,
    retencoesCentavos: Number(r.retencoes_centavos),
    pagoEm: dia(r.pago_em),
    valorPagoCentavos: r.valor_pago_centavos == null ? null : Number(r.valor_pago_centavos),
    canceladaEm: dia(r.cancelada_em),
    motivoCancelamento: r.motivo_cancelamento,
    notas: r.notas,
  };
}

export async function lerFaturas(sql: Queryable): Promise<Fatura[]> {
  const rows = await sql<Linha[]>`SELECT * FROM faturas ORDER BY competencia DESC, conta ASC, id ASC`;
  return rows.map(deLinha);
}

export async function lerFatura(sql: Queryable, id: number, travar = false): Promise<Fatura | null> {
  const rows = travar
    ? await sql<Linha[]>`SELECT * FROM faturas WHERE id = ${id} FOR UPDATE`
    : await sql<Linha[]>`SELECT * FROM faturas WHERE id = ${id}`;
  return rows.length ? deLinha(rows[0]) : null;
}
