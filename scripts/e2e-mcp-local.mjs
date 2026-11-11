// Ponta a ponta do MCP + OAuth contra um app e um banco LOCAIS. Faz o papel do cliente
// (como o Claude Code): descobre os metadados, abre um listener de callback em loopback,
// espera o código da tela de consentimento, troca com PKCE e exercita as ferramentas —
// conferindo no banco cada gravação, cada linha de auditoria e cada recusa.
//
//   E2E_BASE=http://localhost:3010 E2E_DB=postgres://postgres:postgres@127.0.0.1:5433/postgres \
//     node scripts/e2e-mcp-local.mjs
//
// RECUSA rodar contra qualquer coisa que não seja loopback: o script grava sessões, cria
// oportunidades e desativa uma pessoa de teste. Nunca aponte para produção.
//
// A tela de consentimento é clicada por uma pessoa (ou pelo navegador do painel): o script
// imprime "AUTORIZE ROUNDn: <url>" e espera o callback.

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const postgres = require("postgres");

const BASE = process.env.E2E_BASE ?? "http://localhost:3010";
const DB = process.env.E2E_DB ?? "postgres://postgres:postgres@127.0.0.1:5433/postgres";
for (const [nome, url] of [["E2E_BASE", BASE], ["E2E_DB", DB]]) {
  const h = new URL(url).hostname;
  if (h !== "localhost" && h !== "127.0.0.1") throw new Error(`${nome} não é loopback (${h}). Este script só roda local.`);
}
const sql = postgres(DB, { ssl: false, prepare: false, max: 1 });
const CLIENT_ID = "https://claude.ai/oauth/claude-code-client-metadata";

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

const b64url = (b) => b.toString("base64url");

async function sessaoDe(userId) {
  const token = randomBytes(32).toString("hex");
  await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, now() + interval '1 day')`;
  return `session=${token}`;
}

/** Abre um listener de callback em loopback, como o Claude Code, e espera o código. */
async function autorizar(rodada, escopo) {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(12));
  let resolver;
  const codigo = new Promise((r) => (resolver = r));
  const srv = createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    res.end("ok - pode fechar");
    srv.close();
    resolver(Object.fromEntries(u.searchParams));
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const redirectUri = `http://localhost:${srv.address().port}/callback`;
  const q = new URLSearchParams({
    response_type: "code", client_id: CLIENT_ID, redirect_uri: redirectUri, code_challenge: challenge,
    code_challenge_method: "S256", state, scope: escopo, resource: `${BASE}/api/mcp`,
  });
  console.log(`\nAUTORIZE ${rodada}: ${BASE}/oauth/autorizar?${q}`);
  const volta = await Promise.race([codigo, new Promise((_, rej) => setTimeout(() => rej(new Error("callback não chegou em 5 min")), 300000))]);
  return { volta, verifier, redirectUri, state };
}

async function token(campos) {
  const r = await fetch(`${BASE}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, resource: `${BASE}/api/mcp`, ...campos }),
  });
  return { status: r.status, corpo: await r.json(), cache: r.headers.get("cache-control") };
}

let idRpc = 0;
async function rpc(acesso, method, params) {
  const r = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25", ...(acesso ? { authorization: `Bearer ${acesso}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++idRpc, method, ...(params ? { params } : {}) }),
  });
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null, www: r.headers.get("www-authenticate") };
}
const tool = async (acesso, name, args = {}) => (await rpc(acesso, "tools/call", { name, arguments: args })).corpo?.result;

// ---------------------------------------------------------------------------------------

const RAFAEL = 3; // gestor: edita tax e labs; vê law-firms e corporate
const CLARA = 4; // membro: só vê public-sector e social

