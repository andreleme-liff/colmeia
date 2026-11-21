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
import { ESTAGIO_INICIAL, FUNIL, PIPELINE, STAGE_KEYS, estagioEmAberto, estagioNoPipeline, formatarRef, previaDaProposta, refCanonica, tipoDaRef, urlDaProposta } from "../lib/domain.ts";
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
const LABEL = { tax: "Tax", tech: "Tech", jur: "Jurídico" };
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
  produtos: [{ id: "regtrack", area: "tax" }, { id: "genius", area: "tax" }, { id: "observa", area: "tech" }],
  origens: [{ id: "parceiro", label: "Parceiro", ativo: true }, { id: "evento", label: "Evento", ativo: false }],
  oportunidades: [
    { id: 20, ref: "C-0120", conta: "JBS", area: "tax" },
    { id: 21, ref: "C-0121", conta: "Natura", area: "tech" },
    { id: 22, ref: "C-0122", conta: "Banco Sigiloso", area: "jur" },
  ],
};

const ATIV = {
  id: 10, ref: "A-1010", titulo: "Mapear obrigações", area: "tax", status: "backlog",
  prioridade: "media", responsavel_user_id: 1, responsavel: "Bruno Santo", situacao: "",
  proximo_passo: "", proximo_passo_em: null, produto_id: "regtrack", prazo: new Date("2026-11-20T00:00:00Z"),
  oportunidade_id: null,
};
const OPOR = {
  id: 20, ref: "C-0120", conta: "JBS", area: "tax", estagio: "qualificado",
  valor_centavos: "6000000", proximo_passo: "", responsavel_user_id: null, responsavel: null,
  situacao: "", contato: "", responsavel_texto: "Agente 2",
  proximo_passo_em: null,
  origem_id: null, ponte: "", contato_operacional: "", dor: "", erp: "", proposta_url: "", ultima_interacao: null,
  blocker: "", blocker_tipo: null, blocker_dono_id: null, motivo_perda: null, motivo_perda_detalhe: "", notas: "",
  modulos: ["regtrack"],
};

console.log("\n1. criação: permissão vem antes de tudo o que depende do produto");
checa("produto só-leitura recusa com 403",
  erro(planejarCriacaoAtividade({ titulo: "X", area: "tech" }, perm, fatos)), "403 Sem permissão de edição em Tech.");
checa("produto invisível também recusa (403, o produto existe no cadastro)",
  erro(planejarCriacaoOportunidade({ conta: "X", area: "jur" }, perm, fatos)), "403 Sem permissão de edição em Jurídico.");
checa("produto inexistente é 400, não 403",
  erro(planejarCriacaoAtividade({ titulo: "X", area: "nada" }, perm, fatos)), "400 Produto inválido.");
checa("produto não-string não passa por existente",
  erro(planejarCriacaoAtividade({ titulo: "X", area: ["tax"] }, perm, fatos)), "400 Produto inválido.");
checa("título vazio vem antes do produto (ordem antiga)",
  erro(planejarCriacaoAtividade({ titulo: "  ", area: "tech" }, perm, fatos)), "400 A atividade precisa de um título.");
checa("criação válida",
  planejarCriacaoAtividade({ titulo: " Revisar NCM ", area: "tax" }, perm, fatos).linha?.titulo, "Revisar NCM");
checa("defaults de status e prioridade",
  (({ status, prioridade }) => `${status}/${prioridade}`)(planejarCriacaoAtividade({ titulo: "X", area: "tax" }, perm, fatos).linha),
  "backlog/media");

console.log("\n2. criação: referências a outras tabelas");
checa("módulo de outro produto recusa",
  erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", modulos: ["observa"] }, perm, fatos)),
  "400 Módulo inválido para este produto: observa.");
checa("módulos sem duplicata e em ordem",
  planejarCriacaoOportunidade({ conta: "X", area: "tax", modulos: ["regtrack", "genius", "regtrack"] }, perm, fatos).linha?.modulos,
  ["genius", "regtrack"]);
