// Despesas (contas a pagar): situação, recorrências, linhas do mês, resumo por categoria,
// faixas de vencimento, validações e CSV. Sem banco. `node scripts/verificar-despesas.mjs`
import {
  CATEGORIAS_SEMENTE, GRUPO_KEYS, compromissoMensal, contasDoMes, csvDasDespesas, diasVencida, faixasAPagar, lerCategoria, lerDespesa,
  faturasAbertas, lerFavorecido, lerPagamento, lerRecorrencia, mediaPaga, porCategoria, recorrenciaAtivaEm, statusDaDespesa,
  vencimentoDaRecorrencia, vencimentoDoCartao,
} from "../lib/despesas.ts";

let ok = 0, falhas = 0;
const checa = (n, a, b) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x === y) { ok++; console.log("  ✓ " + n); } else { falhas++; console.log("  ✗ " + n + "\n      esperado " + y + "\n      veio     " + x); } };

const HOJE = "2026-11-16";
const cats = [
  { id: 1, nome: "Colaboradores PJ", grupo: "pessoal", ativo: true },
  { id: 2, nome: "Software e assinaturas", grupo: "operacional", ativo: true },
  { id: 3, nome: "Infraestrutura de nuvem e IA", grupo: "custo", ativo: true },
];
const favs = [
  { id: 1, nome: "Ana Dev ME", tipo: "colaborador_pj", documento: "", contato: "", pagamento: "", diaFechamento: null, diaVencimento: null, notas: "", ativo: true },
  { id: 2, nome: "Cartão final 1234", tipo: "cartao", documento: "", contato: "", pagamento: "", diaFechamento: 25, diaVencimento: 5, notas: "", ativo: true },
  { id: 3, nome: "AWS", tipo: "fornecedor", documento: "", contato: "", pagamento: "", diaFechamento: null, diaVencimento: null, notas: "", ativo: true },
];
const rec = (o) => ({ id: 1, favorecidoId: 1, categoriaId: 1, area: null, descricao: "Engenharia", valorCentavos: 1500000, diaVencimento: 5,
  venceMesSeguinte: true, forma: "pix", cartaoId: null, inicio: "2026-10", fim: null, notas: "", ...o });
const desp = (o) => ({ id: 1, ref: "P-0001", favorecidoId: 1, favorecido: "Ana Dev ME", categoriaId: 1, area: null, recorrenciaId: null,
  competencia: "2026-11", descricao: "", valorCentavos: 100000, vencimento: "2026-11-20", forma: "pix", cartaoId: null, documento: "", status: "aberta",
  pagoEm: null, valorPagoCentavos: null, canceladaEm: null, motivoCancelamento: "", notas: "", itens: [], ...o });

console.log("situação");
checa("aberta antes do vencimento", statusDaDespesa(desp({}), HOJE), "aberta");
checa("aberta depois do vencimento vira vencida", statusDaDespesa(desp({ vencimento: "2026-11-10" }), HOJE), "vencida");
checa("vence hoje ainda não é vencida", statusDaDespesa(desp({ vencimento: HOJE }), HOJE), "aberta");
checa("paga não vence", statusDaDespesa(desp({ status: "paga", vencimento: "2026-11-01" }), HOJE), "paga");
checa("dias de atraso", [diasVencida("2026-11-10", HOJE), diasVencida("2026-11-20", HOJE)], [6, 0]);

console.log("\nrecorrências");
checa("vale do início em diante", [recorrenciaAtivaEm(rec({}), "2026-09"), recorrenciaAtivaEm(rec({}), "2026-10"), recorrenciaAtivaEm(rec({}), "2030-01")], [false, true, true]);
checa("para na última competência", [recorrenciaAtivaEm(rec({ fim: "2026-12" }), "2026-12"), recorrenciaAtivaEm(rec({ fim: "2026-12" }), "2027-01")], [true, false]);
checa("PJ vence no mês seguinte", vencimentoDaRecorrencia(rec({}), "2026-11"), "2026-12-05");
checa("dezembro vence em janeiro do outro ano", vencimentoDaRecorrencia(rec({}), "2026-12"), "2027-01-05");
checa("assinatura vence no próprio mês", vencimentoDaRecorrencia(rec({ venceMesSeguinte: false, diaVencimento: 28 }), "2027-02"), "2027-02-28");
checa("gasto fixo soma só as ativas", compromissoMensal([rec({}), rec({ id: 2, valorCentavos: 500000, fim: "2026-10" }), rec({ id: 3, valorCentavos: 20000, inicio: "2027-01" })], "2026-11"), 1500000);

