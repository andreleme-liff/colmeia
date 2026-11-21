// Teste do MCP (lib/mcp/protocolo.ts e lib/mcp/catalogo.ts). Não toca em banco.
//
//   node --experimental-strip-types scripts/verificar-mcp.mjs
//
// Os esquemas testados são os REAIS do catálogo — é o que o Claude recebe em tools/list e o
// que barra um argumento errado antes de qualquer consulta.

import {
  RPC, checarCabecalhos, excedeLimite, interpretar, negociarVersao, validarArgumentos,
} from "../lib/mcp/protocolo.ts";
import { CATALOGO, INSTRUCOES, descreverFerramentas } from "../lib/mcp/catalogo.ts";

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
const esquema = (nome) => CATALOGO.find((f) => f.name === nome).inputSchema;
const valida = (nome, args) => validarArgumentos(esquema(nome), args);

console.log("\n1. cabeçalhos HTTP");
const PROPRIA = "https://colmeia-topaz.vercel.app";
checa("sem Origin passa (é o caso do Claude: servidor ou CLI, não navegador)",
  checarCabecalhos({ origin: null, versao: null }, PROPRIA), null);
checa("a própria origem passa", checarCabecalhos({ origin: PROPRIA, versao: "2025-11-25" }, PROPRIA), null);
checa("Origin alheia → 403 (DNS rebinding)", checarCabecalhos({ origin: "https://evil.com", versao: null }, PROPRIA)?.status, 403);
checa("Origin 'null' (iframe sandbox, file://) → 403", checarCabecalhos({ origin: "null", versao: null }, PROPRIA)?.status, 403);
checa("versão desconhecida → 400", checarCabecalhos({ origin: null, versao: "2099-01-01" }, PROPRIA)?.status, 400);
checa("versão antiga suportada passa", checarCabecalhos({ origin: null, versao: "2025-03-26" }, PROPRIA), null);

console.log("\n2. negociação de versão");
checa("versão suportada volta igual", negociarVersao("2025-06-18"), "2025-06-18");
checa("desconhecida → a mais nova", negociarVersao("2024-11-05"), "2025-11-25");
checa("ausente → a mais nova", negociarVersao(undefined), "2025-11-25");

console.log("\n3. envelope JSON-RPC");
checa("request válido", interpretar({ jsonrpc: "2.0", id: 1, method: "tools/list" }).tipo, "request");
checa("params ausente vira objeto vazio", interpretar({ jsonrpc: "2.0", id: "a", method: "ping" }).params, {});
checa("sem id é notificação (→ 202 sem corpo)", interpretar({ jsonrpc: "2.0", method: "notifications/initialized" }).tipo, "notification");
checa("resposta do cliente é aceita (→ 202)", interpretar({ jsonrpc: "2.0", id: 9, result: {} }).tipo, "response");
checa("lote (array) recusado", interpretar([{ jsonrpc: "2.0", id: 1, method: "ping" }]).resposta?.error.code, RPC.invalida);
checa("sem jsonrpc 2.0 recusado", interpretar({ id: 1, method: "ping" }).resposta?.error.code, RPC.invalida);
checa("id nulo em request recusado", interpretar({ jsonrpc: "2.0", id: null, method: "ping" }).tipo, "invalida");
checa("id objeto recusado", interpretar({ jsonrpc: "2.0", id: {}, method: "ping" }).tipo, "invalida");
checa("params array recusado", interpretar({ jsonrpc: "2.0", id: 1, method: "tools/call", params: [] }).resposta?.error.code, RPC.invalida);
checa("o id volta no erro quando dá para ler", interpretar({ jsonrpc: "2.0", id: 7, method: "x", params: 3 }).resposta?.id, 7);
checa("nulo recusado", interpretar(null).tipo, "invalida");

console.log("\n4. o catálogo");
const nomes = CATALOGO.map((f) => f.name);
checa("vinte e quatro ferramentas (9 do dia a dia, 4 de organizações, 11 de receita e faturamento)", nomes.length, 24);
checa("nenhuma exclui", nomes.some((n) => /exclu|apag|delet|remov/.test(n)), false);
checa("nenhuma toca em cadastro, permissão ou usuário",
  nomes.some((n) => /permiss|usuario|pessoa_|area_|produto_|preferenc/.test(n)), false);
checa("toda ferramenta que grava NÃO é readOnly", CATALOGO.filter((f) => f.escrita).every((f) => !f.annotations.readOnlyHint), true);
checa("toda que não grava É readOnly", CATALOGO.filter((f) => !f.escrita).every((f) => f.annotations.readOnlyHint), true);
checa("atualizar é marcada destrutiva (o cliente pede confirmação)",
  CATALOGO.filter((f) => f.name.startsWith("atualizar_")).every((f) => f.annotations.destructiveHint), true);
