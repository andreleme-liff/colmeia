// Teste do filtro "só o que é meu". Não toca em banco.
//
//   node --experimental-strip-types scripts/verificar-filtro.mjs
//
// A regra não é "responsavelId === me.id" e isso é o ponto do teste. A importação de
// planilha grava SÓ `responsavel_texto`: no pipeline do LIFF Tax o responsável é texto
// livre na coluna RESPONSÁVEL e nenhuma linha tem `responsavel_user_id`. Um filtro por id
// devolveria zero oportunidades e pareceria quebrado no primeiro clique.
//
// Os nomes abaixo são os responsáveis reais da planilha, de propósito: é o conjunto em que
// o filtro vai rodar.

import { ehMeu, textoMencionaPessoa, nomesDoTexto } from "../lib/domain.ts";

const EQUIPE = [
  "Bruno Santo", "Bianka Moreira", "Jose Finocchio", "Eneias Amorim",
  "Milton Schivitaro", "Felipe Zambon", "Andre Leme",
];
const outros = (eu) => EQUIPE.filter((n) => n !== eu);

let ok = 0;
let falhou = 0;
function checa(descricao, obtido, esperado) {
  if (obtido === esperado) {
    ok++;
    console.log(`  ✓ ${descricao}`);
  } else {
    falhou++;
    console.log(`  ✗ ${descricao} — deu ${obtido}, esperava ${esperado}`);
  }
}

console.log("\n1. separação de nomes no texto livre");
for (const [txt, esp] of [
  ["Bruno Santo", ["Bruno Santo"]],
  ["Bruno Santo / Felipe Zambon", ["Bruno Santo", "Felipe Zambon"]],
  ["Felipe Silveira / Bianka", ["Felipe Silveira", "Bianka"]],
  ["Vivi e Giordani", ["Vivi", "Giordani"]],
  ["Neide, Itamar; Marçal", ["Neide", "Itamar", "Marçal"]],
  ["", []],
]) {
  checa(`${JSON.stringify(txt)} → ${esp.length} nome(s)`,
    JSON.stringify(nomesDoTexto(txt)), JSON.stringify(esp));
}

console.log("\n2. nome inteiro e nome parcial");
checa('"Bruno Santo" é de Bruno Santo',
  textoMencionaPessoa("Bruno Santo", "Bruno Santo", outros("Bruno Santo")), true);
checa('"Bianka" sozinho é de Bianka Moreira',
  textoMencionaPessoa("Bianka", "Bianka Moreira", outros("Bianka Moreira")), true);
checa('o segundo nome de uma dupla conta para ele',
  textoMencionaPessoa("Bruno Santo / Felipe Zambon", "Felipe Zambon", outros("Felipe Zambon")), true);
checa('"Bruno Santo" não é de Bianka',
  textoMencionaPessoa("Bruno Santo", "Bianka Moreira", outros("Bianka Moreira")), false);
checa('"José" com acento casa com "Jose" sem',
  textoMencionaPessoa("José Finocchio", "Jose Finocchio", outros("Jose Finocchio")), true);
checa('caixa alta não atrapalha',
  textoMencionaPessoa("BRUNO SANTO", "Bruno Santo", outros("Bruno Santo")), true);
checa("texto vazio não é de ninguém",
  textoMencionaPessoa("", "Bruno Santo", EQUIPE), false);

console.log("\n3. a guarda de ambiguidade");
// Errar para menos esconde um card do dono. Errar para mais mostra a carteira de outra
// pessoa como se fosse sua — pior, num filtro em que se confia para saber o que lhe cabe.
checa('"Bruno" solto não decide entre dois Brunos',
  textoMencionaPessoa("Bruno", "Bruno Santo", ["Bruno Costa"]), false);
checa('"Bruno Santo" continua decidindo mesmo com dois Brunos',
  textoMencionaPessoa("Bruno Santo", "Bruno Santo", ["Bruno Costa"]), true);
checa('"Bruno" decide quando só existe um Bruno',
  textoMencionaPessoa("Bruno", "Bruno Santo", ["Bianka Moreira"]), true);

console.log("\n4. ehMeu: o id manda quando existe");
const eu = { id: 7, nome: "Bruno Santo" };
checa("responsavelId igual ao meu", ehMeu({ responsavelId: 7 }, eu, outros(eu.nome)), true);
checa("responsavelId de outra pessoa", ehMeu({ responsavelId: 9 }, eu, outros(eu.nome)), false);
checa("id de outro vence o texto com o meu nome",
  ehMeu({ responsavelId: 9, responsavelTexto: "Bruno Santo" }, eu, outros(eu.nome)), false);
checa("sem id, vale o texto — é o caso de tudo que veio da planilha",
  ehMeu({ responsavelId: null, responsavelTexto: "Bruno Santo" }, eu, outros(eu.nome)), true);
checa("sem id e sem texto", ehMeu({ responsavelId: null, responsavelTexto: "" }, eu, outros(eu.nome)), false);
checa("atividade, que nem tem campo de texto",
  ehMeu({ responsavelId: null }, eu, outros(eu.nome)), false);

console.log("\n5. o pipeline real do LIFF Tax, por pessoa");
// Recorte da planilha de produção: conta e o que está na coluna RESPONSÁVEL.
const DEALS = [
  ["3M", "Bruno Santo"],
  ["PERNOD RICARD", "Bianka"],
  ["JBS", "Agente 2"],
  ["NATURA", "Jose Finocchio"],
  ["CUMMINS", "Eneias Amorim"],
  ["CI&T", "Milton Schivitaro"],
  ["JA SAÚDE ANIMAL", "Bruno Santo / Felipe Zambon"],
  ["AMBEV", "Bruno Santo"],
];
const ESPERADO = {
  "Bruno Santo": ["3M", "JA SAÚDE ANIMAL", "AMBEV"],
  "Bianka Moreira": ["PERNOD RICARD"],
  "Felipe Zambon": ["JA SAÚDE ANIMAL"],
  "Jose Finocchio": ["NATURA"],
  "Andre Leme": [],
};
for (const [nome, esperadas] of Object.entries(ESPERADO)) {
  const meus = DEALS
    .filter(([, r]) => ehMeu({ responsavelId: null, responsavelTexto: r }, { id: 1, nome }, outros(nome)))
    .map(([c]) => c);
  checa(
    `${nome}: ${meus.length} de ${DEALS.length}${meus.length ? ` (${meus.join(", ")})` : ""}`,
    JSON.stringify(meus),
    JSON.stringify(esperadas)
  );
}
// Nenhum card pode ficar órfão de um jeito que ninguém o veja por engano: "Agente 2" não
// é de ninguém da equipe, e é certo que não apareça para nenhum deles.
const semDono = DEALS.filter(([, r]) => !EQUIPE.some((n) => textoMencionaPessoa(r, n, outros(n))));
checa('"Agente 2" não cai no filtro de ninguém',
  JSON.stringify(semDono.map(([c]) => c)), JSON.stringify(["JBS"]));

console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