console.log("\ncartão");
const CARTAO = favs[1]; // fecha dia 25, vence dia 5
checa("compra antes do fechamento cai na fatura que vence no mês seguinte", vencimentoDoCartao(CARTAO, "2026-11-16"), "2026-12-05");
checa("compra no dia do fechamento ainda entra", vencimentoDoCartao(CARTAO, "2026-11-25"), "2026-12-05");
checa("compra depois do fechamento vai para a fatura seguinte", vencimentoDoCartao(CARTAO, "2026-11-26"), "2027-01-05");
checa("vencimento depois do fechamento no mesmo mês", vencimentoDoCartao({ diaFechamento: 3, diaVencimento: 10 }, "2026-11-02"), "2026-11-10");
checa("idem, compra depois do fechamento", vencimentoDoCartao({ diaFechamento: 3, diaVencimento: 10 }, "2026-11-04"), "2026-12-10");
checa("cartão sem os dias devolve a própria data", vencimentoDoCartao({ diaFechamento: null, diaVencimento: null }, "2026-11-16"), "2026-11-16");
checa("recorrência no cartão: o vencimento é o da fatura da cobrança",
  vencimentoDaRecorrencia(rec({ forma: "cartao", cartaoId: 2, diaVencimento: 3, venceMesSeguinte: false }), "2026-11", CARTAO), "2026-12-05");
checa("recorrência no banco ignora o cartão", vencimentoDaRecorrencia(rec({}), "2026-11", CARTAO), "2026-12-05");
const aws = (o) => desp({ favorecidoId: 3, favorecido: "AWS", categoriaId: 3, forma: "cartao", cartaoId: 2, vencimento: "2026-12-05", ...o });
const fats = faturasAbertas([aws({ id: 20, valorCentavos: 60000 }), aws({ id: 21, valorCentavos: 30000 }), aws({ id: 22, vencimento: "2027-01-05", valorCentavos: 5000 }),
  aws({ id: 23, status: "paga" }), desp({ id: 24 }), aws({ id: 25, cartaoId: 7, valorCentavos: 100 })]);
checa("faturas: uma por cartão e vencimento, só o que está em aberto no cartão", fats.map((f) => [f.cartaoId, f.vencimento, f.despesas.length, f.valorCentavos]),
  [[2, "2026-12-05", 2, 90000], [7, "2026-12-05", 1, 100], [2, "2027-01-05", 1, 5000]]);
const prevCartao = contasDoMes([rec({ id: 9, favorecidoId: 3, categoriaId: 3, forma: "cartao", cartaoId: 2, diaVencimento: 3, venceMesSeguinte: false })], favs, [], "2026-11", HOJE);
checa("prevista no cartão já aponta a fatura e o cartão", prevCartao.map((l) => [l.favorecido, l.forma, l.cartaoId, l.vencimento]), [["AWS", "cartao", 2, "2026-12-05"]]);

console.log("\no mês");
const recs = [rec({}), rec({ id: 2, favorecidoId: 1, descricao: "Encerrada", fim: "2026-10" })];
const lancada = desp({ id: 5, ref: "P-0005", recorrenciaId: 1, valorCentavos: 1550000, vencimento: "2026-12-05" });
const cancelada = desp({ id: 4, ref: "P-0004", recorrenciaId: 1, status: "cancelada" });
const cartao = desp({ id: 6, ref: "P-0006", favorecidoId: 2, favorecido: "Cartão final 1234", categoriaId: null, valorCentavos: 90000, vencimento: "2026-11-10",
  itens: [{ id: 1, data: "2026-11-02", descricao: "AWS", categoriaId: 3, area: null, valorCentavos: 60000 }, { id: 2, data: null, descricao: "Notion", categoriaId: 2, area: null, valorCentavos: 30000 }] });
const semLanc = contasDoMes(recs, favs, [], "2026-11", HOJE);
checa("recorrência sem conta aparece prevista", semLanc.map((l) => [l.status, l.valorCentavos, l.vencimento, l.favorecido]), [["prevista", 1500000, "2026-12-05", "Ana Dev ME"]]);
checa("recorrência encerrada some do mês", semLanc.length, 1);
checa("antes do início não há linha", contasDoMes(recs, favs, [], "2026-09", HOJE).length, 0);
const mes = contasDoMes(recs, favs, [lancada, cancelada, cartao, desp({ id: 9, competencia: "2026-10" })], "2026-11", HOJE);
checa("ordem por vencimento; lançada toma o lugar da prevista", mes.map((l) => [l.chave, l.status, l.valorCentavos]), [["d6", "vencida", 90000], ["r1|2026-11", "aberta", 1550000]]);
checa("cancelada fica no histórico da linha", mes.find((l) => l.recorrenciaId === 1).canceladas.map((d) => d.ref), ["P-0004"]);
checa("só cancelada: a linha volta a ficar prevista", contasDoMes(recs, favs, [cancelada], "2026-11", HOJE).map((l) => [l.status, l.despesa]), [["prevista", null]]);
checa("conta lançada segura a linha mesmo com a recorrência encerrada",
  contasDoMes([rec({ fim: "2026-10" })], favs, [lancada], "2026-11", HOJE).map((l) => l.status), ["aberta"]);