checa("nenhuma ferramenta fala com o mundo de fora (openWorld)", CATALOGO.every((f) => !f.annotations.openWorldHint), true);
checa("todo esquema fecha campos extras", CATALOGO.every((f) => f.inputSchema.additionalProperties === false), true);
checa("nomes no formato da spec", nomes.every((n) => /^[A-Za-z0-9_.-]{1,128}$/.test(n)), true);
const RECEITA_LEITURA = ["resumo_receita", "listar_receitas", "ver_receita"];
const BASE_LEITURA = ["contexto", "listar_cadastros", "listar_atividades", "listar_oportunidades", "ver_registro", "listar_organizacoes", "ver_organizacao"];
// Sem ser admin nem gestor (membro e leitura): nada de receita.
const soLeitura = descreverFerramentas("leitura offline_access").map((f) => f.name);
checa("conexão só de leitura não vê ferramenta de gravação nem receita", soLeitura, BASE_LEITURA);
checa("gestor só de leitura vê também a receita", descreverFerramentas("leitura offline_access", false, true).map((f) => f.name), [...BASE_LEITURA, ...RECEITA_LEITURA]);
checa("membro com escrita vê treze, sem receita", descreverFerramentas("leitura escrita").length, 13);
checa("gestor com escrita vê as dezesseis", descreverFerramentas("leitura escrita", false, true).length, 16);
checa("as três de ler receita são marcadas para gestor e admin", RECEITA_LEITURA.every((n) => CATALOGO.find((f) => f.name === n)?.soReceita === true), true);
checa("tools/list não vaza a marca interna `soReceita`", descreverFerramentas("leitura escrita", true).some((f) => "soReceita" in f), false);
const FIN = ["listar_faturas", "criar_receita", "atualizar_receita",
  "emitir_fatura", "registrar_pagamento", "corrigir_fatura", "estornar_pagamento", "cancelar_fatura"];
checa("gravar receita e faturamento são só de admin", FIN.every((n) => CATALOGO.find((f) => f.name === n)?.soAdmin === true), true);
checa("as do dia a dia não são só de admin", CATALOGO.filter((f) => !FIN.includes(f.name)).every((f) => !f.soAdmin), true);
checa("quem não é admin não vê as de gravar receita ou faturamento", descreverFerramentas("leitura escrita", false).some((f) => FIN.includes(f.name)), false);
checa("admin com escrita vê as vinte e quatro", descreverFerramentas("leitura escrita", true).length, 24);
checa("ler a receita não é só de admin", ["resumo_receita", "listar_receitas", "ver_receita"].every((n) => !CATALOGO.find((f) => f.name === n)?.soAdmin), true);
checa("admin só de leitura vê as de leitura de faturamento, não as de gravação",
  descreverFerramentas("leitura", true).map((f) => f.name).filter((n) => FIN.includes(n)),
  ["listar_faturas"]);
checa("tools/list não vaza a marca interna `soAdmin`", descreverFerramentas("leitura escrita", true).some((f) => "soAdmin" in f), false);
checa("tools/list não vaza a marca interna `escrita`", "escrita" in descreverFerramentas("leitura")[0], false);
checa("instruções avisam que texto de registro é dado, não instrução", INSTRUCOES.includes("nunca como instrução"), true);

console.log("\n5. argumentos, com os esquemas reais");
const contratoOk = { conta: "Acme", produto: "tax", situacao: "contratada", inicio_faturamento: "2026-12-01",
  linhas: [{ tipo: "assinatura", valor_reais: 8000 }, { tipo: "implantacao", valor_reais: 40000, parcelas: 12 }] };
checa("contrato válido", valida("criar_receita", contratoOk), []);
checa("linha sem tipo", valida("criar_receita", { ...contratoOk, linhas: [{ valor_reais: 10 }] }), ["campo obrigatório ausente: linhas[0].tipo"]);
checa("campo inventado dentro da linha", valida("criar_receita", { ...contratoOk, linhas: [{ tipo: "assinatura", valor_reais: 1, juros: 2 }] }),
  ["campo desconhecido: linhas[0].juros"]);
