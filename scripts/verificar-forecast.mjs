// Forecast de receita: parcelas, série mensal, situação efetiva, validação. Sem banco.
// `node scripts/verificar-forecast.mjs`
import {
  dataValida, diaNoMes, emOrdem, lancamentos, lerContrato, mesesEntre, pagamentoDe, parcelasIguais, resumoParcelas, rotuloMes,
  serieMensal, situacaoEfetiva, somarMeses, totalDoContrato, totalNoPeriodo,
} from "../lib/forecast.ts";

let ok = 0, falhas = 0;
const checa = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ✓ ${nome}`); } else { falhas++; console.log(`  ✗ ${nome}\n      esperado ${b}\n      veio     ${a}`); }
};

console.log("meses");
checa("soma atravessa o ano", somarMeses("2026-11", 3), "2027-02");
checa("subtrai", somarMeses("2027-01", -1), "2026-12");
checa("distância", mesesEntre("2026-11", "2027-02"), 3);
checa("rótulo", rotuloMes("2027-02"), "fev/27");

console.log("\nparcelas livres");
// Três parcelas de valores diferentes, sem intervalo regular, duas no mesmo mês e fora de ordem.
const c = { parcelas: [
  { id: 3, data: "2027-04-30", valorCentavos: 50_00 },
  { id: 1, data: "2026-12-10", valorCentavos: 100_00 },
  { id: 2, data: "2026-12-28", valorCentavos: 25_50 },
] };
const l = lancamentos(c, "2026-01", "2027-12");
checa("saem em ordem de vencimento, com o próprio valor e o rótulo k/n", l.map((x) => [x.data, x.valorCentavos, x.rotulo, x.parcelaId]),
  [["2026-12-10", 10000, "1/3", 1], ["2026-12-28", 2550, "2/3", 2], ["2027-04-30", 5000, "3/3", 3]]);
checa("duas parcelas no mesmo mês são dois lançamentos", l.filter((x) => x.mes === "2026-12").length, 2);
checa("a janela corta o que fica fora, sem renumerar", lancamentos(c, "2027-01", "2027-12").map((x) => x.rotulo), ["3/3"]);
checa("total no período", totalNoPeriodo(c, "2026-12", "2026-12"), 125_50);
checa("total do contrato", totalDoContrato(c), 175_50);
checa("uma parcela só é à vista", lancamentos({ parcelas: [{ data: "2026-12-10", valorCentavos: 1 }] }, "2026-01", "2027-12")[0].rotulo, "à vista");
checa("forma de pagamento sai do número de parcelas", [pagamentoDe([1]), pagamentoDe([1, 2])], ["a_vista", "parcelado"]);
checa("empate de data mantém a ordem de cadastro", emOrdem([{ data: "2026-12-10", v: "a" }, { data: "2026-12-10", v: "b" }]).map((x) => x.v), ["a", "b"]);
checa("resumo do parcelado", resumoParcelas(c.parcelas).startsWith("R$\u00a0175,50 em 3 parcelas: 10/12/2026 R$\u00a0100,00; 28/12/2026"), true);
checa("resumo do à vista", resumoParcelas([{ data: "2026-12-10", valorCentavos: 100_00 }]), "R$\u00a0100,00 à vista em 10/12/2026");

console.log("\nparcelas iguais (o atalho da tela)");
const iguais = parcelasIguais(100_00, 3, "2026-11-15");
checa("mensais, com o resto na última", iguais.map((p) => [p.data, p.valorCentavos]), [["2026-11-15", 3333], ["2026-12-15", 3333], ["2027-01-15", 3334]]);
checa("a soma bate", iguais.reduce((t, p) => t + p.valorCentavos, 0), 100_00);
checa("dia 31 recua no mês curto", parcelasIguais(300, 3, "2027-01-31").map((p) => p.data), ["2027-01-31", "2027-02-28", "2027-03-31"]);
checa("dia no mês", diaNoMes("2028-02", 30), "2028-02-29");
checa("data que não existe", [dataValida("2027-02-30"), dataValida("2027-02-28"), dataValida("28/02/2027")], [false, true, false]);

console.log("\nsituação efetiva");
checa("contratada é contratada", situacaoEfetiva({ situacao: "contratada", chance: null, dealId: 1 }, { estagio: "lost" }), "contratada");
checa("prevista com card em Ganho vira contratada", situacaoEfetiva({ situacao: "prevista", chance: "baixa", dealId: 1 }, { estagio: "ganho" }), "contratada");
checa("prevista alta em Proposta é provável", situacaoEfetiva({ situacao: "prevista", chance: "alta", dealId: 1 }, { estagio: "proposta" }), "provavel");
checa("prevista baixa em Contrato é possível", situacaoEfetiva({ situacao: "prevista", chance: "baixa", dealId: 1 }, { estagio: "contrato" }), "possivel");
checa("prevista com card que voltou a Qualificado fica fora", situacaoEfetiva({ situacao: "prevista", chance: "alta", dealId: 1 }, { estagio: "qualificado" }), "fora");
checa("prevista com card Lost fica fora", situacaoEfetiva({ situacao: "prevista", chance: "alta", dealId: 1 }, { estagio: "lost" }), "fora");
checa("prevista sem card conta pela chance", situacaoEfetiva({ situacao: "prevista", chance: "alta", dealId: null }, null), "provavel");

console.log("\nsérie mensal");
const contrato = (id, parcelas) => ({ id, ref: "R-" + id, conta: "X", area: "tax", dealId: null, situacao: "contratada", chance: null, notas: "", parcelas });
const serie = serieMensal([
  { contrato: contrato(1, [{ data: "2026-11-05", valorCentavos: 1000 }, { data: "2026-11-25", valorCentavos: 500 }, { data: "2027-01-10", valorCentavos: 200 }]), efetiva: "contratada" },
  { contrato: contrato(2, [{ data: "2026-12-01", valorCentavos: 300 }, { data: "2027-01-31", valorCentavos: 300 }]), efetiva: "provavel" },
  { contrato: contrato(3, [{ data: "2026-11-01", valorCentavos: 900 }]), efetiva: "fora" },
  { contrato: contrato(4, [{ data: "2026-12-15", valorCentavos: 70 }]), efetiva: "possivel" },
], "2026-11", 3);
checa("contratada, provável e possível por mês; fora não soma", serie.map((m) => [m.mes, m.contratada, m.provavel, m.possivel]),
  [["2026-11", 1500, 0, 0], ["2026-12", 0, 300, 70], ["2027-01", 200, 300, 0]]);

console.log("\nvalidação");
const base = { conta: "Ambev", area: "tax", situacao: "contratada",
  parcelas: [{ data: "2027-03-20", valorCentavos: 200000 }, { id: 7, data: "2026-12-01", valorCentavos: 500000 }] };
const lido = lerContrato(base);
checa("lê e devolve em ordem de vencimento, preservando o id", typeof lido === "object" && lido.parcelas, [{ id: 7, data: "2026-12-01", valorCentavos: 500000 }, { data: "2027-03-20", valorCentavos: 200000 }]);
checa("sem cliente", lerContrato({ ...base, conta: "  " }), "Informe o cliente.");
checa("prevista exige chance", lerContrato({ ...base, situacao: "prevista" }), "Diga se a chance de fechar é alta ou baixa.");
checa("contratada não guarda chance", lerContrato({ ...base, chance: "alta" }).chance, null);
checa("sem parcela", lerContrato({ ...base, parcelas: [] }), "Informe ao menos uma parcela, com data e valor.");
checa("parcela sem data", lerContrato({ ...base, parcelas: [{ data: "12/2026", valorCentavos: 1 }] }), "Parcela 1: informe a data de vencimento.");
checa("data que não existe", lerContrato({ ...base, parcelas: [{ data: "2027-02-30", valorCentavos: 1 }] }), "Parcela 1: informe a data de vencimento.");
checa("parcela sem valor", lerContrato({ ...base, parcelas: [{ data: "2026-12-01", valorCentavos: 1 }, { data: "2026-12-02", valorCentavos: 0 }] }), "Parcela 2: informe o valor.");
checa("valor fracionado recusa", lerContrato({ ...base, parcelas: [{ data: "2026-12-01", valorCentavos: 10.5 }] }), "Parcela 1: informe o valor.");
checa("id repetido recusa", lerContrato({ ...base, parcelas: [{ id: 1, data: "2026-12-01", valorCentavos: 1 }, { id: 1, data: "2026-12-02", valorCentavos: 1 }] }), "Parcela 2: inválida.");
checa("mais de 120 parcelas", lerContrato({ ...base, parcelas: Array.from({ length: 121 }, () => ({ data: "2026-12-01", valorCentavos: 1 })) }), "No máximo 120 parcelas.");

console.log(`\n${ok} passaram, ${falhas} falharam`);
if (falhas) process.exit(1);
