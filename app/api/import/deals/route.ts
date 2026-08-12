// Importação em lote de oportunidades vindas de planilha.
//
// A planilha é lida no NAVEGADOR e chega aqui como JSON — o que evita toda a plumbing de
// upload sem abrir mão de nada, porque o servidor não confia no que recebe de qualquer
// forma: cada linha é revalidada, a permissão é checada por área, e o produto tem de
// pertencer àquela área.
//
// Deduplicação por nome da conta normalizado: reimportar a mesma planilha atualiza os cards
// em vez de duplicá-los, que é o comportamento esperado de uma planilha que é reexportada
// toda semana.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { STAGE_KEYS, normalizarConta } from "@/lib/domain";

type Linha = {
  conta?: string;
  escopo?: string;
  estagio?: string;
  situacao?: string;
  proximoPasso?: string;
  contato?: string;
  responsavelTexto?: string;
  produtoId?: string | null;
  pausado?: boolean;
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
  if (!ctx.areasExistentes.includes(area)) return err("Área inválida.", 400);
  if (!ctx.podeEditar(area)) return err(`Sem permissão de edição em ${ctx.labelArea(area)}.`, 403);

  const linhas = Array.isArray(body.linhas) ? body.linhas : [];
  if (!linhas.length) return err("Nada para importar.", 400);
  if (linhas.length > LIMITE) return err(`Importe no máximo ${LIMITE} linhas por vez.`, 400);

  const sql = await getDb();

  // Produtos válidos para esta área, resolvidos uma vez.
  const produtos = await sql<{ id: string }[]>`SELECT id FROM produtos WHERE area = ${area}`;
  const produtosValidos = new Set(produtos.map((p) => p.id));

  // Índice das contas que já existem NESTA área, para decidir criar ou atualizar.
  const existentes = await sql<{ id: number; ref: string; conta: string }[]>`
    SELECT id, ref, conta FROM deals WHERE area = ${area}
  `;
  const porConta = new Map(existentes.map((d) => [normalizarConta(d.conta), d]));

  let criadas = 0;
  let atualizadas = 0;
  const ignoradas: { linha: number; motivo: string }[] = [];

  for (const [i, l] of linhas.entries()) {
    const conta = String(l.conta ?? "").trim();
    if (!conta) {
      ignoradas.push({ linha: i + 1, motivo: "sem nome de conta" });
      continue;
    }

    const estagio = String(l.estagio ?? "lead");
    if (!STAGE_KEYS.includes(estagio)) {
      ignoradas.push({ linha: i + 1, motivo: `estágio inválido (${estagio})` });
      continue;
    }

    let produtoId: string | null = null;
    if (l.produtoId) {
      if (!produtosValidos.has(l.produtoId)) {
        ignoradas.push({ linha: i + 1, motivo: `produto não pertence a ${ctx.labelArea(area)}` });
        continue;
      }
      produtoId = l.produtoId;
    }

    const campos = {
      escopo: String(l.escopo ?? "").trim().slice(0, 300),
      situacao: String(l.situacao ?? "").trim().slice(0, 4000),
      proximo: String(l.proximoPasso ?? "").trim().slice(0, 2000),
      contato: String(l.contato ?? "").trim().slice(0, 300),
      responsavel: String(l.responsavelTexto ?? "").trim().slice(0, 200),
      pausado: !!l.pausado,
    };

    const jaExiste = porConta.get(normalizarConta(conta));

    if (jaExiste) {
      await sql`
        UPDATE deals SET
          escopo = ${campos.escopo}, estagio = ${estagio}, situacao = ${campos.situacao},
          proximo_passo = ${campos.proximo}, contato = ${campos.contato},
          responsavel_texto = ${campos.responsavel}, produto_id = ${produtoId},
          pausado = ${campos.pausado}, atualizado_em = now()
        WHERE id = ${jaExiste.id}
      `;
      await registrar(sql, {
        actorUserId: ctx.user.userId,
        area,
        entidade: jaExiste.ref,
        campo: "importacao",
        de: null,
        para: conta,
        texto: `Atualizou ${conta} a partir de planilha importada`,
      });
      atualizadas++;
      continue;
    }

    const [{ ref }] = await sql<{ ref: string }[]>`SELECT 'D-' || nextval('deals_ref_seq') AS ref`;
    await sql`
      INSERT INTO deals (ref, conta, escopo, area, estagio, valor_centavos, proximo_passo,
                         situacao, contato, responsavel_texto, produto_id, pausado)
      VALUES (${ref}, ${conta}, ${campos.escopo}, ${area}, ${estagio}, 0, ${campos.proximo},
              ${campos.situacao}, ${campos.contato}, ${campos.responsavel}, ${produtoId}, ${campos.pausado})
    `;
    await registrar(sql, {
      actorUserId: ctx.user.userId,
      area,
      entidade: ref,
      campo: "criacao",
      de: null,
      para: conta,
      texto: `Criou ${conta} a partir de planilha importada`,
    });
    // A conta entra no índice para o resto do mesmo arquivo: planilha com a mesma empresa
    // repetida atualiza a primeira em vez de criar duas.
    porConta.set(normalizarConta(conta), { id: 0, ref, conta });
    criadas++;
  }

  // Um registro-resumo além dos individuais, para a auditoria mostrar a importação como um
  // evento só quando alguém olhar de longe.
  await registrar(sql, {
    actorUserId: ctx.user.userId,
    area,
    entidade: "importacao",
    campo: "resumo",
    de: null,
    para: `${criadas} criadas, ${atualizadas} atualizadas`,
    texto: `Importou planilha em ${ctx.labelArea(area)}: ${criadas} criada(s), ${atualizadas} atualizada(s)${
      ignoradas.length ? `, ${ignoradas.length} ignorada(s)` : ""
    }`,
  });

  return json({ ok: true, criadas, atualizadas, ignoradas });
}
