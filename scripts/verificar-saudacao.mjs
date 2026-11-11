// Saudação da Visão geral (lib/saudacao.ts): sem banco.
// node scripts/verificar-saudacao.mjs
import { numeroDoDia, saudar } from "../lib/saudacao.ts";

let ok = 0;
let ruim = 0;
function checa(nome, deu, esperava) {
  const a = JSON.stringify(deu);
  const b = JSON.stringify(esperava);
  if (a === b) { ok++; console.log(`  ✓ ${nome}`); } else { ruim++; console.log(`  ✗ ${nome}\n      deu      ${a}\n      esperava ${b}`); }
}
const nada = { ganhosRecentes: [], diasFora: null, meus: { vencidos: 0, hoje: 0, amanha: 0, abertos: 0 }, time: { vencidos: 0, hoje: 0 } };
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

console.log("\n2. linha do dia: a situação mais importante vence");
const linha = (f, iso = "2026-11-11T10:00:00", id = 1) => saudar("André", id, em(iso), com(f)).linha;
checa("ganho vem antes de tudo", /Medley/.test(linha({ ganhosRecentes: ["Medley"], diasFora: 9, meus: { vencidos: 4 } })), true);
checa("dois ganhos: plural certo", /Medley e Galena (viraram|entraram)|: Medley e Galena\./.test(linha({ ganhosRecentes: ["Medley", "Galena"] })), true);
checa("mais de dois ganhos resume", /Medley e Galena e mais 1/.test(linha({ ganhosRecentes: ["Medley", "Galena", "Globe"] })), true);
checa("volta depois de dias fora, com o que espera", /4 dias.*2 itens esperando você/.test(linha({ diasFora: 4, meus: { vencidos: 1, hoje: 1 } })), true);
checa("dois dias fora não é 'de volta'", /dias/.test(linha({ diasFora: 2, meus: { abertos: 3 } })), false);
checa("vencido vem antes de 'hoje'", /passaram do prazo/.test(linha({ meus: { vencidos: 2, hoje: 5 } })), true);
checa("um vencido: singular", /1 item seu passou do prazo/.test(linha({ meus: { vencidos: 1 } })), true);
checa("vence hoje", /vence(m)? hoje/.test(linha({ meus: { hoje: 3, amanha: 1 } })), true);
checa("vence amanhã", /amanhã/.test(linha({ meus: { amanha: 1, abertos: 4 } })), true);
checa("tudo em dia, com itens abertos", /dia|prazo/i.test(linha({ meus: { abertos: 4 } })), true);
checa("sem nada no nome: fala do time", /time/.test(linha({ time: { vencidos: 3 } })), true);
checa("nada de nada: frase calma", linha({}).length > 5, true);

console.log("\n3. não cansa");
const formas = (f, id = 1) => new Set([...Array(14)].map((_, i) => saudar("André", id, new Date(2026, 10, 2 + i, 10), com(f)).linha));
checa("mesma situação, formas diferentes ao longo de duas semanas", formas({ meus: { vencidos: 2 } }).size >= 3, true);
checa("dia livre também varia", formas({ meus: { abertos: 4 } }).size >= 3, true);
const seguidos = [...Array(30)].map((_, i) => saudar("André", 1, new Date(2026, 10, 2 + i, 10), com({ meus: { hoje: 2 } })).linha);
checa("dois dias seguidos nunca repetem a mesma forma", seguidos.every((l, i) => i === 0 || l !== seguidos[i - 1]), true);
const a = saudar("André", 1, em("2026-11-11T09:00:00"), com({ meus: { hoje: 2 } }));
const b = saudar("André", 1, em("2026-11-11T11:45:00"), com({ meus: { hoje: 2 } }));
checa("no mesmo dia a frase não muda a cada recarga", a, b);
checa("pessoas diferentes não leem todas a mesma forma no mesmo dia",
  new Set([1, 2, 3, 4].map((id) => saudar("X", id, em("2026-11-11T10:00:00"), com({ meus: { vencidos: 2 } })).linha)).size >= 2, true);
checa("número do dia muda à meia-noite local", numeroDoDia(new Date(2026, 10, 11, 23, 59)) + 1, numeroDoDia(new Date(2026, 10, 12, 0, 1)));

console.log(`\n${ok} passaram, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
