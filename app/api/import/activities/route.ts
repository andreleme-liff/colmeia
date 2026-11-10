// Importação em lote de atividades vindas de planilha.
//
// Espelha `import/deals`: a planilha é lida no navegador e chega aqui como JSON, e o servidor
// revalida tudo — permissão na área de destino, status dentro da lista, limite de linhas.
//
// Deduplicação por título normalizado dentro da área. Uma aba de to-dos é reexportada e
// reimportada; sem isso, cada rodada duplicaria a lista inteira.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { STATUS_KEYS, formatarRef, normalizarTexto } from "@/lib/domain";

type Linha = {
  titulo?: string;
  status?: string;
  situacao?: string;
  proximoPasso?: string;
};

type Body = { area?: string; linhas?: Linha[] };

const LIMITE = 500;

export async function POST(req: Request) {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return err("Requisição inválida.", 400);
  }

  const area = String(body.area ?? "");
  if (!ctx.areasExistentes.includes(area)) return err("Vertical inválida.", 400);
  if (!ctx.podeEditar(area)) return err(`Sem permissão de edição em ${ctx.labelArea(area)}.`, 403);

  const linhas = Array.isArray(body.linhas) ? body.linhas : [];
  if (!linhas.length) return err("Nada para importar.", 400);
  if (linhas.length > LIMITE) return err(`Importe no máximo ${LIMITE} linhas por vez.`, 400);

  const sql = await getDb();

  const existentes = await sql<{ id: number; ref: string; titulo: string }[]>`
    SELECT id, ref, titulo FROM activities WHERE area = ${area}
  `;
  const porTitulo = new Map(existentes.map((a) => [normalizarTexto(a.titulo), a]));

  let criadas = 0;
  let atualizadas = 0;
  const ignoradas: { linha: number; motivo: string }[] = [];

  for (const [i, l] of linhas.entries()) {
    const titulo = String(l.titulo ?? "").trim().slice(0, 300);
    if (!titulo) {
      ignoradas.push({ linha: i + 1, motivo: "sem título" });
      continue;
    }

    const status = String(l.status ?? "backlog");
    if (!STATUS_KEYS.includes(status)) {
      ignoradas.push({ linha: i + 1, motivo: `status inválido (${status})` });
      continue;
    }

    const situacao = String(l.situacao ?? "").trim().slice(0, 4000);
    const proximo = String(l.proximoPasso ?? "").trim().slice(0, 2000);

    const jaExiste = porTitulo.get(normalizarTexto(titulo));

    if (jaExiste) {
      // O título é a chave; reimportar atualiza o resto sem criar uma segunda linha.
      await sql`
        UPDATE activities SET
          status = ${status}, situacao = ${situacao}, proximo_passo = ${proximo}, atualizado_em = now()
        WHERE id = ${jaExiste.id}
      `;
      await registrar(sql, {
        actorUserId: ctx.user.userId,
        area,
        entidade: jaExiste.ref,
        campo: "importacao",
        de: null,
        para: titulo,
        texto: `Atualizou "${titulo}" a partir de planilha importada`,
      });
      atualizadas++;
      continue;
    }

    const [{ n }] = await sql<{ n: string }[]>`SELECT nextval('activities_ref_seq') AS n`;
    const ref = formatarRef("atividade", n);
    await sql`
      INSERT INTO activities (ref, titulo, area, status, prioridade, situacao, proximo_passo)
      VALUES (${ref}, ${titulo}, ${area}, ${status}, 'media', ${situacao}, ${proximo})
    `;
    await registrar(sql, {
      actorUserId: ctx.user.userId,
      area,
      entidade: ref,
      campo: "criacao",
      de: null,
      para: titulo,
      texto: `Criou "${titulo}" a partir de planilha importada`,
    });
    // Entra no índice para o resto do mesmo arquivo: to-do repetido na aba atualiza o
    // primeiro em vez de virar dois.
    porTitulo.set(normalizarTexto(titulo), { id: 0, ref, titulo });
    criadas++;
  }

  await registrar(sql, {
    actorUserId: ctx.user.userId,
    area,
    entidade: "importacao",
    campo: "resumo",
    de: null,
    para: `${criadas} criadas, ${atualizadas} atualizadas`,
    texto: `Importou atividades em ${ctx.labelArea(area)}: ${criadas} criada(s), ${atualizadas} atualizada(s)${
      ignoradas.length ? `, ${ignoradas.length} ignorada(s)` : ""
    }`,
  });

  return json({ ok: true, criadas, atualizadas, ignoradas });
}
