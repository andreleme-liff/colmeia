// Preenchimento de template .docx.
//
// Um .docx é um ZIP de XML. O texto fica em `word/document.xml`, e o Word quebra uma frase
// em vários `<w:r>` (ids de revisão, marcas de corretor) — então a frase que se lê no
// documento quase nunca existe como string contígua no XML. Trocar com `String.replace`
// acerta alguns campos e passa batido em outros, em silêncio.
//
// Aqui cada `<w:t>` é mapeado para a posição dele no texto RENDERIZADO; a busca acontece
// nesse texto e a edição volta para os `<w:t>` que o trecho ocupa. É o que faz
// `{{IMPLANTACAO_VALOR}}` ser encontrado mesmo quando o Word o partiu em três pedaços.
//
// Por que não `docxtemplater`, que é o caminho óbvio: ele é AGPL ou licença comercial paga.
// Num produto fechado vendido a cliente, AGPL não serve. O `fflate` (MIT, 8 KB) entra só
// para ler e escrever o ZIP.

import { unzipSync, zipSync } from "fflate";

/** Partes do pacote onde um campo pode aparecer. Cabeçalho e rodapé também levam texto. */
const PARTES_COM_TEXTO = /^word\/(document|header\d*|footer\d*)\.xml$/;

const RE_T = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
const RE_CAMPO = /\{\{([#^/]?)([A-Z_0-9]+)\}\}/g;

type Regiao = { ini: number; fim: number; abre: string; texto: string; off: number };

/** Índice dos `<w:t>` de uma parte, mais o texto renderizado dela. */
function indexar(xml: string): { regioes: Regiao[]; texto: string } {
  const regioes: Regiao[] = [];
  const partes: string[] = [];
  let off = 0;
  for (const m of xml.matchAll(RE_T)) {
    const texto = m[2];
    regioes.push({ ini: m.index + m[1].length, fim: m.index + m[1].length + texto.length, abre: m[1], texto, off });
    partes.push(texto);
    off += texto.length;
  }
  return { regioes, texto: partes.join("") };
}

/**
 * Troca a primeira ocorrência de `alvo` por `novo`, atravessando fronteira de run.
 *
 * O texto novo vai inteiro no primeiro `<w:t>` atingido e os demais perdem a parte que
 * cabia neles — assim a formatação do início do trecho é a que sobrevive, que é o que se
 * espera ao preencher um campo.
 */
function trocarUma(xml: string, alvo: string, novo: string): string | null {
  const { regioes, texto } = indexar(xml);
  const i = texto.indexOf(alvo);
  if (i < 0) return null;
  const j = i + alvo.length;

  const toca = regioes.filter((r) => r.off < j && r.off + r.texto.length > i);
  if (!toca.length) return null;

  let saida = xml;
  const edicoes = toca.map((r, k) => {
    const a = Math.max(0, i - r.off);
    const b = Math.min(r.texto.length, j - r.off);
    const conteudo = r.texto.slice(0, a) + (k === 0 ? novo : "") + r.texto.slice(b);
    // Sem xml:space="preserve" o Word come espaço nas pontas — e "R$ 60.000,00 (sessenta
    // mil reais)" colado no texto anterior é exatamente o tipo de defeito que ninguém revisa.
    const abre =
      !r.abre.includes("xml:space") && conteudo !== conteudo.trim()
        ? r.abre.slice(0, -1) + ' xml:space="preserve">'
        : r.abre;
    return { ini: r.ini, fim: r.fim, abre: r.abre, novaAbre: abre, conteudo };
  });

  for (const e of edicoes.slice().reverse()) {
    const iniTag = saida.lastIndexOf(e.abre, e.ini);
    saida = saida.slice(0, iniTag) + e.novaAbre + e.conteudo + saida.slice(e.fim);
  }
  return saida;
}

function trocarTodas(xml: string, alvo: string, novo: string): { xml: string; trocas: number } {
  let atual = xml;
  let trocas = 0;
  for (;;) {
    const proximo = trocarUma(atual, alvo, novo);
    if (proximo === null) return { xml: atual, trocas };
    atual = proximo;
    if (++trocas > 500) throw new Error(`laço ao trocar ${alvo}`);
  }
}

/** Escapa o que vai para dentro de um nó de texto XML. */
function escapar(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Resolve os blocos `{{#NOME}}…{{/NOME}}` e `{{^NOME}}…{{/NOME}}`.
 *
 * É o que liga e desliga a cláusula 2.2 do contrato, a da customização. Quando o negócio
 * não tem customização, a cláusula não desaparece: fica "Intencionalmente omitido", porque
 * a numeração da cláusula 2 é texto literal e a 10.4 referencia a 2.4 — apagar a 2.2
 * empurraria tudo uma casa e a referência passaria a apontar para a cláusula errada.
 */
function resolverBlocos(xml: string, ligados: Record<string, boolean>): string {
  let saida = xml;
  for (const [nome, ligado] of Object.entries(ligados)) {
    for (const [marca, mantem] of [
      ["#", ligado],
      ["^", !ligado],
    ] as [string, boolean][]) {
      for (;;) {
        const { texto } = indexar(saida);
        const abre = `{{${marca}${nome}}}`;
        const fecha = `{{/${nome}}}`;
        const i = texto.indexOf(abre);
        if (i < 0) break;
        const f = texto.indexOf(fecha, i);
        if (f < 0) throw new Error(`bloco ${abre} sem fechamento`);
        const corpo = texto.slice(i + abre.length, f);
        const anterior = saida;
        const trocado = trocarUma(saida, abre + corpo + fecha, mantem ? corpo : "");
        if (trocado === null || trocado === anterior) throw new Error(`não consegui resolver ${abre}`);
        saida = trocado;
      }
    }
  }
  return saida;
}

export type Preenchimento = {
  /** Campos simples: `{{NOME}}` vira o valor. */
  campos: Record<string, string>;
  /** Blocos condicionais: `{{#NOME}}…{{/NOME}}` fica, `{{^NOME}}…{{/NOME}}` sai (ou o inverso). */
  blocos?: Record<string, boolean>;
};

export type Resultado = {
  docx: Uint8Array;
  /** Quantas vezes cada campo foi trocado. Zero significa campo que o template não tem. */
  trocas: Record<string, number>;
};

/**
 * Preenche o template e devolve o .docx pronto.
 *
 * Falha quando sobra qualquer `{{...}}` no documento. Isto é deliberado e é a razão de o
 * motor existir: o contrato do Medley foi assinado com seis `[inserir]` em branco, três
 * deles os dias de vencimento das parcelas. Um campo esquecido tem que impedir a geração,
 * não sair no PDF para alguém notar depois.
 */
export function preencherDocx(template: Uint8Array, p: Preenchimento): Resultado {
  const pacote = unzipSync(template);
  const trocas: Record<string, number> = {};
  for (const nome of Object.keys(p.campos)) trocas[nome] = 0;

  const dec = new TextDecoder();
  const enc = new TextEncoder();

  for (const caminho of Object.keys(pacote)) {
    if (!PARTES_COM_TEXTO.test(caminho)) continue;
    let xml = dec.decode(pacote[caminho]);
    if (!xml.includes("{{")) continue;

    if (p.blocos) xml = resolverBlocos(xml, p.blocos);

    for (const [nome, valor] of Object.entries(p.campos)) {
      const r = trocarTodas(xml, `{{${nome}}}`, escapar(valor));
      xml = r.xml;
      trocas[nome] += r.trocas;
    }

    // Nenhum campo pode sobrar. A mensagem nomeia quais, para o erro ser acionável.
    const sobrou = [...indexar(xml).texto.matchAll(RE_CAMPO)].map((m) => m[0]);
    if (sobrou.length) {
      throw new Error(
        `campo não preenchido em ${caminho}: ${[...new Set(sobrou)].join(", ")}`
      );
    }
    pacote[caminho] = enc.encode(xml);
  }

  return { docx: zipSync(pacote), trocas };
}

/** Os campos e blocos que um template pede. Serve para conferir antes de tentar gerar. */
export function camposDoTemplate(template: Uint8Array): { campos: string[]; blocos: string[] } {
  const pacote = unzipSync(template);
  const dec = new TextDecoder();
  const campos = new Set<string>();
  const blocos = new Set<string>();
  for (const caminho of Object.keys(pacote)) {
    if (!PARTES_COM_TEXTO.test(caminho)) continue;
    for (const m of indexar(dec.decode(pacote[caminho])).texto.matchAll(RE_CAMPO)) {
      (m[1] ? blocos : campos).add(m[2]);
    }
  }
  return { campos: [...campos].sort(), blocos: [...blocos].sort() };
}
