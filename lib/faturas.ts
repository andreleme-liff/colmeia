// Faturas no banco: leitura, emissão e as ações (baixa, estorno, correção, cancelamento).
// As regras puras moram em `faturamento.ts`. A interface (rotas /api/faturamento) e o MCP
// gravam pelas mesmas funções daqui, cada ação com a sua linha de auditoria na mesma transação.

import type { Queryable } from "./db";
import { registrar } from "./log";
import { hojeISO } from "./domain";
import { lancamentos, situacaoEfetiva } from "./forecast";
import { lerBaixa, lerEmissao, liquidoEsperado, rotuloForma, rotuloTipoFatura, type Fatura } from "./faturamento";
import { lerContratos, type Autor } from "./receita";

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso: string) => iso.split("-").reverse().join("/");
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

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

/**
 * Emite uma fatura. `body.origem === "avulsa"` para serviço fora de contrato; senão, a linha do
 * cronograma (contratoId, tipo, competencia) — o contrato precisa ser efetivamente contratado,
 * a parcela tem de existir naquela competência e não pode já ter fatura viva.
 */
export async function emitirFatura(
  tx: Queryable,
  autor: Autor,
  body: Record<string, unknown>
): Promise<{ ref: string } | { erro: string }> {
  const competencia = typeof body.competencia === "string" ? body.competencia : "";
  if (!MES.test(competencia)) return { erro: "Competência inválida." };

    let linha: { contratoId: number | null; conta: string; area: string; tipo: string; parcela: string; descricao: string; valorPadrao: number | null };

    if (body.origem === "avulsa") {
      const conta = typeof body.conta === "string" ? body.conta.trim().slice(0, 200) : "";
      if (!conta) return { erro: "Informe o cliente." };
      const area = typeof body.area === "string" ? body.area : "";
      const [a] = await tx<{ id: string }[]>`SELECT id FROM areas WHERE id = ${area}`;
      if (!a) return { erro: "Escolha a vertical." };
      const descricao = typeof body.descricao === "string" ? body.descricao.trim().slice(0, 300) : "";
      if (!descricao) return { erro: "Descreva o que está sendo faturado." };
      linha = { contratoId: null, conta, area, tipo: "avulsa", parcela: "", descricao, valorPadrao: null };
    } else {
      const contratoId = Number(body.contratoId);
      const tipo = typeof body.tipo === "string" ? body.tipo : "";
      const c = (await lerContratos(tx)).find((x) => x.id === contratoId);
      if (!c) return { erro: "Contrato não encontrado." };
      const [deal] = c.dealId != null ? await tx<{ estagio: string }[]>`SELECT estagio FROM deals WHERE id = ${c.dealId}` : [];
      if (situacaoEfetiva(c, deal ?? null) !== "contratada") return { erro: "Só receita contratada é faturada. Este contrato ainda é previsão." };
      const l = lancamentos(c, competencia, competencia).find((x) => x.tipo === tipo);
      if (!l) return { erro: "Esta parcela não existe no cronograma do contrato nesta competência." };
      const [viva] = await tx<{ ref: string }[]>`
        SELECT ref FROM faturas WHERE contrato_id = ${c.id} AND tipo = ${tipo} AND competencia = ${competencia} AND status <> 'cancelada'
      `;
      if (viva) return { erro: `Esta parcela já foi faturada (${viva.ref}).` };
      linha = { contratoId: c.id, conta: c.conta, area: c.area, tipo, parcela: l.rotulo, descricao: "", valorPadrao: l.valorCentavos };
    }

    const e = lerEmissao(body, linha.valorPadrao);
    if (typeof e === "string") return { erro: e };
    const [nova] = await tx<{ id: number }[]>`
      INSERT INTO faturas (contrato_id, conta, area, tipo, parcela, competencia, descricao, valor_centavos, status,
                           emitida_em, vencimento, nf_numero, forma, retencoes_centavos, notas)
      VALUES (${linha.contratoId}, ${linha.conta}, ${linha.area}, ${linha.tipo}, ${linha.parcela}, ${competencia}, ${linha.descricao},
              ${e.valorCentavos}, 'emitida', ${e.emitidaEm}, ${e.vencimento}, ${e.nfNumero}, ${e.forma}, ${e.retencoesCentavos}, ${e.notas})
      RETURNING id
    `;
    const ref = `F-${String(nova.id).padStart(4, "0")}`;
    await tx`UPDATE faturas SET ref = ${ref} WHERE id = ${nova.id}`;
    const oque = linha.tipo === "avulsa" ? linha.descricao : `${rotuloTipoFatura(linha.tipo)} ${linha.parcela}`.trim();
    await registrar(tx, {
      actorUserId: autor.userId,
      origem: autor.origem,
      concessaoId: autor.concessaoId,
      area: linha.area,
      entidade: ref,
      campo: "fatura",
      de: null,
      para: "emitida",
      texto:
        `Emitiu a fatura ${ref} de ${linha.conta} (${oque}, competência ${competencia.split("-").reverse().join("/")}): ` +
        `${reais(e.valorCentavos)}${e.retencoesCentavos ? `, retenções ${reais(e.retencoesCentavos)}` : ""}, ` +
        `vence ${e.vencimento.split("-").reverse().join("/")}, ${rotuloForma(e.forma)}${e.nfNumero ? `, NF ${e.nfNumero}` : ""}`,
    });
    return { ref };
}

