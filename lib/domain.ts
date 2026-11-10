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
 * Os estágios do pipeline comercial (nov/2026). As sete primeiras casas são o FUNIL, na ordem
 * em que uma venda anda; On hold e Lost ficam fora dele — não são passos, são desvios. On hold
 * substituiu o antigo interruptor "Em pausa" ("não é o momento"): virou coluna própria.
 *
 * O CHECK do banco é gerado a partir destas chaves (ver `lib/db.ts`), e as setas do card andam
 * só pelo FUNIL.
 */
export const STAGES = [
  { key: "prospeccao", label: "Prospecção" },
  { key: "primeira_reuniao", label: "1ª Reunião" },
  { key: "qualificado", label: "Qualificado" },
  { key: "proposta", label: "Proposta" },
  { key: "validacao", label: "Validação" },
  { key: "contrato", label: "Contrato" },
  { key: "ganho", label: "Ganho" },
  { key: "on_hold", label: "On hold" },
  { key: "lost", label: "Lost" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];
/** Onde uma oportunidade nasce quando ninguém diz o estágio. */
export const ESTAGIO_INICIAL: StageKey = "prospeccao";
/** As casas por onde as setas andam, em ordem. On hold e Lost ficam de fora. */
export const FUNIL: readonly StageKey[] = ["prospeccao", "primeira_reuniao", "qualificado", "proposta", "validacao", "contrato", "ganho"];
/** Em aberto = no funil e ainda não ganha. On hold e Lost não contam no pipeline aberto. */
export function estagioEmAberto(k: string): boolean {
  return (FUNIL as readonly string[]).includes(k) && k !== "ganho";
}
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

/* =========================================================
   Referências legíveis
   ========================================================= */
/**
 * C-0104 é uma oportunidade COMERCIAL; T-1012 é uma TAREFA (atividade). A letra diz o tipo
 * — sem ela, "104" poderia ser qualquer um dos dois — e o número é o serial do banco, com
 * quatro dígitos no mínimo (passa de 9999 sem cortar).
 *
 * Até nov/2026 eram D-104 e A-1012. A conversão manteve o NÚMERO e trocou a letra, então a
 * referência antiga se resolve sem consultar nada: D-104 → C-0104, A-1012 → T-1012. É o que
 * mantém funcionando um link antigo colado no WhatsApp ou um "D-104" dito ao Claude.
 */
export const PREFIXO_REF = { oportunidade: "C", atividade: "T" } as const;
const PREFIXO_ANTIGO: Record<string, "C" | "T"> = { D: "C", A: "T" };

export function formatarRef(tipo: keyof typeof PREFIXO_REF, numero: number | string): string {
  return `${PREFIXO_REF[tipo]}-${String(Number(numero)).padStart(4, "0")}`;
}

/** A forma canônica de uma referência digitada, colada ou antiga — ou `null` se não é uma. */
export function refCanonica(bruta: string | null | undefined): string | null {
  const m = /^([CTDA])-0*(\d{1,9})$/.exec((bruta ?? "").trim().toUpperCase());
  if (!m) return null;
  const letra = PREFIXO_ANTIGO[m[1]] ?? (m[1] as "C" | "T");
  return `${letra}-${m[2].padStart(4, "0")}`;
}

export function tipoDaRef(ref: string | null | undefined): "oportunidade" | "atividade" | null {
  const r = refCanonica(ref);
  return r === null ? null : r.startsWith("C-") ? "oportunidade" : "atividade";
}

/* =========================================================
   Card comercial v2 (nov/2026) — campos vindos da planilha do LIFF Tax
   ========================================================= */

/** Tipo do que está travando a oportunidade. Lista fechada: é o que permite somar por tipo. */
export const BLOCKER_TIPOS = [
  { key: "operacao", label: "Operação" },
  { key: "seguranca", label: "Segurança" },
  { key: "produto", label: "Produto" },
  { key: "preco", label: "Preço" },
] as const;
export const BLOCKER_TIPO_KEYS = BLOCKER_TIPOS.map((b) => b.key) as readonly string[];

/**
 * Por que se perde. A planilha tinha só texto livre; os seis motivos já escritos cabem nestes
 * cinco, e lista fechada é o que deixa medir onde o funil vaza. O texto original vai no
 * detalhe.
 */
export const MOTIVOS_PERDA = [
  { key: "sem_budget", label: "Sem budget" },
  { key: "concorrente", label: "Já contratou outra solução" },
  { key: "sem_interesse", label: "Sem interesse" },
  { key: "nao_e_momento", label: "Não é o momento" },
  { key: "outro", label: "Outro" },
] as const;
export const MOTIVO_PERDA_KEYS = MOTIVOS_PERDA.map((m) => m.key) as readonly string[];

/** Sugestões para o ERP. Campo de texto: a lista ajuda a padronizar, não impede um caso novo. */
export const ERP_SUGESTOES = ["SAP ECC", "SAP S/4HANA", "TOTVS Protheus", "Oracle", "Senior", "Sankhya", "Outro"] as const;

/** Origens iniciais (aba Listas da planilha). Viram cadastro editável; isto é só o ponto de partida. */
export const ORIGENS_INICIAIS = [
  "Base Fius", "Maluf", "Ponte/parceiro", "AWS", "Evento", "Outbound", "Indicação", "A definir",
] as const;

export function blockerTipoLabel(k: string | null | undefined): string {
  return BLOCKER_TIPOS.find((b) => b.key === k)?.label ?? "";
}
export function motivoPerdaLabel(k: string | null | undefined): string {
  return MOTIVOS_PERDA.find((m) => m.key === k)?.label ?? "";
}

/**
 * Status do follow-up — CALCULADO, não guardado. A planilha tinha a fórmula numa coluna e
 * errava os rótulos de Ganho e Lost ("7 · Ganho", "8 · Lost" contra "8 · Ganho", "9 · Lost"
 * da lista), calculando FUP para oportunidade fechada. Aqui: fora do aberto, não há FUP.
 */
export type StatusFup = "atrasado" | "proximos7" | "ok" | "sem_data" | null;
export function statusFup(estagio: string, proximoPassoEm: string | null, hoje = new Date()): StatusFup {
  if (!estagioEmAberto(estagio)) return null;
  if (!proximoPassoEm) return "sem_data";
  const d = Date.parse(`${proximoPassoEm}T00:00:00Z`);
  const h = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (d < h) return "atrasado";
  if (d <= h + 7 * 86400000) return "proximos7";
  return "ok";
}
export const STATUS_FUP_LABEL: Record<Exclude<StatusFup, null>, string> = {
  atrasado: "Atrasado",
  proximos7: "Próx. 7 dias",
  ok: "Em dia",
  sem_data: "Sem data",
};

/**
 * Estágio da planilha ("0 · Prospecção" … "9 · Lost") → estágio do sistema. Pelo NÚMERO, que
 * é o que não muda quando alguém reescreve o rótulo. As duas POCs e o Assessment técnico são
 * fases de validação; a planilha não tem On hold.
 */
const ESTAGIO_DA_PLANILHA: Record<string, StageKey> = {
  "0": "prospeccao", "1": "primeira_reuniao", "2": "qualificado", "3": "proposta",
  "4": "validacao", "5": "validacao", "6": "validacao", "7": "contrato", "8": "ganho", "9": "lost",
};
export function estagioDaPlanilha(bruto: string): StageKey | null {
  const m = /^\s*(\d)\s*[·.\-–]/.exec(bruto);
  return m ? (ESTAGIO_DA_PLANILHA[m[1]] ?? null) : null;
}

/**
 * Data de uma célula, venha de onde vier: o arquivo lido no navegador entrega o número de
 * série do Excel (46315), o Drive entrega o texto formatado ("20/10/2026"). AAAA-MM-DD ou nulo.
 */
export function dataDaPlanilha(bruto: unknown): string | null {
  if (bruto === null || bruto === undefined) return null;
  const s = String(bruto).trim();
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n < 30000 || n > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    const mes = Number(m[2]), dia = Number(m[1]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
  return null;
}

/** Valor em reais de uma célula: número cru, "294.000", "294,000.00", "R$ 1.500,50". */
export function valorDaPlanilha(bruto: unknown): number | null {
  if (typeof bruto === "number") return Number.isFinite(bruto) && bruto >= 0 ? bruto : null;
  let s = String(bruto ?? "").replace(/R\$|\s/g, "").trim();
  if (!s || s === "-") return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Motivo da perda inferido do texto livre da planilha — sugestão, o texto vai no detalhe. */
export function motivoPerdaSugerido(texto: string): string | null {
  const t = normalizarTexto(texto);
  if (!t) return null;
  if (/budget|orcamento|verba/.test(t)) return "sem_budget";
  if (/contratou|ja tem|ja possui|sovos|pwc|outra (ferramenta|solucao|plataforma)|parceiro tributario/.test(t)) return "concorrente";
  // "Sem interesse no momento" é falta de interesse, não de timing: interesse vem antes.
  if (/interess|nao deseja|nao quer/.test(t)) return "sem_interesse";
  if (/nao e o momento|momento|depois|mais tarde/.test(t)) return "nao_e_momento";
  return "outro";
}

/** Tipo de blocker pelo rótulo da planilha ("Preço", "Segurança"…). */
export function blockerTipoDaPlanilha(bruto: string): string | null {
  const t = normalizarTexto(bruto);
  return BLOCKER_TIPOS.find((b) => normalizarTexto(b.label) === t)?.key ?? null;
}

/**
 * "Situação atual" da planilha empilha anotações datadas, a mais recente em cima ("20/Out: …
 * \n14/Out: …"). O card guarda só a atual — o histórico do card cuida do resto. As anteriores
 * voltam separadas, para a importação registrá-las no histórico em vez de jogá-las fora.
 */
export function separarSituacao(bruto: string): { atual: string; anteriores: string[] } {
  const linhas = bruto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length <= 1) return { atual: linhas[0] ?? "", anteriores: [] };
  return { atual: linhas[0], anteriores: linhas.slice(1) };
}

/* =========================================================
   Card do kanban comercial (v4): prazo, data da situação, iniciais, vizinhos no funil.
   Tudo puro e testado em scripts/verificar-card.mjs.
   ========================================================= */

/** Hoje no fuso da operação (São Paulo), como YYYY-MM-DD. Servidor e navegador concordam. */
export function hojeISO(agora: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(agora);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}

/** Dias de `de` até `ate` (YYYY-MM-DD). Positivo = `ate` no futuro. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${de.slice(0, 10)}T00:00:00Z`)) / 86400000);
}

const MES_ABREV: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};
const MES_ROTULO = ["", "JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/** "19/OUT" — a data no rótulo "SITUAÇÃO · 19/OUT". */
export function diaMes(iso: string | null): string {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}/${MES_ROTULO[Number(m)] ?? m}`;
}

/**
 * Tira a data do começo da situação — "19/Out: validação feita" → 2026-10-19 + "validação feita".
 * Aceita dia/mês por nome (Out, Set…) ou número (19/10, 19.10, 19/10/2026), seguidos de ":", "-"
 * ou "–". Sem ano, vale o ano que deixa a data no passado (ou hoje): uma situação não é escrita
 * no futuro. Sem prefixo reconhecível, devolve o texto intacto e data nula.
 */
export function separarDataDaSituacao(bruto: string, hoje: string = hojeISO()): { data: string | null; texto: string } {
  const texto = bruto.trim();
  const m = /^(\d{1,2})\s*[/.]\s*(\d{1,2}|[A-Za-zÀ-ÿ]{3,9})(?:\s*[/.]\s*(\d{2}|\d{4}))?\.?\s*[:\-–—]\s*/.exec(texto);
  if (!m) return { data: null, texto };
  const dia = Number(m[1]);
  const mes = /^\d+$/.test(m[2]) ? Number(m[2]) : MES_ABREV[normalizarTexto(m[2]).slice(0, 3)];
  if (!mes || mes < 1 || mes > 12 || dia < 1 || dia > 31) return { data: null, texto };
  const [ah] = hoje.split("-").map(Number);
  let ano = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : ah;
  const iso = (a: number) => `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  if (!m[3] && iso(ano) > hoje) ano -= 1;
  const resto = texto.slice(m[0].length).trim();
  return { data: iso(ano), texto: resto ? resto.charAt(0).toUpperCase() + resto.slice(1) : resto };
}

export type TomPrazo = "erro" | "warning" | "sucesso" | "neutro";

/**
 * Etiqueta do prazo (data do próximo passo). Completo: "Venceu 23/10 · há 18 dias",
 * "Prazo 24/11 · em 14 dias". Curto: "23/10 · −18d", "24/11 · +14d". O tom segue o status do
 * FUP: vencido = erro, próximos 7 dias = warning, depois disso = sucesso. Fora do funil aberto
 * (Ganho, On hold, Lost) a data, se houver, é neutra.
 */
export function etiquetaPrazo(
  estagio: string,
  prazo: string | null,
  hoje: string = hojeISO(),
  curto = false
): { texto: string; tom: TomPrazo } | null {
  if (!prazo) return estagioEmAberto(estagio) ? { texto: "Sem prazo", tom: "neutro" } : null;
  const dm = ddmm(prazo);
  if (!estagioEmAberto(estagio)) return { texto: curto ? dm : `Prazo ${dm}`, tom: "neutro" };
  const n = diasEntre(hoje, prazo);
  if (n < 0) {
    const k = -n;
    return { texto: curto ? `${dm} · −${k}d` : `Venceu ${dm} · há ${k} ${k === 1 ? "dia" : "dias"}`, tom: "erro" };
  }
  const tom: TomPrazo = n <= 7 ? "warning" : "sucesso";
  if (n === 0) return { texto: curto ? `${dm} · hoje` : `Prazo ${dm} · hoje`, tom };
  return { texto: curto ? `${dm} · +${n}d` : `Prazo ${dm} · em ${n} ${n === 1 ? "dia" : "dias"}`, tom };
}

/**
 * Prazo ao lado do rótulo PRÓXIMO PASSO, sem prefixo (o rótulo já diz o que é): "27/10 · −14d",
 * "26/11 · +16d", "10/11 · hoje" (a tela mostra em maiúsculas). O tom segue `etiquetaPrazo`.
 */
export function prazoDoPasso(
  estagio: string,
  prazo: string | null,
  hoje: string = hojeISO()
): { texto: string; tom: TomPrazo } | null {
  const base = etiquetaPrazo(estagio, prazo, hoje);
  if (!base || !prazo || base.tom === "neutro") return base && prazo ? { texto: ddmm(prazo), tom: "neutro" } : base;
  const dm = ddmm(prazo);
  const n = diasEntre(hoje, prazo);
  if (n < 0) return { texto: `${dm} · −${-n}d`, tom: base.tom };
  if (n === 0) return { texto: `${dm} · hoje`, tom: base.tom };
  return { texto: `${dm} · +${n}d`, tom: base.tom };
}

/** "1 módulo", "3 módulos". */
export function rotuloModulos(n: number): string {
  return `${n} ${n === 1 ? "módulo" : "módulos"}`;
}

/** Iniciais para o avatar: primeira e última palavra ("Bruno Santo" → "BS"; "Bruno" → "BR"). */
export function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/[\s/]+/).filter(Boolean);
  if (!partes.length) return "—";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Etapas vizinhas no funil. Fora do funil (On hold, Lost), nenhuma: as setas não tiram o card de lá. */
export function vizinhosNoFunil(estagio: string): { anterior: StageKey | null; proxima: StageKey | null } {
  const i = (FUNIL as readonly string[]).indexOf(estagio);
  if (i < 0) return { anterior: null, proxima: null };
  return { anterior: i > 0 ? FUNIL[i - 1] : null, proxima: i < FUNIL.length - 1 ? FUNIL[i + 1] : null };
}
