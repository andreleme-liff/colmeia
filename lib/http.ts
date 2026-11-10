// Helpers de resposta JSON — erros sempre no formato { error: "<mensagem pt-BR>" }.

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function err(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Corpo JSON como objeto, ou `null`. `req.json()` aceita `null`, número e array — e o
 * primeiro `body.campo` sobre `null` derrubava a rota com 500 em vez de um 400 legível.
 */
export async function lerCorpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = await req.json();
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Resposta de erro a partir de uma falha do núcleo de operações. */
export function deFalha(f: { erro: string; status: number }): Response {
  return err(f.erro, f.status);
}