/** Ações sobre uma fatura emitida: pagar, estornar, editar, cancelar. */
export async function agirNaFatura(
  tx: Queryable,
  autor: Autor,
  id: number,
  body: Record<string, unknown>
): Promise<{ ok: true; ref: string } | { erro: string; status: number }> {

    const f = await lerFatura(tx, id, true);
    if (!f) return { erro: "Fatura não encontrada.", status: 404 };
    const log = (texto: string, de: string | null, para: string | null) =>
      registrar(tx, { actorUserId: autor.userId, origem: autor.origem, concessaoId: autor.concessaoId, area: f.area, entidade: f.ref, campo: "fatura", de, para, texto });

    switch (body.acao) {
      case "pagar": {
        if (f.status !== "emitida") return { erro: "Só fatura emitida (em aberto) recebe baixa.", status: 409 };
        const b = lerBaixa(body, f.emitidaEm);
        if (typeof b === "string") return { erro: b, status: 400 };
        await tx`
          UPDATE faturas SET status = 'paga', pago_em = ${b.pagoEm}, valor_pago_centavos = ${b.valorPagoCentavos},
                 notas = CASE WHEN ${b.notas} = '' THEN notas ELSE ${b.notas} END, atualizado_em = now()
          WHERE id = ${id}
        `;
        const dif = b.valorPagoCentavos - liquidoEsperado(f);
        await log(
          `Baixa da fatura ${f.ref} de ${f.conta}: ${reais(b.valorPagoCentavos)} recebidos em ${br(b.pagoEm)}` +
            (dif ? ` (${dif > 0 ? "a mais" : "a menos"} ${reais(Math.abs(dif))} do que o esperado)` : ""),
          "emitida",
          "paga"
        );
        return { ok: true as const, ref: f.ref };
      }
      case "estornar": {
        if (f.status !== "paga") return { erro: "Só fatura paga pode ter a baixa estornada.", status: 409 };
        await tx`UPDATE faturas SET status = 'emitida', pago_em = NULL, valor_pago_centavos = NULL, atualizado_em = now() WHERE id = ${id}`;
        await log(`Estornou a baixa da fatura ${f.ref} de ${f.conta} (era ${reais(f.valorPagoCentavos ?? 0)} em ${br(f.pagoEm ?? hojeISO())})`, "paga", "emitida");
        return { ok: true as const, ref: f.ref };
      }
      case "editar": {
        if (f.status !== "emitida") return { erro: "Só fatura em aberto pode ser corrigida.", status: 409 };
        const e = lerEmissao({ ...body, valorCentavos: body.valorCentavos ?? f.valorCentavos }, f.valorCentavos);
        if (typeof e === "string") return { erro: e, status: 400 };
        await tx`
          UPDATE faturas SET emitida_em = ${e.emitidaEm}, vencimento = ${e.vencimento}, nf_numero = ${e.nfNumero}, forma = ${e.forma},
                 retencoes_centavos = ${e.retencoesCentavos}, valor_centavos = ${e.valorCentavos}, notas = ${e.notas}, atualizado_em = now()
          WHERE id = ${id}
        `;
        await log(
          `Corrigiu a fatura ${f.ref} de ${f.conta}: ${reais(e.valorCentavos)}, vence ${br(e.vencimento)}, ${rotuloForma(e.forma)}` +
            `${e.nfNumero ? `, NF ${e.nfNumero}` : ""}${e.retencoesCentavos ? `, retenções ${reais(e.retencoesCentavos)}` : ""}`,
          null,
          null
        );
        return { ok: true as const, ref: f.ref };
      }
      case "cancelar": {
        if (f.status === "paga") return { erro: "Fatura paga não se cancela: estorne a baixa antes.", status: 409 };
        if (f.status !== "emitida") return { erro: "Esta fatura já está cancelada.", status: 409 };
        const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 500) : "";
        if (!motivo) return { erro: "Diga o motivo do cancelamento.", status: 400 };
        await tx`
          UPDATE faturas SET status = 'cancelada', cancelada_em = ${hojeISO()}, motivo_cancelamento = ${motivo}, atualizado_em = now()
          WHERE id = ${id}
        `;
        await log(`Cancelou a fatura ${f.ref} de ${f.conta} (${reais(f.valorCentavos)}${f.nfNumero ? `, NF ${f.nfNumero}` : ""}): ${motivo}`, "emitida", "cancelada");
        return { ok: true as const, ref: f.ref };
      }
      default:
        return { erro: "Ação inválida.", status: 400 };
    }
}
