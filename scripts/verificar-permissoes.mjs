// Teste de integração da permissão por área, contra o banco de DESENVOLVIMENTO.
//
// Cria sessões direto na tabela `sessions` para cada usuário semeado — assim dá para agir
// como cada perfil sem depender das contas Google deles — e exercita a API pelo HTTP, sem
// passar pela interface. É o único jeito de provar que o recorte acontece no servidor: se a
// regra vivesse no front, todas as chamadas abaixo passariam.
//
//   npm run dev              (noutro terminal, com DATABASE_URL do projeto de dev)
//   node scripts/verificar-permissoes.mjs

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import postgres from "postgres";

const BASE = process.env.BASE ?? "http://localhost:3000";

for (const linha of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false });

let ok = 0;
let falhou = 0;
function checa(descricao, condicao, detalhe = "") {
  if (condicao) {
    console.log(`  ✓ ${descricao}`);
    ok++;
  } else {
    console.log(`  ✗ ${descricao}${detalhe ? ` — ${detalhe}` : ""}`);
    falhou++;
  }
}

/** Sessão real na tabela, como o login faria. */
async function sessaoDe(email) {
  const [u] = await sql`SELECT id, nome FROM users WHERE email = ${email}`;
  if (!u) throw new Error(`usuário ${email} não existe — a base foi semeada?`);
  const token = randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + 3600_000).toISOString();
  await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${u.id}, ${expira})`;
  return { token, id: u.id, nome: u.nome };
}

const req = (token, caminho, opts = {}) =>
  fetch(`${BASE}${caminho}`, {
    ...opts,
    headers: { Cookie: `session=${token}`, "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });

try {
  const andre = await sessaoDe("leme@getliff.ai");
  const marina = await sessaoDe("marina@getliff.ai");
  const rafael = await sessaoDe("rafael@getliff.ai");
  const clara = await sessaoDe("clara@getliff.ai");

  const estados = {};
  for (const [nome, s] of Object.entries({ andre, marina, rafael, clara })) {
    estados[nome] = await (await req(s.token, "/api/state")).json();
  }

  const areas = (e) => [...new Set(e.activities.map((a) => a.area))].sort();

  console.log("\n1. RECORTE NA LEITURA — cada um só recebe as áreas que pode ver\n");
  // Contra o banco, não contra um número fixo: o conjunto de verticais é aberto.
  const [{ c: totalAreas }] = await sql`SELECT COUNT(*)::int AS c FROM areas`;
  const comAtividade = await sql`SELECT DISTINCT area FROM activities`;
  checa(
    `André (admin) vê todas as áreas que têm atividade`,
    areas(estados.andre).length === comAtividade.length,
    `${areas(estados.andre).length} de ${comAtividade.length} (há ${totalAreas} áreas no total)`
  );
  checa(
    `e a permissão de admin cobre as ${totalAreas} áreas cadastradas`,
    Object.keys(estados.andre.perms).length === Number(totalAreas),
    `${Object.keys(estados.andre.perms).length} de ${totalAreas}`
  );
  checa(
    `Marina vê law-firms, corporate, public-sector, tax`,
    areas(estados.marina).join(",") === "corporate,law-firms,public-sector,tax",
    areas(estados.marina).join(",")
  );
  checa(
    `Rafael NÃO vê public-sector nem social`,
    !areas(estados.rafael).includes("public-sector") && !areas(estados.rafael).includes("social"),
    areas(estados.rafael).join(",")
  );
  checa(
    `Clara vê apenas public-sector e social`,
    areas(estados.clara).join(",") === "public-sector,social",
    areas(estados.clara).join(",")
  );
  checa(
    `matriz de permissões só vai para admin`,
    estados.andre.pessoas.some((p) => Object.keys(p.perms).length > 0) &&
      estados.marina.pessoas.every((p) => Object.keys(p.perms).length === 0)
  );

  // ids resolvidos pelo banco, não pelo que cada estado devolveu. ORDER BY para as rodadas
  // serem comparáveis entre si.
  const [aLaw] = await sql`SELECT id, ref, status FROM activities WHERE area='law-firms' ORDER BY id LIMIT 1`;
  const [aTax] = await sql`SELECT id, ref FROM activities WHERE area='tax' ORDER BY id LIMIT 1`;
  const [aPub] = await sql`SELECT id, ref FROM activities WHERE area='public-sector' ORDER BY id LIMIT 1`;
  const [dLaw] = await sql`SELECT id, ref, estagio FROM deals WHERE area='law-firms' ORDER BY id LIMIT 1`;

  // O teste escreve de verdade, então guarda o estado anterior para devolver no fim. Sem
  // isso a rodada seguinte começa de um mundo diferente — foi assim que a checagem da Clara
  // quebrou na segunda execução, depois de o próprio teste ter concedido `tax` a ela.
  const restaurar = {
    statusAtividade: aLaw.status,
    estagioDeal: dLaw.estagio,
    permClaraTax: (await sql`SELECT nivel FROM user_area_perms WHERE user_id=${clara.id} AND area='tax'`)[0]
      ?.nivel ?? null,
  };

  console.log("\n2. ESCRITA — permitida onde há edit, recusada onde não há\n");
  const novoStatus = aLaw.status === "concluido" ? "andamento" : "concluido";
  const r1 = await req(marina.token, `/api/activities/${aLaw.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: novoStatus }),
  });
  checa(`Marina EDITA atividade de law-firms → 200`, r1.status === 200, `veio ${r1.status}`);

  const r2 = await req(marina.token, `/api/activities/${aTax.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "concluido" }),
  });
  checa(`Marina só LÊ tax → 403 ao tentar escrever`, r2.status === 403, `veio ${r2.status}`);

  console.log("\n3. ÁREA INVISÍVEL — 404, não 403 (um 403 confirmaria que o id existe)\n");
  const r3 = await req(rafael.token, `/api/activities/${aPub.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "concluido" }),
  });
  checa(`Rafael, sem acesso a public-sector → 404`, r3.status === 404, `veio ${r3.status}`);

  const r4 = await req(clara.token, `/api/activities/${aPub.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "concluido" }),
  });
  checa(`Clara, que VÊ public-sector mas não edita → 403`, r4.status === 403, `veio ${r4.status}`);

  console.log("\n4. PIPELINE e ADMINISTRAÇÃO\n");
  // Coloca a oportunidade num estágio que tem para onde avançar. Sem isto o teste dependia
  // do histórico: uma vez em "ganho", o +1 não muda nada e a rota devolve 200 sem gravar
  // log — correto, mas fazia a checagem de auditoria falhar sem nada estar quebrado.
  await sql`UPDATE deals SET estagio = 'proposta' WHERE id = ${dLaw.id}`;
  const r5 = await req(marina.token, `/api/deals/${dLaw.id}`, {
    method: "PATCH",
    body: JSON.stringify({ direcao: 1 }),
  });
  checa(`Marina move oportunidade de law-firms → 200`, r5.status === 200, `veio ${r5.status}`);
  const [depoisMover] = await sql`SELECT estagio FROM deals WHERE id = ${dLaw.id}`;
  checa(`e o estágio avançou de fato`, depoisMover.estagio === "negociacao", depoisMover.estagio);

  const r6 = await req(marina.token, `/api/users/${clara.id}`, {
    method: "PATCH",
    body: JSON.stringify({ ciclarArea: "tax" }),
  });
  checa(`Marina (não admin) mexendo em permissão → 403`, r6.status === 403, `veio ${r6.status}`);

  const r7 = await req(andre.token, `/api/users/${clara.id}`, {
    method: "PATCH",
    body: JSON.stringify({ ciclarArea: "tax" }),
  });
  checa(`André (admin) altera permissão de Clara → 200`, r7.status === 200, `veio ${r7.status}`);

  const r8 = await req(andre.token, `/api/users/${andre.id}`, {
    method: "PATCH",
    body: JSON.stringify({ ativo: false }),
  });
  checa(`André não consegue desativar a si mesmo → 409`, r8.status === 409, `veio ${r8.status}`);

  console.log("\n5. CRIAÇÃO — a área vem do corpo, então é onde a checagem mais importa\n");
  const criados = { atividades: [], deals: [] };

  const c1 = await req(marina.token, "/api/activities", {
    method: "POST",
    body: JSON.stringify({ titulo: "[teste] atividade de Marina", area: "law-firms", prioridade: "alta" }),
  });
  const c1json = await c1.json();
  checa(`Marina cria em law-firms (edit) → 201`, c1.status === 201, `veio ${c1.status}`);
  if (c1json.id) criados.atividades.push(c1json.id);

  const c2 = await req(marina.token, "/api/activities", {
    method: "POST",
    body: JSON.stringify({ titulo: "[teste] não deveria existir", area: "tax" }),
  });
  checa(`Marina criando em tax (só lê) → 403`, c2.status === 403, `veio ${c2.status}`);

  const c3 = await req(marina.token, "/api/activities", {
    method: "POST",
    body: JSON.stringify({ titulo: "[teste] não deveria existir", area: "labs" }),
  });
  checa(`Marina criando em labs (sem acesso) → 403`, c3.status === 403, `veio ${c3.status}`);

  const c4 = await req(clara.token, "/api/activities", {
    method: "POST",
    body: JSON.stringify({ titulo: "[teste] não deveria existir", area: "social" }),
  });
  checa(`Clara, só leitura em social → 403`, c4.status === 403, `veio ${c4.status}`);

  const c5 = await req(marina.token, "/api/activities", {
    method: "POST",
    body: JSON.stringify({ titulo: "   ", area: "law-firms" }),
  });
  checa(`título em branco → 400`, c5.status === 400, `veio ${c5.status}`);

  const c6 = await req(marina.token, "/api/deals", {
    method: "POST",
    body: JSON.stringify({ conta: "[teste] Conta", area: "corporate", estagio: "lead", valorReais: 1000 }),
  });
  const c6json = await c6.json();
  checa(`Marina cria oportunidade em corporate → 201`, c6.status === 201, `veio ${c6.status}`);
  if (c6json.id) criados.deals.push(c6json.id);

  console.log("\n5b. TROCA DE ÁREA — exige permissão nas duas pontas\n");
  const areaOriginal = aLaw.area ?? "law-firms";
  const m1 = await req(marina.token, `/api/activities/${aLaw.id}`, {
    method: "PATCH",
    body: JSON.stringify({ area: "corporate" }),
  });
  checa(`law-firms → corporate, Marina edita as duas → 200`, m1.status === 200, `veio ${m1.status}`);

  const m2 = await req(marina.token, `/api/activities/${aLaw.id}`, {
    method: "PATCH",
    body: JSON.stringify({ area: "tax" }),
  });
  checa(`→ tax, onde Marina só lê → 403`, m2.status === 403, `veio ${m2.status}`);

  const m3 = await req(marina.token, `/api/activities/${aLaw.id}`, {
    method: "PATCH",
    body: JSON.stringify({ area: "labs" }),
  });
  checa(`→ labs, que Marina nem enxerga → 403`, m3.status === 403, `veio ${m3.status}`);

  // A auditoria da mudança fica na área de DESTINO, senão o registro sumiria para quem
  // enxerga a área nova.
  const logArea = await sql`
    SELECT area FROM audit_log WHERE entidade = ${aLaw.ref} AND campo = 'area' ORDER BY id DESC LIMIT 1
  `;
  checa(`o log da troca fica na área de destino`, logArea[0]?.area === "corporate", logArea[0]?.area ?? "nenhum");
  await sql`UPDATE activities SET area = ${areaOriginal} WHERE id = ${aLaw.id}`;

  console.log("\n5c. EDIÇÃO COMPLETA DA OPORTUNIDADE\n");
  const dOrig = (await sql`SELECT conta, escopo, estagio, valor_centavos, proximo_passo FROM deals WHERE id = ${dLaw.id}`)[0];
  const e1 = await req(marina.token, `/api/deals/${dLaw.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      conta: "[teste] Conta Editada",
      escopo: "[teste] escopo",
      valorReais: 123000,
      proximoPasso: "[teste] passo",
      estagio: "qualificacao",
    }),
  });
  const e1json = await e1.json();
  checa(`cinco campos de uma vez → 200 com 5 mudanças`, e1.status === 200 && e1json.mudancas === 5, JSON.stringify(e1json));

  const e2 = await req(marina.token, `/api/deals/${dLaw.id}`, {
    method: "PATCH",
    body: JSON.stringify({ valorReais: -1 }),
  });
  checa(`valor negativo → 400`, e2.status === 400, `veio ${e2.status}`);

  const e3 = await req(marina.token, `/api/deals/${dLaw.id}`, {
    method: "PATCH",
    body: JSON.stringify({ conta: "   " }),
  });
  checa(`conta em branco → 400`, e3.status === 400, `veio ${e3.status}`);

  const e4 = await req(marina.token, `/api/deals/${dLaw.id}`, {
    method: "PATCH",
    body: JSON.stringify({ area: "labs" }),
  });
  checa(`mover oportunidade para labs → 403`, e4.status === 403, `veio ${e4.status}`);

  await sql`
    UPDATE deals SET conta = ${dOrig.conta}, escopo = ${dOrig.escopo}, estagio = ${dOrig.estagio},
      valor_centavos = ${dOrig.valor_centavos}, proximo_passo = ${dOrig.proximo_passo}
    WHERE id = ${dLaw.id}
  `;

  console.log("\n5d. TÍTULO DA ATIVIDADE E HISTÓRICO DO REGISTRO\n");
  const tituloOriginal = (await sql`SELECT titulo FROM activities WHERE id = ${aLaw.id}`)[0].titulo;
  const t1 = await req(marina.token, `/api/activities/${aLaw.id}`, {
    method: "PATCH",
    body: JSON.stringify({ titulo: "[teste] renomeada" }),
  });
  checa(`renomear a atividade → 200`, t1.status === 200, `veio ${t1.status}`);

  const t2 = await req(marina.token, `/api/activities/${aLaw.id}`, {
    method: "PATCH",
    body: JSON.stringify({ titulo: "   " }),
  });
  checa(`título em branco → 400`, t2.status === 400, `veio ${t2.status}`);
  await sql`UPDATE activities SET titulo = ${tituloOriginal} WHERE id = ${aLaw.id}`;

  const h1 = await req(marina.token, `/api/logs/${aLaw.ref}`);
  const h1json = await h1.json();
  checa(
    `histórico de ${aLaw.ref} para quem enxerga → 200 com entradas`,
    h1.status === 200 && h1json.entradas.length > 0,
    `${h1.status}, ${h1json.entradas?.length ?? 0} entradas`
  );
  checa(
    `e cada entrada traz autor, campo e o par anterior/novo`,
    h1json.entradas.some((e) => e.autor && e.campo && e.para !== undefined)
  );

  const h2 = await req(rafael.token, `/api/logs/${aPub.ref}`);
  checa(`histórico de área invisível → 404, não 403`, h2.status === 404, `veio ${h2.status}`);

  const h3 = await req(marina.token, "/api/logs/NAO-EXISTE-999");
  checa(`histórico de referência inexistente → 404`, h3.status === 404, `veio ${h3.status}`);

  console.log("\n6. CADASTRO DE ÁREA — configuração, restrita a admin\n");
  const nomeOriginal = (await sql`SELECT label, short FROM areas WHERE id='tax'`)[0];
  const n1 = await req(andre.token, "/api/areas/tax", {
    method: "PATCH",
    body: JSON.stringify({ label: "[teste] Tributário", short: "TRIB" }),
  });
  const n1json = await n1.json();
  checa(`admin renomeia a vertical → 200 com 2 mudanças`, n1.status === 200 && n1json.mudancas === 2, JSON.stringify(n1json));

  const n2 = await req(marina.token, "/api/areas/tax", {
    method: "PATCH",
    body: JSON.stringify({ label: "Não deveria" }),
  });
  checa(`não-admin renomeando → 403`, n2.status === 403, `veio ${n2.status}`);
  await sql`UPDATE areas SET label = ${nomeOriginal.label}, short = ${nomeOriginal.short} WHERE id = 'tax'`;

  const corOriginal = (await sql`SELECT cor FROM areas WHERE id='tax'`)[0].cor;

  const a1 = await req(marina.token, "/api/areas/tax", { method: "PATCH", body: JSON.stringify({ cor: "#123456" }) });
  checa(`Marina (não admin) mudando cor → 403`, a1.status === 403, `veio ${a1.status}`);

  const a2 = await req(andre.token, "/api/areas/tax", { method: "PATCH", body: JSON.stringify({ cor: "#123456" }) });
  checa(`André (admin) muda cor → 200`, a2.status === 200, `veio ${a2.status}`);

  const a3 = await req(andre.token, "/api/areas/tax", { method: "PATCH", body: JSON.stringify({ cor: "red" }) });
  checa(`cor fora do formato HEX → 400`, a3.status === 400, `veio ${a3.status}`);

  const a4 = await req(andre.token, "/api/areas/tax", {
    method: "PATCH",
    body: JSON.stringify({ cor: "#fff;}body{display:none" }),
  });
  checa(`tentativa de injeção de CSS na cor → 400`, a4.status === 400, `veio ${a4.status}`);

  await sql`UPDATE areas SET cor = ${corOriginal} WHERE id = 'tax'`;

  console.log("\n7. AUDITORIA — cada escrita virou registro com autor e valor anterior/novo\n");
  // Filtra pelas entidades que ESTA rodada tocou. Antes isto era um LIMIT sobre as últimas
  // linhas, e bastou o teste passar a criar registros para as escritas anteriores saírem da
  // janela e a asserção falhar sem nada ter quebrado.
  const alvos = [aLaw.ref, dLaw.ref, `U-${clara.id}`];
  const logs = await sql`
    SELECT l.entidade, l.campo, l.valor_anterior, l.valor_novo, u.nome AS autor
    FROM audit_log l LEFT JOIN users u ON u.id = l.actor_user_id
    WHERE l.campo IS NOT NULL AND l.entidade = ANY(${alvos})
    ORDER BY l.id DESC LIMIT 10
  `;
  // Três escritas passaram nesta rodada (status, estágio, permissão). A quarta tentativa —
  // o admin se desativando — levou 409 e, corretamente, não deixa rastro.
  checa(`há registros com campo e par anterior/novo`, logs.length >= 3, `${logs.length} encontrados`);
  checa(
    `as três escritas bem-sucedidas viraram registro`,
    ["status", "estagio", "permissao"].every((c) => logs.some((l) => l.campo === c)),
    logs.map((l) => l.campo).join(",")
  );
  checa(
    `a edição de Marina foi atribuída a ela`,
    logs.some((l) => l.entidade === aLaw.ref && l.autor === "Marina Duarte")
  );
  checa(
    `a mudança de permissão foi atribuída ao admin`,
    logs.some((l) => l.campo === "permissao" && l.autor === "André Leme")
  );
  for (const l of logs.slice(0, 5)) {
    console.log(`     ${l.autor} · ${l.entidade} · ${l.campo}: ${l.valor_anterior} → ${l.valor_novo}`);
  }

  console.log("\n8. TENTATIVA RECUSADA NÃO SUJA O LOG\n");
  const suja = await sql`
    SELECT COUNT(*)::int AS c FROM audit_log WHERE entidade = ${aTax.ref}
  `;
  checa(`a escrita que Marina levou 403 não gerou registro`, suja[0].c === 0, `${suja[0].c} registros`);

  // Devolve o mundo ao estado anterior. O audit_log fica como está: ele é append-only por
  // desenho, e apagar linha dele aqui contradiria a própria coisa que o teste verifica.
  for (const id of criados.atividades) await sql`DELETE FROM activities WHERE id = ${id}`;
  for (const id of criados.deals) await sql`DELETE FROM deals WHERE id = ${id}`;
  await sql`UPDATE activities SET status = ${restaurar.statusAtividade} WHERE id = ${aLaw.id}`;
  await sql`UPDATE deals SET estagio = ${restaurar.estagioDeal} WHERE id = ${dLaw.id}`;
  if (restaurar.permClaraTax === null) {
    await sql`DELETE FROM user_area_perms WHERE user_id = ${clara.id} AND area = 'tax'`;
  } else {
    await sql`
      INSERT INTO user_area_perms (user_id, area, nivel) VALUES (${clara.id}, 'tax', ${restaurar.permClaraTax})
      ON CONFLICT (user_id, area) DO UPDATE SET nivel = EXCLUDED.nivel
    `;
  }
  await sql`DELETE FROM sessions WHERE token IN ${sql([andre.token, marina.token, rafael.token, clara.token])}`;
  console.log("\n(estado restaurado — o harness é repetível)");

  console.log(`\n${falhou === 0 ? "✓" : "✗"} ${ok} passaram, ${falhou} falharam\n`);
  process.exitCode = falhou === 0 ? 0 : 1;
} catch (e) {
  console.error("\n✗ erro no harness:", e?.message ?? e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
