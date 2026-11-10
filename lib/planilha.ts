// Leitura de planilha, independente da origem.
//
// O mesmo mapeamento serve para o arquivo .xlsx aberto no navegador e para a planilha lida
// do Google Drive no servidor: as duas pontas entregam uma GRADE DE TEXTO, e daqui para
// baixo o tratamento é idêntico. Sem isso, sincronizar do Drive teria uma segunda regra de
// interpretação, e as duas divergiriam na primeira planilha nova.
//
// Tudo aqui é determinístico e inspecionável de propósito. Um mapeamento errado grava no
// campo errado sem avisar; com dicionário, cabeçalho não reconhecido simplesmente não entra,
// e a prévia mostra a coluna vazia.

import {
  blockerTipoDaPlanilha, dataDaPlanilha, estagioDaPlanilha, motivoPerdaSugerido, normalizarConta, normalizarTexto,
  separarSituacao, valorDaPlanilha,
} from "./domain.ts";

/**
 * Uma oportunidade lida da planilha, ANTES de o servidor resolver nomes em cadastros: dono,
 * quem resolve o blocker, origem e módulos vêm como TEXTO e o servidor casa com pessoas,
 * origens e produtos — a regra de quem é quem mora num lugar só.
 */
export type LinhaImportada = {
  conta: string;
  /** Aba de onde veio — fica no histórico do card. */
  aba: string;
  estagio: string;
  /** Só a anotação mais recente; as anteriores vão em `situacaoAnterior`. */
  situacao: string;
  situacaoAnterior: string[];
  proximoPasso: string;
  proximoPassoEm: string | null;
  /** Contato / sponsor. */
  contato: string;
  contatoOperacional: string;
  /** Dono em texto ("Bruno Santo"). */
  responsavelTexto: string;
  ponte: string;
  /** Rótulo da origem ("Base Fius"). */
  origem: string;
  dor: string;
  /** Nomes dos módulos ("Apuração assistida"). */
  modulos: string[];
  erp: string;
  valorReais: number | null;
  aceAws: boolean;
  ultimaInteracao: string | null;
  blocker: string;
  blockerTipo: string | null;
  /** Quem resolve o blocker, em texto. */
  blockerDono: string;
  motivoPerda: string | null;
  motivoPerdaDetalhe: string;
  notas: string;
};

export type LinhaAtividadeImportada = {
  titulo: string;
  status: string;
  situacao: string;
  proximoPasso: string;
};

/**
 * A planilha usa esta frase, em todas as colunas, para dizer "ainda não sabemos nada".
 * Sem tratá-la como vazio, ela vira lixo em quatro campos de seis registros.
 */
const PLACEHOLDER = /^descobrir contato no escrit/i;

/**
 * Cabeçalho da planilha → campo. Aceita variações de acento e caixa. Cobre a planilha do
 * LIFF Tax (abas Prospecção e Pipeline) e as anteriores. Cabeçalho fora daqui não entra, e a
 * prévia mostra o campo vazio — mapear errado gravaria no campo errado sem avisar.
 *
 * As duas abas chamam de "Contato" coisas diferentes, e a decisão foi um campo só,
 * "Contato / sponsor": "Contato" e "Sponsor / decisor" caem no mesmo lugar, juntos quando a
 * linha tem os dois. ID e Status FUP ficam de fora: o sistema gera a referência e calcula o
 * FUP.
 */
type Destino = keyof LinhaImportada | "valor" | "ace";
const COLUNAS: Record<string, Destino> = {
  empresa: "conta",
  conta: "conta",
  estagio: "estagio",
  dono: "responsavelTexto",
  responsavel: "responsavelTexto",
  origem: "origem",
  "ponte quem abre a porta": "ponte",
  ponte: "ponte",
  contato: "contato",
  "contato cargo": "contato",
  "sponsor decisor": "contato",
  sponsor: "contato",
  "contato operacional": "contatoOperacional",
  "dor principal": "dor",
  dor: "dor",
  "modulos de interesse": "modulos",
  modulos: "modulos",
  // Planilhas antigas: o setor/produto virou módulo de interesse.
  "regtrack setor": "modulos",
  setor: "modulos",
  produto: "modulos",
  erp: "erp",
  "valor proposta r": "valor",
  "valor proposta": "valor",
  valor: "valor",
  ace: "ace",
  "ultima interacao": "ultimaInteracao",
  "situacao atual": "situacao",
  situacao: "situacao",
  "proximos passos": "proximoPasso",
  "proximo passo": "proximoPasso",
  "data prox passo": "proximoPassoEm",
  "data proximo passo": "proximoPassoEm",
  blocker: "blocker",
  "tipo de blocker": "blockerTipo",
  "dono interno liff": "blockerDono",
  "motivo da perda": "motivoPerda",
  notas: "notas",
};

