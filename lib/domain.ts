// Constantes do domínio, compartilhadas entre servidor e cliente.
// As cores das áreas são tokens do design system — o valor real depende do tema.

export const AREAS = [
  { id: "law-firms", label: "Law Firms", short: "LAW", color: "var(--liff-app-area-law-firms)" },
  { id: "corporate", label: "Corporate", short: "CORP", color: "var(--liff-app-area-corporate)" },
  { id: "public-sector", label: "Public Sector", short: "PUB", color: "var(--liff-app-area-public-sector)" },
  { id: "tax", label: "Tax", short: "TAX", color: "var(--liff-app-area-tax)" },
  { id: "labs", label: "Labs", short: "LABS", color: "var(--liff-app-area-labs)" },
  { id: "social", label: "Social", short: "SOC", color: "var(--liff-app-area-social)" },
] as const;

export type AreaId = (typeof AREAS)[number]["id"];
export const AREA_IDS = AREAS.map((a) => a.id) as readonly string[];

export const STATUS = [
  { key: "backlog", label: "Backlog" },
  { key: "andamento", label: "Em andamento" },
  { key: "revisao", label: "Em revisão" },
  { key: "concluido", label: "Concluído" },
] as const;

export type StatusKey = (typeof STATUS)[number]["key"];
export const STATUS_KEYS = STATUS.map((s) => s.key) as readonly string[];

/**
 * O funil. `validacao` é onde a conta já topou explorar e os dois lados estão provando que dá
 * para fazer, antes de existir preço: NDA, transferência de dados, POC, refinamento de escopo.
 * Fica antes de `proposta` de propósito — sem ela, um card em NDA ficava obrigado a se declarar
 * em Proposta ou Negociação, adiantando o pipeline sobre trabalho que ainda é técnico e jurídico.
 *
 * A ordem desta lista é o funil: mover ±1 anda por ela, e o CHECK do banco é gerado a partir
 * das chaves (ver `lib/db.ts`).
 */
