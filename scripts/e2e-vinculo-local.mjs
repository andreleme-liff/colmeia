// Ponta a ponta do vínculo tarefa ↔ oportunidade, contra app e banco LOCAIS (ver a seção
// "Teste de ponta a ponta local" do README). Emite um token de MCP direto no banco local —
// recusa rodar contra qualquer coisa que não seja loopback.
//
//   node scripts/e2e-vinculo-local.mjs
import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
const require = createRequire(import.meta.url);
const postgres = require("postgres");
const B = "http://localhost:3010";
const DB = process.env.E2E_DB ?? "postgres://postgres:postgres@127.0.0.1:5433/postgres";
for (const u of [B, DB]) if (!["localhost", "127.0.0.1"].includes(new URL(u).hostname)) throw new Error(`não é loopback: ${u}`);
const sql = postgres(DB, { ssl: false, prepare: false, max: 1 });
let ok = 0, falhou = 0;
const checa = (d, a, b) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x === y) { ok++; console.log("  ✓", d); } else { falhou++; console.log("  ✗", d, "\n      deu     ", x, "\n      esperava", y); } };
const sessao = async (uid) => { const t = randomBytes(32).toString("hex"); await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${t}, ${uid}, now() + interval '1 day')`; return `session=${t}`; };
const admin = await sessao(1), clara = await sessao(4);
const id = async (tabela, ref) => (await sql.unsafe(`SELECT id FROM ${tabela} WHERE ref = $1`, [ref]))[0].id;
const patch = (url, cookie, corpo) => fetch(B + url, { method: "PATCH", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(corpo) });
const estado = async (cookie) => (await fetch(B + "/api/state", { headers: { cookie } })).json();

console.log("\n1. ligar pela tela");
const t0401 = await id("activities", "T-0401"), c0007 = await id("deals", "C-0007"), c0001 = await id("deals", "C-0001");
checa("ligar T-0401 a C-0007 (tax)", (await patch(`/api/activities/${t0401}`, admin, { oportunidade: c0007 })).status, 200);
const a1 = (await estado(admin)).activities.find((a) => a.ref === "T-0401");
checa("o card recebe a referência e a conta", [a1.oportunidadeRef, a1.oportunidadeConta, a1.oportunidadeOculta], ["C-0007", "Cimentos Boa Vista", false]);
const h1 = (await (await fetch(B + "/api/logs/T-0401", { headers: { cookie: admin } })).json()).entradas;
checa("o vínculo entra no histórico com de/para", [h1[0].campo, h1[0].de, h1[0].para], ["oportunidade", "—", "C-0007 · Cimentos Boa Vista"]);
const inexist = await patch(`/api/activities/${t0401}`, admin, { oportunidade: 99999 });
checa("oportunidade inexistente: 400 legível", [inexist.status, (await inexist.json()).error], [400, "Oportunidade não encontrada."]);

console.log("\n2. quem não enxerga a oportunidade");
// T-0601 é de Social (Clara vê); C-0001 é de Law Firms (Clara não vê).
const t0601 = await id("activities", "T-0601");
await patch(`/api/activities/${t0601}`, admin, { oportunidade: c0001 });
const a2 = (await estado(clara)).activities.find((a) => a.ref === "T-0601");
checa("Clara vê que há vínculo, sem a conta", [a2.oportunidadeOculta, a2.oportunidadeRef, a2.oportunidadeConta], [true, null, null]);
checa("…e o estado dela não traz a oportunidade alheia em lugar nenhum", JSON.stringify(await estado(clara)).includes("Vieira & Costa"), false);
const hClara = (await (await fetch(B + "/api/logs/T-0601", { headers: { cookie: clara } })).json()).entradas;
checa("o histórico da tarefa, lido por Clara, só tem a referência", [hClara[0].texto, hClara[0].para], ['Ligou "Convênio com Defensoria — plano piloto" à oportunidade C-0001', "C-0001"]);

console.log("\n3. pelo MCP");
const acesso = "col_at_" + randomBytes(32).toString("base64url");
const [k] = await sql`INSERT INTO oauth_concessoes (user_id, client_id, client_nome, redirect_uri, resource, escopos)
  VALUES (1, 'https://claude.ai/oauth/claude-code-client-metadata', 'Claude Code', 'http://localhost/callback', 'http://localhost:3010/api/mcp', 'leitura escrita') RETURNING id`;
await sql`INSERT INTO oauth_tokens (hash, concessao_id, tipo, expira_em) VALUES (${createHash("sha256").update(acesso).digest("hex")}, ${k.id}, 'acesso', now() + interval '1 hour')`;
const tool = async (name, args) => (await (await fetch(B + "/api/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${acesso}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) })).json()).result;
const nova = await tool("criar_atividade", { titulo: "Kickoff de implantação", area: "tax", oportunidade: "C-0007", chave_idempotencia: "vinculo-teste-1" });
checa("Claude cria tarefa já ligada", [nova.isError, nova.structuredContent?.registro?.oportunidade?.ref], [false, "C-0007"]);
const lista = (await tool("listar_atividades", { oportunidade: "D-07" })).structuredContent;
checa("listar por oportunidade (até pela referência antiga)", lista.itens.map((i) => i.ref).sort(), ["T-0401", nova.structuredContent.ref].sort());
const reg = (await tool("ver_registro", { ref: "C-0007" })).structuredContent.registro;
checa("ver_registro da oportunidade traz as tarefas ligadas", reg.tarefas.map((t) => t.ref).sort(), ["T-0401", nova.structuredContent.ref].sort());
const naoVe = await tool("listar_atividades", { oportunidade: "C-9999" });
checa("oportunidade inexistente no filtro: erro legível", [naoVe.isError, naoVe.content[0].text], [true, "Oportunidade não encontrada."]);
const deslig = await tool("atualizar_atividade", { ref: "T-0401", oportunidade: null });
checa("Claude desliga", [deslig.isError, deslig.structuredContent?.registro?.oportunidade], [false, null]);
const [aud] = await sql`SELECT origem, campo FROM audit_log WHERE entidade = 'T-0401' ORDER BY id DESC LIMIT 1`;
checa("o desligar pelo MCP fica marcado como via conexão", [aud.origem, aud.campo], ["mcp", "oportunidade"]);

console.log("\n4. excluir a oportunidade");
const del = await fetch(B + `/api/deals/${c0007}`, { method: "DELETE", headers: { cookie: admin } });
checa("exclusão ok", del.status, 200);
const [orfa] = await sql`SELECT oportunidade_id FROM activities WHERE ref = ${nova.structuredContent.ref}`;
checa("a tarefa continua, sem vínculo", orfa.oportunidade_id, null);
const [perda] = await sql`SELECT texto FROM audit_log WHERE entidade = ${nova.structuredContent.ref} ORDER BY id DESC LIMIT 1`;
checa("…e o histórico dela diz por quê", perda.texto, '"Kickoff de implantação" perdeu o vínculo: a oportunidade C-0007 · Cimentos Boa Vista foi excluída');

console.log(`\n${ok} passaram, ${falhou} falharam`);
await sql.end();
process.exit(falhou ? 1 : 0);