checa("origem desconhecida recusa",
  erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", origemId: "nada" }, perm, fatos)), "400 Origem inválida.");
checa("origem arquivada não entra numa oportunidade nova",
  erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", origemId: "evento" }, perm, fatos)), "400 Origem inválida.");
checa("tipo de blocker fora do domínio recusa",
  erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", blockerTipo: "humor" }, perm, fatos)), "400 Tipo de blocker inválido.");
const LINK_RUIM = "400 Link da proposta inválido. Cole o endereço completo, começando por https://.";
checa("link da proposta: javascript: recusa",
  erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", propostaUrl: "javascript:alert(1)" }, perm, fatos)), LINK_RUIM);
checa("link da proposta: data: recusa", urlDaProposta("data:text/html,<script>1</script>"), null);
checa("link da proposta: com espaço recusa", urlDaProposta("https://a.com/x y"), null);
checa("link da proposta: usuário e senha no endereço recusa", urlDaProposta("https://docs.google.com@evil.com/x"), null);
checa("link da proposta: sem protocolo ganha https", urlDaProposta(" docs.google.com/document/d/1AbCdEfGhIjKl/edit "), "https://docs.google.com/document/d/1AbCdEfGhIjKl/edit");
checa("link da proposta: vazio é 'sem link'", urlDaProposta("  "), "");
checa("link da proposta: entra na criação",
  planejarCriacaoOportunidade({ conta: "X", area: "tax", propostaUrl: "https://drive.google.com/file/d/1AbCdEfGhIjKl/view" }, perm, fatos).linha?.propostaUrl,
  "https://drive.google.com/file/d/1AbCdEfGhIjKl/view");
checa("prévia: Slides vira /preview",
  previaDaProposta("https://docs.google.com/presentation/d/1AbCdEfGhIjKl/edit#slide=id.p")?.embed, "https://docs.google.com/presentation/d/1AbCdEfGhIjKl/preview");
checa("prévia: arquivo do Drive", previaDaProposta("https://drive.google.com/file/d/1AbCdEfGhIjKl/view?usp=sharing")?.embed, "https://drive.google.com/file/d/1AbCdEfGhIjKl/preview");
checa("prévia: open?id= do Drive", previaDaProposta("https://drive.google.com/open?id=1AbCdEfGhIjKl")?.embed, "https://drive.google.com/file/d/1AbCdEfGhIjKl/preview");
checa("prévia: host parecido não vira iframe", previaDaProposta("https://docs.google.com.evil.com/document/d/1AbCdEfGhIjKl/edit"), null);
checa("prévia: outro site fica só como link", previaDaProposta("https://www.canva.com/design/abc"), null);
checa("prévia: http não vira iframe", previaDaProposta("http://docs.google.com/document/d/1AbCdEfGhIjKl/edit"), null);
checa("motivo de perda fora do domínio recusa",
  erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", motivoPerda: "azar" }, perm, fatos)), "400 Motivo da perda inválido.");
checa("quem resolve o blocker tem de existir",
  erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", blockerDonoId: 99 }, perm, fatos)), "400 Quem resolve o blocker é inválido.");
checa("responsável inexistente recusa",
  erro(planejarCriacaoAtividade({ titulo: "X", area: "tax", responsavelId: 99 }, perm, fatos)), "400 Responsável inválido.");
// Antes: um responsavelId "1" (string) ia direto para o SQL e o banco decidia. Agora é recusa
// clara, com a mesma mensagem do "não existe".
checa("responsável que não é inteiro recusa",
  erro(planejarCriacaoAtividade({ titulo: "X", area: "tax", responsavelId: "1" }, perm, fatos)), "400 Responsável inválido.");
checa("valor negativo recusa", erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", valorReais: -1 }, perm, fatos)), "400 Valor inválido.");
checa("valor em string numérica vale (o formulário manda assim)",
  planejarCriacaoOportunidade({ conta: "X", area: "tax", valorReais: "1500.5" }, perm, fatos).linha?.valorCentavos, 150050);
// "Em pausa" virou o estágio On hold: um `pausado` de cliente antigo não grava nada.
checa("pausado (legado) é ignorado na criação",
  "pausado" in (planejarCriacaoOportunidade({ conta: "X", area: "tax", pausado: true }, perm, fatos).linha ?? {}), false);
checa("data malformada vira nula, sem erro (comportamento antigo)",
  planejarCriacaoAtividade({ titulo: "X", area: "tax", prazo: "20/11/2026" }, perm, fatos).linha?.prazo, null);
// A criação não cortava texto nenhum; um agente externo gravaria cem mil caracteres.
checa("texto longo é cortado no limite também na criação",
  planejarCriacaoOportunidade({ conta: "X", area: "tax", situacao: "a".repeat(9000) }, perm, fatos).linha?.situacao.length, 4000);
checa("auditoria da criação", planejarCriacaoOportunidade({ conta: "JBS", area: "tax", valorReais: 60000 }, perm, fatos).auditoria.texto,
  `Criou a oportunidade JBS (${(6000000 / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) em Tax`);

console.log("\n3. alteração: a permissão é a do registro no banco");
checa("registro em produto invisível é 404 (não confirma que existe)",
  erro(planejarAtualizacaoAtividade({ ...ATIV, area: "jur" }, { titulo: "Y" }, perm, fatos)), "404 Atividade não encontrada.");
checa("registro em produto só-leitura é 403",
  erro(planejarAtualizacaoOportunidade({ ...OPOR, area: "tech" }, { conta: "Y" }, perm, fatos)), "403 Sem permissão de edição neste produto.");
checa("mover para produto sem edição recusa",
  erro(planejarAtualizacaoAtividade(ATIV, { area: "tech" }, perm, fatos)), "403 Sem permissão de edição em Tech.");
checa("mover tirando de produto alheio recusa (registro em Tech, quem age só edita Tax)",
  erro(planejarAtualizacaoOportunidade({ ...OPOR, area: "tech" }, { area: "tax" }, perm, fatos)), "403 Sem permissão de edição neste produto.");
const movida = planejarAtualizacaoAtividade(ATIV, { area: "tech" }, perm2, fatos);
checa("mover com edição nas duas pontas passa", movida.areaFinal, "tech");
checa("o módulo do produto antigo cai junto, com registro",
  movida.mudancas.map((m) => m.campo), ["area", "produto"]);
checa("e o módulo vai para nulo", movida.sets.produto_id, null);
checa("a seta não pula etapa e ignora o resto do corpo",
  planejarMovimento(OPOR, 1, perm).sets, { estagio: "proposta" });
checa("seta no fim do funil não muda nada",
  planejarMovimento({ ...OPOR, estagio: "ganho" }, 1, perm).mudancas.length, 0);
checa("direção arbitrária recusa", erro(planejarMovimento(OPOR, 3, perm)), "400 Direção inválida.");
checa("seta também respeita a permissão do registro",
  erro(planejarMovimento({ ...OPOR, area: "tech" }, 1, perm)), "403 Sem permissão de edição neste produto.");

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
checa("mesmos módulos em outra ordem não é mudança",
  planejarAtualizacaoOportunidade({ ...OPOR, modulos: ["genius", "regtrack"] }, { modulos: ["regtrack", "genius"] }, perm, fatos).mudancas.length, 0);
const comModulo = planejarAtualizacaoOportunidade(OPOR, { modulos: ["regtrack", "genius"] }, perm, fatos);
checa("módulos novos vão no plano, fora das colunas", [comModulo.modulos, Object.keys(comModulo.sets)], [["genius", "regtrack"], []]);
checa("origem arquivada que já é a do card não bloqueia a edição",
  planejarAtualizacaoOportunidade({ ...OPOR, origem_id: "evento" }, { origemId: "evento", conta: "JBS 2" }, perm, fatos).ok, true);
checa("responsável para nulo", planejarAtualizacaoAtividade(ATIV, { responsavelId: null }, perm, fatos).sets,
  { responsavel_user_id: null });

console.log("\n5. as chaves de SQL são só as colunas conhecidas");
// `sets` vira `UPDATE ... SET ${tx(sets)}`. Uma chave vinda da entrada seria injeção de nome
// de coluna. A entrada aqui traz chaves que não são campo nenhum.
const intruso = planejarAtualizacaoOportunidade(OPOR, { valor_centavos: 1, "area = 'x'; --": 1, coluna_que_nao_existe: true }, perm, fatos);
checa("chave desconhecida na entrada é ignorada", Object.keys(intruso.sets), []);
const COLUNAS = new Set(["area", "conta", "estagio", "valor_centavos", "proximo_passo", "situacao", "contato",
  "responsavel_texto", "proximo_passo_em", "responsavel_user_id",
  "origem_id", "ponte", "contato_operacional", "dor", "erp", "ultima_interacao", "blocker", "blocker_tipo",
  "blocker_dono_id", "motivo_perda", "motivo_perda_detalhe", "notas", "situacao_em", "proposta_url"]);
const tudo = planejarAtualizacaoOportunidade(OPOR, {
  area: "tech", conta: "B", escopo: "c", estagio: "prospeccao", valorReais: 1, proximoPasso: "p", situacao: "s",
  contato: "k", responsavelTexto: "r", proximoPassoEm: "2026-12-01", produtoId: "observa", pausado: true,
  responsavelId: 2, origemId: "parceiro", ponte: "pt", contatoOperacional: "co", dor: "d", erp: "SAP",
  ultimaInteracao: "2026-11-01", blocker: "b", blockerTipo: "preco", blockerDonoId: 1, motivoPerda: "outro",
  motivoPerdaDetalhe: "md", notas: "n", modulos: ["observa"], propostaUrl: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit",
}, perm2, fatos);
checa("pausado (legado) não vira coluna nenhuma", "pausado" in tudo.sets, false);
checa("todas as colunas possíveis estão na lista conhecida", Object.keys(tudo.sets).every((k) => COLUNAS.has(k)), true);
checa("escopo e produto_id (removidos) não voltam", "escopo" in tudo.sets || "produto_id" in tudo.sets, false);
checa("e são todas as 24 da oportunidade", Object.keys(tudo.sets).length, 24);
checa("mudar a situação grava a data dela", typeof tudo.sets.situacao_em, "string");
checa("a data dita por quem atualiza vale",
  planejarAtualizacaoOportunidade(OPOR, { situacao: "nova", situacaoEm: "2026-10-19" }, perm, fatos).sets.situacao_em, "2026-10-19");
checa("situação igual não mexe na data",
  "situacao_em" in planejarAtualizacaoOportunidade(OPOR, { situacao: "" }, perm, fatos).sets, false);
checa("criar com situação data hoje", typeof planejarCriacaoOportunidade({ conta: "X", area: "tax", situacao: "s" }, perm, fatos).linha.situacaoEm, "string");
checa("criar sem situação: sem data", planejarCriacaoOportunidade({ conta: "X", area: "tax" }, perm, fatos).linha.situacaoEm, null);
checa("módulos do produto novo", tudo.modulos, ["observa"]);

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
// Renomeações de vocabulário feitas de propósito (nov/2026: "área" virou "produto", e
// "produto" virou "módulo"). O resto tem de continuar idêntico.
const RENOMEADAS = {
  "Área inválida.": "Produto inválido.",
  "Sem permissão de edição nesta área.": "Sem permissão de edição neste produto.",
  "Produto inválido para esta área.": "Módulo inválido para este produto.",
};
for (const msg of [...antigas].sort()) {
  const hoje = RENOMEADAS[msg] ?? msg;
  checa(`continua existindo: ${JSON.stringify(hoje)}`, NOVO.includes(hoje), true);
}

console.log("\n7. tarefa ligada a oportunidade");
const criadaLigada = planejarCriacaoAtividade({ titulo: "Implantar", area: "tax", oportunidade: 20 }, perm, fatos);
checa("liga pelo id (o que a tela manda)", criadaLigada.linha?.oportunidadeId, 20);
checa("a criação conta no histórico a que venda serve",
  criadaLigada.auditoria?.texto, 'Criou "Implantar" em Tax, ligada à oportunidade C-0120 · JBS');
checa("liga pela referência (o que o Claude manda)",
  planejarCriacaoAtividade({ titulo: "X", area: "tax", oportunidade: "c-120" }, perm, fatos).linha?.oportunidadeId, 20);
checa("liga pela referência antiga", planejarCriacaoAtividade({ titulo: "X", area: "tax", oportunidade: "D-121" }, perm, fatos).linha?.oportunidadeId, 21);
checa("oportunidade de outro produto que a pessoa vê: vale (a venda e a tarefa nem sempre são do mesmo produto)",
  planejarCriacaoAtividade({ titulo: "X", area: "tax", oportunidade: 21 }, perm, fatos).ok, true);
// Não enxergar responde igual a não existir: confirmar a referência vazaria a carteira alheia.
checa("oportunidade de produto invisível: 'não encontrada'",
  erro(planejarCriacaoAtividade({ titulo: "X", area: "tax", oportunidade: "C-0122" }, perm, fatos)), "400 Oportunidade não encontrada.");
checa("…igual à que não existe",
  erro(planejarCriacaoAtividade({ titulo: "X", area: "tax", oportunidade: "C-9999" }, perm, fatos)), "400 Oportunidade não encontrada.");
checa("referência de tarefa no lugar de oportunidade não liga",
  erro(planejarCriacaoAtividade({ titulo: "X", area: "tax", oportunidade: "T-0120" }, perm, fatos)), "400 Oportunidade não encontrada.");
checa("sem oportunidade é o normal", planejarCriacaoAtividade({ titulo: "X", area: "tax" }, perm, fatos).linha?.oportunidadeId, null);
const ligar = planejarAtualizacaoAtividade(ATIV, { oportunidade: "C-0120" }, perm, fatos);
checa("ligar uma tarefa existente", [ligar.sets?.oportunidade_id, ligar.mudancas?.[0].para], [20, "C-0120 · JBS"]);
checa("mesma oportunidade de novo não é mudança",
  planejarAtualizacaoAtividade({ ...ATIV, oportunidade_id: 20 }, { oportunidade: 20 }, perm, fatos).mudancas.length, 0);
const desligar = planejarAtualizacaoAtividade({ ...ATIV, oportunidade_id: 20 }, { oportunidade: null }, perm, fatos);
checa("desligar", [desligar.sets?.oportunidade_id, desligar.mudancas?.[0].texto], [null, 'Desligou "Mapear obrigações" da oportunidade C-0120 · JBS']);
checa("'' do seletor também desliga", planejarAtualizacaoAtividade({ ...ATIV, oportunidade_id: 20 }, { oportunidade: "" }, perm, fatos).sets?.oportunidade_id, null);
// Trocar a partir de uma oportunidade que quem age não vê: o histórico não pode revelar a conta.
const troca = planejarAtualizacaoAtividade({ ...ATIV, oportunidade_id: 22 }, { oportunidade: 20 }, perm, fatos);
checa("trocar a partir de oportunidade invisível: o histórico mostra só a referência dela",
  troca.mudancas?.[0].de, "C-0122");
checa("…e nenhum texto do histórico cita a conta escondida", troca.mudancas.some((m) => m.texto.includes("Sigiloso")), false);
// O caso que vazou no teste de ponta a ponta: quem LIGA enxerga a venda de outra área, mas
// quem LÊ o histórico da tarefa pode não enxergar. A linha mora na área da tarefa.
const cruzada = planejarAtualizacaoAtividade(ATIV, { oportunidade: 21 }, perm, fatos);
checa("venda de outro produto: o histórico da tarefa guarda só a referência", cruzada.mudancas?.[0].para, "C-0121");
checa("…sem o nome da conta em texto nenhum", cruzada.mudancas.some((m) => `${m.texto}${m.de}${m.para}`.includes("Natura")), false);
const criadaCruzada = planejarCriacaoAtividade({ titulo: "Y", area: "tax", oportunidade: 21 }, perm, fatos);
checa("…nem na criação", criadaCruzada.auditoria.texto.includes("Natura"), false);
// A área FINAL decide: mover a tarefa para a área da venda junto com o vínculo libera a conta.
checa("tarefa movida para o produto da venda no mesmo passo: a conta pode aparecer",
  planejarAtualizacaoAtividade(ATIV, { area: "tech", oportunidade: 21 }, perm2, fatos).mudancas.find((m) => m.campo === "oportunidade")?.para, "C-0121 · Natura");

console.log("\n8. referências C-0000 (comercial) e T-0000 (tarefa)");
checa("nova oportunidade", formatarRef("oportunidade", "108"), "C-0108");
checa("nova tarefa", formatarRef("atividade", 1000), "T-1000");
checa("passa de 9999 sem cortar", formatarRef("oportunidade", 12345), "C-12345");
// A conversão manteve o número: a referência antiga se resolve sem consultar o banco.
checa("D-104 antiga vira C-0104", refCanonica("D-104"), "C-0104");
checa("D-01 do seed vira C-0001", refCanonica("D-01"), "C-0001");
checa("A-1012 antiga vira T-1012", refCanonica("A-1012"), "T-1012");
checa("sem zeros e minúscula", refCanonica(" c-7 "), "C-0007");
checa("já canônica fica igual", refCanonica("T-0101"), "T-0101");
checa("letra desconhecida não é referência", refCanonica("X-12"), null);
checa("lixo depois do número não é referência", refCanonica("C-12a"), null);
checa("tipo pela letra nova", [tipoDaRef("C-0001"), tipoDaRef("T-0001")], ["oportunidade", "atividade"]);
checa("tipo pela letra antiga", [tipoDaRef("D-1"), tipoDaRef("A-1")], ["oportunidade", "atividade"]);
// A rota antiga devolvia o par anterior → o serial de agora, e o migrador usa a mesma função:
// as duas pontas concordam por construção.
const ANTIGAS = ["D-01", "D-08", "D-100", "D-108", "A-101", "A-602", "A-1000"];
checa("conversão sem colisão no conjunto do seed + sequências",
  new Set(ANTIGAS.map(refCanonica)).size, ANTIGAS.length);

console.log("\n9. estágios do pipeline (nov/2026)");
checa("a lista, na ordem combinada", STAGE_KEYS,
  ["prospeccao", "primeira_reuniao", "qualificado", "proposta", "validacao", "contrato", "ganho", "on_hold", "lost"]);
checa("o funil são as sete primeiras", FUNIL, STAGE_KEYS.slice(0, 7));
checa("nasce em Prospecção", [ESTAGIO_INICIAL, planejarCriacaoOportunidade({ conta: "X", area: "tax" }, perm, fatos).linha?.estagio], ["prospeccao", "prospeccao"]);
checa("estágio antigo é recusado", erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", estagio: "negociacao" }, perm, fatos)), "400 Estágio inválido.");
checa("Contrato → Ganho pela seta", planejarMovimento({ ...OPOR, estagio: "contrato" }, 1, perm).sets, { estagio: "ganho" });
checa("Ganho não anda para On hold pela seta", planejarMovimento({ ...OPOR, estagio: "ganho" }, 1, perm).sets, {});
checa("Prospecção não volta", planejarMovimento({ ...OPOR, estagio: "prospeccao" }, -1, perm).sets, {});
checa("seta em On hold é recusada com explicação",
  erro(planejarMovimento({ ...OPOR, estagio: "on_hold" }, -1, perm)), "400 On hold não é uma casa do funil: arraste o card ou use o formulário.");
checa("seta em Lost também", planejarMovimento({ ...OPOR, estagio: "lost" }, 1, perm).ok, false);
checa("pelo formulário vai para On hold", planejarAtualizacaoOportunidade(OPOR, { estagio: "on_hold" }, perm, fatos).sets, { estagio: "on_hold" });
checa("…e volta para o funil", planejarAtualizacaoOportunidade({ ...OPOR, estagio: "on_hold" }, { estagio: "proposta" }, perm, fatos).sets, { estagio: "proposta" });
checa("em aberto: do início ao Contrato", FUNIL.slice(0, 6).every(estagioEmAberto), true);
checa("fora do aberto: Ganho, On hold, Lost", ["ganho", "on_hold", "lost"].some(estagioEmAberto), false);
checa("pipeline: da 1ª Reunião ao Contrato, mais On hold", STAGE_KEYS.filter(estagioNoPipeline), ["primeira_reuniao", "qualificado", "proposta", "validacao", "contrato", "on_hold"]);
checa("fora do pipeline: Prospecção, Ganho, Lost", ["prospeccao", "ganho", "lost"].some(estagioNoPipeline), false);
checa("o pipeline é o funil sem a primeira e a última casa, mais On hold", PIPELINE, [...FUNIL.slice(1, -1), "on_hold"]);
checa("On hold é pipeline mas não está em aberto (não cobra prazo)", [estagioNoPipeline("on_hold"), estagioEmAberto("on_hold")], [true, false]);

// Composição da proposta (assinatura mensal, implantação e customização com parcelas).
const comp = planejarCriacaoOportunidade(
  { conta: "X", area: "tax", valorReais: 1, propAssinaturaReais: 5000, propImplantacaoReais: 30000, propImplantacaoParcelas: 3, propCustomizacaoReais: 24000, propCustomizacaoParcelas: 24, arquetipoId: 1 },
  perm, fatos);
checa("composição define o total em 12 meses (parcelas acima de 12 contam só 12)", comp.linha?.valorCentavos, 5000 * 12 * 100 + 3000000 + 1200000);
checa("sem composição vale o valor digitado", planejarCriacaoOportunidade({ conta: "X", area: "tax", valorReais: 1500 }, perm, fatos).linha?.valorCentavos, 150000);
checa("parcelas fora da faixa", erro(planejarCriacaoOportunidade({ conta: "X", area: "tax", propImplantacaoParcelas: 0 }, perm, fatos)), "400 Parcelas inválidas: use de 1 a 60.");
const upd = planejarAtualizacaoOportunidade(OPOR, { propAssinaturaReais: 1000, valorReais: 7 }, perm, fatos);
checa("atualizar a assinatura recalcula o valor", [upd.sets.prop_assinatura_centavos, upd.sets.valor_centavos], [100000, 1200000]);
console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
