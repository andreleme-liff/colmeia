// Ponta a ponta do papel FINANCEIRO contra um app e um banco LOCAIS: o que ele ganha sobre o
// gestor (editar a receita, faturamento e despesas), o que continua só de admin (pessoas,
// cadastros, funding, changelog) e o modo "ver como".
//
//   E2E_BASE=http://localhost:3010 E2E_DB=postgres://postgres:postgres@127.0.0.1:5433/postgres \
//     node scripts/e2e-financeiro-local.mjs
//
// RECUSA rodar contra qualquer coisa que não seja loopback: o script grava sessões e um
// usuário de teste. Nunca aponte para produção.

import { randomBytes } from "node:crypto";
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

let ok = 0, falhou = 0;
function checa(descricao, obtido, esperado) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ✓ ${descricao}`); } else { falhou++; console.log(`  ✗ ${descricao}\n      esperado ${b}\n      veio     ${a}`); }
}

// Dispara a migração (a rota só abre o banco se vier algum cookie de sessão).
await fetch(`${BASE}/api/state`, { headers: { cookie: "session=aquecimento" } });

async function sessao(userId) {
  const token = randomBytes(32).toString("hex");
  await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, now() + interval '1 day')`;
  return `session=${token}`;
}
const idDe = async (papel) => (await sql`SELECT id FROM users WHERE papel = ${papel} AND ativo AND email NOT LIKE 'financeiro.teste@%' ORDER BY id LIMIT 1`)[0]?.id;
const chamar = async (cookie, metodo, caminho, corpo) => {
  const r = await fetch(BASE + caminho, { method: metodo, headers: { "content-type": "application/json", cookie }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json().catch(() => null) };
};

const admin = await sessao(await idDe("admin"));
const gestor = await sessao(await idDe("gestor"));

console.log("o papel existe");
// Nasce gestor, direto no banco local, e vira financeiro PELA API: é o que prova que o CHECK
// da tabela de usuários aceita o papel novo numa base que já existia.
const [u] = await sql`
  INSERT INTO users (nome, email, papel, iniciais) VALUES ('Financeiro Teste', 'financeiro.teste@example.com', 'gestor', 'FT')
  ON CONFLICT (email) DO UPDATE SET papel = 'gestor', ativo = TRUE RETURNING id`;
checa("papel inventado: 400", (await chamar(admin, "PATCH", `/api/users/${u.id}`, { papel: "tesoureiro" })).status, 400);
checa("gestor não promove ninguém: 403", (await chamar(gestor, "PATCH", `/api/users/${u.id}`, { papel: "financeiro" })).status, 403);
checa("admin promove a financeiro", (await chamar(admin, "PATCH", `/api/users/${u.id}`, { papel: "financeiro" })).status, 200);
checa("gravou no banco", (await sql`SELECT papel FROM users WHERE id = ${u.id}`)[0].papel, "financeiro");
const fin = await sessao(u.id);

console.log("\no que o painel diz de cada um");
const flags = async (c) => (({ isAdmin, podeVerReceita, podeFinanceiro, me }) => [me.papel, isAdmin, podeVerReceita, podeFinanceiro])((await chamar(c, "GET", "/api/state")).corpo);
checa("financeiro: vê receita e opera o dinheiro, sem ser admin", await flags(fin), ["financeiro", false, true, true]);
checa("gestor: vê receita, não opera", await flags(gestor), ["gestor", false, true, false]);
checa("admin: tudo", await flags(admin), ["admin", true, true, true]);

console.log("\no que o financeiro ganha sobre o gestor");
// Corpo inválido de propósito: 400 prova que passou pela permissão sem gravar nada; 403 é barrado.
const portas = [
  ["lê despesas", "GET", "/api/despesas", undefined, 200],
  ["lança despesa", "POST", "/api/despesas", {}, 400],
  ["age numa despesa", "PATCH", "/api/despesas/999999", { acao: "pagar" }, 404],
  ["paga fatura de cartão", "POST", "/api/despesas/fatura", {}, 400],
  ["cadastra favorecido", "POST", "/api/despesas/cadastros/favorecidos", {}, 400],
  ["altera cadastro de despesa", "PATCH", "/api/despesas/cadastros/categorias/999999", { nome: "Teste e2e financeiro", grupo: "operacional" }, 404],
  ["exclui cadastro de despesa", "DELETE", "/api/despesas/cadastros/categorias/999999", undefined, 404],
  ["lê faturamento", "GET", "/api/faturamento", undefined, 200],
  ["emite fatura", "POST", "/api/faturamento", {}, 400],
  ["age numa fatura", "PATCH", "/api/faturamento/999999", {}, 404],
  ["cadastra receita", "POST", "/api/receita", {}, 400],
  ["altera receita", "PATCH", "/api/receita/999999", {}, 400],
  ["exclui receita", "DELETE", "/api/receita/999999", undefined, 404],
];
for (const [nome, metodo, caminho, corpo, esperado] of portas) {
  const f = (await chamar(fin, metodo, caminho, corpo)).status;
  checa(`financeiro ${nome} (${esperado === 200 ? "200" : "passa da permissão"})`, f !== 401 && f !== 403 && (esperado !== 200 || f === 200), true);
  checa(`gestor não ${nome}: 403`, (await chamar(gestor, metodo, caminho, corpo)).status, 403);
}
checa("gestor continua lendo a receita", (await chamar(gestor, "GET", "/api/receita")).status, 200);
checa("financeiro lê a receita", (await chamar(fin, "GET", "/api/receita")).status, 200);
const fav = await chamar(fin, "POST", "/api/despesas/cadastros/favorecidos", { nome: "Fornecedor do financeiro", tipo: "fornecedor" });
checa("financeiro grava de verdade (cadastra um favorecido)", [fav.status, fav.corpo?.ok], [200, true]);
const [linha] = await sql`SELECT actor_user_id FROM audit_log WHERE entidade = ${`FAV-${fav.corpo.id}`}`;
checa("a auditoria registra o financeiro como autor", linha.actor_user_id, u.id);

console.log("\no que continua só de admin");
for (const [nome, metodo, caminho, corpo] of [
  ["lê funding", "GET", "/api/funding", undefined],
  ["lê o changelog", "GET", "/api/logs", undefined],
  ["cadastra pessoa", "POST", "/api/users", {}],
  ["muda papel de alguém", "PATCH", `/api/users/${u.id}`, { papel: "admin" }],
  ["cria produto", "POST", "/api/produtos", {}],
  ["simula outro papel", "POST", "/api/me/ver-como", { papel: "leitura" }],
]) checa(`financeiro não ${nome}: 403`, (await chamar(fin, metodo, caminho, corpo)).status, 403);
const painel = (await chamar(fin, "GET", "/api/state")).corpo;
checa("o log do painel do financeiro não traz linha restrita a admin", painel.logs.some((l) => /^(P|CAT|FAV|REC|F|R|E|U)-/.test(l.entidade ?? "")), false);

console.log("\nver como");
checa("admin liga o modo financeiro", (await chamar(admin, "POST", "/api/me/ver-como", { papel: "financeiro" })).status, 200);
const simulado = `${admin}; ver_como=financeiro`;
checa("simulando: responde como financeiro", await flags(simulado), ["financeiro", false, true, true]);
checa("simulando: funding fica barrado", (await chamar(simulado, "GET", "/api/funding")).status, 403);
checa("simulando: despesas abre", (await chamar(simulado, "GET", "/api/despesas")).status, 200);
checa("quem não é admin não simula pelo cookie", await flags(`${gestor}; ver_como=financeiro`), ["gestor", false, true, false]);

// O usuário de teste fica desativado (nada é apagado), para não sobrar um financeiro ativo na base local.
await sql`UPDATE users SET ativo = FALSE WHERE id = ${u.id}`;
console.log(`\n${ok} passaram, ${falhou} falharam`);
await sql.end();
if (falhou) process.exit(1);