console.log("\n1. descoberta, como o Claude faz");
const sem = await rpc(null, "initialize", {});
checa("sem token → 401", sem.status, 401);
const meta = /resource_metadata="([^"]+)"/.exec(sem.www ?? "")?.[1];
checa("o 401 aponta os metadados do recurso", meta, `${BASE}/.well-known/oauth-protected-resource/api/mcp`);
const recurso = await (await fetch(meta)).json();
checa("resource é a URL do MCP", recurso.resource, `${BASE}/api/mcp`);
const as = await (await fetch(`${recurso.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json();
checa("CIMD + none + S256 anunciados",
  [as.client_id_metadata_document_supported, as.token_endpoint_auth_methods_supported, as.code_challenge_methods_supported],
  [true, ["none"], ["S256"]]);
checa("sem registration_endpoint", "registration_endpoint" in as, false);

console.log("\n2. tela de consentimento sem e com sessão");
const qBase = new URLSearchParams({
  response_type: "code", client_id: CLIENT_ID, redirect_uri: "http://localhost:1/callback",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", code_challenge_method: "S256", scope: "leitura escrita",
});
const semSessao = await fetch(`${BASE}/oauth/autorizar?${qBase}`, { redirect: "manual" });
checa("sem sessão → vai para o login Google, levando o pedido", (semSessao.headers.get("location") ?? "").startsWith("/api/auth/google/start?voltar=%2Foauth%2Fautorizar"), true);
checa("tela não pode ser emoldurada", semSessao.headers.get("x-frame-options"), "DENY");
const cookieClara = await sessaoDe(CLARA);
const htmlClara = await (await fetch(`${BASE}/oauth/autorizar?${qBase}`, { headers: { cookie: cookieClara } })).text();
checa("quem só vê não recebe a opção de gravar", htmlClara.includes('name="escrita"'), false);
checa("…e a tela diz por quê", htmlClara.includes("seu acesso é só de leitura"), true);
const ruim = new URLSearchParams(qBase);
ruim.set("redirect_uri", "https://evil.com/callback");
const htmlRuim = await fetch(`${BASE}/oauth/autorizar?${ruim}`, { headers: { cookie: cookieClara }, redirect: "manual" });
checa("redirect alheio: erro na tela, sem redirecionar", [htmlRuim.status, (await htmlRuim.text()).includes("não pertence a este cliente")], [200, true]);
const alheio = new URLSearchParams(qBase);
alheio.set("client_id", "https://evil.com/client.json");
checa("cliente fora da lista: erro na tela",
  (await (await fetch(`${BASE}/oauth/autorizar?${alheio}`, { headers: { cookie: cookieClara } })).text()).includes("não está autorizado"), true);

const cookieRafael = await sessaoDe(RAFAEL);
console.log(`\nCOOKIE_RAFAEL: ${cookieRafael}`);

console.log("\n3. autorização com gravação (clique na tela)");
const r1 = await autorizar("ROUND1", "leitura escrita offline_access");
checa("o state volta intacto", r1.volta.state, r1.state);
checa("iss no retorno (RFC 9207)", r1.volta.iss, BASE);
checa("código com prefixo", (r1.volta.code ?? "").startsWith("liff_ac_"), true);

const errado = await token({ grant_type: "authorization_code", code: r1.volta.code, code_verifier: b64url(randomBytes(32)), redirect_uri: r1.redirectUri });
checa("verifier errado → invalid_grant", errado.corpo.error, "invalid_grant");
const outroRedirect = await token({ grant_type: "authorization_code", code: r1.volta.code, code_verifier: r1.verifier, redirect_uri: "http://localhost:9/callback" });
checa("redirect_uri diferente → invalid_grant", outroRedirect.corpo.error, "invalid_grant");
const t1 = await token({ grant_type: "authorization_code", code: r1.volta.code, code_verifier: r1.verifier, redirect_uri: r1.redirectUri });
checa("troca certa → tokens", [t1.status, t1.corpo.token_type, !!t1.corpo.refresh_token], [200, "Bearer", true]);
checa("escopos concedidos", t1.corpo.scope, "leitura escrita offline_access");
checa("resposta de token não vai para cache", t1.cache, "no-store");
const [conc] = await sql`SELECT k.id, k.escopos FROM oauth_concessoes k JOIN oauth_tokens t ON t.concessao_id = k.id WHERE t.hash = ${createHash("sha256").update(t1.corpo.access_token).digest("hex")}`;
checa("token guardado só como hash (o valor em claro não está no banco)",
  (await sql`SELECT count(*)::int n FROM oauth_tokens WHERE hash = ${t1.corpo.access_token}`)[0].n, 0);
const [audAut] = await sql`SELECT texto FROM audit_log WHERE entidade = ${`CONEXAO-${conc.id}`} AND campo = 'criacao'`;
checa("a autorização entrou na auditoria", audAut?.texto.startsWith("Autorizou Claude Code (este computador (localhost)) a ler e gravar"), true);
const A = t1.corpo.access_token;

console.log("\n4. ferramentas");
const init = await rpc(A, "initialize", { protocolVersion: "2025-06-18" });
checa("initialize negocia a versão pedida", init.corpo.result.protocolVersion, "2025-06-18");
checa("notificação → 202", (await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${A}` }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) })).status, 202);
checa("com escrita, dezesseis ferramentas", (await rpc(A, "tools/list")).corpo.result.tools.length, 16);
const ctxt = (await tool(A, "contexto")).structuredContent;
checa("age em nome de Rafael", ctxt.pessoa.nome, "Rafael Nunes");
checa("áreas e níveis de Rafael",
  ctxt.produtos.map((a) => `${a.id}:${a.nivel}`).sort(), ["corporate:ver", "labs:editar", "law-firms:ver", "tax:editar"]);
