// OAuth 2.1 do LIFF tasks — a parte com banco e rede. As decisões estão em `protocolo.ts`.

import type { Queryable } from "../db";
import { registrar } from "../log";
import {
  DURACAO, PREFIXO, canonizarResource, clienteFixo, clientIdAceito, gerarSegredo, hashDe, pkceConfere,
  redirectEhLoopback, temEscopo, urlDeRetorno, validarDocumentoCliente,
  type Config, type DocumentoCliente, type Escopo, type PedidoAutorizacao,
} from "./protocolo";

// ---------------------------------------------------------------------------------------
// Documento do cliente (CIMD)

const LIMITE_DOC = 16 * 1024;
const cacheDocs = new Map<string, { doc: DocumentoCliente; ate: number }>();

async function lerComLimite(res: Response, limite: number): Promise<string | null> {
  if (!res.body) return null;
  const leitor = res.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(partes));
}

/**
 * Busca e valida o documento do cliente. Só para hosts da lista (a checagem vem ANTES de
 * qualquer requisição); sem seguir redirecionamento, que levaria a requisição para um host
 * que ninguém aprovou; 5 s de prazo; 16 KB no máximo. Cache de 5 min, como o próprio
 * claude.ai indica no `cache-control` do documento.
 */
export async function buscarCliente(clientId: string, cfg: Config): Promise<DocumentoCliente | null> {
  // Cliente pré-cadastrado (Amazon Quick): não há documento para buscar na rede.
  const fixo = clienteFixo(clientId, cfg.clientesPermitidos);
  if (fixo) return fixo;
  if (!clientIdAceito(clientId, cfg.clientesPermitidos)) {
    console.warn(`[oauth] client_id recusado: ${safeHost(clientId)}`);
    return null;
  }
  const emCache = cacheDocs.get(clientId);
  if (emCache && emCache.ate > Date.now()) return emCache.doc;

  let res: Response;
  try {
    res = await fetch(clientId, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    console.warn(`[oauth] falha ao buscar documento do cliente ${safeHost(clientId)}: ${(e as Error).name}`);
    return null;
  }
  if (!res.ok) return null;
  const texto = await lerComLimite(res, LIMITE_DOC);
  if (texto === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return null;
  }
  const doc = validarDocumentoCliente(json, clientId);
  if (doc) cacheDocs.set(clientId, { doc, ate: Date.now() + 5 * 60 * 1000 });
  return doc;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(inválido)";
  }
}

// ---------------------------------------------------------------------------------------
// Concessão e código

export function descreverEscopos(escopos: string): string {
  return temEscopo(escopos, "escrita") ? "ler e gravar" : "ler";
}

export function hostDeRetorno(redirectUri: string): string {
  return redirectEhLoopback(redirectUri) ? "este computador (localhost)" : safeHost(redirectUri);
}

/**
 * A pessoa clicou em Autorizar: nasce a concessão, com a sua linha de auditoria, e o código
 * de uso único que volta ao cliente. Tudo numa transação.
 */
export async function autorizar(
  tx: Queryable,
  args: { userId: number; nomePessoa: string; doc: DocumentoCliente; pedido: PedidoAutorizacao; escopos: Escopo[]; cfg: Config }
): Promise<string> {
  const { doc, pedido, cfg } = args;
  const escopos = args.escopos.join(" ");

  const [concessao] = await tx<{ id: number }[]>`
    INSERT INTO oauth_concessoes (user_id, client_id, client_nome, redirect_uri, resource, escopos)
    VALUES (${args.userId}, ${doc.clientId}, ${doc.nome}, ${pedido.redirectUri}, ${cfg.resource}, ${escopos})
    RETURNING id
  `;

  await registrar(tx, {
    actorUserId: args.userId,
    area: null,
    entidade: `CONEXAO-${concessao.id}`,
    campo: "criacao",
    de: null,
    para: escopos,
    texto: `Autorizou ${doc.nome} (${hostDeRetorno(pedido.redirectUri)}) a ${descreverEscopos(escopos)} em nome de ${args.nomePessoa}`,
  });

  const codigo = gerarSegredo(PREFIXO.codigo);
  await tx`
    INSERT INTO oauth_codigos (hash, concessao_id, code_challenge, redirect_uri, expira_em)
    VALUES (${hashDe(codigo)}, ${concessao.id}, ${pedido.codeChallenge}, ${pedido.redirectUri},
            now() + ${`${DURACAO.codigoSeg} seconds`}::interval)
  `;

  return urlDeRetorno(pedido.redirectUri, { code: codigo, state: pedido.state, iss: cfg.issuer });
}

