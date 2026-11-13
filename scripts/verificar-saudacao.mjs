// Saudação da Visão geral (lib/saudacao.ts): sem banco.
// node scripts/verificar-saudacao.mjs
import { linhaEmTexto, numeroDoDia, saudar } from "../lib/saudacao.ts";

let ok = 0;
let ruim = 0;
function checa(nome, deu, esperava) {
  const a = JSON.stringify(deu);
  const b = JSON.stringify(esperava);
  if (a === b) { ok++; console.log(`  ✓ ${nome}`); } else { ruim++; console.log(`  ✗ ${nome}\n      deu      ${a}\n      esperava ${b}`); }
}
const nada = { ganhosRecentes: [], diasFora: null, meus: { vencidos: [], hoje: [], amanha: [], proximo: null, abertos: 0 }, time: { vencidos: [], hoje: [] } };
const em = (iso) => new Date(iso); // hora local
const com = (f) => ({ ...nada, ...f, meus: { ...nada.meus, ...(f.meus ?? {}) }, time: { ...nada.time, ...(f.time ?? {}) } });

console.log("\n1. título");
const titulos = (iso, ids = [1, 2, 3]) => ids.map((id) => saudar("André", id, em(iso), nada).titulo);
checa("sempre termina com o nome e a exclamação", [...Array(40)].every((_, i) => saudar("André", 7, new Date(2026, 10, 1 + i, 9 + (i % 12)), nada).titulo.endsWith(", André!")), true);
checa("quarta de manhã é bom dia", titulos("2026-11-11T09:00:00"), ["Bom dia, André!", "Bom dia, André!", "Bom dia, André!"]);
checa("quarta à tarde é boa tarde", titulos("2026-11-11T15:00:00")[0], "Boa tarde, André!");
checa("quarta à noite é boa noite", titulos("2026-11-11T20:00:00")[0], "Boa noite, André!");
checa("sábado sempre é bom sábado", titulos("2026-11-14T10:00:00"), ["Bom sábado, André!", "Bom sábado, André!", "Bom sábado, André!"]);
checa("domingo sempre é bom domingo", titulos("2026-11-15T16:00:00")[0], "Bom domingo, André!");
checa("antes das 7h, madrugou", titulos("2026-11-11T06:10:00")[0], "Madrugou, André!");
checa("madrugada nunca é 'boa noite' simples", ["Ainda por aqui, André!", "Boa madrugada, André!"].includes(titulos("2026-11-12T01:30:00")[0]), true);
const sextas = new Set([...Array(9)].map((_, i) => saudar("André", 1, new Date(2026, 10, 13 + 7 * i, 15), nada).titulo));
checa("sexta à tarde varia ao longo das semanas (inclui a saudação simples)", sextas.size >= 2 && sextas.has("Boa tarde, André!"), true);
const segundas = new Set([...Array(9)].map((_, i) => saudar("André", 1, new Date(2026, 10, 16 + 7 * i, 9), nada).titulo));
checa("segunda de manhã varia ao longo das semanas", segundas.size >= 2, true);

console.log("\n2. linha do dia: a situação mais importante vence, e diz o quê");
const it = (ref, titulo, prazo = "2026-11-11") => ({ ref, titulo, prazo });
const T1 = it("T-1045", "Desenvolver POC Vetnil"), T2 = it("T-1050", "Revisar contrato EMS"), C1 = it("C-0325", "Metalinox Cogne: FUP");
const n = (k) => [...Array(k)].map((_, i) => it(`T-2${i}`, `Item ${i}`));
const linha = (f) => linhaEmTexto(saudar("André", 1, em("2026-11-11T10:00:00"), com(f)).linha);
const trechos = (f) => saudar("André", 1, em("2026-11-11T10:00:00"), com(f)).linha;
checa("ganho vem antes de tudo, pelo nome", linha({ ganhosRecentes: [{ ref: "C-1", conta: "Medley" }], diasFora: 9, meus: { vencidos: [T1] } }), "Virou Ganho: Medley.");
checa("dois ganhos", linha({ ganhosRecentes: [{ ref: "C-1", conta: "Medley" }, { ref: "C-2", conta: "Galena" }] }), "Viraram Ganho: Medley e Galena.");
checa("ganho é link para o card", trechos({ ganhosRecentes: [{ ref: "C-1", conta: "Medley" }] })[1], { texto: "Medley", ref: "C-1" });
checa("volta depois de dias fora, com o que espera", linha({ diasFora: 4, meus: { vencidos: [T1], hoje: [T2] } }), "De volta depois de 4 dias. Esperando você: Desenvolver POC Vetnil e Revisar contrato EMS.");
checa("dois dias fora não é 'de volta'", /De volta/.test(linha({ diasFora: 2, meus: { hoje: [T1] } })), false);
checa("vencido vem antes de hoje, e avisa o de hoje", linha({ meus: { vencidos: [T1], hoje: [T2, C1] } }), "Passou do prazo: Desenvolver POC Vetnil. Hoje vencem mais 2.");
checa("vence hoje: cita o item", linha({ meus: { hoje: [C1] } }), "Vence hoje: Metalinox Cogne: FUP.");
checa("o item de hoje é link para abrir", trechos({ meus: { hoje: [T1] } })[1], { texto: "Desenvolver POC Vetnil", ref: "T-1045" });
checa("muitos: dois com link e o resto vai ao cronograma", trechos({ meus: { hoje: n(5) } }).at(-2), { texto: "mais 3", ir: "cronograma" });
checa("vence amanhã", linha({ meus: { amanha: [T1] } }), "Nada para hoje. Amanhã vence Desenvolver POC Vetnil.");
checa("em dia: aponta o próximo prazo", linha({ meus: { proximo: it("T-1", "Enviar proposta", "2026-11-18"), abertos: 3 } }), "Nada seu vence hoje nem amanhã. Próximo prazo: Enviar proposta, em 18/11.");
checa("título longo é cortado", trechos({ meus: { hoje: [it("T-9", "x".repeat(80))] } })[1].texto.length, 48);
checa("sem nada no nome: fala do time", linha({ time: { vencidos: [T1] } }), "Fora do prazo no time: Desenvolver POC Vetnil.");
checa("nada de nada: frase calma", linha({}), "Nenhum prazo apertado no time.");

console.log("\n3. estável");
const a = saudar("André", 1, em("2026-11-11T09:00:00"), com({ meus: { hoje: [T1] } }));
const b = saudar("André", 1, em("2026-11-11T11:45:00"), com({ meus: { hoje: [T1] } }));
checa("no mesmo dia a frase não muda a cada recarga", a, b);
checa("número do dia muda à meia-noite local", numeroDoDia(new Date(2026, 10, 11, 23, 59)) + 1, numeroDoDia(new Date(2026, 10, 12, 0, 1)));

console.log(`\n${ok} passaram, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
