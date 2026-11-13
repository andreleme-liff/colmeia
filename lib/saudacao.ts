// Saudação da Visão geral: "Boa tarde, André!" e uma linha sobre o dia.
//
// Três ideias juntas, e um cuidado para não cansar:
//  1. a saudação muda com a hora e com o dia da semana (segunda, sexta, fim de semana,
//     madrugada), mas nem sempre: em parte dos dias fica a saudação simples;
//  2. a segunda linha diz UMA coisa útil, a mais importante que houver: venda fechada, volta
//     depois de uns dias fora, o que está vencido, o que vence hoje ou amanhã, ou dia livre;
//  3. cada situação tem várias formas de dizer, e a escolha gira com o dia.
//
// A escolha é DETERMINÍSTICA por pessoa e por dia: a frase não troca a cada clique nem a cada
// recarga (isso sim cansaria), e dois dias seguidos não repetem a mesma forma enquanto houver
// outra. Nada aqui é sorteado, então dá para testar (scripts/verificar-saudacao.mjs).

export type FatosDoDia = {
  /** Contas que foram para Ganho nas últimas 48 horas. */
  ganhosRecentes: string[];
  /** Dias desde a última vez que a pessoa abriu o sistema neste navegador; null = não se sabe. */
  diasFora: number | null;
  /** Do que é da própria pessoa (tarefas e próximos passos de oportunidades). */
  meus: { vencidos: number; hoje: number; amanha: number; abertos: number };
  /** Do time inteiro, para quem não tem nada no próprio nome. */
  time: { vencidos: number; hoje: number };
};

export type Saudacao = { titulo: string; linha: string };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Número do dia (dias desde 1970) no fuso de quem olha: é o que faz a frase girar. */
export function numeroDoDia(agora: Date): number {
  return Math.floor((agora.getTime() - agora.getTimezoneOffset() * 60000) / 86400000);
}

/** Escolhe uma das formas: gira com o dia, deslocada por pessoa e por situação. */
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

/** A linha do dia: a primeira situação que valer, na ordem do que mais importa saber. */
function linhaDe(f: FatosDoDia, agora: Date, dia: number, userId: number): string {
  const gira = (formas: string[], situacao: number) => escolher(formas, dia, userId + situacao * 7);

  if (f.ganhosRecentes.length) {
    const nomes = f.ganhosRecentes.slice(0, 2).join(" e ") + (f.ganhosRecentes.length > 2 ? ` e mais ${f.ganhosRecentes.length - 2}` : "");
    const varios = f.ganhosRecentes.length > 1;
    return gira(
      [
        `${nomes} ${varios ? "viraram" : "virou"} Ganho. Vale comemorar.`,
        `Venda fechada: ${nomes}.`,
        `Tem Ganho novo no pipeline: ${nomes}.`,
        `${nomes} ${varios ? "entraram" : "entrou"} para a lista de clientes.`,
      ],
      1
    );
  }

  if (f.diasFora !== null && f.diasFora >= 3) {
    const pendente = f.meus.vencidos + f.meus.hoje;
    const resto = pendente ? ` Há ${plural(pendente, "item esperando", "itens esperando")} você.` : " Nada ficou esperando você.";
    return gira([`Bom te ver de volta depois de ${f.diasFora} dias.`, `Faz ${f.diasFora} dias desde a última visita.`, `De volta depois de ${f.diasFora} dias.`], 2) + resto;
  }

  if (f.meus.vencidos) {
    const n = plural(f.meus.vencidos, "item seu passou do prazo", "itens seus passaram do prazo");
    return gira([`${n}. Bom lugar para começar.`, `${n}.`, `Antes de tudo: ${n}.`, `${n}. Reagendar também resolve.`], 3);
  }

  if (f.meus.hoje) {
    const n = plural(f.meus.hoje, "item seu vence hoje", "itens seus vencem hoje");
    return gira([`${n}.`, `Para hoje: ${n}.`, `${n}. O resto pode esperar.`], 4);
  }

  if (f.meus.amanha) {
    const n = plural(f.meus.amanha, "item seu vence amanhã", "itens seus vencem amanhã");
    return gira([`Hoje está livre; ${n}.`, `${n}.`, `Nada para hoje, mas ${n}.`], 5);
  }

  if (f.meus.abertos) {
    const fimDeSemana = agora.getDay() === 0 || agora.getDay() === 6;
    return gira(
      fimDeSemana
        ? ["Nada vencendo. Fim de semana é fim de semana.", "Tudo em dia por aqui.", "Sem prazo apertado no seu nome."]
        : ["Nada seu vence hoje nem amanhã.", "Tudo em dia no seu nome.", "Sem prazo apertado hoje. Bom dia para adiantar o que importa.", "Seus prazos estão em dia."],
      6
    );
  }

  // Ninguém atribuiu nada a esta pessoa: fala do time, sem apontar o dedo.
  if (f.time.vencidos) return gira([`O time tem ${plural(f.time.vencidos, "item fora do prazo", "itens fora do prazo")}.`, `${plural(f.time.vencidos, "item do time passou", "itens do time passaram")} do prazo.`], 7);
  if (f.time.hoje) return gira([`${plural(f.time.hoje, "item do time vence", "itens do time vencem")} hoje.`, `Hoje o time tem ${plural(f.time.hoje, "prazo", "prazos")}.`], 8);
  return gira(["Tudo em dia por aqui.", "Nenhum prazo apertado no time.", "Dia tranquilo no quadro."], 9);
}

export function saudar(nome: string, userId: number, agora: Date, fatos: FatosDoDia): Saudacao {
  const dia = numeroDoDia(agora);
  return { titulo: tituloDe(nome, agora, dia, userId), linha: linhaDe(fatos, agora, dia, userId) };
}
