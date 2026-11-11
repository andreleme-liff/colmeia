// OAuth 2.1 do LIFF tasks — a parte PURA: decisões, sem banco e sem rede.
//
// O app é o próprio servidor de autorização do seu MCP. Quem autentica a pessoa é o SSO
// Google que já existe; aqui só se decide se um pedido de autorização é aceitável, se um
// redirect casa, se o PKCE confere e o que a concessão pode. Tudo isto roda em
// `scripts/verificar-oauth.mjs`, sem banco.
//
// Referências: MCP Authorization 2025-11-25; OAuth 2.1 (draft-ietf-oauth-v2-1-13); RFC 7636
// (PKCE), 8252 (apps nativos/loopback), 8414 e 9728 (metadados), 8707 (resource), 9207 (iss);
// e os requisitos do cliente do Claude em claude.com/docs/connectors/building/authentication.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------------------
// Configuração

export type Config = {
  habilitado: boolean;
  /** URL canônica do MCP — o `resource` (RFC 8707) a que todo token fica preso. */
  resource: string;
  /** Emissor (issuer): a origem do `resource`. */
  issuer: string;
  /** Hosts aceitos como dono de um Client ID Metadata Document. */
  clientesPermitidos: string[];
};

export const RESOURCE_PADRAO = "https://go.liff.tech/api/mcp";

export function lerConfig(env: Record<string, string | undefined>): Config {
  const resource = canonizarResource(env.MCP_URL_CANONICA || RESOURCE_PADRAO) ?? RESOURCE_PADRAO;
  const clientes = (env.MCP_CLIENTES_PERMITIDOS || "claude.ai")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return {
    habilitado: env.MCP_HABILITADO === "1",
    resource,
    issuer: new URL(resource).origin,
    clientesPermitidos: clientes,
  };
}

/**
 * Forma canônica de um `resource`: esquema e host em minúsculas, sem fragmento, sem barra
 * final. A especificação pede aceitar maiúscula no host e preferir a forma sem barra.
 */
