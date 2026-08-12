// Move para o estágio `validacao` as oportunidades que já estavam no sistema descritas por
// NDA, POC ou transferência de dados. Elas foram importadas quando o funil ainda não tinha
// essa casa e caíram em Proposta ou Negociação, adiantando o pipeline sobre trabalho que era
// técnico e jurídico, não comercial.
//
//   node scripts/reclassificar-validacao.mjs           # mostra o que faria, não grava
//   node scripts/reclassificar-validacao.mjs --aplicar # grava
//
// Roda em cima do DATABASE_URL do .env.local. NÃO aponte para produção sem querer: o padrão
// é seco justamente porque um UPDATE de estágio em massa não tem desfazer barato.

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

// A mesma regra da importação (app/components/ImportarPlanilha.tsx), incluindo o `tra\w*fer`
// que tolera o "tranferência" da planilha original.
const VALIDACAO = /\bnda\b|\bpoc\b|tra\w*fer[êe]ncia d[eo]s? dados|refinamento de escopo/;

// Só reclassifica quem está adiante da validação por engano. Um card em lead ou qualificação
// pode mencionar POC como plano futuro ("agendar a entrega da POC") e não deve avançar.
const ORIGENS = ["proposta", "negociacao"];

const aplicar = process.argv.includes("--aplicar");

carregarEnvLocal();
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL não definida. Configure o .env.local.");
  process.exit(1);
}
console.log(`Banco: ${new URL(url).hostname}  ·  modo: ${aplicar ? "APLICAR" : "simulação"}\n`);

const sql = postgres(url, { ssl: "require", prepare: false });

try {
  const candidatos = await sql`
    SELECT id, ref, conta, area, estagio, situacao
    FROM deals
    WHERE estagio = ANY(${ORIGENS})
    ORDER BY id
  `;

  const alvos = candidatos.filter((d) => VALIDACAO.test((d.situacao || "").toLowerCase()));

  if (!alvos.length) {
    console.log(`Nada a fazer: ${candidatos.length} card(s) em ${ORIGENS.join("/")}, nenhum casa NDA/POC.`);
  } else {
    for (const d of alvos) {
      console.log(`${d.ref}  ${d.conta}`);
      console.log(`   ${d.estagio} → validacao`);
      console.log(`   situação: ${(d.situacao || "").slice(0, 110)}\n`);
    }

    if (!aplicar) {
      console.log(`${alvos.length} card(s) seriam movidos. Rode com --aplicar para gravar.`);
    } else {
      // Uma transação só: ou o funil inteiro fica coerente, ou nada muda.
      await sql.begin(async (tx) => {
        for (const d of alvos) {
          await tx`UPDATE deals SET estagio = 'validacao', atualizado_em = now() WHERE id = ${d.id}`;
          // Sem ator: não foi ninguém do time que mexeu, foi a mudança do funil. Deixar o
          // campo nulo é mais honesto do que atribuir a alteração a um usuário qualquer.
          await tx`
            INSERT INTO audit_log (actor_user_id, area, entidade, campo, valor_anterior, valor_novo, texto)
            VALUES (NULL, ${d.area}, ${d.ref}, 'estagio', ${d.estagio}, 'validacao',
                    ${`Reclassificou ${d.conta} para Validação (NDA/POC deixou de significar proposta)`})
          `;
        }
      });
      console.log(`${alvos.length} card(s) movidos para Validação, com registro na auditoria.`);
    }
  }
} finally {
  await sql.end();
}
