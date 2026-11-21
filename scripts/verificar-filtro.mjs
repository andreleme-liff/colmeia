// Teste do filtro por responsável. Não toca em banco.
//
//   node --experimental-strip-types scripts/verificar-filtro.mjs
//
// A regra não é "responsavelId === alguem.id", e isso é o ponto do teste. A importação de
// planilha grava SÓ `responsavel_texto`: no pipeline do Tax o responsável é texto livre
// na coluna RESPONSÁVEL e nenhuma linha tem `responsavel_user_id`. Um filtro por id
// devolveria zero oportunidades e pareceria quebrado no primeiro clique.
//
// Os nomes e as linhas abaixo são os reais da planilha, de propósito: é o conjunto em que o
// filtro vai rodar.

import {
  CHAVE_SEM_RESPONSAVEL, MAX_RESPONSAVEIS_NA_SELECAO, chaveDeTexto, chavesDoResponsavel,
  ehDoResponsavel, escreverSelecaoDeResponsaveis, lerSelecaoDeResponsaveis, nomesDoTexto,
  opcoesDeResponsavel, textoMencionaPessoa,
} from "../lib/domain.ts";

const EQUIPE = [
  { id: 1, nome: "Bruno Santo" },
  { id: 2, nome: "Bianka Moreira" },
  { id: 3, nome: "Jose Finocchio" },
  { id: 4, nome: "Eneias Amorim" },
  { id: 5, nome: "Milton Schivitaro" },
  { id: 6, nome: "Felipe Zambon" },
  { id: 7, nome: "Andre Leme" },
];
const outrosNomes = (eu) => EQUIPE.filter((p) => p.nome !== eu).map((p) => p.nome);
const porTexto = (t) => ({ responsavelId: null, responsavelTexto: t });