export function canonizarResource(bruto: string): string | null {
  let u: URL;
  try {
    u = new URL(bruto);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.hash || u.username || u.password) return null;
  const caminho = u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.host.toLowerCase()}${caminho}${u.search}`;
}

// ---------------------------------------------------------------------------------------
// Escopos

export const ESCOPOS = ["leitura", "escrita", "offline_access"] as const;
export type Escopo = (typeof ESCOPOS)[number];

/** O que o cliente recebe quando não pede escopo nenhum: o que o `401` anuncia. */
export const ESCOPOS_ANUNCIADOS = "leitura escrita";

export function lerEscopos(bruto: string | null | undefined): Escopo[] {
  const pedidos = (bruto ?? "").split(/\s+/).filter(Boolean);
  return ESCOPOS.filter((e) => pedidos.includes(e));
}

/**
 * Os escopos que a concessão efetivamente recebe.
 *  · `leitura` sempre — é a base; uma conexão que não lê não serve para nada.
 *  · `escrita` só se o cliente PEDIU, a pessoa MARCOU na tela, o papel não é `leitura` e ela
 *    edita ao menos uma área. Nunca mais do que o pedido, nunca mais do que a pessoa pode.
 *  · `offline_access` se pedido — é o que dá direito a refresh token.
 */
export function escoposConcedidos(opts: {
  pedidos: Escopo[];
  marcouEscrita: boolean;
  papel: string;
  editaAlgumaArea: boolean;
}): Escopo[] {
  const r: Escopo[] = ["leitura"];
  if (opts.pedidos.includes("escrita") && opts.marcouEscrita && podeConcederEscrita(opts.papel, opts.editaAlgumaArea)) {
    r.push("escrita");
  }
  if (opts.pedidos.includes("offline_access")) r.push("offline_access");
  return r;
}

export function podeConcederEscrita(papel: string, editaAlgumaArea: boolean): boolean {
  return papel !== "leitura" && editaAlgumaArea;
}

export function temEscopo(escopos: string, e: Escopo): boolean {
  return escopos.split(/\s+/).includes(e);
}

// ---------------------------------------------------------------------------------------
// Cliente (Client ID Metadata Document)

/**
 * O `client_id` é uma URL https num host da lista. Não há registro dinâmico aberto: só
 * clientes cujo documento mora num host conhecido podem pedir acesso — e o servidor só faz
 * requisição de rede para esses hosts, o que fecha o SSRF que um CIMD aberto permitiria.
 */
export function clientIdAceito(clientId: string, permitidos: string[]): boolean {
  let u: URL;
  try {
    u = new URL(clientId);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password || u.port || u.hash) return false;
  if (u.pathname === "/" || !u.pathname) return false;
  return permitidos.includes(u.hostname.toLowerCase());
}

export type DocumentoCliente = {
  clientId: string;
  nome: string;
  redirectUris: string[];
};

/** Valida o documento buscado. `null` = inutilizável. */
export function validarDocumentoCliente(doc: unknown, clientIdUrl: string): DocumentoCliente | null {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return null;
  const d = doc as Record<string, unknown>;
  // O documento precisa dizer que é ele mesmo: um `client_id` diferente da URL de onde veio é
  // alguém tentando se passar por outro cliente.
  if (d.client_id !== clientIdUrl) return null;
  if (!Array.isArray(d.redirect_uris) || !d.redirect_uris.length) return null;
  if (!d.redirect_uris.every((r) => typeof r === "string" && r.length <= 2000)) return null;
  // Só cliente público. É o que anunciamos, e é o que o Claude usa via CIMD.
  if (d.token_endpoint_auth_method !== undefined && d.token_endpoint_auth_method !== "none") return null;
  const nome = typeof d.client_name === "string" && d.client_name.trim()
    ? d.client_name.trim().slice(0, 80)
    : new URL(clientIdUrl).hostname;
  return { clientId: clientIdUrl, nome, redirectUris: d.redirect_uris as string[] };
}

// ---------------------------------------------------------------------------------------
// Redirect

const LOOPBACK = new Set(["localhost", "127.0.0.1"]);

function ehLoopback(u: URL): boolean {
  return u.protocol === "http:" && LOOPBACK.has(u.hostname) && !u.username && !u.password;
}

/**
 * O `redirect_uri` pedido casa com algum registrado no documento?
 *  · Igualdade exata de string — o caso geral (claude.ai).
 *  · Loopback com qualquer porta (RFC 8252 §7.3): o Claude Code abre uma porta efêmera por
 *    sessão e declara `http://localhost/callback` e `http://127.0.0.1/callback`. Casa só se o
 *    registrado também é loopback, com o MESMO host e o MESMO caminho. Nada mais ganha folga.
 */
export function redirectCasa(pedido: string, registrados: string[]): boolean {
  if (registrados.includes(pedido)) return true;
  let p: URL;
  try {
    p = new URL(pedido);
  } catch {
    return false;
  }
  if (!ehLoopback(p) || p.hash) return false;
  return registrados.some((r) => {
    let q: URL;
    try {
      q = new URL(r);
    } catch {
      return false;
    }
    return ehLoopback(q) && q.hostname === p.hostname && q.pathname === p.pathname && q.search === p.search;
  });
}

export function redirectEhLoopback(redirectUri: string): boolean {
  try {
    return ehLoopback(new URL(redirectUri));
  } catch {
    return false;
  }
}

/** Monta o redirect de volta ao cliente, preservando a query que já existir. */
export function urlDeRetorno(redirectUri: string, params: Record<string, string | undefined>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

// ---------------------------------------------------------------------------------------
// Pedido de autorização

export type PedidoAutorizacao = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | undefined;
  escopos: Escopo[];
};

/**
 * Valida o pedido em duas etapas, porque o tratamento do erro depende de onde ele está:
 *  · `client_id` ou `redirect_uri` ruins → erro NA TELA. Redirecionar para um endereço não
 *    validado é exatamente o redirecionamento aberto que o OAuth proíbe.
 *  · o resto ruim → erro DE VOLTA ao cliente pelo `redirect_uri`, já validado.
 * A primeira etapa (cliente e redirect) depende do documento buscado na rede, então é feita
 * por quem chama; esta função recebe o documento já validado.
 */
