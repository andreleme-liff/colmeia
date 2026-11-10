// MCP — a parte PURA: envelope JSON-RPC, versão, cabeçalhos e validação de argumentos.
// Sem banco, sem `next/*`; roda em `scripts/verificar-mcp.mjs`.
//
// Transporte: Streamable HTTP sem estado (MCP 2025-11-25). Cada POST traz UMA mensagem
// JSON-RPC e recebe UMA resposta `application/json`. Não há sessão, SSE nem nada guardado em
// memória entre requisições — o que é exatamente o que um servidor serverless consegue honrar.

export const VERSOES = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

/** Negociação (lifecycle): devolve a versão pedida se suportada, senão a mais nova. */
export function negociarVersao(pedida: unknown): string {
  return typeof pedida === "string" && (VERSOES as readonly string[]).includes(pedida) ? pedida : VERSOES[0];
}

// ---------------------------------------------------------------------------------------
// Cabeçalhos HTTP

export type RecusaHttp = { status: number; mensagem: string };

/**
 * Checagens que vêm antes de olhar o corpo.
 *  · `Origin`: presente e diferente da nossa → 403. É a proteção contra DNS rebinding que a
 *    especificação exige; os clientes de verdade (o backend do claude.ai, o Claude Code) não
 *    mandam `Origin`, só um navegador manda.
 *  · `MCP-Protocol-Version`: presente e desconhecida → 400. Ausente → vale a 2025-03-26.
 */
export function checarCabecalhos(h: { origin: string | null; versao: string | null }, origemPropria: string): RecusaHttp | null {
  if (h.origin !== null && h.origin !== origemPropria) return { status: 403, mensagem: "Origin não permitida." };
  if (h.versao !== null && !(VERSOES as readonly string[]).includes(h.versao)) {
    return { status: 400, mensagem: `MCP-Protocol-Version não suportada: ${h.versao.slice(0, 40)}` };
  }
  return null;
}

// ---------------------------------------------------------------------------------------
// JSON-RPC 2.0

export const RPC = {
  parse: -32700,
  invalida: -32600,
  metodo: -32601,
  params: -32602,
  interno: -32603,
} as const;

export type Id = string | number;

export type Mensagem =
  | { tipo: "request"; id: Id; method: string; params: Record<string, unknown> }
  | { tipo: "notification"; method: string }
  | { tipo: "response" }
  | { tipo: "invalida"; resposta: RespostaErro };

export type RespostaErro = { jsonrpc: "2.0"; id: Id | null; error: { code: number; message: string } };
export type RespostaOk = { jsonrpc: "2.0"; id: Id; result: unknown };

