// Teste do OAuth 2.1 (lib/oauth/protocolo.ts). Não toca em banco nem em rede.
//
//   node --experimental-strip-types scripts/verificar-oauth.mjs
//
// O documento do Claude Code abaixo é o REAL, copiado de
// https://claude.ai/oauth/claude-code-client-metadata em 09/11/2026. É o cliente que vai
// conectar; os ataques são os que a especificação do MCP e o RFC 8252 descrevem.

import {
  canonizarResource, clienteFixo, clientIdAceito, desafio, escoposConcedidos, gerarSegredo, hashDe, lerConfig, metadadosRecurso,
  lerEscopos, metadadosServidor, pkceConfere, redirectCasa, validarDocumentoCliente, validarPedido,
} from "../lib/oauth/protocolo.ts";

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

const CLAUDE_CODE_URL = "https://claude.ai/oauth/claude-code-client-metadata";
const CLAUDE_CODE_DOC = {
  client_id: CLAUDE_CODE_URL,
  client_name: "Claude Code",
  client_uri: "https://claude.ai",
  redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
};
const cfg = lerConfig({ MCP_HABILITADO: "1" });

console.log("\n1. PKCE (RFC 7636)");
// Apêndice B do RFC: o par de referência.
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
checa("o vetor do apêndice B confere", pkceConfere(VERIFIER, CHALLENGE), true);
checa("verifier trocado não confere", pkceConfere(VERIFIER.replace("d", "e"), CHALLENGE), false);
checa("verifier curto demais é recusado antes do hash", pkceConfere("abc", CHALLENGE), false);
checa("verifier com caractere fora do alfabeto é recusado", pkceConfere(`${VERIFIER}!`, CHALLENGE), false);
checa("challenge de outro tamanho não estoura, só recusa", pkceConfere(VERIFIER, "curto"), false);