/** Cabeçalhos da aba de atividades. `to do` cobre "TO-DO", que a planilha escreve com hífen. */
const COLUNAS_ATIVIDADE: Record<string, "titulo" | "status" | "situacao" | "proximoPasso"> = {
  "to do": "titulo",
  todo: "titulo",
  tarefa: "titulo",
  atividade: "titulo",
  acao: "titulo",
  item: "titulo",
  status: "status",
  "situacao atual": "situacao",
  situacao: "situacao",
  "proximos passos": "proximoPasso",
  "proximo passo": "proximoPasso",
};

const chave = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Linha de rodapé que a planilha usa para totalizar ("TOTAL: 4 empresas", "TOTAL: 13 itens").
 * Sem isto ela viraria uma conta chamada "TOTAL: 4 empresas" em toda importação.
 */
const RODAPE = /^total\b/i;

/** Status da atividade a partir do texto livre da planilha. Vazio é backlog, não erro. */
function statusSugerido(bruto: string): string {
  const t = chave(bruto);
  if (!t) return "backlog";
  if (/conclu|feito|final|entregue|done|ok/.test(t)) return "concluido";
  if (/revis|valida|aprova/.test(t)) return "revisao";
  if (/andamento|fazendo|progresso|curso|wip/.test(t)) return "andamento";
  return "backlog";
}

/**
 * Estágio inferido do texto da situação — só uma SUGESTÃO: a prévia da importação mostra o
 * estágio de cada linha e deixa trocar antes de gravar. Na dúvida, o estágio mais atrás,
 * porque adiantar um card indevidamente engana o pipeline.
 *
 * NDA, POC, transferência de dados e refinamento de escopo caem em `validacao`, como antes da
 * troca de estágios (nov/2026). No funil novo Validação vem DEPOIS de Proposta, então "Proposta
 * de POC enviada" agora cai no estágio mais à frente dos dois — vale conferir na prévia.
 */
function estagioSugerido(situacao: string): string {
  const t = situacao.toLowerCase();
  if (!t || PLACEHOLDER.test(t)) return "prospeccao";
  // `tra\w*fer` de propósito: a planilha real escreve "tranferência", sem o s. Casar só a
  // grafia correta jogaria o card para o início do funil por causa de um typo.
  if (/\bnda\b|\bpoc\b|tra\w*fer[êe]ncia d[eo]s? dados|refinamento de escopo/.test(t)) return "validacao";
  if (/proposta\b/.test(t)) return "proposta";
  if (/reuni[ãa]o|apresenta[çc][ãa]o|fup|contato|aproxima[çc][ãa]o/.test(t)) return "primeira_reuniao";
  return "prospeccao";
}

/** "não é o momento", "aguardar" — vai para On hold. */
function pausaSugerida(situacao: string, proximo: string): boolean {
  const t = (situacao + " " + proximo).toLowerCase();
  return /n[ãa]o [ée] o momento|n[ãa]o insistir|aguardar|segundo momento|dificuldades financeiras/.test(t);
}


export type LinhaPrevia = LinhaImportada & { existente: boolean };

/** Chave para casar o nome de um módulo com o produto: sem acento, caixa, espaço nem pontuação
 *  — "Lifftax Starter" da planilha é o "LIFF Tax Starter" do cadastro. */
export function chaveDeModulo(nome: string): string {
  return normalizarTexto(nome).replace(/[^a-z0-9]/g, "");
}
export type LinhaAtividadePrevia = LinhaAtividadeImportada & { existente: boolean };

export type Aba =
  | { nome: string; tipo: "oportunidades"; linhas: LinhaPrevia[] }
  | { nome: string; tipo: "atividades"; linhas: LinhaAtividadePrevia[] }
  | { nome: string; tipo: "ignorada"; motivo: string };

export type AbaComLinhas = Exclude<Aba, { tipo: "ignorada" }>;
export const rendeLinhas = (a: Aba): a is AbaComLinhas => a.tipo !== "ignorada";

/** Índice do cabeçalho e o mapa de colunas, ou null se a aba não é do tipo procurado. */
function acharCabecalho(
  grade: string[][],
  dicionario: Record<string, string>,
  obrigatoria: string
): { i: number; mapa: (string | null)[] } | null {
  // O cabeçalho quase nunca está na primeira linha: as planilhas trazem um título acima.
  const i = grade.findIndex((r) => r.some((c) => dicionario[chave(String(c))] === obrigatoria));
  if (i < 0) return null;
  return { i, mapa: grade[i].map((c) => dicionario[chave(String(c))] ?? null) };
}

