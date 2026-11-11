// Faturamento: cronograma → faturas do mês, status, aging, vencimento, validação. Sem banco.
// `node scripts/verificar-faturamento.mjs`
import {
  aging, csvDoMes, diasDeAtraso, itensDoMes, lerBaixa, lerEmissao, liquidoEsperado, statusDe, vencimentoSugerido,
} from "../lib/faturamento.ts";

let ok = 0, falhas = 0;
const checa = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ✓ ${nome}`); } else { falhas++; console.log(`  ✗ ${nome}\n      esperado ${b}\n      veio     ${a}`); }
};
const HOJE = "2026-12-15";

const contrato = {
  id: 1, ref: "R-0001", conta: "Medley", area: "tax", dealId: null, situacao: "contratada", chance: null,
  inicioFaturamento: "2026-12-01", notas: "",
  linhas: [
    { tipo: "implantacao", valorCentavos: 9000, parcelas: 3, inicioMes: 0, duracaoMeses: null },
    { tipo: "assinatura", valorCentavos: 800, parcelas: 1, inicioMes: 0, duracaoMeses: null },
  ],
};
const prevista = { ...contrato, id: 2, ref: "R-0002", conta: "Ourofino", situacao: "prevista", chance: "alta" };
const fatura = (o) => ({
  id: 10, ref: "F-0010", contratoId: 1, conta: "Medley", area: "tax", tipo: "implantacao", parcela: "1/3", competencia: "2026-12",
  descricao: "", valorCentavos: 3000, status: "emitida", emitidaEm: "2026-12-01", vencimento: "2026-12-10", nfNumero: "123",
  forma: "boleto", retencoesCentavos: 0, pagoEm: null, valorPagoCentavos: null, canceladaEm: null, motivoCancelamento: "", notas: "", ...o,
});
const contratado = (c) => c.situacao === "contratada";

console.log("mês");
let itens = itensDoMes([contrato, prevista], contratado, [], "2026-12", HOJE);
checa("só contrato contratado gera linha", itens.map((i) => i.conta + " " + i.tipo + " " + i.parcela),
  ["Medley assinatura mês 1", "Medley implantacao 1/3"]);
checa("sem fatura, tudo a emitir com o valor do cronograma", itens.map((i) => [i.status, i.valorCentavos]), [["a_emitir", 800], ["a_emitir", 3000]]);

itens = itensDoMes([contrato], contratado, [fatura({ valorCentavos: 3100 })], "2026-12", HOJE);
const imp = itens.find((i) => i.tipo === "implantacao");
checa("fatura emitida assume a linha, com o valor dela, e vencida depois do vencimento", [imp.status, imp.valorCentavos, imp.fatura.ref], ["vencida", 3100, "F-0010"]);

itens = itensDoMes([contrato], contratado, [fatura({ status: "cancelada" })], "2026-12", HOJE);
const reem = itens.find((i) => i.tipo === "implantacao");
checa("cancelada devolve a linha para a emitir, guardando o histórico", [reem.status, reem.canceladas.length], ["a_emitir", 1]);

itens = itensDoMes([contrato], contratado, [fatura({ id: 11, ref: "F-0011", contratoId: null, conta: "Avulso SA", tipo: "avulsa", parcela: "" })], "2026-12", HOJE);
checa("avulsa entra no mês", itens.some((i) => i.conta === "Avulso SA" && i.chave === "f11"), true);
checa("outro mês não traz a fatura", itensDoMes([contrato], contratado, [fatura({})], "2027-01", HOJE).some((i) => i.fatura), false);

console.log("\nstatus e valores");
checa("emitida antes do vencimento", statusDe({ status: "emitida", vencimento: "2026-12-20" }, HOJE), "emitida");
checa("emitida no dia do vencimento ainda não venceu", statusDe({ status: "emitida", vencimento: HOJE }, HOJE), "emitida");
checa("paga não vira vencida", statusDe({ status: "paga", vencimento: "2026-01-01" }, HOJE), "paga");
checa("dias de atraso", diasDeAtraso("2026-12-10", HOJE), 5);
checa("líquido desconta retenções", liquidoEsperado({ valorCentavos: 10000, retencoesCentavos: 1130 }), 8870);

console.log("\naging");
const ag = aging([
  fatura({ id: 1, vencimento: "2026-12-20", valorCentavos: 100 }),
  fatura({ id: 2, vencimento: "2026-12-01", valorCentavos: 200 }),
  fatura({ id: 3, vencimento: "2026-08-01", valorCentavos: 400 }),
  fatura({ id: 4, status: "paga", vencimento: "2026-01-01", valorCentavos: 999 }),
], HOJE);
checa("faixas", ag.map((a) => [a.key, a.qtd, a.valor]), [["a_vencer", 1, 100], ["1_30", 1, 200], ["31_60", 0, 0], ["61_90", 0, 0], ["90_mais", 1, 400]]);

console.log("\nvencimento");
checa("dia do contrato no mês da competência", vencimentoSugerido("2026-12", 10, "2026-12-01"), "2026-12-10");
checa("dia já passou: mês seguinte", vencimentoSugerido("2026-12", 10, "2026-12-12"), "2027-01-10");

console.log("\nvalidação");
const em = { emitidaEm: "2026-12-01", vencimento: "2026-12-10", forma: "pix", nfNumero: " 42 " };
checa("emissão usa o valor do cronograma", lerEmissao(em, 3000).valorCentavos, 3000);
checa("emissão apara o número da NF", lerEmissao(em, 3000).nfNumero, "42");
checa("vencimento antes da emissão", lerEmissao({ ...em, vencimento: "2026-11-30" }, 3000), "O vencimento não pode ser antes da emissão.");
checa("forma inválida", lerEmissao({ ...em, forma: "cheque" }, 3000), "Escolha a forma de cobrança.");
checa("retenção maior que o valor", lerEmissao({ ...em, retencoesCentavos: 5000 }, 3000), "As retenções não podem passar do valor da fatura.");
checa("avulsa sem valor", lerEmissao(em, null), "Valor inválido.");
checa("baixa antes da emissão", lerBaixa({ pagoEm: "2026-11-01", valorPagoCentavos: 10 }, "2026-12-01"), "O pagamento não pode ser antes da emissão.");
checa("baixa sem valor", lerBaixa({ pagoEm: "2026-12-11" }, "2026-12-01"), "Informe o valor recebido.");
checa("baixa ok", lerBaixa({ pagoEm: "2026-12-11", valorPagoCentavos: 2900 }, "2026-12-01").valorPagoCentavos, 2900);

console.log("\nCSV");
const csv = csvDoMes(itensDoMes([contrato], contratado, [fatura({})], "2026-12", HOJE), () => "Tax");
checa("cabeçalho e linhas", csv.split("\n").length, 3);
checa("decimal com vírgula e data brasileira", csv.includes(";30,00;") && csv.includes("10/12/2026"), true);

console.log(`\n${ok} passaram, ${falhas} falharam`);
if (falhas) process.exit(1);