/**
 * Revoga a concessão: marca, apaga tokens e códigos, audita. `porUserId` nulo = o próprio
 * sistema (reuso de token detectado). Idempotente: revogar o que já caiu não faz nada.
 */
export async function revogar(
  tx: Queryable,
  concessaoId: number,
  porUserId: number | null,
  motivo: string
): Promise<boolean> {
  const linhas = await tx<{ client_nome: string; user_id: number; nome: string }[]>`
    UPDATE oauth_concessoes k SET revogado_em = now(), revogado_por = ${porUserId}, motivo_revogacao = ${motivo}
    FROM users u
    WHERE k.id = ${concessaoId} AND k.revogado_em IS NULL AND u.id = k.user_id
    RETURNING k.client_nome, k.user_id, u.nome
  `;
  await tx`DELETE FROM oauth_tokens WHERE concessao_id = ${concessaoId}`;
  await tx`DELETE FROM oauth_codigos WHERE concessao_id = ${concessaoId}`;
  if (!linhas.length) return false;
  await registrar(tx, {
    actorUserId: porUserId,
    area: null,
    entidade: `CONEXAO-${concessaoId}`,
    campo: "revogacao",
    de: "ativa",
    para: "revogada",
    texto: `Revogou o acesso de ${linhas[0].client_nome} em nome de ${linhas[0].nome}: ${motivo}`,
  });
  return true;
}

// ---------------------------------------------------------------------------------------
// Token endpoint

export type RespostaToken = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  scope: string;
};

export type ErroToken = {
  error: "invalid_request" | "invalid_grant" | "unsupported_grant_type" | "invalid_target";
  error_description: string;
};

async function emitirTokens(tx: Queryable, concessaoId: number, escopos: string): Promise<RespostaToken> {
  const acesso = gerarSegredo(PREFIXO.acesso);
  await tx`
    INSERT INTO oauth_tokens (hash, concessao_id, tipo, expira_em)
    VALUES (${hashDe(acesso)}, ${concessaoId}, 'acesso', now() + ${`${DURACAO.acessoSeg} seconds`}::interval)
  `;
  const r: RespostaToken = { access_token: acesso, token_type: "Bearer", expires_in: DURACAO.acessoSeg, scope: escopos };
  if (temEscopo(escopos, "offline_access")) {
    const refresh = gerarSegredo(PREFIXO.refresh);
    await tx`
      INSERT INTO oauth_tokens (hash, concessao_id, tipo, expira_em)
      VALUES (${hashDe(refresh)}, ${concessaoId}, 'refresh', now() + ${`${DURACAO.refreshSeg} seconds`}::interval)
    `;
    r.refresh_token = refresh;
  }
  await tx`UPDATE oauth_concessoes SET ultimo_uso_em = now() WHERE id = ${concessaoId}`;
  return r;
}

const grant = (d: string): ErroToken => ({ error: "invalid_grant", error_description: d });

/** `authorization_code` + PKCE. */
export async function trocarCodigo(
  tx: Queryable,
  p: { code: string; verifier: string; clientId: string; redirectUri: string; resource: string | null },
  cfg: Config
): Promise<RespostaToken | ErroToken> {
  const linhas = await tx<{
    concessao_id: number; code_challenge: string; redirect_uri: string; expirado: boolean; usado_em: Date | null;
    client_id: string; escopos: string; resource: string; revogado_em: Date | null; ativo: boolean;
  }[]>`
    SELECT c.concessao_id, c.code_challenge, c.redirect_uri, c.expira_em < now() AS expirado, c.usado_em,
           k.client_id, k.escopos, k.resource, k.revogado_em, u.ativo
    FROM oauth_codigos c
    JOIN oauth_concessoes k ON k.id = c.concessao_id
    JOIN users u ON u.id = k.user_id
    WHERE c.hash = ${hashDe(p.code)}
    FOR UPDATE OF c
  `;
  if (!linhas.length) return grant("código desconhecido");
  const c = linhas[0];

  // Código reapresentado: alguém além do cliente legítimo o tem. OAuth 2.1 §4.1.3 pede
  // revogar o que foi emitido com ele.
  if (c.usado_em) {
    await revogar(tx, c.concessao_id, null, "código de autorização reutilizado");
    return grant("código já utilizado");
  }
  if (c.expirado) return grant("código expirado");
  if (c.client_id !== p.clientId) return grant("código emitido para outro cliente");
  if (c.redirect_uri !== p.redirectUri) return grant("redirect_uri diferente do pedido");
  if (p.resource !== null && canonizarResource(p.resource) !== c.resource) {
    return { error: "invalid_target", error_description: "resource não é este servidor MCP" };
  }
  if (!pkceConfere(p.verifier, c.code_challenge)) return grant("code_verifier não confere");
  if (c.revogado_em || !c.ativo) return grant("acesso revogado");
  if (c.resource !== cfg.resource) return grant("concessão de outro recurso");

  await tx`UPDATE oauth_codigos SET usado_em = now() WHERE hash = ${hashDe(p.code)}`;
  return emitirTokens(tx, c.concessao_id, c.escopos);
}