console.log("\npor categoria");
const pc = porCategoria(mes, cats);
checa("itens do cartão vão para as categorias deles", pc.map((c) => [c.nome, c.grupo, c.valor]),
  [["Colaboradores PJ", "pessoal", 1550000], ["Infraestrutura de nuvem e IA", "custo", 60000], ["Software e assinaturas", "operacional", 30000]]);
checa("a soma fecha com o total do mês", pc.reduce((t, c) => t + c.valor, 0), mes.reduce((t, l) => t + l.valorCentavos, 0));
const furado = contasDoMes([], favs, [{ ...cartao, valorCentavos: 100000 }], "2026-11", HOJE);
checa("diferença entre conta e itens cai em Sem categoria", porCategoria(furado, cats).find((c) => c.categoriaId === null)?.valor, 10000);

console.log("\na pagar e média");
const fx = faixasAPagar([desp({ vencimento: "2026-11-10" }), desp({ id: 2, vencimento: HOJE }), desp({ id: 3, vencimento: "2026-11-23" }), desp({ id: 4, vencimento: "2026-11-24" }),
  desp({ id: 5, vencimento: "2027-03-01" }), desp({ id: 6, status: "paga", vencimento: "2026-11-01" })], HOJE);
checa("faixas por vencimento (paga fica fora)", fx.map((f) => [f.key, f.qtd]), [["vencidas", 1], ["7_dias", 2], ["30_dias", 1], ["depois", 1]]);
const pagas = [desp({ status: "paga", pagoEm: "2026-10-05", valorPagoCentavos: 300000 }), desp({ id: 2, status: "paga", pagoEm: "2026-08-20", valorPagoCentavos: 600000 }),
  desp({ id: 3, status: "paga", pagoEm: "2026-11-03", valorPagoCentavos: 999999 }), desp({ id: 4, status: "paga", pagoEm: "2026-07-31", valorPagoCentavos: 999999 })];
checa("média dos 3 meses fechados (mês corrente fica fora)", mediaPaga(pagas, HOJE), 300000);