const lista = (await tool(A, "listar_oportunidades", { limite: 200 })).structuredContent;
checa("só oportunidades de áreas que ele vê", lista.itens.every((d) => ["law-firms", "corporate", "tax", "labs"].includes(d.produto)), true);
const [{ n: totalVisivel }] = await sql`SELECT count(*)::int n FROM deals WHERE area IN ('law-firms','corporate','tax','labs')`;
checa("e todas elas", lista.total, totalVisivel);
const invisivel = await sql`SELECT ref FROM deals WHERE area IN ('public-sector','social') LIMIT 1`;
if (invisivel.length) {
  const v = await tool(A, "ver_registro", { ref: invisivel[0].ref });
  checa("registro de área invisível: 'não encontrado'", [v.isError, v.content[0].text], [true, "Registro não encontrado."]);
}
const inv = await tool(A, "criar_oportunidade", { conta: "X", produto: "tax", tipo: "y" });
checa("campo inventado → erro legível para o modelo", [inv.isError, inv.content[0].text], [true, "Argumentos inválidos: campo desconhecido: tipo."]);

console.log("\n5. gravação, idempotência e rastro");
const chave = `e2e-${randomBytes(6).toString("hex")}`;
const c1 = await tool(A, "criar_oportunidade", { conta: "E2E Bebidas", produto: "tax", valor_reais: 1500.5, estagio: "qualificado", chave_idempotencia: chave });
checa("cria na área que edita", [c1.isError, c1.structuredContent?.criado], [false, true]);
const ref = c1.structuredContent.ref;
checa("o link aponta para o card no app", c1.structuredContent.url, `${BASE}/comercial/${ref}`);
const c2 = await tool(A, "criar_oportunidade", { conta: "E2E Bebidas", produto: "tax", valor_reais: 1500.5, chave_idempotencia: chave });
checa("repetir com a mesma chave devolve o mesmo, sem duplicar", [c2.structuredContent?.repetida, c2.structuredContent?.ref], [true, ref]);
checa("existe UMA oportunidade com essa conta", (await sql`SELECT count(*)::int n FROM deals WHERE conta = 'E2E Bebidas'`)[0].n, 1);
const [deal] = await sql`SELECT id, valor_centavos, estagio FROM deals WHERE ref = ${ref}`;
checa("valor em centavos no banco", Number(deal.valor_centavos), 150050);
const [aud] = await sql`SELECT origem, concessao_id, actor_user_id, campo FROM audit_log WHERE entidade = ${ref}`;
checa("auditoria: origem mcp, a concessão e a pessoa", [aud.origem, aud.concessao_id, aud.actor_user_id, aud.campo], ["mcp", conc.id, RAFAEL, "criacao"]);
const [cham] = await sql`SELECT ok, escrita, ref, chave_idempotencia FROM mcp_chamadas WHERE concessao_id = ${conc.id} AND ferramenta = 'criar_oportunidade' AND ok`;
checa("a chamada registrada, com a ref e a chave", [cham.ok, cham.escrita, cham.ref, cham.chave_idempotencia], [true, true, ref, chave]);