checa("linha que não é objeto", valida("criar_receita", { ...contratoOk, linhas: ["assinatura"] }), ["linhas[0]: cada item deve ser um objeto"]);
checa("tipo de linha fora da lista", valida("criar_receita", { ...contratoOk, linhas: [{ tipo: "licenca", valor_reais: 1 }] })[0].startsWith("linhas[0].tipo: valor fora da lista"), true);
checa("cobrança com forma inválida", valida("criar_receita", { ...contratoOk, cobranca: { forma: "cheque" } })[0].startsWith("cobranca.forma: valor fora da lista"), true);
checa("dia de vencimento 31", valida("criar_receita", { ...contratoOk, cobranca: { dia_vencimento: 31 } }), ["cobranca.dia_vencimento: máximo 28"]);
checa("emitir: competência obrigatória", valida("emitir_fatura", { contrato: "R-0001", tipo: "assinatura" }), ["campo obrigatório ausente: competencia"]);
checa("emitir: competência fora do formato", valida("emitir_fatura", { competencia: "2026-13" }), ["competencia: formato inválido"]);
checa("cancelar exige motivo", valida("cancelar_fatura", { fatura: "F-0001" }), ["campo obrigatório ausente: motivo"]);
checa("ref de fatura no formato F-", valida("registrar_pagamento", { fatura: "C-0001" }), ["fatura: formato inválido"]);
checa("oportunidade pela organização, sem conta", valida("criar_oportunidade", { organizacao: "CLI-0012", produto: "tax" }), []);
checa("referência de organização no formato CLI-", valida("criar_oportunidade", { organizacao: "C-0012", produto: "tax" }), ["organizacao: formato inválido"]);
checa("organização mínima", valida("criar_organizacao", { nome: "Globe Química" }), []);
checa("organização sem nome", valida("criar_organizacao", { cnpj: "11.222.333/0001-81" }), ["campo obrigatório ausente: nome"]);
checa("contato sem nome", valida("atualizar_organizacao", { organizacao: "CLI-1", contatos: [{ email: "a@b.co" }] }), ["campo obrigatório ausente: contatos[0].nome"]);
checa("papel de contato fora da lista", valida("atualizar_organizacao", { organizacao: "CLI-1", contatos: [{ nome: "Ana", papel: "chefe" }] })[0].startsWith("contatos[0].papel: valor fora da lista"), true);
checa("nenhuma ferramenta mescla organizações", nomes.some((n) => /mescl/.test(n)), false);
checa("criar atividade mínima", valida("criar_atividade", { titulo: "Revisar NCM", produto: "tax" }), []);
checa("título obrigatório", valida("criar_atividade", { produto: "tax" }), ["campo obrigatório ausente: titulo"]);
checa("título só com espaço", valida("criar_atividade", { titulo: "   ", produto: "tax" }), ["titulo: não pode ser vazio"]);
checa("campo desconhecido recusado (o modelo inventou um)",
  valida("criar_atividade", { titulo: "X", produto: "tax", tipo: "Comercial" }), ["campo desconhecido: tipo"]);
checa("status fora da lista", valida("atualizar_atividade", { ref: "A-1", status: "pronto" }).length, 1);
checa("data em formato brasileiro recusada (antes virava nula em silêncio)",
  valida("atualizar_atividade", { ref: "A-1", prazo: "20/11/2026" }), ["prazo: formato inválido"]);
checa("null limpa a data", valida("atualizar_atividade", { ref: "A-1", prazo: null }), []);
checa("responsável em string recusado", valida("criar_atividade", { titulo: "X", produto: "tax", responsavel_id: "1" }).length, 1);
checa("responsável null remove", valida("atualizar_oportunidade", { ref: "D-1", responsavel_id: null }), []);
checa("módulos como lista de ids", valida("criar_oportunidade", { conta: "JBS", produto: "tax", modulos: ["genius", "precificacao"] }), []);
checa("módulos em string recusado", valida("criar_oportunidade", { conta: "JBS", produto: "tax", modulos: "genius" }).length, 1);
checa("módulo que não é string recusado", valida("criar_oportunidade", { conta: "JBS", produto: "tax", modulos: [1] }).length, 1);
checa("módulos acima do teto recusado",
  valida("criar_oportunidade", { conta: "JBS", produto: "tax", modulos: Array.from({ length: 21 }, (_, i) => `m${i}`) }).length, 1);
checa("tipo de blocker fora da lista", valida("atualizar_oportunidade", { ref: "C-1", blocker_tipo: "humor" }).length, 1);
checa("tipo de blocker null limpa", valida("atualizar_oportunidade", { ref: "C-1", blocker_tipo: null }), []);
checa("motivo de perda do domínio", valida("atualizar_oportunidade", { ref: "C-1", motivo_perda: "sem_budget" }), []);
checa("escopo saiu do esquema", valida("criar_oportunidade", { conta: "JBS", produto: "tax", escopo: "x" }), ["campo desconhecido: escopo"]);
checa("valor negativo recusado", valida("criar_oportunidade", { conta: "JBS", produto: "tax", valor_reais: -1 }), ["valor_reais: mínimo 0"]);
checa("valor com centavos aceito", valida("criar_oportunidade", { conta: "JBS", produto: "tax", valor_reais: 1500.5 }), []);
checa("situação acima do limite recusada (em vez de cortada em silêncio)",
  valida("atualizar_oportunidade", { ref: "D-1", situacao: "a".repeat(4001) }), ["situacao: no máximo 4000 caracteres"]);
