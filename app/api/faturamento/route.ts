// Faturamento (contas a receber): lista de faturas e emissão. Só administração.
//
// Emitir uma linha do cronograma: o servidor confere que o contrato é CONTRATADO (inclusive o
// previsto cujo card foi para Ganho) e que a parcela existe naquela competência, e usa o valor
// do cronograma se o corpo não trouxer outro. Fatura avulsa: cliente, vertical e valor livres.
// Toda gravação entra na auditoria, na mesma transação.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { registrar } from "@/lib/log";
import { lancamentos, situacaoEfetiva } from "@/lib/forecast";
import { lerEmissao, rotuloForma, rotuloTipoFatura } from "@/lib/faturamento";
import { lerContratos } from "@/lib/receita";
import { lerFaturas } from "@/lib/faturas";

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET() {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const sql = await getDb();
  return json({ faturas: await lerFaturas(sql) });
}

export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const body = await lerCorpo(req);
  if (!body) return err("Requisição inválida.", 400);
  const competencia = typeof body.competencia === "string" ? body.competencia : "";
  if (!MES.test(competencia)) return err("Competência inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin(async (tx) => {
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
      actorUserId: ctx.user.userId,
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
  });
  if ("erro" in r) return err(r.erro as string, 400);
  return json({ ok: true, ref: r.ref });
}
