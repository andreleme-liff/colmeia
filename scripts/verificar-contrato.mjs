// Teste do template de contrato e do motor que o preenche. Não toca em banco.
//
//   node --experimental-strip-types scripts/verificar-contrato.mjs
//
// O teste central é de ida e volta: o template preenchido com os dados do Medley tem que
// reproduzir o contrato original, caractere por caractere, descontadas as três correções
// de defeito que a v1 introduziu de propósito. Se bater, o template não perdeu nada na
// derivação e o motor não errou nenhum campo.

import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { preencherDocx, camposDoTemplate } from "../lib/docx.ts";
import { inteiroEmPalavras, reaisEmPalavras, parcelaCentavos, tcvCentavos } from "../lib/domain.ts";

const TEMPLATE = "templates/contrato-prestacao-servicos-v1.docx";
const ORIGINAL =
  "/Users/andreleme/Downloads/Contrato de Prestação de Serviços - LiffTax (Medley)(18557426.1) (1).docx";

let ok = 0;
let falhou = 0;
function checa(d, c, det = "") {
  if (c) {
    ok++;
    console.log(`  ✓ ${d}`);
  } else {
    falhou++;
    console.log(`  ✗ ${d}${det ? ` — ${det}` : ""}`);
  }
}

/** Texto renderizado de um .docx, do mesmo jeito nos dois lados da comparação. */
function textoDe(bytes) {
  const pacote = unzipSync(new Uint8Array(bytes));
  const xml = new TextDecoder().decode(pacote["word/document.xml"]);
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => m[1])
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const template = new Uint8Array(readFileSync(TEMPLATE));

// ---------------------------------------------------------------- 1. o que o template pede
console.log("\n1. campos do template");
const { campos, blocos } = camposDoTemplate(template);
checa("30 campos", campos.length === 30, `achei ${campos.length}`);
checa("um bloco condicional, SE_ADDON", blocos.length === 1 && blocos[0] === "SE_ADDON", blocos.join(","));
checa("nenhum [inserir] sobrou do original", !textoDe(readFileSync(TEMPLATE)).includes("[inserir]"));

// ------------------------------------------------- 2. os valores do contrato Medley
const CENTAVOS = { implantacao: 6_000_000, addon: 2_500_000, mensal: 1_100_000 };
const PARCELAS = { implantacao: 12, addon: 12 };
const DIA = "10";

const brl = (c) => "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const parcIm = parcelaCentavos(CENTAVOS.implantacao, PARCELAS.implantacao);
const parcAd = parcelaCentavos(CENTAVOS.addon, PARCELAS.addon);

const MEDLEY = {
  CONTRATANTE_RAZAO_SOCIAL: "MEDLEY FARMACÊUTICA LTDA.",
  CONTRATANTE_TIPO_SOCIETARIO: "sociedade limitada",
  CONTRATANTE_ENDERECO: "Rua Estácio de Sá, 1144 (Sala São Paulo) – Jd. Santa Genebra",
  CONTRATANTE_CIDADE: "Campinas",
  CONTRATANTE_ESTADO: "São Paulo",
  CONTRATANTE_CNPJ: "62.946.352/0001-91",
  CONTRATANTE_CONTATO_NOME: "Sra. Fernanda Prado",
  CONTRATANTE_CONTATO_EMAIL: "fernanda.prado@medley.com.br",

  IMPLANTACAO_VALOR: brl(CENTAVOS.implantacao),
  IMPLANTACAO_VALOR_EM_PALAVRAS: reaisEmPalavras(CENTAVOS.implantacao),
  IMPLANTACAO_PARCELAS: String(PARCELAS.implantacao),
  IMPLANTACAO_PARCELAS_EM_PALAVRAS: inteiroEmPalavras(PARCELAS.implantacao),
  IMPLANTACAO_PARCELA_VALOR: brl(parcIm.centavos),
  IMPLANTACAO_PARCELA_VALOR_EM_PALAVRAS: reaisEmPalavras(parcIm.centavos),
  IMPLANTACAO_DIA_VENCIMENTO: DIA,

  ADDON_DESCRICAO: "Add-on",
  ADDON_VALOR: brl(CENTAVOS.addon),
  ADDON_VALOR_EM_PALAVRAS: reaisEmPalavras(CENTAVOS.addon),
  ADDON_PARCELAS: String(PARCELAS.addon),
  ADDON_PARCELAS_EM_PALAVRAS: inteiroEmPalavras(PARCELAS.addon),
  ADDON_PARCELA_VALOR: brl(parcAd.centavos),
  ADDON_PARCELA_VALOR_EM_PALAVRAS: reaisEmPalavras(parcAd.centavos),
  ADDON_DIA_VENCIMENTO: DIA,
  ADDON_MARCO_INICIAL: "da entrega do Add-on",

  MENSAL_VALOR: brl(CENTAVOS.mensal),
  MENSAL_VALOR_EM_PALAVRAS: reaisEmPalavras(CENTAVOS.mensal),
  MENSAL_DIA_VENCIMENTO: DIA,

  CIDADE_ASSINATURA: "Campinas",
  DATA_ASSINATURA: "28 de outubro de 2026",
  ANEXO_I_ESCOPO: "Escopo conforme proposta comercial anexa.",
};