export function erroRpc(id: Id | null, code: number, message: string): RespostaErro {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export function ok(id: Id, result: unknown): RespostaOk {
  return { jsonrpc: "2.0", id, result };
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function interpretar(corpo: unknown): Mensagem {
  // Lote (array) saiu da especificação em 2025-06-18; aceitar só abriria espaço para uma
  // requisição fazer o trabalho de cem e escapar do limite por minuto.
  if (Array.isArray(corpo)) return { tipo: "invalida", resposta: erroRpc(null, RPC.invalida, "Lotes JSON-RPC não são aceitos.") };
  if (!ehObjeto(corpo) || corpo.jsonrpc !== "2.0") {
    return { tipo: "invalida", resposta: erroRpc(null, RPC.invalida, "Mensagem JSON-RPC 2.0 inválida.") };
  }
  const temId = "id" in corpo;
  const idValido = typeof corpo.id === "string" || (typeof corpo.id === "number" && Number.isFinite(corpo.id));

  if (typeof corpo.method === "string") {
    if (!temId) return { tipo: "notification", method: corpo.method };
    if (!idValido) return { tipo: "invalida", resposta: erroRpc(null, RPC.invalida, "id deve ser string ou número.") };
    if (corpo.params !== undefined && !ehObjeto(corpo.params)) {
      return { tipo: "invalida", resposta: erroRpc(corpo.id as Id, RPC.invalida, "params deve ser um objeto.") };
    }
    return { tipo: "request", id: corpo.id as Id, method: corpo.method, params: (corpo.params as Record<string, unknown>) ?? {} };
  }
  if (temId && ("result" in corpo || "error" in corpo)) return { tipo: "response" };
  return { tipo: "invalida", resposta: erroRpc(idValido ? (corpo.id as Id) : null, RPC.invalida, "Mensagem JSON-RPC 2.0 inválida.") };
}

// ---------------------------------------------------------------------------------------
// Validação de argumentos — o subconjunto de JSON Schema que as ferramentas usam.
//
// Um validador pequeno e próprio, e não uma dependência: o conjunto é fechado (objeto raso de
// string, inteiro, número, booleano, nulo, enum, limites) e cada recusa precisa sair numa
// frase que o modelo entenda e corrija.

export type Esquema = {
  type: "object";
  properties: Record<string, Prop>;
  required?: string[];
  additionalProperties: false;
};

export type Prop = {
  type: "string" | "integer" | "number" | "boolean" | Array<"string" | "integer" | "number" | "boolean" | "null">;
  description?: string;
  enum?: readonly (string | null)[];
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
};

function tipoDe(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function aceitaTipo(prop: Prop, v: unknown): boolean {
  const tipos = Array.isArray(prop.type) ? prop.type : [prop.type];
  const t = tipoDe(v);
  return tipos.some((x) => x === t || (x === "number" && t === "integer"));
}

/** Lista de problemas, em português; vazia = válido. */
export function validarArgumentos(esquema: Esquema, args: unknown): string[] {
  if (!ehObjeto(args)) return ["os argumentos devem ser um objeto"];
  const erros: string[] = [];
  for (const nome of Object.keys(args)) {
    if (!(nome in esquema.properties)) erros.push(`campo desconhecido: ${nome}`);
  }
  for (const nome of esquema.required ?? []) {
    if (args[nome] === undefined) erros.push(`campo obrigatório ausente: ${nome}`);
  }
  for (const [nome, prop] of Object.entries(esquema.properties)) {
    const v = args[nome];
    if (v === undefined) continue;
    if (!aceitaTipo(prop, v)) {
      erros.push(`${nome}: esperado ${Array.isArray(prop.type) ? prop.type.join(" ou ") : prop.type}, veio ${tipoDe(v)}`);
      continue;
    }
    if (prop.enum && !prop.enum.includes(v as string | null)) {
      erros.push(`${nome}: valor fora da lista (${prop.enum.filter((e) => e !== null).join(", ")})`);
    }
    if (typeof v === "string") {
      if (prop.maxLength !== undefined && v.length > prop.maxLength) erros.push(`${nome}: no máximo ${prop.maxLength} caracteres`);
      if (prop.minLength !== undefined && v.trim().length < prop.minLength) {
        erros.push(prop.minLength <= 1 ? `${nome}: não pode ser vazio` : `${nome}: no mínimo ${prop.minLength} caracteres`);
      }
      if (prop.pattern && !new RegExp(prop.pattern).test(v)) erros.push(`${nome}: formato inválido`);
    }
    if (typeof v === "number") {
      if (prop.minimum !== undefined && v < prop.minimum) erros.push(`${nome}: mínimo ${prop.minimum}`);
      if (prop.maximum !== undefined && v > prop.maximum) erros.push(`${nome}: máximo ${prop.maximum}`);
    }
  }
  return erros;
}

// ---------------------------------------------------------------------------------------
// Resultado de ferramenta

/** Sucesso: dado estruturado + o mesmo dado como texto (compatibilidade, pede a spec). */
export function resultado(dados: Record<string, unknown>) {
  return { content: [{ type: "text", text: JSON.stringify(dados) }], structuredContent: dados, isError: false };
}

/** Erro de execução: volta como resultado com `isError`, para o modelo ler e se corrigir. */
export function falhaFerramenta(mensagem: string) {
  return { content: [{ type: "text", text: mensagem }], isError: true };
}

// ---------------------------------------------------------------------------------------
// Limite por minuto

export const LIMITE = { chamadasPorMinuto: 60, escritasPorMinuto: 20 } as const;

export function excedeLimite(recentes: { total: number; escritas: number }, escrita: boolean): string | null {
  if (recentes.total >= LIMITE.chamadasPorMinuto) {
    return `Limite de ${LIMITE.chamadasPorMinuto} chamadas por minuto atingido nesta conexão. Espere um minuto.`;
  }
  if (escrita && recentes.escritas >= LIMITE.escritasPorMinuto) {
    return `Limite de ${LIMITE.escritasPorMinuto} gravações por minuto atingido nesta conexão. Espere um minuto.`;
  }
  return null;
}
