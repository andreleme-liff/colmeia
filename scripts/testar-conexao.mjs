// Testa a DATABASE_URL sem passar por deploy. Lê do .env.local (ou do ambiente) e diz
// apenas se conectou e o que o banco respondeu — nunca imprime a connection string.
//
//   node scripts/testar-conexao.mjs

import { readFileSync } from "node:fs";
import postgres from "postgres";

function carregarEnvLocal() {
  try {
    for (const linha of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* sem .env.local — usa só o que já estiver no ambiente */
  }
}

const DIAGNOSTICO = {
  "28P01":
    "Senha recusada.\n" +
    "   • No pooler da Supabase o usuário TEM de ser `postgres.<project-ref>`, não `postgres` puro.\n" +
    "   • Se a senha tem @ / : # ?, precisa vir percent-encoded, senão a URI é lida errado.\n" +
    "   • Na dúvida: Settings → Database → Reset database password, e copie a URI inteira\n" +
    "     da aba 'Transaction pooler' trocando só [YOUR-PASSWORD].",
  "3D000": "O banco do final da URI não existe. No Supabase ele se chama `postgres`.",
  ENOTFOUND: "Host não resolve. Confira se copiou o host do pooler (…pooler.supabase.com).",
  ETIMEDOUT: "Conectou em lugar nenhum. Porta errada? O pooler é 6543; a direta, 5432.",
  ECONNREFUSED: "Porta fechada nesse host. O pooler é 6543.",
};

carregarEnvLocal();

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("✗ DATABASE_URL não encontrada no .env.local nem no ambiente.");
  process.exit(1);
}

// Só o formato, nunca as credenciais.
try {
  const u = new URL(url);
  const usuario = decodeURIComponent(u.username);
  console.log(`  host    : ${u.hostname}`);
  console.log(`  porta   : ${u.port || "(padrão)"}`);
  console.log(`  banco   : ${u.pathname.replace(/^\//, "") || "(vazio)"}`);
  console.log(`  usuário : ${usuario}`);
  if (u.hostname.includes("pooler.supabase.com") && !usuario.includes(".")) {
    console.log("  ⚠ host é o pooler mas o usuário não tem `.<project-ref>` — é a causa mais comum do 28P01.");
  }
  console.log("");
} catch {
  console.log("  ⚠ a URI não faz parse. Caractere especial na senha sem percent-encoding?\n");
}

const sql = postgres(url, { ssl: "require", prepare: false, connect_timeout: 15 });
try {
  const [linha] = await sql`SELECT current_user, current_database() AS banco, version() AS versao`;
  console.log("✓ conectou");
  console.log(`  current_user : ${linha.current_user}`);
  console.log(`  database     : ${linha.banco}`);
  console.log(`  servidor     : ${String(linha.versao).split(" on ")[0]}`);

  const t0 = performance.now();
  for (let i = 0; i < 5; i++) await sql`SELECT 1`;
  console.log(`  latência     : ${((performance.now() - t0) / 5).toFixed(0)}ms por consulta`);

  const tabelas = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `;
  console.log(`  tabelas      : ${tabelas.length ? tabelas.map((t) => t.table_name).join(", ") : "(nenhuma — migração ainda não rodou)"}`);
} catch (e) {
  const codigo = e?.code ?? e?.errno ?? "";
  console.error(`✗ falhou${codigo ? ` (${codigo})` : ""}: ${e?.message ?? e}`);
  if (DIAGNOSTICO[codigo]) console.error(`\n → ${DIAGNOSTICO[codigo]}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
