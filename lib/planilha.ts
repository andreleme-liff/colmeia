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

import { normalizarConta, normalizarTexto, slugificar } from "./domain";

export type LinhaImportada = {
  conta: string;
  escopo: string;
  estagio: string;
  situacao: string;
  proximoPasso: string;
  contato: string;
  responsavelTexto: string;
  produtoId: string | null;
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

/** Aceita variações de acento e caixa nos cabeçalhos das planilhas de oportunidade. */
const COLUNAS: Record<string, keyof LinhaImportada | "setor"> = {
  empresa: "conta",
  conta: "conta",
  "regtrack setor": "setor",
  setor: "setor",
  produto: "setor",
  "situacao atual": "situacao",
  situacao: "situacao",
  "proximos passos": "proximoPasso",
  "proximo passo": "proximoPasso",
  "contato cargo": "contato",
  contato: "contato",
  responsavel: "responsavelTexto",
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


export type LinhaPrevia = LinhaImportada & { setorOriginal: string; existente: boolean };
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
      const campos: Record<string, string> = {};
      cabDeal.mapa.forEach((destino, i) => {
        if (!destino) return;
        const bruto = String(linha[i] ?? "").trim();
        campos[destino] = PLACEHOLDER.test(bruto) ? "" : bruto;
      });
      const conta = (campos.conta ?? "").trim();
      if (!conta || RODAPE.test(conta)) continue;

      const situacao = campos.situacao ?? "";
      const proximo = campos.proximoPasso ?? "";
      const setor = campos.setor ?? "";
      linhas.push({
        conta,
        escopo: "",
        // "Não é o momento" não é casa do funil: é o estágio On hold, que substituiu o antigo
        // interruptor "Em pausa".
        estagio: pausaSugerida(situacao, proximo) ? "on_hold" : estagioSugerido(situacao),
        situacao,
        proximoPasso: proximo,
        contato: campos.contato ?? "",
        responsavelTexto: campos.responsavelTexto ?? "",
        produtoId: setor ? slugificar(setor) : null,
        setorOriginal: setor,
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