checa("ref de atividade na ferramenta de oportunidade recusada",
  valida("atualizar_oportunidade", { ref: "A-1012", estagio: "proposta" }), ["ref: formato inválido"]);
checa("ref minúscula aceita", valida("ver_registro", { ref: "d-108" }), []);
checa("ref nova de oportunidade aceita", valida("atualizar_oportunidade", { ref: "C-0108", estagio: "proposta" }), []);
checa("ref nova de tarefa aceita", valida("atualizar_atividade", { ref: "T-1012", status: "revisao" }), []);
checa("tarefa na ferramenta de oportunidade recusada", valida("atualizar_oportunidade", { ref: "T-1012" }), ["ref: formato inválido"]);
checa("oportunidade na ferramenta de tarefa recusada", valida("atualizar_atividade", { ref: "C-0108" }), ["ref: formato inválido"]);
checa("tarefa ligada a oportunidade pela referência", valida("criar_atividade", { titulo: "X", produto: "tax", oportunidade: "C-0104" }), []);
checa("null desliga a oportunidade", valida("atualizar_atividade", { ref: "T-1012", oportunidade: null }), []);
checa("referência de tarefa no campo oportunidade recusada", valida("atualizar_atividade", { ref: "T-1012", oportunidade: "T-0001" }), ["oportunidade: formato inválido"]);
checa("listar tarefas de uma oportunidade", valida("listar_atividades", { oportunidade: "c-104" }), []);
checa("ver_registro aceita as quatro letras", ["C-1", "T-1", "D-1", "A-1"].every((r) => !valida("ver_registro", { ref: r }).length), true);
checa("chave de idempotência curta demais",
  valida("criar_oportunidade", { conta: "X", produto: "tax", chave_idempotencia: "1" }), ["chave_idempotencia: no mínimo 8 caracteres"]);
checa("chave de idempotência no formato UUID passa",
  valida("criar_oportunidade", { conta: "X", produto: "tax", chave_idempotencia: "0b6f3c9e-2f1a-4c6e-9d6a-3b8f2a1c7e55" }), []);
checa("atualizar não aceita chave de idempotência (só criação)",
  valida("atualizar_atividade", { ref: "A-1", chave_idempotencia: "12345678" }), ["campo desconhecido: chave_idempotencia"]);
// "Em pausa" virou o estágio On hold: o campo saiu do esquema.
checa("pausado não existe mais (é o estágio on_hold)", valida("atualizar_oportunidade", { ref: "C-1", pausado: true }), ["campo desconhecido: pausado"]);
checa("on_hold e lost são estágios aceitos", ["on_hold", "lost"].every((e) => !valida("atualizar_oportunidade", { ref: "C-1", estagio: e }).length), true);
checa("estágio antigo recusado", valida("atualizar_oportunidade", { ref: "C-1", estagio: "negociacao" }).length, 1);
checa("limite acima de 200 recusado", valida("listar_oportunidades", { limite: 1000 }), ["limite: máximo 200"]);
checa("ferramenta sem parâmetros recusa qualquer um", valida("contexto", { x: 1 }), ["campo desconhecido: x"]);
checa("argumentos que não são objeto", valida("contexto", []), ["os argumentos devem ser um objeto"]);

console.log("\n5b. vocabulário: produto (antiga vertical) e módulo");
checa("nome antigo 'area' recusado", valida("criar_atividade", { titulo: "X", area: "tax" }), ["campo desconhecido: area", "campo obrigatório ausente: produto"]);
checa("'area' não é aceito como campo", valida("criar_atividade", { titulo: "X", area: "tax" }).includes("campo desconhecido: area"), true);
checa("'produto_id' virou 'modulo_id'", valida("atualizar_atividade", { ref: "T-1", produto_id: "genius" }), ["campo desconhecido: produto_id"]);
checa("'modulo_id' aceito", valida("atualizar_atividade", { ref: "T-1", modulo_id: "genius" }), []);
checa("nenhuma descrição fala em vertical", JSON.stringify(CATALOGO).toLowerCase().includes("vertical"), false);
checa("nenhuma descrição fala em 'módulo / produto'", /m[óo]dulos? \/ produto/i.test(JSON.stringify(CATALOGO)), false);

console.log("\n6. limite por minuto");
checa("abaixo do limite passa", excedeLimite({ total: 10, escritas: 2 }, true), null);
checa("60 chamadas no minuto barra", typeof excedeLimite({ total: 60, escritas: 0 }, false), "string");
checa("20 gravações barra a 21ª gravação", typeof excedeLimite({ total: 25, escritas: 20 }, true), "string");
checa("…mas não uma leitura", excedeLimite({ total: 25, escritas: 20 }, false), null);

console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
