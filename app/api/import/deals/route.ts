// Importação em lote de oportunidades vindas de planilha.
//
// A planilha é lida no NAVEGADOR e chega aqui como JSON (`LinhaImportada`). O servidor não
// confia no que recebe: cada linha passa pelo MESMO núcleo da interface e do MCP
// (`criarOportunidade` / `atualizarOportunidade`), com a mesma validação, a mesma permissão
// por área e a auditoria na mesma transação.
//
// O que a planilha traz como TEXTO e o sistema guarda como cadastro é resolvido aqui:
//   - Dono: vira a pessoa cadastrada quando o nome casa com exatamente uma; o texto fica
//     sempre (é o que o card mostra quando não há pessoa).
//   - Quem resolve o blocker: idem; se não casar, o nome vai junto do texto do blocker.
//   - Origem: casa pelo rótulo do cadastro; desconhecida vai para as observações.
//   - Módulos: casam com os produtos DA ÁREA pelo nome; o que não casar volta como aviso.
//
// Cada linha é uma transação: uma linha recusada não desfaz as outras, e aparece em
// `ignoradas` com o motivo. Deduplicação pelo nome da conta normalizado, dentro da área.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json, err } from "@/lib/http";
import { registrar } from "@/lib/log";
import { chavesDoResponsavel, normalizarConta, normalizarTexto, separarDataDaSituacao, type Pessoa } from "@/lib/domain";
import { chaveDeModulo, type LinhaImportada } from "@/lib/planilha";
import { ehFalha, LIMITES } from "@/lib/ops/comum";
import { atualizarOportunidade, criarOportunidade } from "@/lib/ops/oportunidades";

type Body = { area?: string; linhas?: Partial<LinhaImportada>[] };

const LIMITE = 500;

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** A pessoa que o texto nomeia, quando é exatamente uma. */
function pessoaDoTexto(texto: string, pessoas: Pessoa[]): number | null {
  if (!texto) return null;
  const chaves = chavesDoResponsavel({ responsavelId: null, responsavelTexto: texto }, pessoas);
  if (chaves.length !== 1 || !chaves[0].startsWith("u:")) return null;
  return Number(chaves[0].slice(2));
}