console.log("\nvalidação");
const base = { favorecidoId: 1, competencia: "2026-11", vencimento: "2026-12-05", forma: "pix", categoriaId: 1, valorCentavos: 1500000 };
checa("conta simples ok", (({ valorCentavos, categoriaId, itens }) => [valorCentavos, categoriaId, itens.length])(lerDespesa(base)), [1500000, 1, 0]);
checa("sem favorecido", lerDespesa({ ...base, favorecidoId: "" }), "Escolha o favorecido.");
checa("competência no formato errado", lerDespesa({ ...base, competencia: "11/2026" }), "Competência inválida (AAAA-MM).");
checa("vencimento que não existe", lerDespesa({ ...base, vencimento: "2026-13-40" }), "Informe o vencimento.");
checa("forma inventada", lerDespesa({ ...base, forma: "cheque" }), "Escolha a forma de pagamento.");
checa("cartão sem dizer qual", lerDespesa({ ...base, forma: "cartao" }), "Escolha em qual cartão a despesa é paga.");
checa("no cartão guarda o cartão", (({ forma, cartaoId }) => [forma, cartaoId])(lerDespesa({ ...base, forma: "cartao", cartaoId: "2" })), ["cartao", 2]);
checa("pelo banco descarta o cartão que vier", lerDespesa({ ...base, cartaoId: 2 }).cartaoId, null);
checa("recorrência no cartão sem cartão", lerRecorrencia({ favorecidoId: 3, categoriaId: 3, valorCentavos: 1, diaVencimento: 3, forma: "cartao", inicio: "2026-10" }), "Escolha em qual cartão a despesa é paga.");
checa("cartão guarda fechamento e vencimento", (({ diaFechamento, diaVencimento }) => [diaFechamento, diaVencimento])(lerFavorecido({ nome: "Cartão", tipo: "cartao", diaFechamento: "25", diaVencimento: 5 })), [25, 5]);
checa("cartão com um dia só", lerFavorecido({ nome: "Cartão", tipo: "cartao", diaFechamento: 25 }), "Informe o dia de fechamento e o de vencimento do cartão, ou nenhum dos dois.");
checa("dia 30 não serve", lerFavorecido({ nome: "Cartão", tipo: "cartao", diaFechamento: 30, diaVencimento: 5 }), "Os dias de fechamento e de vencimento vão de 1 a 28.");
checa("quem não é cartão não guarda os dias", lerFavorecido({ nome: "AWS", tipo: "fornecedor", diaFechamento: 25, diaVencimento: 5 }).diaFechamento, null);
checa("sem categoria", lerDespesa({ ...base, categoriaId: null }), "Escolha a categoria.");
checa("valor zero", lerDespesa({ ...base, valorCentavos: 0 }), "Informe o valor.");
checa("valor quebrado", lerDespesa({ ...base, valorCentavos: 10.5 }), "Informe o valor.");
const comItens = lerDespesa({ ...base, categoriaId: 1, valorCentavos: 1, itens: [{ descricao: "AWS", categoriaId: "3", valorCentavos: 60000, data: "2026-11-02" }, { descricao: "Notion", categoriaId: 2, valorCentavos: 30000 }] });
checa("com itens: valor é a soma e a categoria fica nos itens", [comItens.valorCentavos, comItens.categoriaId, comItens.itens.map((i) => i.categoriaId)], [90000, null, [3, 2]]);
checa("item sem categoria", lerDespesa({ ...base, itens: [{ descricao: "AWS", valorCentavos: 1 }] }), "Item 1: escolha a categoria.");
checa("item sem valor", lerDespesa({ ...base, itens: [{ descricao: "AWS", categoriaId: 3 }] }), "Item 1: informe o valor.");
checa("item com data inválida", lerDespesa({ ...base, itens: [{ descricao: "AWS", categoriaId: 3, valorCentavos: 1, data: "ontem" }] }), "Item 1: data inválida.");
checa("produto vazio vira nulo", lerDespesa({ ...base, area: "  " }).area, null);
const r0 = { favorecidoId: 1, categoriaId: 1, valorCentavos: 1500000, diaVencimento: 5, forma: "pix", inicio: "2026-10" };
checa("recorrência ok", (({ venceMesSeguinte, fim }) => [venceMesSeguinte, fim])(lerRecorrencia(r0)), [false, null]);
checa("dia 31 não existe em todo mês", lerRecorrencia({ ...r0, diaVencimento: 31 }), "O dia de vencimento vai de 1 a 28.");
checa("fim antes do início", lerRecorrencia({ ...r0, fim: "2026-09" }), "O fim não pode ser antes do início.");
checa("fim inválido", lerRecorrencia({ ...r0, fim: "dez" }), "Fim inválido (AAAA-MM).");
checa("favorecido de tipo inventado", lerFavorecido({ nome: "X", tipo: "clt" }), "Escolha o tipo do favorecido.");
checa("favorecido ok nasce ativo", lerFavorecido({ nome: " Ana ", tipo: "advisor_pj" }).ativo && lerFavorecido({ nome: " Ana ", tipo: "advisor_pj" }).nome, "Ana");
checa("categoria sem grupo", lerCategoria({ nome: "X" }), "Escolha o grupo da categoria.");
checa("pagamento sem data", lerPagamento({ valorPagoCentavos: 1 }), "Informe a data do pagamento.");
checa("pagamento ok", lerPagamento({ pagoEm: "2026-12-05", valorPagoCentavos: 1500000 }), { pagoEm: "2026-12-05", valorPagoCentavos: 1500000, notas: "" });
checa("semente só usa grupos que existem", CATEGORIAS_SEMENTE.every((c) => GRUPO_KEYS.includes(c.grupo)), true);

console.log("\ncsv");
const csv = csvDasDespesas(mes, cats, (a) => a ?? "").split("\n");
checa("uma linha por item do cartão + a conta simples", csv.length, 1 + 2 + 1);
checa("linha de item", csv[1], "2026-11;P-0006;Cartão final 1234;AWS;Infraestrutura de nuvem e IA;Custo do serviço;;Vencida;600,00;10/11/2026;PIX;;;");
checa("campo com ponto e vírgula vai entre aspas", csvDasDespesas(contasDoMes([], favs, [desp({ descricao: "a;b" })], "2026-11", HOJE), cats, () => "").split("\n")[1].includes('"a;b"'), true);

console.log(`\n${ok} passaram, ${falhas} falharam`);
if (falhas) process.exit(1);
