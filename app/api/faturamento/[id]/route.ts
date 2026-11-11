// Ações sobre uma fatura emitida. Só administração.
//   pagar    — baixa: data e valor recebido (emitida → paga);
//   estornar — desfaz a baixa (paga → emitida), para corrigir um lançamento errado;
//   editar   — corrige dados da emissão: NF, vencimento, forma, retenções, valor (só emitida);
//   cancelar — com motivo (só emitida; paga precisa ser estornada antes). A linha do
//              cronograma volta a ficar a emitir, para a reemissão.

import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/perms";
import { err, json, lerCorpo } from "@/lib/http";
import { registrar } from "@/lib/log";
import { lerBaixa, lerEmissao, liquidoEsperado, rotuloForma } from "@/lib/faturamento";
import { lerFatura } from "@/lib/faturas";
import { hojeISO } from "@/lib/domain";

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso: string) => iso.split("-").reverse().join("/");

export async function PATCH(req: Request, ctxRoute: RouteContext<"/api/faturamento/[id]">) {
  const ctx = await requireAdmin();
  if (ctx instanceof Response) return ctx;
  const { id: bruto } = await ctxRoute.params;
  const id = Number(bruto);
  if (!Number.isInteger(id) || id <= 0) return err("Fatura inválida.", 400);
  const body = await lerCorpo(req);
  if (!body) return err("Requisição inválida.", 400);

  const sql = await getDb();
  const r = await sql.begin(async (tx) => {
    const f = await lerFatura(tx, id, true);
    if (!f) return { erro: "Fatura não encontrada.", status: 404 };
    const log = (texto: string, de: string | null, para: string | null) =>
      registrar(tx, { actorUserId: ctx.user.userId, area: f.area, entidade: f.ref, campo: "fatura", de, para, texto });

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
        return { ok: true };
      }
      case "estornar": {
        if (f.status !== "paga") return { erro: "Só fatura paga pode ter a baixa estornada.", status: 409 };
        await tx`UPDATE faturas SET status = 'emitida', pago_em = NULL, valor_pago_centavos = NULL, atualizado_em = now() WHERE id = ${id}`;
        await log(`Estornou a baixa da fatura ${f.ref} de ${f.conta} (era ${reais(f.valorPagoCentavos ?? 0)} em ${br(f.pagoEm ?? hojeISO())})`, "paga", "emitida");
        return { ok: true };
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
        return { ok: true };
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
        return { ok: true };
      }
      default:
        return { erro: "Ação inválida.", status: 400 };
    }
  });
  if ("erro" in r) return err(r.erro as string, r.status as number);
  return json({ ok: true });
}
