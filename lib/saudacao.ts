// Saudação da Visão geral: "Boa tarde, André!" e uma linha sobre o dia.
//
//  1. a saudação muda com a hora e com o dia da semana (segunda, sexta, fim de semana,
//     madrugada), mas nem sempre: em parte dos dias fica a saudação simples;
//  2. a segunda linha diz UMA coisa útil, a mais importante que houver: venda fechada, volta
//     depois de uns dias fora, o que está vencido, o que vence hoje ou amanhã, ou o próximo
//     prazo. E diz O QUÊ, não só quantos: cita o item pelo nome, com link para abrir. "1 item
//     seu vence hoje" obriga a ir procurar; "Vence hoje: Proposta Metalinox" já leva até ele.
//  3. sem frase de enfeite ("bom lugar para começar", "o resto pode esperar"): a variedade vem
//     do conteúdo, que muda todo dia, e não de girar a forma de dizer a mesma contagem.
//
// A escolha do título é DETERMINÍSTICA por pessoa e por dia: não troca a cada clique nem a
// cada recarga. Nada aqui é sorteado, então dá para testar (scripts/verificar-saudacao.mjs).

/** Um item citado na linha: tarefa (T-...) ou oportunidade (C-...). */
export type ItemDoDia = { ref: string; titulo: string; prazo: string | null };

export type FatosDoDia = {
  /** Oportunidades que foram para Ganho nas últimas 48 horas. */
  ganhosRecentes: { ref: string; conta: string }[];
  /** Dias desde a última vez que a pessoa abriu o sistema neste navegador; null = não se sabe. */
  diasFora: number | null;
  /** Do que é da própria pessoa (tarefas e próximos passos de oportunidades), já ordenado pelo prazo. */
  meus: { vencidos: ItemDoDia[]; hoje: ItemDoDia[]; amanha: ItemDoDia[]; proximo: ItemDoDia | null; abertos: number };
  /** Do time inteiro, para quem não tem nada no próprio nome. */
  time: { vencidos: ItemDoDia[]; hoje: ItemDoDia[] };
};

/** Pedaço da linha: texto corrido, link para um item ou link para uma tela. */
export type Trecho = string | { texto: string; ref: string } | { texto: string; ir: string };
export type Saudacao = { titulo: string; linha: Trecho[] };

/** Número do dia (dias desde 1970) no fuso de quem olha: é o que faz o título girar. */
export function numeroDoDia(agora: Date): number {
  return Math.floor((agora.getTime() - agora.getTimezoneOffset() * 60000) / 86400000);
}

/** Escolhe uma das formas: gira com o dia, deslocada por pessoa. */
function escolher<T>(formas: T[], dia: number, deslocamento: number): T {
  return formas[(((dia + deslocamento) % formas.length) + formas.length) % formas.length];
}

function tituloDe(nome: string, agora: Date, dia: number, userId: number): string {
  const h = agora.getHours();
  const semana = agora.getDay(); // 0 = domingo
  const basico = h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
  // Em um de cada três dias fica a saudação simples, para o "especial" continuar especial.
  const simples = (dia + userId) % 3 === 0;

  let especial: string | null = null;
  if (h >= 23 || h < 5) especial = escolher(["Ainda por aqui", "Boa madrugada"], dia, userId);
  else if (h < 7) especial = "Madrugou";
  else if (semana === 6) especial = "Bom sábado";
  else if (semana === 0) especial = "Bom domingo";
  else if (semana === 1 && h < 12) especial = escolher(["Boa segunda", "Bom começo de semana"], dia, userId);
  else if (semana === 5) especial = h < 12 ? "Boa sexta" : escolher(["Sextou", "Boa sexta"], dia, userId);

  // Madrugada e fim de semana sempre aparecem: é quando a saudação comum soaria estranha.
  const sempre = h >= 23 || h < 7 || semana === 0 || semana === 6;
  return `${especial && (sempre || !simples) ? especial : basico}, ${nome}!`;
}

const curto = (s: string, max = 48) => (s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s);
const link = (i: ItemDoDia): Trecho => ({ texto: curto(i.titulo), ref: i.ref });

/**
 * "A", "A e B", "A, B e mais 3": até dois itens com link; o resto vira um link para o
 * cronograma, onde dá para ver todos os prazos de uma vez.
 */
function lista(itens: ItemDoDia[]): Trecho[] {
  if (itens.length === 1) return [link(itens[0])];
  if (itens.length === 2) return [link(itens[0]), " e ", link(itens[1])];
  return [link(itens[0]), ", ", link(itens[1]), " e ", { texto: `mais ${itens.length - 2}`, ir: "cronograma" }];
}

/** "18/11" para um prazo AAAA-MM-DD. */
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** A linha do dia: a primeira situação que valer, na ordem do que mais importa saber. */
function linhaDe(f: FatosDoDia): Trecho[] {
  const { vencidos, hoje, amanha, proximo } = f.meus;
  /** Complemento curto quando, além do principal, também há algo para hoje. */
  const eHoje = (n: number): Trecho[] => (n ? [` Hoje ${n === 1 ? "vence mais 1" : `vencem mais ${n}`}.`] : []);

  if (f.ganhosRecentes.length) {
    const g = f.ganhosRecentes.map((x) => ({ ref: x.ref, titulo: x.conta, prazo: null }));
    return [g.length === 1 ? "Virou Ganho: " : "Viraram Ganho: ", ...lista(g), "."];
  }

  if (f.diasFora !== null && f.diasFora >= 3) {
    const esperando = [...vencidos, ...hoje];
    return esperando.length
      ? [`De volta depois de ${f.diasFora} dias. Esperando você: `, ...lista(esperando), "."]
      : [`De volta depois de ${f.diasFora} dias. Nada ficou esperando você.`];
  }

  if (vencidos.length) {
    return [vencidos.length === 1 ? "Passou do prazo: " : "Passaram do prazo: ", ...lista(vencidos), ".", ...eHoje(hoje.length)];
  }

  if (hoje.length) return [hoje.length === 1 ? "Vence hoje: " : "Vencem hoje: ", ...lista(hoje), "."];

  if (amanha.length) return [amanha.length === 1 ? "Nada para hoje. Amanhã vence " : "Nada para hoje. Amanhã vencem ", ...lista(amanha), "."];

  if (proximo?.prazo) return ["Nada seu vence hoje nem amanhã. Próximo prazo: ", link(proximo), `, em ${diaMes(proximo.prazo)}.`];
  if (f.meus.abertos) return ["Nada seu vence hoje nem amanhã, e o que está aberto não tem prazo."];

  // Ninguém atribuiu nada a esta pessoa: fala do time, sem apontar o dedo.
  if (f.time.vencidos.length) return ["Fora do prazo no time: ", ...lista(f.time.vencidos), "."];
  if (f.time.hoje.length) return ["Vence hoje no time: ", ...lista(f.time.hoje), "."];
  return ["Nenhum prazo apertado no time."];
}

export function saudar(nome: string, userId: number, agora: Date, fatos: FatosDoDia): Saudacao {
  const dia = numeroDoDia(agora);
  return { titulo: tituloDe(nome, agora, dia, userId), linha: linhaDe(fatos) };
}

/** A linha como texto corrido, sem links: para testes e para leitor de tela. */
export function linhaEmTexto(linha: Trecho[]): string {
  return linha.map((t) => (typeof t === "string" ? t : t.texto)).join("");
}