export function validarPedido(
  q: URLSearchParams,
  doc: DocumentoCliente,
  cfg: Config
):
  | { ok: true; pedido: PedidoAutorizacao }
  | { ok: false; naTela: string }
  | { ok: false; redirect: string; error: string; descricao: string } {
  const redirectUri = q.get("redirect_uri") ?? "";
  if (!redirectUri || !redirectCasa(redirectUri, doc.redirectUris)) {
    return { ok: false, naTela: "O endereço de retorno não pertence a este cliente." };
  }
  const state = q.get("state") ?? undefined;
  const volta = (error: string, descricao: string) =>
    ({ ok: false as const, redirect: urlDeRetorno(redirectUri, { error, error_description: descricao, state, iss: cfg.issuer }), error, descricao });

  if (state !== undefined && state.length > 2048) return volta("invalid_request", "state longo demais");
  if (q.get("response_type") !== "code") return volta("unsupported_response_type", "só response_type=code");
  if (q.get("code_challenge_method") !== "S256") return volta("invalid_request", "PKCE S256 é obrigatório");
  const codeChallenge = q.get("code_challenge") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) return volta("invalid_request", "code_challenge inválido");

  // `resource` (RFC 8707): o Claude sempre manda. Se veio, tem de ser este MCP — um token
  // pedido para outro recurso não pode nascer aqui.
  const resource = q.get("resource");
  if (resource !== null && canonizarResource(resource) !== cfg.resource) {
    return volta("invalid_target", "resource não é este servidor MCP");
  }

  const escopoBruto = q.get("scope");
  const escopos = lerEscopos(escopoBruto ?? ESCOPOS_ANUNCIADOS);
  if (escopoBruto !== null && escopoBruto.trim() && !escopos.length) return volta("invalid_scope", "nenhum escopo conhecido");

  return { ok: true, pedido: { clientId: doc.clientId, redirectUri, codeChallenge, state, escopos } };
}

// ---------------------------------------------------------------------------------------
// PKCE e tokens

const b64url = (b: Buffer) => b.toString("base64url");

/** RFC 7636 §4.6: BASE64URL(SHA256(verifier)) == challenge, em tempo constante. */
export function pkceConfere(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const calculado = Buffer.from(b64url(createHash("sha256").update(verifier, "ascii").digest()));
  const esperado = Buffer.from(challenge);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

export const PREFIXO = { codigo: "liff_ac_", acesso: "liff_at_", refresh: "liff_rt_" } as const;

/** 256 bits aleatórios, com prefixo legível para scanners de segredo reconhecerem um vazado. */
export function gerarSegredo(prefixo: string): string {
  return prefixo + b64url(randomBytes(32));
}

/** O que se guarda no banco. O valor em claro existe só na resposta ao cliente. */
export function hashDe(segredo: string): string {
  return createHash("sha256").update(segredo, "utf8").digest("hex");
}

export const DURACAO = {
  codigoSeg: 5 * 60,
  acessoSeg: 60 * 60,
  refreshSeg: 30 * 24 * 60 * 60,
} as const;

// ---------------------------------------------------------------------------------------
// Metadados e desafio

export function urlMetadadosRecurso(cfg: Config): string {
  // Caminho com o path do MCP inserido (RFC 9728 §3.1) — é o primeiro que o cliente tenta.
  return `${cfg.issuer}/.well-known/oauth-protected-resource${new URL(cfg.resource).pathname}`;
}

export function metadadosRecurso(cfg: Config) {
  return {
    resource: cfg.resource,
    authorization_servers: [cfg.issuer],
    scopes_supported: ["leitura", "escrita"],
    bearer_methods_supported: ["header"],
    resource_name: "LIFF go",
  };
}

export function metadadosServidor(cfg: Config) {
  return {
    issuer: cfg.issuer,
    authorization_endpoint: `${cfg.issuer}/oauth/autorizar`,
    token_endpoint: `${cfg.issuer}/api/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    // `none` + CIMD é o par que faz o Claude escolher o documento em vez de registro
    // dinâmico. Não há `registration_endpoint`, de propósito.
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    scopes_supported: ["leitura", "escrita", "offline_access"],
    authorization_response_iss_parameter_supported: true,
  };
}

/** `WWW-Authenticate` do 401 (e do 403 por escopo). O `scope` diz ao Claude o que pedir. */
export function desafio(cfg: Config, extra?: { error: string; descricao: string; scope?: string }): string {
  const partes = [`resource_metadata="${urlMetadadosRecurso(cfg)}"`, `scope="${extra?.scope ?? ESCOPOS_ANUNCIADOS}"`];
  if (extra) partes.push(`error="${extra.error}"`, `error_description="${extra.descricao.replace(/"/g, "'")}"`);
  return `Bearer ${partes.join(", ")}`;
}