console.log("\n2. preenchimento com os valores do Medley");
const cheio = preencherDocx(template, { campos: MEDLEY, blocos: { SE_ADDON: true } });
const naoUsados = Object.entries(cheio.trocas).filter(([, n]) => n === 0).map(([k]) => k);
checa("todos os 30 campos foram trocados", naoUsados.length === 0, `sem uso: ${naoUsados.join(", ")}`);
const textoCheio = textoDe(cheio.docx);
checa("não sobrou nenhum {{campo}}", !/\{\{/.test(textoCheio));
checa("o .docx gerado reabre como ZIP válido", Object.keys(unzipSync(cheio.docx)).length === 23);

// ------------------------------------------------- 3. ida e volta contra o original
console.log("\n3. ida e volta: bate com o contrato original?");
let esperado = textoDe(readFileSync(ORIGINAL));
// as três correções de defeito que a v1 introduziu
esperado = esperado
  .replace("nos termos exclusivos do item 3.7", "nos termos exclusivos do item 3.3")
  .replace("encargos moratórios previstos no item 2.3.", "encargos moratórios previstos no item 2.4.")
  .replace("representada, neste ato, a forma", "representada, neste ato, na forma");
// os campos que o original tinha em branco e que agora têm valor
esperado = esperado
  .replace("previsto todo dia [inserir] de cada mês, a partir da data", `previsto todo dia ${DIA} de cada mês, a partir da data`)
  .replace("previsto todo dia [inserir] de cada mês, a partir [inserir].", `previsto todo dia ${DIA} de cada mês, a partir de ${MEDLEY.ADDON_MARCO_INICIAL}.`)
  .replace("vencimento todo dia [inserir] de cada mês", `vencimento todo dia ${DIA} de cada mês`)
  .replace("Destinatário: [inserir]", `Destinatário: ${MEDLEY.CONTRATANTE_CONTATO_NOME}`)
  .replace("E-mail: [inserir]", `E-mail: ${MEDLEY.CONTRATANTE_CONTATO_EMAIL}`)
  // o Anexo I do original é um título sem conteúdo
  .replace(/PROPOSTA COMERCIAL LIFF TAX$/, `PROPOSTA COMERCIAL LIFF TAX${MEDLEY.ANEXO_I_ESCOPO}`)
  // O bloco de assinatura do original escrevia a razão social sem o ponto final, e o
  // preâmbulo com. O template usa o MESMO campo nos dois lugares, então o gerado fica
  // consistente — diferença deliberada de um caractere em relação ao original.
  .replace("MEDLEY FARMACÊUTICA LTDAANEXO I", "MEDLEY FARMACÊUTICA LTDA.ANEXO I");

if (textoCheio === esperado) {
  checa("o texto gerado é idêntico ao do contrato original", true);
} else {
  let i = 0;
  while (i < Math.min(textoCheio.length, esperado.length) && textoCheio[i] === esperado[i]) i++;
  checa(
    "o texto gerado é idêntico ao do contrato original",
    false,
    `divergem no caractere ${i} de ${esperado.length}\n      gerado:   …${JSON.stringify(textoCheio.slice(i - 60, i + 60))}\n      esperado: …${JSON.stringify(esperado.slice(i - 60, i + 60))}`
  );
}

// ------------------------------------------------- 4. negócio sem customização
console.log("\n4. negócio sem customização: a 2.2 fica reservada");
const semAddon = { ...MEDLEY };
for (const k of Object.keys(semAddon)) if (k.startsWith("ADDON_")) semAddon[k] = "";
const magro = preencherDocx(template, { campos: semAddon, blocos: { SE_ADDON: false } });
const textoMagro = textoDe(magro.docx);
checa('a 2.2 diz "Intencionalmente omitido."', textoMagro.includes("2.2Intencionalmente omitido."));
checa("o texto do add-on desapareceu", !textoMagro.includes("Implantação do"));
checa("a numeração não andou: 2.3, 2.4 e 2.5 seguem no lugar",
  textoMagro.includes("2.3Remuneração Mensal") &&
  textoMagro.includes("2.4 Encargos de Mora") &&
  textoMagro.includes("2.5 Atualização"));
checa("a referência da 10.4 continua apontando para a 2.4",
  textoMagro.includes("encargos moratórios previstos no item 2.4"));
checa("a implantação e a mensalidade continuam lá",
  textoMagro.includes("R$ 60.000,00 (sessenta mil reais)") &&
  textoMagro.includes("R$ 11.000,00 (onze mil reais)"));

// ------------------------------------------------- 5. campo esquecido tem que barrar
console.log("\n5. campo esquecido impede a geração");
const incompleto = { ...MEDLEY };
delete incompleto.MENSAL_DIA_VENCIMENTO;
delete incompleto.CONTRATANTE_CNPJ;
try {
  preencherDocx(template, { campos: incompleto, blocos: { SE_ADDON: true } });
  checa("gerar com campo faltando falha", false, "gerou em silêncio");
} catch (e) {
  checa("gerar com campo faltando falha", true);
  checa("o erro nomeia os campos que faltam",
    e.message.includes("MENSAL_DIA_VENCIMENTO") && e.message.includes("CONTRATANTE_CNPJ"), e.message);
}

// ------------------------------------------------- 6. injeção de XML pelo valor
console.log("\n6. valor com caractere de XML não quebra o documento");
const comXml = { ...MEDLEY, CONTRATANTE_RAZAO_SOCIAL: 'ACME & FILHOS <LTDA> "S/A"' };
const docXml = preencherDocx(template, { campos: comXml, blocos: { SE_ADDON: true } });
checa("o pacote segue válido", Object.keys(unzipSync(docXml.docx)).length === 23);
checa("o valor aparece íntegro no texto", textoDe(docXml.docx).includes('ACME & FILHOS <LTDA> "S/A"'));

// ------------------------------------------------- 7. os números do Medley
console.log("\n7. aritmética do modelo comercial");
const tcv = tcvCentavos({
  implantacaoCentavos: CENTAVOS.implantacao, addonCentavos: CENTAVOS.addon,
  mensalCentavos: CENTAVOS.mensal, duracaoMeses: 12,
});
checa("TCV = 60.000 + 25.000 + 11.000×12 = R$ 217.000,00", tcv === 21_700_000, brl(tcv));
checa("as 12 parcelas do add-on não fecham o total (4 centavos)", parcAd.resto === 4, `resto ${parcAd.resto}`);

// ------------------------------------------------- 8. o extenso, caso a caso
//
// É a função mais perigosa do conjunto: quando o algarismo e o extenso divergem num
// contrato, prevalece o extenso. Um erro aqui não é erro de exibição, é o valor do
// contrato. A regra do "e" entre grupos é o que quase todo gerador erra —
// "mil e vinte" leva "e", "mil, duzentos e trinta" leva vírgula.
console.log("\n8. valor em palavras");
const EXTENSO = [
  [0, "zero reais"],
  [1, "um centavo"],
  [2, "dois centavos"],
  [100, "um real"],
  [101, "um real e um centavo"],
  [200, "dois reais"],
  [10_000, "cem reais"],
  [10_100, "cento e um reais"],
  [100_000, "mil reais"],
  [100_100, "mil e um reais"],
  [102_000, "mil e vinte reais"],
  [123_000, "mil, duzentos e trinta reais"],
  [500_000, "cinco mil reais"],
  [208_333, "dois mil e oitenta e três reais e trinta e três centavos"],
  [1_100_000, "onze mil reais"],
  [2_500_000, "vinte e cinco mil reais"],
  [6_000_000, "sessenta mil reais"],
  [18_200_000, "cento e oitenta e dois mil reais"],
  [22_900_000, "duzentos e vinte e nove mil reais"],
  [34_000_000, "trezentos e quarenta mil reais"],
  [100_000_000, "um milhão de reais"],
  [150_000_000, "um milhão e quinhentos mil reais"],
  [241_600_000, "dois milhões, quatrocentos e dezesseis mil reais"],
  [
    123_456_789,
    "um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete reais e oitenta e nove centavos",
  ],
];
let errosExtenso = 0;
for (const [centavos, esperadoTxt] of EXTENSO) {
  const obtido = reaisEmPalavras(centavos);
  if (obtido !== esperadoTxt) {
    errosExtenso++;
    console.log(`      ${brl(centavos)} deu "${obtido}", esperava "${esperadoTxt}"`);
  }
}
checa(`${EXTENSO.length} valores em palavras`, errosExtenso === 0, `${errosExtenso} errado(s)`);
checa("acima de bilhão recusa em vez de inventar escala", (() => {
  try {
    reaisEmPalavras(100_000_000_000_000);
    return false;
  } catch {
    return true;
  }
})());

console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
