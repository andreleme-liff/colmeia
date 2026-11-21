// Tipos e utilidades do núcleo de operações — o que a interface e o MCP compartilham.
//
// Este arquivo e os `regras-*.ts` são PUROS: nada de banco, nada de `next/*`. Recebem a
// entrada e os fatos já carregados (registro atual, pessoas, produtos, permissões) e
// devolvem um PLANO — o que gravar e o que auditar — ou a falha. Quem executa o plano é
// `atividades.ts` / `oportunidades.ts`, dentro de uma transação.
//
// A separação existe por dois motivos:
//  1. A regra roda sem banco, então é testável em `scripts/verificar-ops.mjs`.
//  2. Validar TUDO antes de gravar QUALQUER coisa. As rotas antigas gravavam campo a campo e
//     auditavam no fim; um erro de validação no meio deixava campos já alterados sem a linha
//     de auditoria que conta a alteração. Com um plano completo antes da primeira escrita, ou
//     tudo entra (dado + auditoria, na mesma transação) ou nada entra.

export type Falha = { ok: false; erro: string; status: number };

export function falha(erro: string, status = 400): Falha {
  return { ok: false, erro, status };
}

export function ehFalha(x: unknown): x is Falha {
  return typeof x === "object" && x !== null && (x as { ok?: unknown }).ok === false;
}

/**
 * O que o núcleo precisa saber da permissão de quem age. É um recorte estrutural do `Ctx` de
 * `lib/perms.ts`, declarado aqui para este arquivo não importar a camada de sessão.
 */
export type Permissoes = {
  areasExistentes: string[];
  podeVer: (area: string) => boolean;
  podeEditar: (area: string) => boolean;
  labelArea: (area: string) => string;
};

/**
 * Quem está agindo e por onde. `origem` nula é a interface, como sempre foi; `"mcp"` é uma
 * chamada de um sistema externo autorizado pela pessoa, e `concessaoId` diz qual conexão.
 */
export type Autor = {
  userId: number;
  origem: "mcp" | null;
  concessaoId: number | null;
};

/** Uma linha de auditoria planejada. Vira `registrar(...)` na execução. */
export type Mudanca = { campo: string; de: string | null; para: string | null; texto: string };

export type Fatos = {
  /** Toda pessoa cadastrada: id → nome. Ativa ou não — a regra de responsável sempre foi
   *  "existe", não "está ativa". Excluída do cadastro fica de fora: não é mais ninguém. */
  pessoas: Map<number, string>;
  /** Todo produto: para conferir que pertence à área (final) do registro. */
  produtos: { id: string; area: string; label?: string }[];
  /** Cadastro de origens da oportunidade (evento, indicação, outbound…). */
  origens?: { id: string; label: string; ativo: boolean }[];
  /** Toda oportunidade: para ligar uma tarefa a ela, por id (tela) ou referência (MCP). */
  oportunidades: { id: number; ref: string; conta: string; area: string }[];
};

export const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Data válida no formato do sistema, ou nula. Data malformada vira nula em silêncio —
 *  é o comportamento que as rotas sempre tiveram, e a interface depende dele. */
export function dataOuNula(v: unknown): string | null {
  return typeof v === "string" && DATA_RE.test(v) ? v : null;
}

/** Date do banco → "YYYY-MM-DD", como as rotas sempre compararam. */
export function isoDoBanco(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Texto livre: aparado e cortado no limite. Não-string vira vazio. */
export function texto(v: unknown, max: number): string {
  if (v === undefined || v === null) return "";
  return String(v).trim().slice(0, max);
}

/** Id de pessoa válido para a regra, ou `undefined` quando não é inteiro. */
export function idDePessoa(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined;
}

/**
 * A oportunidade a que uma tarefa vai ficar ligada. Aceita o id (o que a tela manda) ou a
 * referência, inclusive a antiga — "C-0104", "D-104" (o que o Claude manda).
 *
 * Quem liga precisa ENXERGAR a oportunidade. Não enxergar responde igual a não existir, como
 * em todo o sistema: confirmar que a referência existe já seria vazar a carteira de outra área.
 */
export function resolverOportunidade(
  v: unknown,
  fatos: Fatos,
  perm: Permissoes,
  refCanonica: (r: string) => string | null
): { id: number; ref: string; conta: string; area: string } | null {
  const alvo =
    typeof v === "number" && Number.isInteger(v)
      ? fatos.oportunidades.find((o) => o.id === v)
      : typeof v === "string"
        ? fatos.oportunidades.find((o) => o.ref === refCanonica(v))
        : undefined;
  return alvo && perm.podeVer(alvo.area) ? alvo : null;
}

/**
 * Como uma oportunidade aparece numa linha do histórico de uma TAREFA.
 *
 * A linha fica na área da tarefa, e quem lê é quem enxerga essa área — não quem a escreveu.
 * Se a oportunidade é de outra área, um leitor pode não ter acesso a ela, e o nome da conta
 * na linha abriria a carteira alheia pelo histórico. Por isso a conta só entra quando as
 * duas são da mesma área; fora disso, só a referência.
 */
export function rotuloOportunidade(o: { ref: string; conta: string; area: string }, areaDaLinha: string): string {
  return o.area === areaDaLinha ? `${o.ref} · ${o.conta}` : o.ref;
}

export function produtoNaArea(fatos: Fatos, produtoId: unknown, area: string): string | null {
  if (typeof produtoId !== "string") return null;
  return fatos.produtos.some((p) => p.id === produtoId && p.area === area) ? produtoId : null;
}

/**
 * Limites de texto. Eram os da edição; a criação não cortava nada, e um agente externo
 * mandando um campo de cem mil caracteres gravaria cem mil caracteres. Agora valem nos dois.
 */
export const LIMITES = {
  titulo: 300,
  conta: 200,
  escopo: 300,
  proximoPassoOportunidade: 200,
  proximoPassoAtividade: 2000,
  situacao: 4000,
  contato: 300,
  responsavelTexto: 200,
  ponte: 300,
  contatoOperacional: 300,
  dor: 300,
  erp: 100,
  propostaUrl: 2000,
  blocker: 300,
  motivoPerdaDetalhe: 300,
  notas: 2000,
  modulos: 20,
} as const;