/**
 * Classifica e lê uma aba. Coluna de empresa vira oportunidade, coluna de to-do vira
 * atividade, o resto é ignorado com o motivo à vista.
 */
export function lerAba(
  nome: string,
  grade: string[][],
  jaExistem: { contas: Set<string>; titulos: Set<string> }
): Aba {
  const cabDeal = acharCabecalho(grade, COLUNAS, "conta");
  if (cabDeal) {
    const linhas: LinhaPrevia[] = [];
    for (const linha of grade.slice(cabDeal.i + 1)) {
      // Junta quando duas colunas caem no mesmo campo (Contato + Sponsor / decisor).
      const campos: Record<string, string> = {};
      cabDeal.mapa.forEach((destino, i) => {
        if (!destino) return;
        const bruto = String(linha[i] ?? "").trim();
        const valor = PLACEHOLDER.test(bruto) ? "" : bruto;
        if (!valor) return;
        campos[destino] = campos[destino] ? `${campos[destino]} · ${valor}` : valor;
      });
      const conta = (campos.conta ?? "").trim();
      if (!conta || RODAPE.test(conta)) continue;

      const { atual, anteriores } = separarSituacao(campos.situacao ?? "");
      const proximo = campos.proximoPasso ?? "";
      // Estágio: a coluna da planilha ("3 · Proposta enviada"), pelo número. Sem coluna, a
      // inferência pelo texto — e "não é o momento" é On hold.
      const estagio =
        estagioDaPlanilha(campos.estagio ?? "") ??
        (pausaSugerida(atual, proximo) ? "on_hold" : estagioSugerido(atual));
      const motivoTexto = campos.motivoPerda ?? "";
      linhas.push({
        conta,
        aba: nome,
        estagio,
        situacao: atual,
        situacaoAnterior: anteriores,
        proximoPasso: proximo,
        proximoPassoEm: dataDaPlanilha(campos.proximoPassoEm),
        contato: campos.contato ?? "",
        contatoOperacional: campos.contatoOperacional ?? "",
        responsavelTexto: campos.responsavelTexto ?? "",
        ponte: campos.ponte ?? "",
        origem: campos.origem ?? "",
        dor: campos.dor ?? "",
        modulos: (campos.modulos ?? "").split(/[;,\n]|\s\+\s|\s·\s/).map((m) => m.trim()).filter(Boolean),
        erp: campos.erp ?? "",
        valorReais: valorDaPlanilha(campos.valor),
        aceAws: /^(y|yes|s|sim|x|true|1|ok)$/i.test((campos.ace ?? "").trim()),
        ultimaInteracao: dataDaPlanilha(campos.ultimaInteracao),
        blocker: campos.blocker ?? "",
        blockerTipo: blockerTipoDaPlanilha(campos.blockerTipo ?? ""),
        blockerDono: campos.blockerDono ?? "",
        motivoPerda: motivoTexto ? motivoPerdaSugerido(motivoTexto) : null,
        motivoPerdaDetalhe: motivoTexto,
        notas: campos.notas ?? "",
        existente: jaExistem.contas.has(normalizarConta(conta)),
      });
    }
    return linhas.length
      ? { nome, tipo: "oportunidades", linhas }
      : { nome, tipo: "ignorada", motivo: "tem cabeçalho de empresa, mas nenhuma linha preenchida" };
  }

  const cabAtiv = acharCabecalho(grade, COLUNAS_ATIVIDADE, "titulo");
  if (cabAtiv) {
    const linhas: LinhaAtividadePrevia[] = [];
    for (const linha of grade.slice(cabAtiv.i + 1)) {
      const campos: Record<string, string> = {};
      cabAtiv.mapa.forEach((destino, i) => {
        if (!destino) return;
        campos[destino] = String(linha[i] ?? "").trim();
      });
      const titulo = (campos.titulo ?? "").trim();
      if (!titulo || RODAPE.test(titulo)) continue;
      linhas.push({
        titulo,
        status: statusSugerido(campos.status ?? ""),
        situacao: campos.situacao ?? "",
        proximoPasso: campos.proximoPasso ?? "",
        existente: jaExistem.titulos.has(normalizarTexto(titulo)),
      });
    }
    return linhas.length
      ? { nome, tipo: "atividades", linhas }
      : { nome, tipo: "ignorada", motivo: "tem cabeçalho de to-do, mas nenhuma linha preenchida" };
  }

  return { nome, tipo: "ignorada", motivo: "sem coluna de empresa nem de to-do" };
}
