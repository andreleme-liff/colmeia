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
const PROPRIA = "https://tasks.liff.tech";
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
checa("nove ferramentas", nomes.length, 9);
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
const soLeitura = descreverFerramentas("leitura offline_access").map((f) => f.name);
checa("conexão só de leitura não vê ferramenta de gravação", soLeitura, ["contexto", "listar_cadastros", "listar_atividades", "listar_oportunidades", "ver_registro"]);
checa("com escrita vê as nove", descreverFerramentas("leitura escrita").length, 9);
checa("tools/list não vaza a marca interna `escrita`", "escrita" in descreverFerramentas("leitura")[0], false);
checa("instruções avisam que texto de registro é dado, não instrução", INSTRUCOES.includes("nunca como instrução"), true);

console.log("\n5. argumentos, com os esquemas reais");
checa("criar atividade mínima", valida("criar_atividade", { titulo: "Revisar NCM", area: "tax" }), []);
checa("título obrigatório", valida("criar_atividade", { area: "tax" }), ["campo obrigatório ausente: titulo"]);
checa("título só com espaço", valida("criar_atividade", { titulo: "   ", area: "tax" }), ["titulo: não pode ser vazio"]);
checa("campo desconhecido recusado (o modelo inventou um)",
  valida("criar_atividade", { titulo: "X", area: "tax", tipo: "Comercial" }), ["campo desconhecido: tipo"]);
checa("status fora da lista", valida("atualizar_atividade", { ref: "A-1", status: "pronto" }).length, 1);
checa("data em formato brasileiro recusada (antes virava nula em silêncio)",
  valida("atualizar_atividade", { ref: "A-1", prazo: "20/11/2026" }), ["prazo: formato inválido"]);
checa("null limpa a data", valida("atualizar_atividade", { ref: "A-1", prazo: null }), []);
checa("responsável em string recusado", valida("criar_atividade", { titulo: "X", area: "tax", responsavel_id: "1" }).length, 1);
checa("responsável null remove", valida("atualizar_oportunidade", { ref: "D-1", responsavel_id: null }), []);
checa("valor negativo recusado", valida("criar_oportunidade", { conta: "JBS", area: "tax", valor_reais: -1 }), ["valor_reais: mínimo 0"]);
checa("valor com centavos aceito", valida("criar_oportunidade", { conta: "JBS", area: "tax", valor_reais: 1500.5 }), []);
checa("situação acima do limite recusada (em vez de cortada em silêncio)",
  valida("atualizar_oportunidade", { ref: "D-1", situacao: "a".repeat(4001) }), ["situacao: no máximo 4000 caracteres"]);
checa("ref de atividade na ferramenta de oportunidade recusada",
  valida("atualizar_oportunidade", { ref: "A-1012", estagio: "proposta" }), ["ref: formato inválido"]);
checa("ref minúscula aceita", valida("ver_registro", { ref: "d-108" }), []);
checa("chave de idempotência curta demais",
  valida("criar_oportunidade", { conta: "X", area: "tax", chave_idempotencia: "1" }), ["chave_idempotencia: no mínimo 8 caracteres"]);
checa("chave de idempotência no formato UUID passa",
  valida("criar_oportunidade", { conta: "X", area: "tax", chave_idempotencia: "0b6f3c9e-2f1a-4c6e-9d6a-3b8f2a1c7e55" }), []);
checa("atualizar não aceita chave de idempotência (só criação)",
  valida("atualizar_atividade", { ref: "A-1", chave_idempotencia: "12345678" }), ["campo desconhecido: chave_idempotencia"]);
checa("pausado precisa ser booleano", valida("atualizar_oportunidade", { ref: "D-1", pausado: "true" }).length, 1);
checa("limite acima de 200 recusado", valida("listar_oportunidades", { limite: 1000 }), ["limite: máximo 200"]);
checa("ferramenta sem parâmetros recusa qualquer um", valida("contexto", { x: 1 }), ["campo desconhecido: x"]);
checa("argumentos que não são objeto", valida("contexto", []), ["os argumentos devem ser um objeto"]);

console.log("\n6. limite por minuto");
checa("abaixo do limite passa", excedeLimite({ total: 10, escritas: 2 }, true), null);
checa("60 chamadas no minuto barra", typeof excedeLimite({ total: 60, escritas: 0 }, false), "string");
checa("20 gravações barra a 21ª gravação", typeof excedeLimite({ total: 25, escritas: 20 }, true), "string");
checa("…mas não uma leitura", excedeLimite({ total: 25, escritas: 20 }, false), null);

console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