let ok = 0;
let falhou = 0;
function checa(descricao, obtido, esperado) {
  const a = typeof obtido === "object" ? JSON.stringify(obtido) : obtido;
  const b = typeof esperado === "object" ? JSON.stringify(esperado) : esperado;
  if (a === b) {
    ok++;
    console.log(`  ✓ ${descricao}`);
  } else {
    falhou++;
    console.log(`  ✗ ${descricao}\n      deu      ${a}\n      esperava ${b}`);
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
  checa(`${JSON.stringify(txt)} → ${esp.length} nome(s)`, nomesDoTexto(txt), esp);
}

console.log("\n2. nome inteiro e nome parcial");
checa('"Bianka" sozinho é de Bianka Moreira',
  textoMencionaPessoa("Bianka", "Bianka Moreira", outrosNomes("Bianka Moreira")), true);
checa("o segundo nome de uma dupla conta para ele",
  textoMencionaPessoa("Bruno Santo / Felipe Zambon", "Felipe Zambon", outrosNomes("Felipe Zambon")), true);
checa('"José" com acento casa com "Jose" sem',
  textoMencionaPessoa("José Finocchio", "Jose Finocchio", outrosNomes("Jose Finocchio")), true);
checa("caixa alta não atrapalha",
  textoMencionaPessoa("BRUNO SANTO", "Bruno Santo", outrosNomes("Bruno Santo")), true);
// Errar para menos esconde um card do dono. Errar para mais mostra a carteira de outra
// pessoa como se fosse sua — pior, num filtro em que se confia para saber o que lhe cabe.
checa('"Bruno" solto não decide entre dois Brunos',
  textoMencionaPessoa("Bruno", "Bruno Santo", ["Bruno Costa"]), false);
checa('"Bruno" decide quando só existe um Bruno',
  textoMencionaPessoa("Bruno", "Bruno Santo", ["Bianka Moreira"]), true);

console.log("\n3. a chave de filtro de um registro");
checa("responsavelId manda quando existe", chavesDoResponsavel({ responsavelId: 6 }, EQUIPE), ["u:6"]);
checa("id manda mesmo com texto de outra pessoa",
  chavesDoResponsavel({ responsavelId: 6, responsavelTexto: "Bruno Santo" }, EQUIPE), ["u:6"]);
checa("texto que resolve vira a chave da pessoa", chavesDoResponsavel(porTexto("Bianka"), EQUIPE), ["u:2"]);
checa("dupla conta para os dois — o card é dos dois",
  chavesDoResponsavel(porTexto("Bruno Santo / Felipe Zambon"), EQUIPE), ["u:1", "u:6"]);
checa("texto que não é ninguém da equipe vale por si",
  chavesDoResponsavel(porTexto("Agente 2"), EQUIPE), ["t:agente-2"]);
// Ambíguo não pode virar u:<id>: atribuiria o card ao Bruno errado. Vira opção própria.
checa("ambíguo não resolve e vira chave de texto",
  chavesDoResponsavel(porTexto("Bruno"), [{ id: 1, nome: "Bruno Santo" }, { id: 8, nome: "Bruno Costa" }]),
  ["t:bruno"]);
checa("em branco é 'sem responsável'", chavesDoResponsavel(porTexto(""), EQUIPE), [CHAVE_SEM_RESPONSAVEL]);
checa("só espaço também é 'sem responsável'", chavesDoResponsavel(porTexto("   "), EQUIPE), [CHAVE_SEM_RESPONSAVEL]);
checa("o mesmo nome repetido não duplica a chave",
  chavesDoResponsavel(porTexto("Bruno Santo / Bruno Santo"), EQUIPE), ["u:1"]);
checa("slug de texto com pontuação", chaveDeTexto("Special Agent 2 — ponte"), "t:special-agent-2-ponte");
checa("texto sem letra nem número cai em 'sem'", chaveDeTexto("—"), CHAVE_SEM_RESPONSAVEL);

console.log("\n4. as opções, tiradas do pipeline real do Tax");
const DEALS = [
  ["3M", "Bruno Santo"],
  ["PERNOD RICARD", "Bianka"],
  ["JBS", "Agente 2"],
  ["NATURA", "Jose Finocchio"],
  ["CUMMINS", "Eneias Amorim"],
  ["CI&T", "Milton Schivitaro"],
  ["JA SAÚDE ANIMAL", "Bruno Santo / Felipe Zambon"],
  ["AMBEV", "Bruno Santo"],
].map(([conta, resp]) => ({ conta, ...porTexto(resp) }));

const opcoes = opcoesDeResponsavel(DEALS, EQUIPE);
// Cadastradas em ordem alfabética, texto solto depois, "sem responsável" por último.
checa("ordem e rótulos", opcoes.map((o) => o.label),
  ["Bianka Moreira", "Bruno Santo", "Eneias Amorim", "Felipe Zambon", "Jose Finocchio", "Milton Schivitaro", "Agente 2"]);
checa("contagens", opcoes.map((o) => `${o.chave}=${o.qtd}`),
  ["u:2=1", "u:1=3", "u:4=1", "u:6=1", "u:3=1", "u:5=1", "t:agente-2=1"]);
// "Bianka" na planilha, "Bianka Moreira" na lista: o rótulo é o nome cadastrado, senão a
// mesma pessoa apareceria duas vezes conforme a grafia da linha.
checa("o rótulo é o nome cadastrado, não a grafia da planilha",
  opcoes.find((o) => o.chave === "u:2").label, "Bianka Moreira");
checa('"Agente 2" não vem marcado como pessoa cadastrada',
  opcoes.find((o) => o.chave === "t:agente-2").cadastrada, false);
// Andre Leme não tem nada no pipeline: não aparece, e isso é a informação.
checa("quem não tem nada em escopo não entra na lista",
  opcoes.some((o) => o.chave === "u:7"), false);

const comVazio = opcoesDeResponsavel([...DEALS, porTexto("")], EQUIPE);
checa("'sem responsável' entra e vai para o fim",
  comVazio[comVazio.length - 1].chave, CHAVE_SEM_RESPONSAVEL);

console.log("\n5. o recorte");
const contas = (sel) => DEALS.filter((d) => ehDoResponsavel(d, sel, EQUIPE)).map((d) => d.conta);
checa("seleção vazia é 'todos'", contas([]).length, DEALS.length);
checa("uma pessoa", contas(["u:1"]), ["3M", "JA SAÚDE ANIMAL", "AMBEV"]);
checa("duas pessoas somam, sem repetir a dupla",
  contas(["u:1", "u:6"]), ["3M", "JA SAÚDE ANIMAL", "AMBEV"]);
checa("pessoas sem card em comum", contas(["u:2", "u:3"]), ["PERNOD RICARD", "NATURA"]);
checa("o segundo da dupla sozinho", contas(["u:6"]), ["JA SAÚDE ANIMAL"]);
checa("texto solto é selecionável", contas(["t:agente-2"]), ["JBS"]);
checa("quem não tem nada devolve nada", contas(["u:7"]), []);
checa("'sem responsável' não pega quem tem responsável", contas([CHAVE_SEM_RESPONSAVEL]), []);
// A lista de opções tem de ser montada ANTES do recorte: depois dele, escolher uma pessoa
// deixaria só ela na lista e não haveria como trocar nem voltar.
const aposRecorte = opcoesDeResponsavel(DEALS.filter((d) => ehDoResponsavel(d, ["u:1"], EQUIPE)), EQUIPE);
checa("montar as opções depois do recorte colapsaria a lista (por isso é antes)",
  aposRecorte.length < opcoes.length, true);

console.log("\n6. o que entra e sai das preferências");
checa("ida e volta", lerSelecaoDeResponsaveis("u:1,t:agente-2,sem"), ["u:1", "t:agente-2", "sem"]);
checa("vazio é todos", lerSelecaoDeResponsaveis(""), []);
checa("nulo é todos", lerSelecaoDeResponsaveis(null), []);
checa("espaço em volta não atrapalha", lerSelecaoDeResponsaveis(" u:1 , u:2 "), ["u:1", "u:2"]);
checa("duplicata sai", lerSelecaoDeResponsaveis("u:1,u:1"), ["u:1"]);
// Chave inválida é descartada, e não transformada: uma preferência corrompida voltando como
// filtro que não casa com nada deixaria a tela vazia sem explicação.
checa("chave fora do formato é descartada", lerSelecaoDeResponsaveis("u:1,lixo,u:abc,t:MAIÚSCULA"), ["u:1"]);
checa("maiúscula não é slug válido", lerSelecaoDeResponsaveis("t:Agente-2"), []);
checa("teto de itens", lerSelecaoDeResponsaveis(
  Array.from({ length: MAX_RESPONSAVEIS_NA_SELECAO + 10 }, (_, i) => `u:${i + 1}`).join(",")
).length, MAX_RESPONSAVEIS_NA_SELECAO);
checa("a forma de gravar é canônica", escreverSelecaoDeResponsaveis(["u:2", "lixo", "u:2", "sem"]), "u:2,sem");
checa("gravar nada dá string vazia", escreverSelecaoDeResponsaveis([]), "");

console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
