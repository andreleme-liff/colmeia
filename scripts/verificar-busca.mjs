// Busca por termo: acento, vários termos, ordem. Sem banco. `node scripts/verificar-busca.mjs`
import { aplicarBusca, normalizarBusca, prepararBusca, pontuarBusca } from "../lib/domain.ts";

let ok = 0, falhas = 0;
const checa = (nome, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) { ok++; console.log(`  ✓ ${nome}`); } else { falhas++; console.log(`  ✗ ${nome}\n      esperado ${b}\n      veio     ${a}`); }
};

checa("normaliza acento e caixa", normalizarBusca("  Ação   FISCAL São "), "acao fiscal sao");
checa("vazio é sem busca", prepararBusca("   "), null);
checa("termos sem repetição", prepararBusca("tax tax ambev").termos, ["tax", "ambev"]);

const b = prepararBusca("reunião contrato");
checa("ignora acento no registro", pontuarBusca(prepararBusca("reuniao"), ["Reunião com o cliente"]) > 0, true);
checa("ignora acento na busca", pontuarBusca(prepararBusca("acao"), ["ação judicial"]) > 0, true);
checa("nenhum termo: 0", pontuarBusca(b, ["proposta enviada"]), 0);
checa("só um termo ainda casa", pontuarBusca(b, ["contrato assinado"]) > 0, true);
checa("frase vale mais que termos soltos",
  pontuarBusca(b, ["reunião contrato na sexta"]) > pontuarBusca(b, ["contrato e depois reunião"]), true);
checa("ambos soltos valem mais que um só",
  pontuarBusca(b, ["contrato e depois reunião"]) > pontuarBusca(b, ["só reunião"]), true);
checa("frase não atravessa campos", pontuarBusca(b, ["fazer reunião", "contrato"]) < 1000, true);

const lista = [
  { id: 1, t: "só contrato" },
  { id: 2, t: "contrato antes da reunião" },
  { id: 3, t: "nada a ver" },
  { id: 4, t: "Reunião contrato" },
  { id: 5, t: "outra reuniao" },
];
checa("ordena: frase, ambos, um (empate na ordem original)",
  aplicarBusca(lista, b, (x) => [x.t]).map((x) => x.id), [4, 2, 1, 5]);
checa("sem busca devolve tudo, mesma ordem", aplicarBusca(lista, null, (x) => [x.t]).map((x) => x.id), [1, 2, 3, 4, 5]);

console.log(`\n${ok} passaram, ${falhas} falharam`);
if (falhas) process.exit(1);
