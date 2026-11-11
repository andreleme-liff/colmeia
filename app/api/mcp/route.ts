// Endpoint MCP (Streamable HTTP, sem estado). Uma mensagem JSON-RPC por POST, uma resposta
// JSON. GET e DELETE → 405: não há SSE nem sessão para encerrar.
//
// Ordem das barreiras, da mais barata para a mais cara:
//   chave geral → Origin/versão → tamanho → token (401 inicia o login no Claude) →
//   JSON-RPC → ferramenta existe → escopo → argumentos → limite por minuto → execução.
// Toda tools/call, aceita ou recusada depois do token, deixa uma linha em mcp_chamadas.

import { getDb, type Queryable } from "@/lib/db";
import { ctxDoUsuario } from "@/lib/perms";
import { desafio, lerConfig, temEscopo } from "@/lib/oauth/protocolo";
import { resolverAcesso, type Acesso } from "@/lib/oauth/servidor";
import {
  RPC, checarCabecalhos, erroRpc, excedeLimite, falhaFerramenta, interpretar, negociarVersao, ok,
  resultado, validarArgumentos, type Id,
} from "@/lib/mcp/protocolo";
import { FERRAMENTAS, type Saida } from "@/lib/mcp/ferramentas";
import { INSTRUCOES, descreverFerramentas } from "@/lib/mcp/catalogo";
import { contarRecentes, jaCriado, registrarChamada } from "@/lib/mcp/registro";

export const dynamic = "force-dynamic";

const LIMITE_CORPO = 64 * 1024;

function jsonRpc(corpo: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

function naoPermitido(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function GET() {
  return lerConfig(process.env).habilitado ? naoPermitido() : new Response(null, { status: 404 });
}

export async function DELETE() {
  return lerConfig(process.env).habilitado ? naoPermitido() : new Response(null, { status: 404 });
}

export async function POST(req: Request) {
  const cfg = lerConfig(process.env);
  if (!cfg.habilitado) return new Response(null, { status: 404 });

  const recusa = checarCabecalhos(
    { origin: req.headers.get("origin"), versao: req.headers.get("mcp-protocol-version") },
    cfg.issuer
  );
  if (recusa) return jsonRpc(erroRpc(null, RPC.invalida, recusa.mensagem), recusa.status);

  if (Number(req.headers.get("content-length") ?? 0) > LIMITE_CORPO) {
    return jsonRpc(erroRpc(null, RPC.invalida, "Corpo grande demais."), 413);
  }

  // Token ANTES de olhar a mensagem: o Claude precisa do 401 para iniciar o login, inclusive
  // no `initialize`. Sem token, nada sobre o servidor além do caminho dos metadados.
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const sql = await getDb();
  const acesso = bearer ? await resolverAcesso(sql, bearer, cfg) : null;
  const ctx = acesso ? await ctxDoUsuario(acesso.userId) : null;
  if (!acesso || !ctx) {
    return jsonRpc(erroRpc(null, RPC.invalida, "Não autorizado."), 401, {
      "WWW-Authenticate": bearer ? desafio(cfg, { error: "invalid_token", descricao: "token inválido, expirado ou revogado" }) : desafio(cfg),
    });
  }

  const texto = await req.text();
  if (texto.length > LIMITE_CORPO) return jsonRpc(erroRpc(null, RPC.invalida, "Corpo grande demais."), 413);
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return jsonRpc(erroRpc(null, RPC.parse, "JSON inválido."), 400);
  }

  const msg = interpretar(corpo);
  if (msg.tipo === "invalida") return jsonRpc(msg.resposta, 400);
  if (msg.tipo === "notification" || msg.tipo === "response") return new Response(null, { status: 202 });

  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return jsonRpc(
        ok(id, {
          protocolVersion: negociarVersao(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "liff-go", title: "LIFF go", version: "1.0.0" },
          instructions: INSTRUCOES,
        })
      );
    case "ping":
      return jsonRpc(ok(id, {}));
    case "tools/list":
      return jsonRpc(ok(id, { tools: descreverFerramentas(acesso.escopos, ctx.isAdmin) }));
    case "tools/call":
      return jsonRpc(await chamarFerramenta(id, params, acesso, ctx, sql, cfg.issuer));
    default:
      return jsonRpc(erroRpc(id, RPC.metodo, `Método não suportado: ${method.slice(0, 60)}`));
  }
}

type Log = (o: { ok: boolean; erro?: string; ref?: string }, onde?: Queryable) => Promise<void>;

/** Violação do índice único de idempotência: outra chamada com a mesma chave chegou antes. */
function ehCorridaDeIdempotencia(e: unknown): boolean {
  const pg = e as { code?: string; constraint_name?: string };
  return pg?.code === "23505" && (pg.constraint_name ?? "").includes("idempotencia");
}

