// Funções puras do card do kanban comercial (v4). Sem banco.
//   node --experimental-strip-types scripts/verificar-card.mjs
import {
  diasEntre, diaMes, etiquetaPrazo, hojeISO, prazoDoPasso, prazoRelativo, iniciaisDoNome, rotuloModulos, separarDataDaSituacao, vizinhosNoFunil,
} from "../lib/domain.ts";

let ok = 0;
let falhou = 0;
function checa(descricao, obtido, esperado) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ✓ ${descricao}`); }
  else { falhou++; console.log(`  ✗ ${descricao}\n      deu      ${a}\n      esperava ${b}`); }
}

const HOJE = "2026-11-10";

console.log("\n1. prazo");
checa("vencido", etiquetaPrazo("contrato", "2026-10-23", HOJE), { texto: "Venceu 23/10 · há 18 dias", tom: "erro" });
checa("vencido ontem (singular)", etiquetaPrazo("proposta", "2026-11-09", HOJE).texto, "Venceu 09/11 · há 1 dia");
checa("hoje é próximo (warning)", etiquetaPrazo("proposta", HOJE, HOJE), { texto: "Prazo 10/11 · hoje", tom: "warning" });
checa("em 7 dias ainda é warning", etiquetaPrazo("proposta", "2026-11-17", HOJE).tom, "warning");
checa("em 14 dias é sucesso", etiquetaPrazo("proposta", "2026-11-24", HOJE), { texto: "Prazo 24/11 · em 14 dias", tom: "sucesso" });
checa("amanhã (singular)", etiquetaPrazo("proposta", "2026-11-11", HOJE).texto, "Prazo 11/11 · em 1 dia");
checa("curto vencido", etiquetaPrazo("contrato", "2026-10-23", HOJE, true).texto, "23/10 (−18d)");
checa("curto futuro", etiquetaPrazo("contrato", "2026-11-24", HOJE, true).texto, "24/11 (+14d)");
checa("sem data no funil aberto", etiquetaPrazo("proposta", null, HOJE), { texto: "Sem prazo", tom: "neutro" });
checa("ganho com data é neutro", etiquetaPrazo("ganho", "2026-10-01", HOJE), { texto: "Prazo 01/10", tom: "neutro" });
checa("lost sem data: nada", etiquetaPrazo("lost", null, HOJE), null);
checa("passo vencido", prazoDoPasso("contrato", "2026-10-27", HOJE), { texto: "27/10 (−14d)", tom: "erro" });
checa("passo a vencer", prazoDoPasso("proposta", "2026-11-26", HOJE), { texto: "26/11 (+16d)", tom: "sucesso" });
checa("passo próximo", prazoDoPasso("proposta", "2026-11-12", HOJE), { texto: "12/11 (+2d)", tom: "warning" });
checa("passo hoje", prazoDoPasso("proposta", HOJE, HOJE), { texto: "10/11 (hoje)", tom: "warning" });
checa("passo sem data", prazoDoPasso("proposta", null, HOJE), { texto: "Sem prazo", tom: "neutro" });
checa("passo fora do funil", prazoDoPasso("ganho", "2026-10-01", HOJE), { texto: "01/10", tom: "neutro" });
checa("passo lost sem data", prazoDoPasso("lost", null, HOJE), null);
checa("atividade em aberto vencida", prazoRelativo("2026-11-03", HOJE, true), { texto: "03/11 (−7d)", tom: "erro" });
checa("atividade concluída: data neutra", prazoRelativo("2026-11-03", HOJE, false), { texto: "03/11", tom: "neutro" });
checa("atividade concluída sem data: nada", prazoRelativo(null, HOJE, false), null);
checa("diasEntre atravessa mês", diasEntre("2026-10-31", "2026-11-01"), 1);

console.log("\n2. data da situação");
checa("19/Out:", separarDataDaSituacao("19/Out: validação técnica realizada", HOJE), { data: "2026-10-19", texto: "Validação técnica realizada" });
checa("21/out - minúsculo e hífen", separarDataDaSituacao("21/out - Nebuya informou", HOJE), { data: "2026-10-21", texto: "Nebuya informou" });
checa("numérico 19/10:", separarDataDaSituacao("19/10: ok", HOJE).data, "2026-10-19");
checa("com ano", separarDataDaSituacao("05/03/2025: antigo", HOJE).data, "2025-03-05");
checa("mês futuro sem ano vai para o ano anterior", separarDataDaSituacao("15/Dez: x", HOJE).data, "2025-12-15");
checa("sem prefixo: intacto", separarDataDaSituacao("Contato frio, sem resposta.", HOJE), { data: null, texto: "Contato frio, sem resposta." });
checa("data no fim não é prefixo", separarDataDaSituacao("Sem interesse - 28.09", HOJE).data, null);
checa("mês inválido não vale", separarDataDaSituacao("19/Xyz: x", HOJE).data, null);
checa("rótulo 19/OUT", diaMes("2026-10-19"), "19/OUT");

console.log("\n3. iniciais, módulos, funil");
checa("duas palavras", iniciaisDoNome("Bruno Santo"), "BS");
checa("uma palavra", iniciaisDoNome("Bruno"), "BR");
checa("três palavras: primeira e última", iniciaisDoNome("Clara B. Bastos"), "CB");
checa("1 módulo", rotuloModulos(1), "1 módulo");
checa("3 módulos", rotuloModulos(3), "3 módulos");
checa("início do funil", vizinhosNoFunil("prospeccao"), { anterior: null, proxima: "primeira_reuniao" });
checa("fim do funil", vizinhosNoFunil("ganho"), { anterior: "contrato", proxima: null });
checa("on hold: nenhuma", vizinhosNoFunil("on_hold"), { anterior: null, proxima: null });
checa("hojeISO usa São Paulo (02h UTC ainda é o dia anterior)", hojeISO(new Date("2026-11-10T02:00:00Z")), "2026-11-09");

console.log(`\n${ok} passaram, ${falhou} falharam`);
if (falhou) process.exit(1);