/**
 * Janela em que reapresentar um refresh já trocado NÃO derruba a concessão. O Claude
 * renova tanto antes de expirar quanto ao receber 401, e duas renovações simultâneas com o
 * mesmo refresh são legítimas; a segunda perde a corrida e recebe `invalid_grant`, mas a
 * primeira já entregou o par novo ao mesmo cliente. Fora da janela, é roubo presumido.
 */
const JANELA_CORRIDA_SEG = 60;

/** `refresh_token`, com rotação a cada uso. */
export async function trocarRefresh(
  tx: Queryable,
  p: { refresh: string; clientId: string; resource: string | null },
  cfg: Config
): Promise<RespostaToken | ErroToken> {
  const linhas = await tx<{
    concessao_id: number; expirado: boolean; usado_em: Date | null; usado_ha_seg: number | null;
    client_id: string; escopos: string; resource: string; revogado_em: Date | null; ativo: boolean;
  }[]>`
    SELECT t.concessao_id, t.expira_em < now() AS expirado, t.usado_em,
           EXTRACT(EPOCH FROM (now() - t.usado_em))::int AS usado_ha_seg,
           k.client_id, k.escopos, k.resource, k.revogado_em, u.ativo
    FROM oauth_tokens t
    JOIN oauth_concessoes k ON k.id = t.concessao_id
    JOIN users u ON u.id = k.user_id
    WHERE t.hash = ${hashDe(p.refresh)} AND t.tipo = 'refresh'
    FOR UPDATE OF t
  `;
  if (!linhas.length) return grant("refresh token desconhecido");
  const t = linhas[0];

  if (t.usado_em) {
    if ((t.usado_ha_seg ?? 0) > JANELA_CORRIDA_SEG) {
      await revogar(tx, t.concessao_id, null, "refresh token reutilizado — possível vazamento");
    }
    return grant("refresh token já utilizado");
  }
  if (t.expirado) return grant("refresh token expirado");
  if (t.client_id !== p.clientId) return grant("refresh token de outro cliente");
  if (t.revogado_em || !t.ativo) return grant("acesso revogado");
  if (p.resource !== null && canonizarResource(p.resource) !== t.resource) {
    return { error: "invalid_target", error_description: "resource não é este servidor MCP" };
  }
  if (t.resource !== cfg.resource) return grant("concessão de outro recurso");

  await tx`UPDATE oauth_tokens SET usado_em = now() WHERE hash = ${hashDe(p.refresh)}`;
  return emitirTokens(tx, t.concessao_id, t.escopos);
}

// ---------------------------------------------------------------------------------------
// Resolução do Bearer no endpoint MCP

export type Acesso = { concessaoId: number; userId: number; escopos: string; clientNome: string };

/**
 * Bearer → concessão viva → pessoa ativa. A audiência é conferida aqui: um token cuja
 * concessão foi emitida para outro `resource` não vale neste MCP.
 */
export async function resolverAcesso(sql: Queryable, bearer: string, cfg: Config): Promise<Acesso | null> {
  if (!bearer.startsWith(PREFIXO.acesso)) return null;
  const linhas = await sql<{ id: number; user_id: number; escopos: string; client_nome: string; resource: string; usado_ha_seg: number | null }[]>`
    SELECT k.id, k.user_id, k.escopos, k.client_nome, k.resource,
           EXTRACT(EPOCH FROM (now() - k.ultimo_uso_em))::int AS usado_ha_seg
    FROM oauth_tokens t
    JOIN oauth_concessoes k ON k.id = t.concessao_id
    JOIN users u ON u.id = k.user_id
    WHERE t.hash = ${hashDe(bearer)} AND t.tipo = 'acesso' AND t.expira_em > now()
      AND k.revogado_em IS NULL AND u.ativo
  `;
  if (!linhas.length || linhas[0].resource !== cfg.resource) return null;
  const k = linhas[0];
  // "Último uso" na tela de conexões. Uma escrita por minuto basta para isso.
  if (k.usado_ha_seg === null || k.usado_ha_seg > 60) {
    await sql`UPDATE oauth_concessoes SET ultimo_uso_em = now() WHERE id = ${k.id}`;
  }
  return { concessaoId: k.id, userId: k.user_id, escopos: k.escopos, clientNome: k.client_nome };
}