const semPerm = await tool(A, "criar_oportunidade", { conta: "E2E Proibida", produto: "law-firms" });
checa("área só-leitura: recusa com a mensagem da interface", semPerm.content[0].text.startsWith("Sem permissão de edição em"), true);
checa("…e nada foi criado", (await sql`SELECT count(*)::int n FROM deals WHERE conta = 'E2E Proibida'`)[0].n, 0);
checa("…mas a tentativa ficou registrada", (await sql`SELECT count(*)::int n FROM mcp_chamadas WHERE concessao_id = ${conc.id} AND NOT ok AND ferramenta = 'criar_oportunidade'`)[0].n >= 1, true);

// O caso que motivou o núcleo: um campo válido e um inválido na mesma alteração.
const misto = await tool(A, "atualizar_oportunidade", { ref, estagio: "proposta", conta: "" });
checa("alteração com um campo inválido é recusada", misto.isError, true);
checa("…e o campo válido NÃO foi gravado (tudo ou nada)", (await sql`SELECT estagio FROM deals WHERE ref = ${ref}`)[0].estagio, "qualificado");
checa("…sem linha de auditoria órfã", (await sql`SELECT count(*)::int n FROM audit_log WHERE entidade = ${ref}`)[0].n, 1);
const at = await tool(A, "atualizar_oportunidade", { ref, estagio: "proposta", proximo_passo: "Enviar proposta" });
checa("alteração válida", [at.isError, at.structuredContent?.campos_alterados], [false, 2]);
const hist = (await tool(A, "ver_registro", { ref })).structuredContent.historico;
checa("histórico mostra 'via Claude Code'", hist.every((h) => h.via === "Claude Code"), true);
checa("…com o par anterior/novo", hist.find((h) => h.campo === "estagio")?.de, "qualificado");

console.log("\n6. a interface usa o mesmo núcleo (rota HTTP)");
const patch = (corpo) => fetch(`${BASE}/api/deals/${deal.id}`, { method: "PATCH", headers: { "content-type": "application/json", cookie: cookieRafael }, body: JSON.stringify(corpo) });
const pm = await patch({ conta: "E2E Bebidas S.A.", estagio: "nao-existe" });
checa("PATCH misto pela interface: 400 com a mesma mensagem de sempre", [pm.status, (await pm.json()).error], [400, "Estágio inválido."]);
checa("…e a conta não mudou", (await sql`SELECT conta FROM deals WHERE ref = ${ref}`)[0].conta, "E2E Bebidas");
const pb = await patch({ conta: "E2E Bebidas S.A." });
checa("PATCH válido pela interface", [pb.status, (await pb.json()).mudancas], [200, 1]);
checa("…auditado SEM origem (é a interface)", (await sql`SELECT origem FROM audit_log WHERE entidade = ${ref} AND campo = 'conta'`)[0].origem, null);
const pnull = await fetch(`${BASE}/api/deals/${deal.id}`, { method: "PATCH", headers: { "content-type": "application/json", cookie: cookieRafael }, body: "null" });
checa("corpo null: 400 legível em vez de 500", pnull.status, 400);
const logs = await (await fetch(`${BASE}/api/logs/${ref}`, { headers: { cookie: cookieRafael } })).json();
checa("histórico da interface traz 'via' só nas entradas do MCP",
  logs.entradas.map((e) => e.via ?? "interface").sort(), ["Claude Code", "Claude Code", "Claude Code", "interface"]);

console.log("\n7. renovação com rotação");
const rf1 = await token({ grant_type: "refresh_token", refresh_token: t1.corpo.refresh_token });
checa("refresh devolve par novo", [rf1.status, rf1.corpo.refresh_token !== t1.corpo.refresh_token], [200, true]);
const corrida = await token({ grant_type: "refresh_token", refresh_token: t1.corpo.refresh_token });
checa("refresh reapresentado na janela de corrida → invalid_grant", corrida.corpo.error, "invalid_grant");
checa("…sem derrubar a concessão (o par novo continua valendo)", (await tool(rf1.corpo.access_token, "contexto")).isError, false);
const A2 = rf1.corpo.access_token;

