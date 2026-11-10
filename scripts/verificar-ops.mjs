// Teste do núcleo de operações (lib/ops/regras-*.ts). Não toca em banco.
//
//   node --experimental-strip-types scripts/verificar-ops.mjs
//
// As regras de criar e alterar atividade e oportunidade saíram de dentro das rotas HTTP para
// um núcleo que a interface e o MCP compartilham. Este teste segura três coisas:
//
//  1. PERMISSÃO — o que um agente externo mais vai testar sem querer: área só-leitura, área
//     invisível, mover para área sem edição, mover tirando de área alheia.
//  2. TUDO ANTES DE GRAVAR — com dois campos, um válido e um inválido, o plano é a falha
//     inteira, sem nada a gravar. Era o defeito das rotas antigas.
//  3. AS MESMAS MENSAGENS — a interface mostra o texto do erro. A seção 6 extrai as mensagens
//     das rotas como estavam antes da refatoração (git) e exige que todas continuem existindo.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  planejarAtualizacaoAtividade, planejarCriacaoAtividade,
} from "../lib/ops/regras-atividade.ts";
import {
  planejarAtualizacaoOportunidade, planejarCriacaoOportunidade, planejarMovimento,
} from "../lib/ops/regras-oportunidade.ts";

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
const erro = (r) => (r.ok ? "ok" : `${r.status} ${r.erro}`);

// Quem age: edita Tax, só vê Tech, não enxerga Jurídico.
const LABEL = { tax: "LIFF Tax", tech: "LIFF.tech", jur: "Jurídico" };
const NIVEL = { tax: "edit", tech: "view" };
const perm = {
  areasExistentes: ["tax", "tech", "jur"],
  podeVer: (a) => !!NIVEL[a],
  podeEditar: (a) => NIVEL[a] === "edit",
  labelArea: (a) => LABEL[a] ?? a,
};
// Quem age em duas áreas, para os movimentos que DEVEM passar.
const NIVEL2 = { tax: "edit", tech: "edit" };
const perm2 = { ...perm, podeVer: (a) => !!NIVEL2[a], podeEditar: (a) => NIVEL2[a] === "edit" };

const fatos = {
  pessoas: new Map([[1, "Bruno Santo"], [2, "Bianka Moreira"]]),
  produtos: [{ id: "regtrack", area: "tax" }, { id: "observa", area: "tech" }],
};

const ATIV = {
  id: 10, ref: "A-1010", titulo: "Mapear obrigações", area: "tax", status: "backlog",
  prioridade: "media", responsavel_user_id: 1, responsavel: "Bruno Santo", situacao: "",
  proximo_passo: "", proximo_passo_em: null, produto_id: "regtrack", prazo: new Date("2026-11-20T00:00:00Z"),
};
const OPOR = {
  id: 20, ref: "D-120", conta: "JBS", escopo: "", area: "tax", estagio: "qualificacao",
  valor_centavos: "6000000", proximo_passo: "", responsavel_user_id: null, responsavel: null,
  situacao: "", contato: "", responsavel_texto: "Agente 2", produto_id: "regtrack",
  pausado: false, proximo_passo_em: null, ace_aws: false,
};

console.log("\n1. criação: permissão vem antes de tudo o que depende da área");
checa("área só-leitura recusa com 403",
  erro(planejarCriacaoAtividade({ titulo: "X", area: "tech" }, perm, fatos)), "403 Sem permissão de edição em LIFF.tech.");
checa("área invisível também recusa (403, a área existe no cadastro)",
  erro(planejarCriacaoOportunidade({ conta: "X", area: "jur" }, perm, fatos)), "403 Sem permissão de edição em Jurídico.");
checa("área inexistente é 400, não 403",
  erro(planejarCriacaoAtividade({ titulo: "X", area: "nada" }, perm, fatos)), "400 Área inválida.");
checa("área não-string não passa por existente",
  erro(planejarCriacaoAtividade({ titulo: "X", area: ["tax"] }, perm, fatos)), "400 Área inválida.");
checa("título vazio vem antes da área (ordem antiga)",
  erro(planejarCriacaoAtividade({ titulo: "  ", area: "tech" }, perm, fatos)), "400 A atividade precisa de um título.");
checa("criação válida",
  planejarCriacaoAtividade({ titulo: " Revisar NCM ", area: "tax" }, perm, fatos).linha?.titulo, "Revisar NCM");