export const STAGES = [
  { key: "lead", label: "Lead" },
  { key: "qualificacao", label: "Qualificação" },
  { key: "validacao", label: "Validação" },
  { key: "proposta", label: "Proposta" },
  { key: "negociacao", label: "Negociação" },
  { key: "ganho", label: "Ganho" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];
export const STAGE_KEYS = STAGES.map((s) => s.key) as readonly string[];

export const PRIORIDADES = ["alta", "media", "baixa"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

/**
 * Comparador de rótulo em português. `localeCompare` com pt-BR é o que faz "Ática" cair
 * antes de "Atlas" e não depois de "Zurique" — ordenar por code point jogaria tudo que tem
 * acento para o fim da lista.
 *
 * Vale para cadastro: pessoa, área, produto, conta. Não vale para `STAGES`, `STATUS` nem
 * `PRIORIDADES` — essas listas são um funil, um fluxo e uma escala, e em ordem alfabética
 * diriam a coisa errada (Ganho antes de Lead).
 */
export function porTexto(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

/** Nível de acesso a uma área. Ausência de registro = sem acesso. */
export type Nivel = "view" | "edit";

/** O papel define o teto de permissão; a matriz por área refina dentro dele. */
export const PAPEIS = ["admin", "gestor", "membro", "leitura"] as const;
export type Papel = (typeof PAPEIS)[number];

// "atividades" saiu: era a mesma coleção de Operações em forma de tabela plana. Duas
// entradas de menu para o mesmo dado obrigam a escolher antes de olhar, e o quadro já
// mostra área, responsável, prazo e prioridade em cada card.
export const NAV = [
  { key: "overview", label: "visão geral" },
  { key: "comercial", label: "comercial" },
  { key: "operacoes", label: "operações" },
  { key: "cronograma", label: "cronograma" },
  { key: "cadastros", label: "cadastros" },
  { key: "admin", label: "administração" },
  { key: "auditoria", label: "auditoria" },
  // Aplicativos externos (o Claude) que alguém autorizou a agir em seu nome pelo MCP. Para
  // TODOS, não só admin: cada pessoa revoga as próprias conexões — por isso não mora em
  // Cadastros, que é só da administração.
  { key: "conexoes", label: "conexões" },
] as const;

export const TITLES: Record<string, string> = {
  overview: "Visão geral",
  comercial: "Pipeline comercial",
  operacoes: "Quadro operacional",
  cronograma: "Cronograma",
  cadastros: "Cadastros",
  admin: "Administração",
  auditoria: "Auditoria",
  conexoes: "Conexões",
};

export const ADMIN_CARDS = [
  {
    title: "PAPÉIS",
    body: "Admin, Gestor, Membro e Leitura. O papel define o teto de permissão; a matriz acima refina por área.",
  },
  {
    title: "SSO GOOGLE",
    body: "Login restrito ao domínio getliff.ai. Novos usuários entram sem área atribuída até liberação.",
  },
  {
    title: "RETENÇÃO DE LOG",
    body: "Registro imutável por 24 meses: autor, horário, entidade, campo, valor anterior e novo.",
  },
];

/**
 * Id derivado do nome. O conjunto de caracteres é restrito de propósito: no caso das áreas
 * o id vira nome de variável CSS, e vale manter a mesma regra para produtos.
 */
export function slugificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export type Produto = { id: string; label: string; area: string; ativo: boolean };

/**
 * Chave de comparação de nome de empresa, usada para deduplicar na importação. Ignora
 * caixa, acento, pontuação e sufixo societário — "GLOBE QUIMICA S.A" e "Globe Química SA"
 * são a mesma conta, e a planilha alterna entre as duas grafias.
 */
export function normalizarConta(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(s\.?a\.?|ltda\.?|eireli|me|epp|inc\.?|s\/a)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Chave de comparação de texto livre, usada para deduplicar título de atividade na
 * importação. Diferente de `normalizarConta`: não mexe em sufixo societário, porque um
 * to-do não é razão social — só ignora caixa, acento e espaço repetido.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type Area = { id: string; label: string; short: string; color: string };

/**
 * Registro em memória do cadastro de áreas, preenchido pelo cliente com o que vem do banco.
 * A cor devolvida é sempre a variável CSS `--liff-app-area-<id>` — quem define o valor dela é
 * o bloco de estilo que o cliente injeta a partir do cadastro, e é por isso que o tema claro
 * continua derivando a variante escurecida sozinho.
 *
 * O padrão abaixo vale para o servidor e para o primeiro render, antes de o estado carregar.
 */
let registroAreas: Area[] = AREAS.map((a) => ({ ...a }));

export function setAreas(lista: { id: string; label: string; short: string }[]): void {
  if (!lista?.length) return;
  registroAreas = lista.map((a) => ({ ...a, color: `var(--liff-app-area-${a.id})` }));
}

export function todasAreas(): Area[] {
  return registroAreas;
}

export function areaOf(id: string): Area {
  return (
    registroAreas.find((a) => a.id === id) ?? {
      id,
      label: "—",
      short: "—",
      color: "var(--liff-text-faint)",
    }
  );
}

export function statusLabel(k: string): string {
  return STATUS.find((s) => s.key === k)?.label ?? k;
}

export function stageLabel(k: string): string {
  return STAGES.find((s) => s.key === k)?.label ?? k;
}

/** Uma casa decimal só quando ela diz alguma coisa: "1,5k" sim, "420,0k" não. */
function compacto(n: number): string {
  const arredondado = Math.round(n * 10) / 10;
  return Number.isInteger(arredondado)
    ? String(arredondado)
    : arredondado.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Valor para leitura rápida — cabe no card e no total da coluna.
 *
 * A escala muda com a grandeza em vez de ser sempre em milhares. Fixo em "k", tudo abaixo de
 * R$ 500 arredondava para zero: uma oportunidade salva com R$ 200 voltava do banco correta e
 * aparecia no card como "R$ 0k", como se não valesse nada.
 *
 * Continua sendo aproximação acima de mil — para o valor exato existe `brlExato`, que é o que
 * a auditoria usa.
 */
export function brl(centavos: number): string {
  const reais = centavos / 100;
  const grandeza = Math.abs(reais);
  if (grandeza < 1000) return "R$ " + Math.round(reais).toLocaleString("pt-BR");
  if (grandeza < 1_000_000) return "R$ " + compacto(reais / 1000) + "k";
  return "R$ " + compacto(reais / 1_000_000) + "M";
}

/** Valor exato, com centavos. Histórico de dinheiro não arredonda. */
export function brlExato(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Prazo em dd/MM, que é como o quadro sempre mostrou. */
export function ddmm(iso: string | null): string {
  if (!iso) return "—";
  const [, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}`;
}

/** Data e hora curtas para o log: dd/MM HH:mm. */
export function stamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* =========================================================
   Semanas — base do cronograma
   ========================================================= */

/** Data local em ISO (yyyy-mm-dd), sem passar por UTC. `toISOString` desloca o dia. */
export function diaISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Data de um `yyyy-mm-dd` à meia-noite local. */
export function daISO(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

/** Segunda-feira da semana que contém a data. A semana de trabalho começa nela. */
export function inicioDaSemana(d: Date): Date {
  const seg = new Date(d);
  seg.setHours(0, 0, 0, 0);
  // getDay(): 0 é domingo. Domingo pertence à semana que começou na segunda anterior.
  const desloca = (seg.getDay() + 6) % 7;
  seg.setDate(seg.getDate() - desloca);
  return seg;
}

/**
 * Sexta-feira da semana corrente — o "fim da semana" que o cronograma assume para um
 * próximo passo sem data.
 *
 * Se a sexta já passou (estamos no sábado ou domingo), vale a sexta seguinte: jogar o item
 * para uma data no passado o marcaria como atrasado por causa do fim de semana, e não por
 * causa de alguém ter deixado a bola cair.
 */
export function fimDaSemana(hoje = new Date()): string {
  const sexta = inicioDaSemana(hoje);
  sexta.setDate(sexta.getDate() + 4);
  const base = new Date(hoje);
  base.setHours(0, 0, 0, 0);
  if (sexta < base) sexta.setDate(sexta.getDate() + 7);
  return diaISO(sexta);
}

/** "Semana de 18/08" — rótulo do bloco no cronograma. */
export function rotuloDaSemana(segundaISO: string): string {
  const seg = daISO(segundaISO);
  const sex = new Date(seg);
  sex.setDate(sex.getDate() + 4);
  const dm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${dm(seg)} a ${dm(sex)}`;
}

// ---------------------------------------------------------------------------
// Modelo comercial e valor em palavras
//
// O contrato de prestação de serviços tem três componentes de remuneração —
// implantação, customização ("add-on") e assinatura mensal —, os dois primeiros
// cobrados à parte e parceláveis em até 12 vezes. Daqui saem o valor total e o
// texto que vai dentro do contrato.
// ---------------------------------------------------------------------------

/** Teto de parcelas do modelo comercial, nas duas cobranças de uma vez. */
export const MAX_PARCELAS = 12;

/** Teto de duração do contrato em meses. É o mesmo limite que o ACE aceita. */
export const MAX_DURACAO_MESES = 144;

export type ModeloComercial = {
  implantacaoCentavos: number;
  addonCentavos: number;
  mensalCentavos: number;
  duracaoMeses: number;
};

/**
 * Valor total do contrato: as duas cobranças de uma vez mais a assinatura ao
 * longo da vigência. É o número que vira `valor_centavos` do card quando o
 * modelo está preenchido — ter os dois lados editáveis à mão era convite para
 * o card dizer um valor e o contrato outro.
 */
export function tcvCentavos(m: ModeloComercial): number {
  return (
    Math.max(0, m.implantacaoCentavos) +
    Math.max(0, m.addonCentavos) +
    Math.max(0, m.mensalCentavos) * Math.max(0, m.duracaoMeses)
  );
}

/**
 * Parcela de uma cobrança, e o que sobra da divisão.
 *
 * `resto` existe porque a cláusula do contrato diz "parcelas iguais, mensais e
 * sucessivas", e isso só é verdade quando o total divide exato. R$ 25.000,00 em
 * 12 vezes dá R$ 2.083,33, que somadas fecham R$ 24.999,96 — quatro centavos a
 * menos do que a cláusula afirma. Quem chama decide o que fazer; o importante é
 * que a diferença seja visível em vez de aparecer na conciliação do financeiro.
 */
export function parcelaCentavos(totalCentavos: number, parcelas: number): { centavos: number; resto: number } {
  const total = Math.max(0, Math.round(totalCentavos));
  const n = Math.max(1, Math.round(parcelas));
  const centavos = Math.floor(total / n);
  return { centavos, resto: total - centavos * n };
}

const UNIDADES = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
  "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos",
  "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos",
];
/** Escalas, do grupo de três menos significativo para o mais. */
const ESCALAS: { singular: string; plural: string }[] = [
  { singular: "", plural: "" },
  { singular: "mil", plural: "mil" },
  { singular: "milhão", plural: "milhões" },
  { singular: "bilhão", plural: "bilhões" },
];

/** Um grupo de 1 a 999 em palavras. "cem" e "cento e um" são casos distintos. */
function grupoEmPalavras(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(" e ");
}

/**
 * Inteiro em palavras, em português. Usado para os extensos do contrato.
 *
 * A regra do "e" entre grupos não é uniforme: liga-se o último grupo com "e"
 * quando ele é menor que cem ou múltiplo exato de cem ("mil e vinte", "um milhão
 * e quinhentos"), e com vírgula nos demais casos ("mil, duzentos e trinta").
 */
export function inteiroEmPalavras(n: number): string {
  const v = Math.abs(Math.round(n));
  if (v === 0) return "zero";

  const grupos: number[] = [];
  for (let resto = v; resto > 0; resto = Math.floor(resto / 1000)) grupos.push(resto % 1000);

  const ditos: string[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    const escala = ESCALAS[i];
    // Acima de bilhão a tabela de escalas acaba. Num contrato, recusar é melhor que
    // escrever um extenso errado: é o extenso que prevalece em caso de divergência.
    if (!escala) throw new RangeError(`valor fora da faixa com extenso em português: ${v}`);
    // "mil" não leva "um" na frente: 1.000 é "mil", não "um mil".
    const corpo = i === 1 && g === 1 ? "" : grupoEmPalavras(g);
    const nome = i === 0 ? "" : g === 1 ? escala.singular : escala.plural;
    ditos.push([corpo, nome].filter(Boolean).join(" "));
  }
  if (ditos.length === 1) return ditos[0];

  const ultimoGrupo = grupos.find((g) => g > 0) as number;
  const ligaComE = ultimoGrupo < 100 || ultimoGrupo % 100 === 0;
  const cabeca = ditos.slice(0, -1).join(", ");
  return `${cabeca}${ligaComE ? " e " : ", "}${ditos[ditos.length - 1]}`;
}

/**
 * Valor em palavras para dentro do contrato: "sessenta mil reais", "dois mil e
 * oitenta e três reais e trinta e três centavos".
 *
 * É calculado, nunca digitado. Quando o algarismo e o extenso divergem num
 * contrato, prevalece o extenso — então um extenso errado não é erro de
 * digitação, é o valor do contrato.
 *
 * O "de" de "um milhão de reais" só entra quando o valor é múltiplo exato de um
 * milhão: com grupos abaixo, é "um milhão e quinhentos mil reais".
 */
export function reaisEmPalavras(centavos: number): string {
  const total = Math.abs(Math.round(centavos));
  const reais = Math.floor(total / 100);
  const cents = total % 100;

  const partes: string[] = [];
  if (reais || !cents) {
    const milhoesExatos = reais >= 1_000_000 && reais % 1_000_000 === 0;
    const moeda = reais === 1 ? "real" : "reais";
    partes.push(`${inteiroEmPalavras(reais)} ${milhoesExatos ? "de " : ""}${moeda}`);
  }
  if (cents) partes.push(`${inteiroEmPalavras(cents)} ${cents === 1 ? "centavo" : "centavos"}`);
  return partes.join(" e ");
}

// ---------------------------------------------------------------------------
// "Só o que é meu"
//
// O filtro de responsável não pode olhar apenas `responsavelId`. A importação de
// planilha grava SÓ `responsavel_texto` — o responsável vem como texto livre na
// coluna RESPONSÁVEL ("Bruno Santo", "Bianka", "Bruno Santo / Felipe Zambon") e
// nenhuma linha ganha `responsavel_user_id`. Filtrar por id devolveria zero
// oportunidades no pipeline inteiro do Tax, e o filtro pareceria quebrado.
//
// Então: id quando existe, nome quando não existe. O nome é heurística, e por
// isso tem guarda de ambiguidade — ver `textoMencionaPessoa`.
// ---------------------------------------------------------------------------

/**
 * Separadores que a planilha e o cadastro à mão usam para listar mais de uma
 * pessoa no mesmo campo. O " e " cercado de espaço cobre "Vivi e Giordani" sem
 * pegar o "e" dentro de palavra.
 */
const SEPARADORES_DE_NOME = /\s*(?:\/|,|;|&|\+|\se\s)\s*/;

/** Os nomes que um campo de responsável em texto livre contém. */
export function nomesDoTexto(texto: string): string[] {
  return (texto ?? "")
    .split(SEPARADORES_DE_NOME)
    .map((p) => p.trim())
    .filter(Boolean);
}

const palavrasDe = (s: string) => normalizarTexto(s).split(" ").filter(Boolean);
/** `a` contém todas as palavras de `b`. */
const cobre = (a: string[], b: string[]) => b.length > 0 && b.every((w) => a.includes(w));

/**
 * O texto livre de responsável se refere a `nome`?
 *
 * Duas direções, e a segunda é a que precisa de cuidado:
 *
 *  · o trecho contém o nome inteiro — "Bruno Santo Filho" para "Bruno Santo";
 *  · o trecho é PARTE do nome — "Bianka" para "Bianka Moreira". Aqui mora o risco:
 *    com "Bruno Santo" e "Bruno Costa" cadastrados, um "Bruno" solto não decide
 *    de quem é. `outrosNomes` existe para isso — se o trecho couber em mais de
 *    uma pessoa, não é de ninguém. Errar para menos esconde um card do dono;
 *    errar para mais mostra a carteira de outra pessoa como se fosse sua, o que
 *    é pior num filtro em que as pessoas confiam para saber o que lhes cabe.
 */
export function textoMencionaPessoa(texto: string, nome: string, outrosNomes: string[] = []): boolean {
  const meu = palavrasDe(nome);
  if (!meu.length) return false;

  return nomesDoTexto(texto).some((trecho) => {
    const dele = palavrasDe(trecho);
    if (!dele.length) return false;
    if (cobre(dele, meu)) return true;
    if (!cobre(meu, dele)) return false;
    // Parte do meu nome: só vale se não servir para mais ninguém.
    return !outrosNomes.some((o) => cobre(palavrasDe(o), dele));
  });
}

// ---------------------------------------------------------------------------
// Filtro por responsável
//
// A lista de opções sai dos DADOS, e não da tabela de pessoas. A razão é a
// importação de planilha: ela grava `responsavel_texto` e nunca
// `responsavel_user_id`, então o pipeline inteiro é texto livre — "Bianka",
// "Bruno Santo / Felipe Zambon", "Agente 2". Uma lista só com gente cadastrada
// deixaria as linhas de "Agente 2" sem nenhuma opção que as alcance: fora de
// todo filtro e visíveis apenas em "todos", que é a pior maneira de esconder o
// trabalho de alguém.
//
// Daí três tipos de chave:
//   u:<id>    pessoa cadastrada — o texto resolveu para ela, sem ambiguidade
//   t:<slug>  texto que não resolveu: "Agente 2", ou "Bruno" com dois Brunos
//   sem       responsável em branco
// ---------------------------------------------------------------------------

export const CHAVE_SEM_RESPONSAVEL = "sem";
export const ROTULO_SEM_RESPONSAVEL = "Sem responsável";

/** Teto de itens numa seleção gravada, para limitar o que vai à coluna de preferências. */
export const MAX_RESPONSAVEIS_NA_SELECAO = 50;

export type RegistroComResponsavel = { responsavelId?: number | null; responsavelTexto?: string };
export type Pessoa = { id: number; nome: string };

export type OpcaoResponsavel = {
  chave: string;
  label: string;
  /** Quantos registros em escopo caem nesta chave. */
  qtd: number;
  /** Pessoa cadastrada, e não texto solto — ordena a lista e muda o marcador. */
  cadastrada: boolean;
};

const slugDe = (texto: string) =>
  normalizarTexto(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** A chave de um responsável em texto livre. Texto que vira slug vazio é "sem". */
export function chaveDeTexto(texto: string): string {
  const s = slugDe(texto);
  return s ? `t:${s}` : CHAVE_SEM_RESPONSAVEL;
}

/** Chave e rótulo de cada responsável de um registro. */
function resolver(registro: RegistroComResponsavel, pessoas: Pessoa[]): { chave: string; label: string }[] {
  if (registro.responsavelId != null) {
    const p = pessoas.find((x) => x.id === registro.responsavelId);
    return [{ chave: `u:${registro.responsavelId}`, label: p?.nome ?? `#${registro.responsavelId}` }];
  }

  const trechos = nomesDoTexto(registro.responsavelTexto ?? "");
  if (!trechos.length) return [{ chave: CHAVE_SEM_RESPONSAVEL, label: ROTULO_SEM_RESPONSAVEL }];

  return trechos.map((trecho) => {
    const candidatos = pessoas.filter((p) =>
      textoMencionaPessoa(trecho, p.nome, pessoas.filter((o) => o.id !== p.id).map((o) => o.nome))
    );
    // Um candidato resolve. Zero é texto que não é ninguém da equipe; dois ou mais é
    // ambiguidade. Nos dois casos o trecho vale por si mesmo: uma opção "Bruno" é melhor
    // que atribuir o card ao Bruno errado.
    return candidatos.length === 1
      ? { chave: `u:${candidatos[0].id}`, label: candidatos[0].nome }
      : { chave: chaveDeTexto(trecho), label: trecho };
  });
}

/**
 * Para quais chaves de filtro um registro conta.
 *
 * Mais de uma quando o campo traz uma dupla: "Bruno Santo / Felipe Zambon" aparece no
 * filtro do Bruno e no do Felipe, porque o card é dos dois.
 */
export function chavesDoResponsavel(registro: RegistroComResponsavel, pessoas: Pessoa[]): string[] {
  return [...new Set(resolver(registro, pessoas).map((r) => r.chave))];
}

/**
 * As opções do filtro, tiradas dos registros em escopo.
 *
 * Tem de ser chamada ANTES de aplicar o próprio filtro, senão escolher uma pessoa colapsa
 * a lista para ela só e não há como voltar.
 */
export function opcoesDeResponsavel(registros: RegistroComResponsavel[], pessoas: Pessoa[]): OpcaoResponsavel[] {
  const acc = new Map<string, OpcaoResponsavel>();

  for (const r of registros) {
    const vistas = new Set<string>();
    for (const { chave, label } of resolver(r, pessoas)) {
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      const atual = acc.get(chave);
      if (atual) atual.qtd++;
      else acc.set(chave, { chave, label, qtd: 1, cadastrada: chave.startsWith("u:") });
    }
  }

  // Cadastradas primeiro, texto solto depois, "sem responsável" por último — o vazio é o
  // que menos se procura e o que mais polui o topo de uma lista.
  const peso = (o: OpcaoResponsavel) => (o.chave === CHAVE_SEM_RESPONSAVEL ? 2 : o.cadastrada ? 0 : 1);
  return [...acc.values()].sort(
    (a, b) => peso(a) - peso(b) || a.label.localeCompare(b.label, "pt-BR")
  );
}

/** Seleção vazia é "todos" — é o estado inicial e o que o botão "Todos" devolve. */
export function ehDoResponsavel(
  registro: RegistroComResponsavel,
  selecao: readonly string[],
  pessoas: Pessoa[]
): boolean {
  if (!selecao.length) return true;
  return chavesDoResponsavel(registro, pessoas).some((c) => selecao.includes(c));
}

const RE_CHAVE = /^(?:sem|u:[0-9]{1,9}|t:[a-z0-9-]{1,60})$/;

/**
 * Lê a seleção gravada, descartando o que não for chave válida.
 *
 * Sem isto uma preferência antiga ou corrompida viraria um filtro que não casa com nada, e
 * a tela apareceria vazia sem explicação — pior que voltar para "todos".
 */
export function lerSelecaoDeResponsaveis(bruto: string | null | undefined): string[] {
  return [...new Set((bruto ?? "").split(",").map((s) => s.trim()).filter((s) => RE_CHAVE.test(s)))].slice(
    0,
    MAX_RESPONSAVEIS_NA_SELECAO
  );
}

/** Forma canônica para gravar. Passa pelo leitor, então o que vai ao banco é sempre válido. */
export function escreverSelecaoDeResponsaveis(selecao: readonly string[]): string {
  return lerSelecaoDeResponsaveis(selecao.join(",")).join(",");
}