async function chamarFerramenta(
  id: Id,
  params: Record<string, unknown>,
  acesso: Acesso,
  ctx: NonNullable<Awaited<ReturnType<typeof ctxDoUsuario>>>,
  sql: Awaited<ReturnType<typeof getDb>>,
  base: string
) {
  const inicio = Date.now();
  const nome = typeof params.name === "string" ? params.name : "";
  const ferramenta = FERRAMENTAS.find((f) => f.name === nome);
  if (!ferramenta) return erroRpc(id, RPC.params, `Ferramenta desconhecida: ${nome.slice(0, 60)}`);

  const args = (typeof params.arguments === "object" && params.arguments !== null && !Array.isArray(params.arguments)
    ? params.arguments
    : {}) as Record<string, unknown>;
  const chave = ferramenta.escrita && typeof args.chave_idempotencia === "string" ? args.chave_idempotencia : null;

  const log: Log = (o, onde = sql) =>
    registrarChamada(onde, {
      concessaoId: acesso.concessaoId,
      userId: acesso.userId,
      ferramenta: nome,
      argumentos: args,
      escrita: ferramenta.escrita,
      ok: o.ok,
      erro: o.erro ?? null,
      ref: o.ref ?? null,
      chave: o.ok ? chave : null,
      duracaoMs: Date.now() - inicio,
    });

  const recusar = async (mensagem: string) => {
    await log({ ok: false, erro: mensagem });
    return ok(id, falhaFerramenta(mensagem));
  };

  // Receita e faturamento são da administração, como as páginas: a lista já não as mostra para
  // os demais, e a chamada direta também é recusada (com o registro da tentativa).
  if ("soAdmin" in ferramenta && ferramenta.soAdmin && !ctx.isAdmin) {
    return recusar("Ferramenta restrita à administração.");
  }
  if (ferramenta.escrita && !temEscopo(acesso.escopos, "escrita")) {
    return recusar("Esta conexão só tem permissão de leitura. Para gravar, reconecte marcando 'Gravar' na tela de autorização.");
  }
  const problemas = validarArgumentos(ferramenta.inputSchema, args);
  if (problemas.length) return recusar(`Argumentos inválidos: ${problemas.join("; ")}.`);
  const limite = excedeLimite(await contarRecentes(sql, acesso.concessaoId), ferramenta.escrita);
  if (limite) return recusar(limite);

  try {
    let saida: Saida;
    if (!ferramenta.escrita) {
      saida = await ferramenta.executar({ sql, ctx, acesso, base }, args);
      // Sem registro, sem dado: se a linha de auditoria da leitura não entra, a leitura não
      // é entregue.
      await log(saida.ok ? { ok: true, ref: saida.ref } : { ok: false, erro: saida.erro });
    } else {
      saida = await gravar(ferramenta.executar, chave, args, acesso, ctx, sql, base, log);
      if (!saida.ok) await log({ ok: false, erro: saida.erro });
    }
    return ok(id, saida.ok ? resultado(saida.dados) : falhaFerramenta(saida.erro));
  } catch (e) {
    console.error(`[mcp] ${nome} falhou:`, (e as Error).message);
    try {
      await log({ ok: false, erro: "erro interno" });
    } catch {
      // Se nem o registro entra, o banco está fora; a resposta abaixo já diz que nada foi feito.
    }
    return ok(id, falhaFerramenta("Erro interno. Nada foi gravado; tente de novo em instantes."));
  }
}

/**
 * Gravação: execução + registro da chamada na MESMA transação. Com chave de idempotência,
 * uma repetição devolve o registro já criado; duas chamadas simultâneas com a mesma chave
 * esbarram no índice único, a segunda é desfeita inteira (inclusive o registro que ela criou)
 * e devolve o da primeira.
 */
async function gravar(
  executar: (typeof FERRAMENTAS)[number]["executar"],
  chave: string | null,
  args: Record<string, unknown>,
  acesso: Acesso,
  ctx: NonNullable<Awaited<ReturnType<typeof ctxDoUsuario>>>,
  sql: Awaited<ReturnType<typeof getDb>>,
  base: string,
  log: Log
): Promise<Saida> {
  const repetida = async (): Promise<Saida | null> => {
    if (!chave) return null;
    const ref = await jaCriado(sql, acesso.concessaoId, chave);
    return ref ? { ok: true, ref, dados: { criado: false, repetida: true, ref, observacao: "Já criado antes com esta chave." } } : null;
  };

  const antes = await repetida();
  if (antes) return antes;

  try {
    return await sql.begin(async (tx) => {
      const s = await executar({ sql: tx, ctx, acesso, base }, args);
      if (s.ok) await log({ ok: true, ref: s.ref }, tx);
      return s;
    });
  } catch (e) {
    if (ehCorridaDeIdempotencia(e)) {
      const depois = await repetida();
      if (depois) return depois;
    }
    throw e;
  }
}