console.log("\n8. pessoa desativada perde o acesso na hora");
await sql`UPDATE users SET ativo = false WHERE id = ${RAFAEL}`;
checa("desativado → 401", (await rpc(A2, "tools/list")).status, 401);
await sql`UPDATE users SET ativo = true WHERE id = ${RAFAEL}`;
checa("reativado → volta", (await rpc(A2, "tools/list")).status, 200);

console.log("\n9. permissão tirada na administração vale na próxima chamada");
await sql`UPDATE user_area_perms SET nivel = 'view' WHERE user_id = ${RAFAEL} AND area = 'tax'`;
const semTax = await tool(A2, "atualizar_oportunidade", { ref, proximo_passo: "outro" });
checa("tax virou só-leitura → recusa, com o mesmo token", semTax.content[0].text, "Sem permissão de edição neste produto.");
await sql`UPDATE user_area_perms SET nivel = 'edit' WHERE user_id = ${RAFAEL} AND area = 'tax'`;

console.log("\n10. limite por minuto");
let barrou = 0;
for (let i = 0; i < 70 && !barrou; i++) {
  const r = await tool(A2, "contexto");
  if (r.isError && r.content[0].text.startsWith("Limite de 60")) barrou = i + 1;
}
checa("barra antes da 71ª chamada no minuto", barrou > 0 && barrou <= 61, true);

console.log("\n11. revogação pela tela");
const lst = await (await fetch(`${BASE}/api/conexoes`, { headers: { cookie: cookieRafael } })).json();
checa("a conexão aparece na lista da pessoa", lst.conexoes.some((c) => c.id === conc.id && c.cliente === "Claude Code"), true);
const del = await fetch(`${BASE}/api/conexoes/${conc.id}`, { method: "DELETE", headers: { cookie: cookieClara } });
checa("outra pessoa (não admin) não revoga: 404", del.status, 404);
const del2 = await fetch(`${BASE}/api/conexoes/${conc.id}`, { method: "DELETE", headers: { cookie: cookieRafael } });
checa("a dona revoga", del2.status, 200);
checa("token revogado → 401 na próxima chamada", (await rpc(A2, "tools/list")).status, 401);
checa("refresh da concessão revogada → invalid_grant", (await token({ grant_type: "refresh_token", refresh_token: rf1.corpo.refresh_token })).corpo.error, "invalid_grant");
checa("a revogação entrou na auditoria", (await sql`SELECT count(*)::int n FROM audit_log WHERE entidade = ${`CONEXAO-${conc.id}`} AND campo = 'revogacao'`)[0].n, 1);

console.log("\n12. código reaproveitado derruba a concessão (segunda autorização, só leitura)");
const r2 = await autorizar("ROUND2", "leitura escrita offline_access");
const t2 = await token({ grant_type: "authorization_code", code: r2.volta.code, code_verifier: r2.verifier, redirect_uri: r2.redirectUri });
checa("sem marcar Gravar, só leitura", t2.corpo.scope, "leitura offline_access");
checa("só leitura não vê ferramenta de gravação", (await rpc(t2.corpo.access_token, "tools/list")).corpo.result.tools.length, 5);
const forcada = await tool(t2.corpo.access_token, "criar_atividade", { titulo: "x", produto: "tax" });
checa("chamar gravação mesmo assim → recusa por escopo", forcada.content[0].text.startsWith("Esta conexão só tem permissão de leitura"), true);
const reuso = await token({ grant_type: "authorization_code", code: r2.volta.code, code_verifier: r2.verifier, redirect_uri: r2.redirectUri });
checa("código reapresentado → invalid_grant", reuso.corpo.error, "invalid_grant");
checa("…e o token emitido com ele morreu", (await rpc(t2.corpo.access_token, "tools/list")).status, 401);
checa("…com o motivo registrado",
  (await sql`SELECT motivo_revogacao FROM oauth_concessoes ORDER BY id DESC LIMIT 1`)[0].motivo_revogacao, "código de autorização reutilizado");

console.log(`\n${ok} passaram, ${falhou} falharam`);
await sql.end();
process.exit(falhou ? 1 : 0);
