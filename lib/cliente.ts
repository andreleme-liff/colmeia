// Cadastro de clientes: as regras, sem banco. A gravação mora em `clientes-db.ts`.
//
// O sistema nasceu pelas oportunidades, e cada uma guarda o nome da conta em texto. O cliente
// é o que junta essas oportunidades (de produtos diferentes), os contratos e as faturas num
// cadastro só, com os dados que não pertencem a uma venda: CNPJ, cobrança, pessoas.
//
// O vínculo é pelo NOME, normalizado numa chave (`chaveCliente`): "GLOBE QUIMICA S.A" e
// "Globe Química SA" dão a mesma chave e viram um cliente. O que a chave não pega ("Globe" e
// "Globe Química") aparece como possível duplicado e é mesclado à mão; a chave do cadastro
// absorvido continua apontando para o que ficou, então o engano não volta na próxima
// oportunidade criada com o nome antigo.

import { normalizarConta } from "./domain.ts";
import { FORMA_KEYS } from "./forecast.ts";

/** Chave de deduplicação do nome. Vazia quando o nome não tem letra nem número. */
export function chaveCliente(nome: string): string {
  return normalizarConta(nome);
}

export const PAPEIS_CONTATO = [
  { key: "sponsor", label: "Sponsor / decisor" },
  { key: "operacional", label: "Operacional" },
  { key: "financeiro", label: "Financeiro / cobrança" },
  { key: "outro", label: "Outro" },
] as const;
export type PapelContato = (typeof PAPEIS_CONTATO)[number]["key"];
const PAPEL_KEYS = PAPEIS_CONTATO.map((p) => p.key) as readonly string[];
export const papelContatoLabel = (k: string) => PAPEIS_CONTATO.find((p) => p.key === k)?.label ?? k;

export type Contato = {
  id?: number;
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
  papel: PapelContato;
  notas: string;
};

export type Cliente = {
  id: number;
  ref: string;
  nome: string;
  razaoSocial: string;
  /** 14 caracteres, sem pontuação; "" quando não informado. */
  cnpj: string;
  inscricaoMunicipal: string;
  site: string;
  segmento: string;
  endereco: string;
  emailCobranca: string;
  /** 1 a 28; null = ainda não combinado. */
  diaVencimento: number | null;
  formaCobranca: string | null;
  notas: string;
  contatos: Contato[];
  /** Outros nomes que caem neste cadastro (grafias mescladas ou nome anterior). */
  outrosNomes: string[];
  criadoEm: string;
};

export type EntradaCliente = Omit<Cliente, "id" | "ref" | "contatos" | "outrosNomes" | "criadoEm"> & {
  /** `undefined` = não mexe nos contatos; lista = substitui todos. */
  contatos?: Contato[];
};

export const LIMITES_CLIENTE = {
  nome: 200, razaoSocial: 300, inscricaoMunicipal: 40, site: 300, segmento: 100, endereco: 500, email: 200,
  notas: 4000, contatoNome: 200, cargo: 200, telefone: 40, contatoNotas: 500, contatos: 50,
} as const;

// ---------- CNPJ ----------

const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_2 = [6, ...PESOS_1];

/**
 * CNPJ sem pontuação, em maiúsculas — ou `null` se inválido. "" para vazio.
 * Aceita o formato alfanumérico (em vigor desde jul/2026): doze posições de letra ou número e
 * dois dígitos verificadores. A conta é a mesma do numérico, com cada caractere valendo o
 * código ASCII menos 48 ("0" = 0, "A" = 17).
 */