checa("defaults de status e prioridade",
  (({ status, prioridade }) => `${status}/${prioridade}`)(planejarCriacaoAtividade({ titulo: "X", area: "tax" }, perm, fatos).linha),
  "backlog/media");

console.log("\n2. criação: referências a outras tabelas");
checa("produto de outra área recusa",
  erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", produtoId: "observa" }, perm, fatos)),
  "400 Produto inválido para esta área.");
checa("responsável inexistente recusa",
  erro(planejarCriacaoAtividade({ titulo: "X", area: "tax", responsavelId: 99 }, perm, fatos)), "400 Responsável inválido.");
// Antes: um responsavelId "1" (string) ia direto para o SQL e o banco decidia. Agora é recusa
// clara, com a mesma mensagem do "não existe".
checa("responsável que não é inteiro recusa",
  erro(planejarCriacaoAtividade({ titulo: "X", area: "tax", responsavelId: "1" }, perm, fatos)), "400 Responsável inválido.");
checa("valor negativo recusa", erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", valorReais: -1 }, perm, fatos)), "400 Valor inválido.");
checa("valor em string numérica vale (o formulário manda assim)",
  planejarCriacaoOportunidade({ conta: "X", area: "tax", valorReais: "1500.5" }, perm, fatos).linha?.valorCentavos, 150050);
checa("pausado que não é booleano recusa",
  erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", pausado: "false" }, perm, fatos)), "400 Requisição inválida.");
checa("data malformada vira nula, sem erro (comportamento antigo)",
  planejarCriacaoAtividade({ titulo: "X", area: "tax", prazo: "20/11/2026" }, perm, fatos).linha?.prazo, null);
// A criação não cortava texto nenhum; um agente externo gravaria cem mil caracteres.
checa("texto longo é cortado no limite também na criação",
  planejarCriacaoOportunidade({ conta: "X", area: "tax", situacao: "a".repeat(9000) }, perm, fatos).linha?.situacao.length, 4000);
checa("auditoria da criação", planejarCriacaoOportunidade({ conta: "JBS", area: "tax", valorReais: 60000 }, perm, fatos).auditoria.texto,
  `Criou a oportunidade JBS (${(6000000 / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) em LIFF Tax`);

console.log("\n3. alteração: a permissão é a do registro no banco");
checa("registro em área invisível é 404 (não confirma que existe)",
  erro(planejarAtualizacaoAtividade({ ...ATIV, area: "jur" }, { titulo: "Y" }, perm, fatos)), "404 Atividade não encontrada.");
checa("registro em área só-leitura é 403",
  erro(planejarAtualizacaoOportunidade({ ...OPOR, area: "tech" }, { conta: "Y" }, perm, fatos)), "403 Sem permissão de edição nesta área.");
checa("mover para área sem edição recusa",
  erro(planejarAtualizacaoAtividade(ATIV, { area: "tech" }, perm, fatos)), "403 Sem permissão de edição em LIFF.tech.");
checa("mover tirando de área alheia recusa (registro em Tech, quem age só edita Tax)",
  erro(planejarAtualizacaoOportunidade({ ...OPOR, area: "tech" }, { area: "tax" }, perm, fatos)), "403 Sem permissão de edição nesta área.");
const movida = planejarAtualizacaoAtividade(ATIV, { area: "tech" }, perm2, fatos);
checa("mover com edição nas duas pontas passa", movida.areaFinal, "tech");
checa("o produto da vertical antiga cai junto, com registro",
  movida.mudancas.map((m) => m.campo), ["area", "produto"]);
checa("e o produto vai para nulo", movida.sets.produto_id, null);
checa("o setas não pula etapa e ignora o resto do corpo",
  planejarMovimento(OPOR, 1, perm).sets, { estagio: "validacao" });
checa("seta no fim do funil não muda nada",
  planejarMovimento({ ...OPOR, estagio: "ganho" }, 1, perm).mudancas.length, 0);
checa("direção arbitrária recusa", erro(planejarMovimento(OPOR, 3, perm)), "400 Direção inválida.");
checa("seta também respeita a permissão do registro",
  erro(planejarMovimento({ ...OPOR, area: "tech" }, 1, perm)), "403 Sem permissão de edição nesta área.");

console.log("\n4. alteração: tudo ou nada");
// O caso que motivou o núcleo: título válido + status inválido. A rota antiga já tinha gravado
// o título quando chegou no status, e a auditoria (no fim) nunca rodava.
const misto = planejarAtualizacaoAtividade(ATIV, { titulo: "Novo título", status: "pronto" }, perm, fatos);
checa("um campo inválido derruba o plano inteiro", erro(misto), "400 Status inválido.");
checa("e não há nada a gravar", misto.sets, undefined);
const mistoD = planejarAtualizacaoOportunidade(OPOR, { conta: "JBS S.A.", valorReais: -5 }, perm, fatos);
checa("idem na oportunidade", erro(mistoD), "400 Valor inválido.");
const bom = planejarAtualizacaoOportunidade(OPOR, { conta: "JBS S.A.", estagio: "proposta", valorReais: 60000 }, perm, fatos);
checa("cada campo que mudou vira uma linha de auditoria; o que não mudou, não",
  bom.mudancas.map((m) => m.campo), ["conta", "estagio"]);
checa("e o SQL toca só essas colunas", Object.keys(bom.sets), ["conta", "estagio"]);
checa("nada mudou → plano vazio",
  planejarAtualizacaoAtividade(ATIV, { titulo: "Mapear obrigações", prioridade: "media" }, perm, fatos).mudancas.length, 0);
checa("prazo igual em outra forma não conta como mudança",
  planejarAtualizacaoAtividade(ATIV, { prazo: "2026-11-20" }, perm, fatos).mudancas.length, 0);
checa("produto '' com o card já sem produto não é mudança (a rota antiga gravava '— → —')",
  planejarAtualizacaoOportunidade({ ...OPOR, produto_id: null }, { produtoId: "" }, perm, fatos).mudancas.length, 0);
checa("responsável para nulo", planejarAtualizacaoAtividade(ATIV, { responsavelId: null }, perm, fatos).sets,
  { responsavel_user_id: null });

console.log("\n5. as chaves de SQL são só as colunas conhecidas");
// `sets` vira `UPDATE ... SET ${tx(sets)}`. Uma chave vinda da entrada seria injeção de nome
// de coluna. A entrada aqui traz chaves que não são campo nenhum.
const intruso = planejarAtualizacaoOportunidade(OPOR, { valor_centavos: 1, "area = 'x'; --": 1, ace_aws: true, aceAws: true }, perm, fatos);
checa("chave desconhecida na entrada é ignorada", Object.keys(intruso.sets), ["ace_aws"]);
const COLUNAS = new Set(["area", "conta", "escopo", "estagio", "valor_centavos", "proximo_passo", "situacao", "contato",
  "responsavel_texto", "proximo_passo_em", "produto_id", "pausado", "ace_aws", "responsavel_user_id", "titulo",
  "status", "prioridade", "prazo"]);
const tudo = planejarAtualizacaoOportunidade(OPOR, {
  area: "tech", conta: "B", escopo: "c", estagio: "lead", valorReais: 1, proximoPasso: "p", situacao: "s",
  contato: "k", responsavelTexto: "r", proximoPassoEm: "2026-12-01", produtoId: "observa", pausado: true,
  aceAws: true, responsavelId: 2,
}, perm2, fatos);
checa("todas as colunas possíveis estão na lista conhecida", Object.keys(tudo.sets).every((k) => COLUNAS.has(k)), true);
checa("e são todas as 14 da oportunidade", Object.keys(tudo.sets).length, 14);

console.log("\n6. as mensagens de erro são as mesmas de antes da refatoração");
// Extrai todo `err("...")` das rotas como estavam no commit anterior à extração do núcleo e
// exige que cada texto continue existindo no código novo. Template strings (com ${...})
// entram pelo trecho fixo antes da primeira interpolação.
const ROTAS = ["app/api/activities/route.ts", "app/api/activities/[id]/route.ts", "app/api/deals/route.ts", "app/api/deals/[id]/route.ts"];
const BASE = "7abbf5a";
const NOVO = ["lib/ops/regras-atividade.ts", "lib/ops/regras-oportunidade.ts", "lib/ops/atividades.ts", "lib/ops/oportunidades.ts", ...ROTAS]
  .map((f) => readFileSync(f, "utf8")).join("\n");
const antigas = new Set();
for (const rota of ROTAS) {
  const fonte = execSync(`git show ${BASE}:"${rota}"`, { encoding: "utf8" });
  for (const m of fonte.matchAll(/err\(\s*["`]([^"`]+?)(?:\$\{|["`])/g)) antigas.add(m[1]);
}
checa("achou as mensagens antigas (sanidade do extrator)", antigas.size >= 14, true);
for (const msg of [...antigas].sort()) checa(`continua existindo: ${JSON.stringify(msg)}`, NOVO.includes(msg), true);

console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
