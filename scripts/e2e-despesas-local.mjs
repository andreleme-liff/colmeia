// Ponta a ponta das despesas (contas a pagar) contra um app e um banco LOCAIS: cadastros,
// recorrência, lançamento, fatura de cartão com itens, pagamento, estorno, correção,
// cancelamento, permissão (só admin) e auditoria (só admin vê).
//
//   E2E_BASE=http://localhost:3010 E2E_DB=postgres://postgres:postgres@127.0.0.1:5433/postgres \
//     node scripts/e2e-despesas-local.mjs
//
// RECUSA rodar contra qualquer coisa que não seja loopback: o script grava sessões e contas
// de teste. Nunca aponte para produção.

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

// Dispara a migração: sem cookie a rota responde 401 antes de abrir o banco, então vai um
// cookie qualquer, que obriga a consulta à tabela de sessões.
await fetch(`${BASE}/api/despesas`, { headers: { cookie: "session=aquecimento" } });

async function sessaoDe(papel) {
  const [u] = await sql`SELECT id FROM users WHERE papel = ${papel} AND ativo ORDER BY id LIMIT 1`;
  if (!u) throw new Error(`nenhum usuário ${papel} na base local (SEED_DEMO=1?)`);
  const token = randomBytes(32).toString("hex");
  await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${u.id}, now() + interval '1 day')`;
  return `session=${token}`;
}
const chamar = async (cookie, metodo, caminho, corpo) => {
  const r = await fetch(BASE + caminho, { method: metodo, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json().catch(() => null) };
};

const admin = await sessaoDe("admin");
const A = (m, c, b) => chamar(admin, m, c, b);
const ler = async () => (await A("GET", "/api/despesas")).corpo;

console.log("permissão");
checa("sem sessão: 401", (await chamar(null, "GET", "/api/despesas")).status, 401);
for (const papel of ["gestor", "membro", "leitura"]) {
  const [existe] = await sql`SELECT 1 FROM users WHERE papel = ${papel} AND ativo LIMIT 1`;
  if (!existe) { console.log(`  · sem usuário ${papel} na base local, pulado`); continue; }
  const c = await sessaoDe(papel);
  checa(`${papel} não lê: 403`, (await chamar(c, "GET", "/api/despesas")).status, 403);
  checa(`${papel} não lança: 403`, (await chamar(c, "POST", "/api/despesas", {})).status, 403);
  checa(`${papel} não paga: 403`, (await chamar(c, "PATCH", "/api/despesas/1", { acao: "pagar" })).status, 403);
  checa(`${papel} não cadastra: 403`, (await chamar(c, "POST", "/api/despesas/cadastros/favorecidos", { nome: "X", tipo: "fornecedor" })).status, 403);
  checa(`${papel} não exclui: 403`, (await chamar(c, "DELETE", "/api/despesas/cadastros/categorias/1")).status, 403);
}

console.log("\ncadastros");
const d0 = await ler();
checa("categorias da semente", d0.categorias.length, 11);
const cat = (nome) => d0.categorias.find((c) => c.nome === nome).id;
const pj = (await A("POST", "/api/despesas/cadastros/favorecidos", { nome: "Ana Dev ME", tipo: "colaborador_pj", documento: "12.345.678/0001-90", pagamento: "PIX: CNPJ" })).corpo;
const cartao = (await A("POST", "/api/despesas/cadastros/favorecidos", { nome: "Cartão corporativo final 1234", tipo: "cartao" })).corpo;
checa("favorecidos criados", [pj.ok, cartao.ok], [true, true]);
checa("tipo de cadastro inexistente: 404", (await A("POST", "/api/despesas/cadastros/outros", {})).status, 404);
checa("corpo que não é objeto: 400", (await A("POST", "/api/despesas/cadastros/favorecidos", [1])).status, 400);
checa("categoria com nome repetido: 409", (await A("POST", "/api/despesas/cadastros/categorias", { nome: "advisors", grupo: "pessoal" })).status, 409);
const nova = (await A("POST", "/api/despesas/cadastros/categorias", { nome: "Treinamento", grupo: "operacional" })).corpo;
checa("categoria nunca usada sai", (await A("DELETE", `/api/despesas/cadastros/categorias/${nova.id}`)).status, 200);
checa("recorrência com favorecido inexistente: 400", (await A("POST", "/api/despesas/cadastros/recorrencias",
  { favorecidoId: 9999, categoriaId: cat("Colaboradores PJ"), valorCentavos: 1, diaVencimento: 5, forma: "pix", inicio: "2026-10" })).status, 400);
checa("recorrência com produto inexistente: 400", (await A("POST", "/api/despesas/cadastros/recorrencias",
  { favorecidoId: pj.id, categoriaId: cat("Colaboradores PJ"), area: "nao-existe", valorCentavos: 1, diaVencimento: 5, forma: "pix", inicio: "2026-10" })).status, 400);
const rec = (await A("POST", "/api/despesas/cadastros/recorrencias",
  { favorecidoId: pj.id, categoriaId: cat("Colaboradores PJ"), descricao: "Engenharia", valorCentavos: 1500000, diaVencimento: 5, venceMesSeguinte: true, forma: "pix", inicio: "2026-10" })).corpo;
checa("recorrência criada", rec.ok, true);

console.log("\nlançamento de recorrência");
const lanc = { competencia: "2026-11", categoriaId: cat("Colaboradores PJ"), valorCentavos: 1550000, vencimento: "2026-12-05", forma: "pix", documento: "NF 152", descricao: "Engenharia" };
checa("fora da vigência: 400", (await A("POST", "/api/despesas", { ...lanc, recorrenciaId: rec.id, competencia: "2026-09" })).status, 400);
const p1 = await A("POST", "/api/despesas", { ...lanc, recorrenciaId: rec.id, favorecidoId: cartao.id });
checa("lança e devolve a referência", [p1.status, /^P-\d{4}$/.test(p1.corpo.ref)], [200, true]);
const d1 = await ler();
const conta1 = d1.despesas.find((d) => d.ref === p1.corpo.ref);
checa("o favorecido é o da recorrência, não o do corpo", [conta1.favorecidoId, conta1.favorecido], [pj.id, "Ana Dev ME"]);
checa("gravou valor, vencimento, documento e situação", [conta1.valorCentavos, conta1.vencimento, conta1.documento, conta1.status, conta1.recorrenciaId], [1550000, "2026-12-05", "NF 152", "aberta", rec.id]);
checa("mesma competência duas vezes: 409", (await A("POST", "/api/despesas", { ...lanc, recorrenciaId: rec.id })).status, 409);
checa("recorrência com conta não se exclui: 409", (await A("DELETE", `/api/despesas/cadastros/recorrencias/${rec.id}`)).status, 409);
checa("favorecido com conta não se exclui: 409", (await A("DELETE", `/api/despesas/cadastros/favorecidos/${pj.id}`)).status, 409);
checa("categoria em uso não se exclui: 409", (await A("DELETE", `/api/despesas/cadastros/categorias/${cat("Colaboradores PJ")}`)).status, 409);

console.log("\nfatura do cartão com itens");
const p2 = await A("POST", "/api/despesas", { favorecidoId: cartao.id, competencia: "2026-11", descricao: "Fatura do cartão", vencimento: "2026-11-25", forma: "boleto", valorCentavos: 1,
  itens: [{ data: "2026-11-02", descricao: "AWS", categoriaId: cat("Infraestrutura de nuvem e IA"), valorCentavos: 60000 }, { descricao: "Notion", categoriaId: cat("Software e assinaturas"), valorCentavos: 30000 }] });
const conta2 = (await ler()).despesas.find((d) => d.ref === p2.corpo.ref);
checa("valor é a soma dos itens e a conta fica sem categoria", [conta2.valorCentavos, conta2.categoriaId, conta2.itens.map((i) => [i.descricao, i.valorCentavos, i.data])],
  [90000, null, [["AWS", 60000, "2026-11-02"], ["Notion", 30000, null]]]);
checa("item com categoria inexistente: 400", (await A("POST", "/api/despesas", { favorecidoId: cartao.id, competencia: "2026-11", vencimento: "2026-11-25", forma: "boleto",
  itens: [{ descricao: "X", categoriaId: 9999, valorCentavos: 1 }] })).status, 400);
checa("conta simples sem categoria: 400", (await A("POST", "/api/despesas", { favorecidoId: cartao.id, competencia: "2026-11", vencimento: "2026-11-25", forma: "boleto", valorCentavos: 100 })).status, 400);

console.log("\nações");
const acao = (id, corpo) => A("PATCH", `/api/despesas/${id}`, corpo);
checa("conta inexistente: 404", (await acao(99999, { acao: "pagar", pagoEm: "2026-12-05", valorPagoCentavos: 1 })).status, 404);
checa("ação inventada: 400", (await acao(conta1.id, { acao: "apagar" })).status, 400);
checa("pagar sem data: 400", (await acao(conta1.id, { acao: "pagar", valorPagoCentavos: 1 })).status, 400);
checa("estornar o que não foi pago: 409", (await acao(conta1.id, { acao: "estornar" })).status, 409);
checa("paga", (await acao(conta1.id, { acao: "pagar", pagoEm: "2026-12-04", valorPagoCentavos: 1550000 })).status, 200);
let c1 = (await ler()).despesas.find((d) => d.id === conta1.id);
checa("ficou paga, com data e valor", [c1.status, c1.pagoEm, c1.valorPagoCentavos], ["paga", "2026-12-04", 1550000]);
checa("pagar de novo: 409", (await acao(conta1.id, { acao: "pagar", pagoEm: "2026-12-04", valorPagoCentavos: 1 })).status, 409);
checa("corrigir paga: 409", (await acao(conta1.id, { acao: "editar", ...lanc })).status, 409);
checa("cancelar paga: 409", (await acao(conta1.id, { acao: "cancelar", motivo: "x" })).status, 409);
checa("estorna", (await acao(conta1.id, { acao: "estornar" })).status, 200);
checa("corrige (valor e vencimento)", (await acao(conta1.id, { acao: "editar", ...lanc, competencia: "2027-01", favorecidoId: cartao.id, valorCentavos: 1600000, vencimento: "2026-12-10" })).status, 200);
c1 = (await ler()).despesas.find((d) => d.id === conta1.id);
checa("conta de recorrência não troca de mês nem de favorecido", [c1.status, c1.valorCentavos, c1.vencimento, c1.competencia, c1.favorecidoId, c1.pagoEm], ["aberta", 1600000, "2026-12-10", "2026-11", pj.id, null]);
checa("corrige os itens do cartão", (await acao(conta2.id, { acao: "editar", favorecidoId: cartao.id, competencia: "2026-11", descricao: "Fatura do cartão", vencimento: "2026-11-25", forma: "boleto",
  itens: [{ descricao: "AWS", categoriaId: cat("Infraestrutura de nuvem e IA"), valorCentavos: 70000 }] })).status, 200);
const c2 = (await ler()).despesas.find((d) => d.id === conta2.id);
checa("itens substituídos e total refeito", [c2.valorCentavos, c2.itens.length], [70000, 1]);
checa("cancelar sem motivo: 400", (await acao(conta1.id, { acao: "cancelar", motivo: "  " })).status, 400);
checa("cancela", (await acao(conta1.id, { acao: "cancelar", motivo: "Nota veio errada" })).status, 200);
checa("cancelar de novo: 409", (await acao(conta1.id, { acao: "cancelar", motivo: "x" })).status, 409);
const p3 = await A("POST", "/api/despesas", { ...lanc, recorrenciaId: rec.id });
checa("depois de cancelada, a competência pode ser relançada", p3.status, 200);

console.log("\ncadastros em uso");
checa("desativa o favorecido", (await A("PATCH", `/api/despesas/cadastros/favorecidos/${pj.id}`, { nome: "Ana Dev LTDA", tipo: "colaborador_pj", ativo: false })).status, 200);
const d9 = await ler();
checa("renomear não reescreve a conta lançada", [d9.favorecidos.find((f) => f.id === pj.id).nome, d9.favorecidos.find((f) => f.id === pj.id).ativo, d9.despesas.find((d) => d.id === conta1.id).favorecido],
  ["Ana Dev LTDA", false, "Ana Dev ME"]);
checa("encerra a recorrência pelo fim", (await A("PATCH", `/api/despesas/cadastros/recorrencias/${rec.id}`,
  { favorecidoId: pj.id, categoriaId: cat("Colaboradores PJ"), valorCentavos: 1500000, diaVencimento: 5, venceMesSeguinte: true, forma: "pix", inicio: "2026-10", fim: "2026-12" })).status, 200);
checa("depois do fim não lança: 400", (await A("POST", "/api/despesas", { ...lanc, recorrenciaId: rec.id, competencia: "2027-01" })).status, 400);

console.log("\nauditoria");
const logs = await sql`SELECT entidade, texto, valor_anterior AS de, valor_novo AS para FROM audit_log WHERE entidade ~ '^(P|CAT|FAV|REC)-' ORDER BY id`;
const de = (ref) => logs.filter((l) => l.entidade === ref).map((l) => [l.de, l.para]);
checa("cada ação da conta deixou a sua linha", de(p1.corpo.ref), [[null, "aberta"], ["aberta", "paga"], ["paga", "aberta"], [null, null], ["aberta", "cancelada"]]);
checa("o lançamento diz valor, vencimento e documento", logs.find((l) => l.entidade === p1.corpo.ref).texto.replace(/\u00a0/g, " "),
  `Lançou a conta a pagar ${p1.corpo.ref} de Ana Dev ME (Engenharia), competência 11/2026: R$ 15.500,00, vence 05/12/2026, PIX, documento NF 152`);
checa("cadastros auditados", [logs.some((l) => l.entidade === `FAV-${pj.id}`), logs.some((l) => l.entidade === `REC-${rec.id}`), logs.some((l) => l.entidade === `CAT-${nova.id}` && l.texto.startsWith("Excluiu"))], [true, true, true]);
// O histórico de uma conta mora no Changelog (só admin), como o das faturas: a rota de
// histórico por registro é a dos cards (C- e T-) e não conhece P-.
const [gestor] = await sql`SELECT 1 AS ok FROM users WHERE papel = 'gestor' AND ativo LIMIT 1`;
if (gestor) {
  const g = await sessaoDe("gestor");
  const estado = (await chamar(g, "GET", "/api/state")).corpo;
  checa("gestor carrega o painel", Array.isArray(estado?.logs), true);
  checa("gestor não vê despesa no log do painel", estado.logs.some((l) => /^(P|CAT|FAV|REC)-/.test(l.entidade ?? "") || /conta a pagar|favorecido/i.test(l.texto ?? "")), false);
  checa("gestor não lê o histórico da conta: 404", (await chamar(g, "GET", `/api/logs/${p1.corpo.ref}`)).status, 404);
}
const painel = (await chamar(admin, "GET", "/api/state")).corpo;
checa("admin vê as despesas no log do painel", painel.logs.some((l) => l.entidade === p1.corpo.ref), true);
const changelog = (await chamar(admin, "GET", "/api/logs")).corpo;
checa("admin vê as 5 linhas da conta no changelog", changelog.logs.filter((l) => l.entidade === p1.corpo.ref).length, 5);

console.log(`\n${ok} passaram, ${falhou} falharam`);
await sql.end();
if (falhou) process.exit(1);