export function cnpjLimpo(bruto: unknown): string | null {
  if (bruto == null) return "";
  if (typeof bruto !== "string") return null;
  const s = bruto.replace(/[\s./-]/g, "").toUpperCase();
  if (!s) return "";
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(s)) return null;
  if (/^(.)\1{13}$/.test(s)) return null;
  const valor = (c: string) => c.charCodeAt(0) - 48;
  const dv = (base: string, pesos: number[]) => {
    const resto = base.split("").reduce((soma, c, i) => soma + valor(c) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(s.slice(0, 12), PESOS_1);
  const d2 = dv(s.slice(0, 12) + d1, PESOS_2);
  return s.endsWith(`${d1}${d2}`) ? s : null;
}

/** "12ABC34501DE35" → "12.ABC.345/01DE-35". O que não tem 14 posições volta como veio. */
export function cnpjFormatado(cnpj: string): string {
  return cnpj.length === 14
    ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
    : cnpj;
}

// ---------- leitura do formulário ----------

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const longo = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function lerContato(b: unknown): Contato | string | null {
  if (!b || typeof b !== "object") return "Contato inválido.";
  const c = b as Record<string, unknown>;
  const nome = txt(c.nome, LIMITES_CLIENTE.contatoNome);
  const email = txt(c.email, LIMITES_CLIENTE.email).toLowerCase();
  const cargo = txt(c.cargo, LIMITES_CLIENTE.cargo);
  const telefone = txt(c.telefone, LIMITES_CLIENTE.telefone);
  const notas = longo(c.notas, LIMITES_CLIENTE.contatoNotas);
  // Linha em branco no formulário: ignora em vez de recusar o cadastro inteiro.
  if (!nome && !email && !cargo && !telefone && !notas) return null;
  if (!nome) return "Todo contato precisa de nome.";
  if (email && !EMAIL.test(email)) return `E-mail inválido no contato ${nome}.`;
  const papel = c.papel == null || c.papel === "" ? "outro" : c.papel;
  if (typeof papel !== "string" || !PAPEL_KEYS.includes(papel)) return `Papel inválido no contato ${nome}.`;
  return { nome, cargo, email, telefone, papel: papel as PapelContato, notas };
}

/** Valida o corpo do cadastro. Devolve a entrada pronta ou a mensagem de erro. */
export function lerCliente(corpo: unknown): EntradaCliente | string {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return "Requisição inválida.";
  const b = corpo as Record<string, unknown>;
  const nome = txt(b.nome, LIMITES_CLIENTE.nome);
  if (!nome) return "Informe o nome do cliente.";
  if (!chaveCliente(nome)) return "O nome do cliente precisa ter letras ou números.";

  const cnpj = cnpjLimpo(b.cnpj);
  if (cnpj === null) return "CNPJ inválido. Confira os 14 caracteres e os dígitos verificadores.";

  const emailCobranca = txt(b.emailCobranca, LIMITES_CLIENTE.email).toLowerCase();
  if (emailCobranca && !EMAIL.test(emailCobranca)) return "E-mail de cobrança inválido.";

  let diaVencimento: number | null = null;
  if (b.diaVencimento != null && b.diaVencimento !== "") {
    const n = Number(b.diaVencimento);
    if (!Number.isInteger(n) || n < 1 || n > 28) return "Dia de vencimento: de 1 a 28.";
    diaVencimento = n;
  }
  let formaCobranca: string | null = null;
  if (b.formaCobranca != null && b.formaCobranca !== "") {
    if (typeof b.formaCobranca !== "string" || !FORMA_KEYS.includes(b.formaCobranca)) return "Forma de cobrança inválida.";
    formaCobranca = b.formaCobranca;
  }

  let site = txt(b.site, LIMITES_CLIENTE.site);
  if (site) {
    try {
      const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(site) ? site : `https://${site}`);
      if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname.includes(".")) return "Site inválido.";
      site = u.toString();
    } catch {
      return "Site inválido.";
    }
  }

  let contatos: Contato[] | undefined;
  if (b.contatos !== undefined) {
    if (!Array.isArray(b.contatos) || b.contatos.length > LIMITES_CLIENTE.contatos) return "Lista de contatos inválida.";
    contatos = [];
    for (const item of b.contatos) {
      const c = lerContato(item);
      if (typeof c === "string") return c;
      if (c) contatos.push(c);
    }
  }

  return {
    nome,
    razaoSocial: txt(b.razaoSocial, LIMITES_CLIENTE.razaoSocial),
    cnpj,
    inscricaoMunicipal: txt(b.inscricaoMunicipal, LIMITES_CLIENTE.inscricaoMunicipal),
    site,
    segmento: txt(b.segmento, LIMITES_CLIENTE.segmento),
    endereco: longo(b.endereco, LIMITES_CLIENTE.endereco),
    emailCobranca,
    diaVencimento,
    formaCobranca,
    notas: longo(b.notas, LIMITES_CLIENTE.notas),
    contatos,
  };
}

// ---------- contatos tirados do texto das oportunidades ----------

/**
 * O card comercial guarda o contato em texto livre: "Fernando — Diretor de Tax",
 * "Cida (Gerente de Tax)", "Leo e Fabiana". Daqui sai um rascunho de contato por pessoa:
 * o que vem antes do separador é o nome, o resto é o cargo. É uma leitura aproximada, e por
 * isso só roda uma vez, quando a oportunidade entra no cliente; depois o cadastro é de quem
 * edita.
 */
export function contatosDoTexto(texto: string, papel: PapelContato): Contato[] {
  const limpo = (texto ?? "").trim();
  if (!limpo) return [];
  const saida: Contato[] = [];
  for (const parte of limpo.split(/\s*(?:;|\n|\s\/\s|\s\+\s)\s*/)) {
    const p = parte.trim();
    if (!p) continue;
    const email = p.match(/[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/)?.[0]?.toLowerCase() ?? "";
    const semEmail = p.replace(/<?[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+>?/, "").trim();
    const m = semEmail.match(/^(.*?)\s*(?:—|–|\s-\s|\(|,|:)\s*(.*?)\)?$/);
    const nome = (m ? m[1] : semEmail).trim().slice(0, LIMITES_CLIENTE.contatoNome);
    const cargo = (m ? m[2] : "").trim().slice(0, LIMITES_CLIENTE.cargo);
    if (!nome || nome.length < 2) continue;
    saida.push({ nome, cargo, email, telefone: "", papel, notas: "" });
  }
  return saida;
}

/** Mesma pessoa? Compara o nome sem caixa nem acento. */
export function chaveContato(nome: string): string {
  return nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// ---------- possíveis duplicados ----------

/**
 * Pares de clientes que parecem o mesmo e a chave não juntou: um nome é o começo do outro
 * ("globe" e "globe quimica"), ou os dois têm o mesmo CNPJ. É sugestão: quem decide é a pessoa.
 */
export function possiveisDuplicados<T extends { id: number; nome: string; cnpj: string }>(clientes: T[]): [T, T][] {
  const pares: [T, T][] = [];
  const itens = clientes.map((c) => ({ c, chave: chaveCliente(c.nome) })).sort((a, b) => a.chave.localeCompare(b.chave));
  for (let i = 0; i < itens.length; i++) {
    for (let j = i + 1; j < itens.length; j++) {
      const a = itens[i];
      const b = itens[j];
      const mesmoCnpj = !!a.c.cnpj && a.c.cnpj === b.c.cnpj;
      // Prefixo por palavra inteira, e com pelo menos 4 letras: "sa" não é começo de "santander".
      const prefixo = a.chave.length >= 4 && b.chave.startsWith(a.chave + " ");
      if (mesmoCnpj || prefixo) pares.push([a.c, b.c]);
    }
  }
  return pares;
}
