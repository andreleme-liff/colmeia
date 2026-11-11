// Regras do cadastro de clientes (lib/cliente.ts), sem banco.
// node scripts/verificar-clientes.mjs
import { chaveCliente, cnpjFormatado, cnpjLimpo, contatosDoTexto, lerCliente, possiveisDuplicados } from "../lib/cliente.ts";

let ok = 0;
let ruim = 0;
function checa(nome, deu, esperava) {
  const a = JSON.stringify(deu);
  const b = JSON.stringify(esperava);
  if (a === b) {
    ok++;
    console.log(`  ✓ ${nome}`);
  } else {
    ruim++;
    console.log(`  ✗ ${nome}\n      deu      ${a}\n      esperava ${b}`);
  }
}

console.log("\n1. chave do nome (deduplicação)");
checa("caixa, acento e sufixo societário não separam", chaveCliente("GLOBE QUIMICA S.A"), chaveCliente("Globe Química SA"));
checa("Ltda. também cai", chaveCliente("Cimentos Boa Vista Ltda."), "cimentos boa vista");
checa("empresas diferentes continuam diferentes", chaveCliente("Globe") === chaveCliente("Globe Química"), false);
checa("nome só de pontuação não tem chave", chaveCliente(" -- "), "");

console.log("\n2. CNPJ");
checa("numérico válido, com pontuação", cnpjLimpo("11.222.333/0001-81"), "11222333000181");
checa("dígito verificador errado", cnpjLimpo("11.222.333/0001-82"), null);
checa("todos iguais", cnpjLimpo("00.000.000/0000-00"), null);
checa("alfanumérico válido (exemplo da Receita)", cnpjLimpo("12.ABC.345/01DE-35"), "12ABC34501DE35");
checa("alfanumérico com dígito errado", cnpjLimpo("12.ABC.345/01DE-36"), null);
checa("minúsculas viram maiúsculas", cnpjLimpo("12.abc.345/01de-35"), "12ABC34501DE35");
checa("curto demais", cnpjLimpo("1234"), null);
checa("vazio é 'sem CNPJ'", cnpjLimpo("  "), "");
checa("formata", cnpjFormatado("12ABC34501DE35"), "12.ABC.345/01DE-35");

console.log("\n3. contatos tirados do texto do card");
checa("nome — cargo", contatosDoTexto("Fernando — Diretor de Tax", "sponsor").map((c) => [c.nome, c.cargo, c.papel]), [["Fernando", "Diretor de Tax", "sponsor"]]);
checa("nome (cargo)", contatosDoTexto("Cida (Gerente de Tax)", "operacional").map((c) => [c.nome, c.cargo]), [["Cida", "Gerente de Tax"]]);
checa("duas pessoas com +", contatosDoTexto("Leo + Fabiana (FIUS)", "sponsor").map((c) => c.nome), ["Leo", "Fabiana"]);
checa("e-mail sai do nome", contatosDoTexto("Ana Lima <ana@x.com.br>", "outro").map((c) => [c.nome, c.email]), [["Ana Lima", "ana@x.com.br"]]);
checa("só nome", contatosDoTexto("Roberto Dias", "sponsor").map((c) => [c.nome, c.cargo]), [["Roberto Dias", ""]]);
checa("vazio não gera contato", contatosDoTexto("  ", "sponsor"), []);

console.log("\n4. validação do cadastro");
checa("sem nome", lerCliente({ nome: " " }), "Informe o nome do cliente.");
checa("CNPJ inválido", lerCliente({ nome: "X", cnpj: "123" }), "CNPJ inválido. Confira os 14 caracteres e os dígitos verificadores.");
checa("dia de vencimento fora da faixa", lerCliente({ nome: "X", diaVencimento: 31 }), "Dia de vencimento: de 1 a 28.");
checa("forma de cobrança inventada", lerCliente({ nome: "X", formaCobranca: "fiado" }), "Forma de cobrança inválida.");
checa("e-mail de cobrança inválido", lerCliente({ nome: "X", emailCobranca: "financeiro" }), "E-mail de cobrança inválido.");
checa("site javascript: recusa", lerCliente({ nome: "X", site: "javascript:alert(1)" }), "Site inválido.");
checa("contato sem nome", lerCliente({ nome: "X", contatos: [{ email: "a@b.co" }] }), "Todo contato precisa de nome.");
checa("papel de contato inventado", lerCliente({ nome: "X", contatos: [{ nome: "Ana", papel: "chefe" }] }), "Papel inválido no contato Ana.");
const bom = lerCliente({ nome: "  Globe   Química ", cnpj: "11.222.333/0001-81", site: "globe.com.br", diaVencimento: "10", contatos: [{ nome: "Ana" }, {}] });
checa("cadastro válido normaliza", [bom.nome, bom.cnpj, bom.site, bom.diaVencimento, bom.contatos.length, bom.contatos[0].papel], ["Globe Química", "11222333000181", "https://globe.com.br/", 10, 1, "outro"]);
checa("sem `contatos` no corpo, não mexe neles", lerCliente({ nome: "X" }).contatos, undefined);

console.log("\n5. possíveis duplicados");
const cs = [
  { id: 1, nome: "Globe", cnpj: "" }, { id: 2, nome: "Globe Química", cnpj: "" }, { id: 3, nome: "Sa", cnpj: "" },
  { id: 4, nome: "Santander", cnpj: "X" }, { id: 5, nome: "Banco Real", cnpj: "X" }, { id: 6, nome: "Globex", cnpj: "" },
];
checa("prefixo por palavra inteira e mesmo CNPJ", possiveisDuplicados(cs).map(([a, b]) => [a.id, b.id]), [[5, 4], [1, 2]]);

console.log(`\n${ok} passaram, ${ruim} falharam`);
process.exit(ruim ? 1 : 0);
