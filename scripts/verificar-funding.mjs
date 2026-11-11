// Funding AWS: consumo por conta, funding garantido, cobertura, sugestão da calculadora,
// validações. Sem banco. `node scripts/verificar-funding.mjs`
import {
  ARQUETIPOS_SEMENTE, cobertura, consumo, funding, lerArquetipo, lerCalculadora, lerEstimativa, lerLinha, lerPasta, lerPrograma, sugestaoDaCalculadora,
} from "../lib/funding.ts";

let ok = 0, falhas = 0;
const checa = (n, a, b) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x === y) { ok++; console.log("  ✓ " + n); } else { falhas++; console.log("  ✗ " + n + "\n      esperado " + y + "\n      veio     " + x); } };

const est = (o) => ({ id: 1, ref: "E-0001", conta: "X", dealId: null, arquetipoId: 1, regiao: "us-east-1", porte: "M",
  liffMensalCentavos: 11497, clienteMensalCentavos: 64502, iaMensalCentavos: 45500, iaPagaPor: "liff", inicio: "2026-12", duracaoMeses: 12, notas: "", linhas: [], ...o });
const linha = (o) => ({ id: 1, estimativaId: 1, programaId: "poc-credits", beneficiario: "cliente", valorCentavos: 100000, status: "aprovado", awsId: "", solicitadoEm: null, aprovadoEm: null, expiraEm: null, notas: "", ...o });

console.log("consumo");
const c = consumo(est({}));
checa("IA soma na conta que paga (LIFF)", c.mensal, { liff: 11497 + 45500, cliente: 64502 });
checa("total no período", c.total, (11497 + 45500 + 64502) * 12);
checa("IA paga pelo cliente", consumo(est({ iaPagaPor: "cliente" })).mensal.cliente, 64502 + 45500);

console.log("\nfunding e cobertura");
const e = est({ linhas: [linha({}), linha({ id: 2, status: "recebido", beneficiario: "liff", valorCentavos: 50000 }), linha({ id: 3, status: "solicitado", valorCentavos: 70000 }), linha({ id: 4, status: "negado", valorCentavos: 999 })] });
const f = funding(e);
checa("garantido = aprovado + recebido", f.garantido, 150000);
checa("em andamento = planejado + solicitado", f.emAndamento, 70000);
checa("garantido por beneficiário", [f.garantidoLiff, f.garantidoCliente], [50000, 100000]);
checa("cobertura", Math.round(cobertura(e) * 1000) / 1000, Math.round((150000 / ((11497 + 45500 + 64502) * 12)) * 1000) / 1000);
checa("sem consumo, sem cobertura", cobertura(est({ liffMensalCentavos: 0, clienteMensalCentavos: 0, iaMensalCentavos: 0 })), null);

console.log("\nsugestão da calculadora");
const celula = ARQUETIPOS_SEMENTE.find((a) => a.modelo === "hibrido");
const arq = { id: 1, nome: celula.nome, modelo: "hibrido", descricao: "", ativo: true,
  calculadoras: celula.calculadoras.map((x, i) => ({ id: i, arquetipoId: 1, regiao: x.regiao, conta: x.conta, porte: x.porte, url: "", custoMensalCentavos: Math.round(x.usd * 100), dataPreco: null, notas: "" })) };
checa("híbrido em SP: cliente e LIFF separados", sugestaoDaCalculadora(arq, "sa-east-1", "M"), { liff: 13981, cliente: 97152, achou: true });
checa("porte sem calculadora", sugestaoDaCalculadora(arq, "us-east-1", "G").achou, false);
checa("semente tem os quatro modelos", [...new Set(ARQUETIPOS_SEMENTE.map((a) => a.modelo))].sort(), ["cliente", "dedicado_liff", "hibrido", "saas_liff"]);

console.log("\nvalidação");
checa("calculadora com link que não é da AWS", lerCalculadora({ arquetipoId: 1, regiao: "us-east-1", conta: "liff", custoMensalCentavos: 1, url: "https://evil.com" }),
  "Use o link da AWS Pricing Calculator (https://calculator.aws/…).");
checa("calculadora ok", typeof lerCalculadora({ arquetipoId: 1, regiao: "us-east-1", conta: "liff", custoMensalCentavos: 1, url: "https://calculator.aws/#/estimate?id=abc" }), "object");
checa("estimativa sem cliente", lerEstimativa({ regiao: "us-east-1", liffMensalCentavos: 0, clienteMensalCentavos: 0, iaPagaPor: "liff" }), "Informe o cliente / oportunidade.");
checa("estimativa com início inválido", lerEstimativa({ conta: "X", regiao: "us-east-1", liffMensalCentavos: 0, clienteMensalCentavos: 0, iaPagaPor: "liff", inicio: "12/2026" }), "Início inválido (AAAA-MM).");
checa("linha com status inventado", lerLinha({ estimativaId: 1, programaId: "map-migrate", beneficiario: "liff", valorCentavos: 1, status: "talvez" }), "Status inválido.");
checa("pasta sem nome", lerPasta({ nome: "  " }), "Dê um nome à pasta.");
checa("pasta ok, produto opcional", lerPasta({ nome: "LIFF Tax Reform", produtoId: "" }), { nome: "LIFF Tax Reform", produtoId: null, descricao: "" });
checa("arquétipo sem pasta", lerArquetipo({ nome: "A", modelo: "hibrido" }).pastaId, null);
checa("arquétipo na pasta 3", lerArquetipo({ nome: "A", modelo: "hibrido", pastaId: "3" }).pastaId, 3);
checa("arquétipo com pasta inválida", lerArquetipo({ nome: "A", modelo: "hibrido", pastaId: "x" }), "Pasta inválida.");
checa("programa ganha id do nome", lerPrograma({ label: "MAP · Migrate 2.0", forma: "credito" }).id, "map-migrate-2-0");

console.log(`\n${ok} passaram, ${falhas} falharam`);
if (falhas) process.exit(1);