console.log("\n2. quem pode ser cliente (client_id)");
const PERMITIDOS = cfg.clientesPermitidos;
checa("lista padrão: Claude, ChatGPT e Amazon Quick", PERMITIDOS, ["claude.ai", "chatgpt.com", "amazon-quick"]);
// Amazon Quick: cliente pré-cadastrado, público, com retorno só para o próprio Quick.
const QUICK = clienteFixo("amazon-quick", PERMITIDOS);
checa("Quick: client_id pré-cadastrado é reconhecido", [QUICK?.nome, QUICK?.redirectUris], ["Amazon Quick", []]);
checa("Quick: fora da lista de permitidos, não vale", clienteFixo("amazon-quick", ["claude.ai"]), null);
checa("client_id inventado não é pré-cadastrado", clienteFixo("outro-app", PERMITIDOS), null);
checa("nome de propriedade herdada não vira cliente", clienteFixo("constructor", [...PERMITIDOS, "constructor"]), null);
const pedidoQuick = (redirect) => validarPedido(new URLSearchParams({ response_type: "code", client_id: "amazon-quick", redirect_uri: redirect,
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256", state: "s", resource: cfg.resource }), QUICK, cfg);
checa("Quick: retorno us-east-1 aceito", pedidoQuick("https://us-east-1.quicksight.aws.amazon.com/sn/oauthcallback").ok, true);
checa("Quick: retorno sa-east-1 aceito", pedidoQuick("https://sa-east-1.quicksight.aws.amazon.com/sn/oauthcallback").ok, true);
checa("Quick: retorno us-gov-west-1 aceito", pedidoQuick("https://us-gov-west-1.quicksight.aws.amazon.com/sn/oauthcallback").ok, true);
checa("Quick: outro caminho no mesmo host recusado", pedidoQuick("https://us-east-1.quicksight.aws.amazon.com/outro").naTela, "O endereço de retorno não pertence a este cliente.");
checa("Quick: host-isca recusado", pedidoQuick("https://us-east-1.quicksight.aws.amazon.com.evil.com/sn/oauthcallback").ok, false);
checa("Quick: subdomínio que não é região recusado", pedidoQuick("https://evil.quicksight.aws.amazon.com/sn/oauthcallback").ok, false);
checa("Quick: http recusado", pedidoQuick("http://us-east-1.quicksight.aws.amazon.com/sn/oauthcallback").ok, false);
checa("Quick: com query recusado", pedidoQuick("https://us-east-1.quicksight.aws.amazon.com/sn/oauthcallback?x=1").ok, false);
checa("metadados do recurso anunciam offline_access (o Quick tira os escopos dali)", metadadosRecurso(cfg).scopes_supported, ["leitura", "escrita", "offline_access"]);
checa("ChatGPT: client_id do documento aceito", clientIdAceito("https://chatgpt.com/oauth/client.json", PERMITIDOS), true);
checa("ChatGPT: isca de subdomínio não", clientIdAceito("https://chatgpt.com.evil.com/oauth/client.json", PERMITIDOS), false);
// Documento real, copiado de https://chatgpt.com/oauth/client.json em 11/11/2026.
const DOC_CHATGPT = { client_id: "https://chatgpt.com/oauth/client.json", client_uri: "https://chatgpt.com/",
  redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], token_endpoint_auth_method: "private_key_jwt",
  token_endpoint_auth_methods_supported: ["none", "private_key_jwt"], grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"], client_name: "ChatGPT" };
checa("ChatGPT: documento real é aceito (sabe ser cliente público)",
  validarDocumentoCliente(DOC_CHATGPT, DOC_CHATGPT.client_id), { clientId: DOC_CHATGPT.client_id, nome: "ChatGPT", redirectUris: DOC_CHATGPT.redirect_uris });
checa("cliente que SÓ sabe private_key_jwt é recusado",
  validarDocumentoCliente({ ...DOC_CHATGPT, token_endpoint_auth_methods_supported: ["private_key_jwt"] }, DOC_CHATGPT.client_id), null);
checa("cliente confidencial sem lista de métodos é recusado",
  validarDocumentoCliente({ ...DOC_CHATGPT, token_endpoint_auth_methods_supported: undefined, token_endpoint_auth_method: "client_secret_basic" }, DOC_CHATGPT.client_id), null);
checa("o documento real do Claude Code", clientIdAceito(CLAUDE_CODE_URL, PERMITIDOS), true);
checa("http não", clientIdAceito("http://claude.ai/oauth/x", PERMITIDOS), false);
checa("subdomínio-isca não", clientIdAceito("https://claude.ai.evil.com/x", PERMITIDOS), false);
checa("host certo no caminho não", clientIdAceito("https://evil.com/claude.ai", PERMITIDOS), false);
checa("userinfo não", clientIdAceito("https://claude.ai@evil.com/x", PERMITIDOS), false);
checa("porta explícita não", clientIdAceito("https://claude.ai:8443/x", PERMITIDOS), false);
checa("sem caminho não (a spec exige path)", clientIdAceito("https://claude.ai/", PERMITIDOS), false);
checa("lixo não", clientIdAceito("não é url", PERMITIDOS), false);
checa("lista configurável acrescenta host",
  clientIdAceito("https://outro.exemplo.com/c.json", lerConfig({ MCP_CLIENTES_PERMITIDOS: "claude.ai, outro.exemplo.com" }).clientesPermitidos), true);

console.log("\n3. o documento do cliente");
const doc = validarDocumentoCliente(CLAUDE_CODE_DOC, CLAUDE_CODE_URL);
checa("o documento real valida", doc?.nome, "Claude Code");
checa("client_id do documento diferente da URL = impostor",
  validarDocumentoCliente({ ...CLAUDE_CODE_DOC, client_id: "https://claude.ai/outro" }, CLAUDE_CODE_URL), null);
checa("cliente confidencial não é suportado",
  validarDocumentoCliente({ ...CLAUDE_CODE_DOC, token_endpoint_auth_method: "private_key_jwt" }, CLAUDE_CODE_URL), null);
checa("sem redirect_uris não serve", validarDocumentoCliente({ ...CLAUDE_CODE_DOC, redirect_uris: [] }, CLAUDE_CODE_URL), null);
checa("redirect_uris com não-string não serve",
  validarDocumentoCliente({ ...CLAUDE_CODE_DOC, redirect_uris: ["http://localhost/callback", 3] }, CLAUDE_CODE_URL), null);
checa("array no lugar do objeto não serve", validarDocumentoCliente([CLAUDE_CODE_DOC], CLAUDE_CODE_URL), null);
checa("sem client_name usa o host",
  validarDocumentoCliente({ ...CLAUDE_CODE_DOC, client_name: undefined }, CLAUDE_CODE_URL)?.nome, "claude.ai");

console.log("\n4. redirect_uri");
const R = CLAUDE_CODE_DOC.redirect_uris;
checa("loopback localhost com porta efêmera (o caso do Claude Code)", redirectCasa("http://localhost:3118/callback", R), true);
checa("loopback 127.0.0.1 com porta", redirectCasa("http://127.0.0.1:50999/callback", R), true);
checa("igual ao registrado", redirectCasa("http://localhost/callback", R), true);
checa("https em loopback não é o registrado", redirectCasa("https://localhost:3118/callback", R), false);
checa("localhost.evil.com não é loopback", redirectCasa("http://localhost.evil.com/callback", R), false);
checa("127.0.0.1@evil.com vai para evil.com", redirectCasa("http://127.0.0.1@evil.com/callback", R), false);
checa("outro caminho não", redirectCasa("http://localhost:3118/outro", R), false);
checa("caminho que normaliza para outro não", redirectCasa("http://localhost:3118/callback/../x", R), false);
checa("query a mais não", redirectCasa("http://localhost:3118/callback?x=1", R), false);
checa("fragmento não", redirectCasa("http://localhost:3118/callback#x", R), false);
checa("IPv6 não foi declarado", redirectCasa("http://[::1]:3118/callback", R), false);
const CLAUDE_AI = ["https://claude.ai/api/mcp/auth_callback"];
checa("claude.ai: igualdade exata", redirectCasa("https://claude.ai/api/mcp/auth_callback", CLAUDE_AI), true);
checa("claude.ai: barra final não", redirectCasa("https://claude.ai/api/mcp/auth_callback/", CLAUDE_AI), false);
checa("claude.ai: porta não ganha folga fora de loopback", redirectCasa("https://claude.ai:444/api/mcp/auth_callback", CLAUDE_AI), false);

console.log("\n5. escopos: nunca mais do que o pedido, nunca mais do que a pessoa pode");
const base = { pedidos: ["leitura", "escrita", "offline_access"], marcouEscrita: true, papel: "membro", editaAlgumaArea: true };
checa("tudo pedido, marcado, pode", escoposConcedidos(base), ["leitura", "escrita", "offline_access"]);
checa("papel leitura nunca recebe escrita", escoposConcedidos({ ...base, papel: "leitura" }), ["leitura", "offline_access"]);
checa("sem área editável não recebe escrita", escoposConcedidos({ ...base, editaAlgumaArea: false }), ["leitura", "offline_access"]);
checa("não marcou na tela, não recebe", escoposConcedidos({ ...base, marcouEscrita: false }), ["leitura", "offline_access"]);
checa("não pediu, não recebe — mesmo marcado", escoposConcedidos({ ...base, pedidos: ["leitura"] }), ["leitura"]);
checa("leitura vem mesmo sem ser pedida", escoposConcedidos({ ...base, pedidos: [] }), ["leitura"]);
checa("escopo desconhecido é descartado", lerEscopos("openid leitura admin"), ["leitura"]);

console.log("\n6. resource (RFC 8707)");
checa("barra final some", canonizarResource("https://go.liff.tech/api/mcp/"), "https://go.liff.tech/api/mcp");
checa("host em maiúscula vira minúscula", canonizarResource("https://GO.liff.tech/api/mcp"), "https://go.liff.tech/api/mcp");
checa("fragmento é inválido", canonizarResource("https://go.liff.tech/api/mcp#x"), null);
checa("padrão de produção", cfg.resource, "https://go.liff.tech/api/mcp");
checa("issuer é a origem", cfg.issuer, "https://go.liff.tech");
checa("local configurável", lerConfig({ MCP_URL_CANONICA: "http://localhost:3000/api/mcp" }).issuer, "http://localhost:3000");
checa("desligado por padrão", lerConfig({}).habilitado, false);
checa("só '1' liga", lerConfig({ MCP_HABILITADO: "true" }).habilitado, false);

console.log("\n7. o pedido de autorização");
const pedido = (extra = {}) => new URLSearchParams({
  response_type: "code", client_id: CLAUDE_CODE_URL, redirect_uri: "http://localhost:3118/callback",
  code_challenge: CHALLENGE, code_challenge_method: "S256", state: "xyz", resource: "https://go.liff.tech/api/mcp",
  scope: "leitura escrita offline_access", ...extra,
});
const bom = validarPedido(pedido(), doc, cfg);
checa("pedido completo passa", bom.ok, true);
checa("escopos lidos", bom.pedido?.escopos, ["leitura", "escrita", "offline_access"]);
checa("redirect ruim → erro NA TELA, nunca redirect", validarPedido(pedido({ redirect_uri: "https://evil.com/cb" }), doc, cfg).naTela,
  "O endereço de retorno não pertence a este cliente.");
const semS256 = validarPedido(pedido({ code_challenge_method: "plain" }), doc, cfg);
checa("PKCE plain → invalid_request de volta ao cliente", semS256.error, "invalid_request");
checa("o retorno carrega state e iss (RFC 9207)",
  ["state", "iss"].map((k) => new URL(semS256.redirect).searchParams.get(k)), ["xyz", "https://go.liff.tech"]);
checa("response_type=token → unsupported_response_type",
  validarPedido(pedido({ response_type: "token" }), doc, cfg).error, "unsupported_response_type");
checa("resource de outro servidor → invalid_target",
  validarPedido(pedido({ resource: "https://outro.com/mcp" }), doc, cfg).error, "invalid_target");
checa("resource com barra final ainda é este servidor",
  validarPedido(pedido({ resource: "https://go.liff.tech/api/mcp/" }), doc, cfg).ok, true);
checa("challenge malformado → invalid_request", validarPedido(pedido({ code_challenge: "x" }), doc, cfg).error, "invalid_request");
const semEscopo = pedido();
semEscopo.delete("scope");
checa("sem scope → o que o 401 anuncia", validarPedido(semEscopo, doc, cfg).pedido?.escopos, ["leitura", "escrita"]);
checa("só escopo desconhecido → invalid_scope", validarPedido(pedido({ scope: "openid" }), doc, cfg).error, "invalid_scope");

console.log("\n8. segredos, metadados e desafio");
const s1 = gerarSegredo("liff_at_");
checa("prefixo legível para scanners", s1.startsWith("liff_at_"), true);
checa("256 bits em base64url (43 caracteres após o prefixo)", s1.length, "liff_at_".length + 43);
checa("dois segredos nunca iguais", gerarSegredo("x") === gerarSegredo("x"), false);
checa("hash é SHA-256 hex", /^[0-9a-f]{64}$/.test(hashDe(s1)), true);
checa("hash é determinístico", hashDe(s1) === hashDe(s1), true);
const meta = metadadosServidor(cfg);
checa("sem registration_endpoint (sem registro aberto)", "registration_endpoint" in meta, false);
checa("CIMD + none: o par que faz o Claude usar o documento",
  [meta.client_id_metadata_document_supported, meta.token_endpoint_auth_methods_supported], [true, ["none"]]);
checa("PKCE S256 anunciado", meta.code_challenge_methods_supported, ["S256"]);
checa("offline_access anunciado (o Claude pede refresh por ele)", meta.scopes_supported.includes("offline_access"), true);
checa("o 401 aponta os metadados com o path do MCP",
  desafio(cfg).includes('resource_metadata="https://go.liff.tech/.well-known/oauth-protected-resource/api/mcp"'), true);
checa("aspas na descrição não quebram o cabeçalho",
  desafio(cfg, { error: "insufficient_scope", descricao: 'precisa de "escrita"' }).includes("precisa de 'escrita'"), true);

console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
