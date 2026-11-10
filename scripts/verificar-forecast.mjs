// Forecast de receita: parcelas, série mensal, situação efetiva, validação. Sem banco.
// `node scripts/verificar-forecast.mjs`
import {
  lancamentos, lerContrato, mesesEntre, rotuloMes, serieMensal, situacaoEfetiva, somarMeses, totalNoPeriodo,
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

console.log("\nparcelas");
const c = {
  inicioFaturamento: "2026-11-15",
  linhas: [
    { tipo: "implantacao", valorCentavos: 100_00, parcelas: 3, inicioMes: 0, duracaoMeses: null },
    { tipo: "assinatura", valorCentavos: 50_00, parcelas: 1, inicioMes: 2, duracaoMeses: 3 },
  ],
};
const l = lancamentos(c, "2026-01", "2027-12");
checa("implantação em 3 parcelas, resto na última", l.filter((x) => x.tipo === "implantacao").map((x) => [x.mes, x.valorCentavos, x.rotulo]),
  [["2026-11", 3333, "1/3"], ["2026-12", 3333, "2/3"], ["2027-01", 3334, "3/3"]]);
checa("a soma das parcelas bate", l.filter((x) => x.tipo === "implantacao").reduce((t, x) => t + x.valorCentavos, 0), 100_00);
checa("assinatura começa no mês 3 e dura 3", l.filter((x) => x.tipo === "assinatura").map((x) => x.mes), ["2027-01", "2027-02", "2027-03"]);
checa("janela corta o que fica fora", lancamentos(c, "2026-12", "2027-01").map((x) => x.mes + x.tipo),
  ["2026-12implantacao", "2027-01assinatura", "2027-01implantacao"].sort((a, b) => a.slice(0, 7).localeCompare(b.slice(0, 7)) || (a.includes("assinatura") ? -1 : 1)));
const semPrazo = { inicioFaturamento: "2026-11-01", linhas: [{ tipo: "assinatura", valorCentavos: 10_00, parcelas: 1, inicioMes: 0, duracaoMeses: null }] };
checa("assinatura sem prazo vai até o fim da janela", lancamentos(semPrazo, "2026-11", "2027-04").length, 6);
checa("total no período", totalNoPeriodo(semPrazo, "2026-11", "2027-04"), 60_00);
checa("valor zero não lança", lancamentos({ inicioFaturamento: "2026-11-01", linhas: [{ tipo: "customizacao", valorCentavos: 0, parcelas: 2, inicioMes: 0, duracaoMeses: null }] }, "2026-01", "2027-12"), []);

console.log("\nsituação efetiva");
checa("contratada é contratada", situacaoEfetiva({ situacao: "contratada", chance: null, dealId: 1 }, { estagio: "lost" }), "contratada");
checa("prevista com card em Ganho vira contratada", situacaoEfetiva({ situacao: "prevista", chance: "baixa", dealId: 1 }, { estagio: "ganho" }), "contratada");
checa("prevista alta em Proposta é provável", situacaoEfetiva({ situacao: "prevista", chance: "alta", dealId: 1 }, { estagio: "proposta" }), "provavel");
checa("prevista baixa em Contrato é possível", situacaoEfetiva({ situacao: "prevista", chance: "baixa", dealId: 1 }, { estagio: "contrato" }), "possivel");
checa("prevista com card que voltou a Qualificado fica fora", situacaoEfetiva({ situacao: "prevista", chance: "alta", dealId: 1 }, { estagio: "qualificado" }), "fora");
checa("prevista com card Lost fica fora", situacaoEfetiva({ situacao: "prevista", chance: "alta", dealId: 1 }, { estagio: "lost" }), "fora");
checa("prevista sem card conta pela chance", situacaoEfetiva({ situacao: "prevista", chance: "alta", dealId: null }, null), "provavel");

console.log("\nsérie mensal");
const contrato = (id, linhas, inicio = "2026-11-01") => ({ id, ref: "R-" + id, conta: "X", area: "tax", dealId: null, situacao: "contratada", chance: null, inicioFaturamento: inicio, notas: "", linhas });
const serie = serieMensal([
  { contrato: contrato(1, [{ tipo: "assinatura", valorCentavos: 1000, parcelas: 1, inicioMes: 0, duracaoMeses: null }]), efetiva: "contratada" },
  { contrato: contrato(2, [{ tipo: "customizacao", valorCentavos: 600, parcelas: 2, inicioMes: 1, duracaoMeses: null }]), efetiva: "provavel" },
  { contrato: contrato(3, [{ tipo: "implantacao", valorCentavos: 900, parcelas: 1, inicioMes: 0, duracaoMeses: null }]), efetiva: "fora" },
], "2026-11", 3);
checa("contratada por tipo, prevista por chance, fora não soma", serie.map((m) => [m.mes, m.assinatura, m.provavel, m.implantacao]),
  [["2026-11", 1000, 0, 0], ["2026-12", 1000, 300, 0], ["2027-01", 1000, 300, 0]]);

console.log("\nvalidação");
const base = { conta: "Ambev", area: "tax", situacao: "contratada", inicioFaturamento: "2026-12-01",
  linhas: [{ tipo: "assinatura", valorCentavos: 500000 }, { tipo: "implantacao", valorCentavos: 0, parcelas: 3 }] };
const lido = lerContrato(base);
checa("lê e descarta linha zerada", typeof lido === "object" && lido.linhas.map((x) => x.tipo), ["assinatura"]);
checa("sem cliente", lerContrato({ ...base, conta: "  " }), "Informe o cliente.");
checa("prevista exige chance", lerContrato({ ...base, situacao: "prevista" }), "Diga se a chance de fechar é alta ou baixa.");
checa("contratada não guarda chance", lerContrato({ ...base, chance: "alta" }).chance, null);
checa("data inválida", lerContrato({ ...base, inicioFaturamento: "12/2026" }), "Informe o início do faturamento.");
checa("tudo zerado", lerContrato({ ...base, linhas: [{ tipo: "assinatura", valorCentavos: 0 }] }), "Informe ao menos um valor: customização, implantação ou assinatura.");
checa("tipo repetido", lerContrato({ ...base, linhas: [{ tipo: "assinatura", valorCentavos: 1 }, { tipo: "assinatura", valorCentavos: 2 }] }), "Cada tipo de receita aparece uma vez só.");
checa("parcelas fora do limite", lerContrato({ ...base, linhas: [{ tipo: "implantacao", valorCentavos: 100, parcelas: 0 }] }), "Implantação: parcelas entre 1 e 60.");
checa("valor fracionado recusa", lerContrato({ ...base, linhas: [{ tipo: "implantacao", valorCentavos: 10.5, parcelas: 1 }] }), "Implantação: valor inválido.");

console.log(`\n${ok} passaram, ${falhas} falharam`);
if (falhas) process.exit(1);