function juntar(base: string, extra: string, max: number): string {
  return (base ? `${base} · ${extra}` : extra).slice(0, max);
}

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

  // Cadastros resolvidos uma vez para o arquivo inteiro.
  const [pessoas, produtos, origens, existentes] = await Promise.all([
    sql<Pessoa[]>`SELECT id, nome FROM users WHERE excluido_em IS NULL`,
    sql<{ id: string; label: string }[]>`SELECT id, label FROM produtos WHERE area = ${area}`,
    sql<{ id: string; label: string; ativo: boolean }[]>`SELECT id, label, ativo FROM origens`,
    sql<{ id: number; conta: string }[]>`SELECT id, conta FROM deals WHERE area = ${area}`,
  ]);
  const pessoasLista = [...pessoas];
  const produtoPorChave = new Map(produtos.map((p) => [chaveDeModulo(p.label), p.id]));
  for (const p of produtos) produtoPorChave.set(chaveDeModulo(p.id), p.id);
  const origemPorChave = new Map<string, string>();
  for (const o of origens) {
    if (!o.ativo) continue;
    origemPorChave.set(normalizarTexto(o.label), o.id);
    origemPorChave.set(normalizarTexto(o.id), o.id);
  }
  const porConta = new Map(existentes.map((d) => [normalizarConta(d.conta), d.id]));

  const autor = { userId: ctx.user.userId, origem: null, concessaoId: null };
  let criadas = 0;
  let atualizadas = 0;
  const ignoradas: { linha: number; motivo: string }[] = [];
  const avisos: { linha: number; aviso: string }[] = [];

  for (const [i, l] of linhas.entries()) {
    const n = i + 1;
    const conta = txt(l.conta);
    if (!conta) {
      ignoradas.push({ linha: n, motivo: "sem nome de conta" });
      continue;
    }

    // Módulos: só os que existem nesta área; o resto vira aviso, não recusa.
    const modulos: string[] = [];
    for (const nome of lista(l.modulos)) {
      const id = produtoPorChave.get(chaveDeModulo(nome));
      if (id) {
        if (!modulos.includes(id)) modulos.push(id);
      } else {
        avisos.push({ linha: n, aviso: `${conta}: módulo / produto "${nome}" não cadastrado em ${ctx.labelArea(area)}` });
      }
    }

    let notas = txt(l.notas);
    const origemTexto = txt(l.origem);
    let origemId: string | null = null;
    if (origemTexto) {
      origemId = origemPorChave.get(normalizarTexto(origemTexto)) ?? null;
      if (!origemId) notas = juntar(notas, `Origem na planilha: ${origemTexto}`, LIMITES.notas);
    }

    let blocker = txt(l.blocker);
    const blockerDonoTexto = txt(l.blockerDono);
    const blockerDonoId = pessoaDoTexto(blockerDonoTexto, pessoasLista);
    if (blockerDonoTexto && blockerDonoId === null) {
      blocker = juntar(blocker, `resolve: ${blockerDonoTexto}`, LIMITES.blocker);
    }

    const responsavelTexto = txt(l.responsavelTexto);
    // "19/Out: validação feita" → a data vai para o campo próprio, o texto fica sem ela.
    const sit = separarDataDaSituacao(txt(l.situacao));
    const campos: Record<string, unknown> = {
      estagio: txt(l.estagio) || undefined,
      situacao: sit.texto,
      ...(sit.data ? { situacaoEm: sit.data } : {}),
      proximoPasso: txt(l.proximoPasso),
      proximoPassoEm: l.proximoPassoEm || null,
      contato: txt(l.contato),
      contatoOperacional: txt(l.contatoOperacional),
      responsavelTexto,
      responsavelId: pessoaDoTexto(responsavelTexto, pessoasLista),
      ponte: txt(l.ponte),
      origemId,
      dor: txt(l.dor),
      modulos,
      erp: txt(l.erp),
      aceAws: l.aceAws === true,
      ultimaInteracao: l.ultimaInteracao || null,
      blocker,
      blockerTipo: l.blockerTipo || null,
      blockerDonoId,
      motivoPerda: l.motivoPerda || null,
      motivoPerdaDetalhe: txt(l.motivoPerdaDetalhe),
      notas,
    };
    // Valor vazio na planilha não apaga um valor já preenchido no sistema.
    if (typeof l.valorReais === "number" && Number.isFinite(l.valorReais)) campos.valorReais = l.valorReais;

    const aba = txt(l.aba) || "planilha";
    const anteriores = lista(l.situacaoAnterior).map((s) => s.trim()).filter(Boolean);
    const existente = porConta.get(normalizarConta(conta));

    const r = await sql.begin(async (tx) => {
      const feito = existente
        ? await atualizarOportunidade(tx, ctx, existente, campos, autor)
        : await criarOportunidade(tx, ctx, { ...campos, conta, area }, autor);
      if (ehFalha(feito)) return feito;

      await registrar(tx, {
        actorUserId: autor.userId,
        area,
        entidade: feito.ref,
        campo: "importacao",
        de: null,
        para: aba,
        texto: `${existente ? "Atualizou" : "Criou"} ${conta} a partir da planilha (aba ${aba})`,
      });
      // As anotações antigas da coluna Situação não viram campo: entram UMA vez no histórico,
      // na criação — reimportar a mesma planilha não pode repeti-las a cada semana.
      if (!existente && anteriores.length) {
        await registrar(tx, {
          actorUserId: autor.userId,
          area,
          entidade: feito.ref,
          campo: "situacao_anterior",
          de: null,
          para: null,
          texto: `Anotações anteriores da planilha:\n${anteriores.join("\n")}`.slice(0, 8000),
        });
      }
      return { ok: true as const, ref: feito.ref, id: "id" in feito ? feito.id : existente! };
    });

    if (ehFalha(r)) {
      ignoradas.push({ linha: n, motivo: `${conta}: ${r.erro}` });
      continue;
    }
    // A conta entra no índice para o resto do arquivo: a mesma empresa repetida atualiza a
    // primeira em vez de criar duas.
    porConta.set(normalizarConta(conta), r.id);
    if (existente) atualizadas++;
    else criadas++;
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

  return json({ ok: true, criadas, atualizadas, ignoradas, avisos });
}
