// Despesas (contas a pagar) no banco: leitura, os três cadastros (categorias, favorecidos,
// recorrências), o lançamento de uma conta e as ações sobre ela (pagar, estornar, corrigir,
// cancelar). As regras puras moram em `despesas.ts`. Toda gravação deixa linha de auditoria
// na mesma transação, visível só para a administração (referências P-, CAT-, FAV- e REC-,
// ver ENTIDADES_SO_ADMIN em log.ts): pagamento de PJ é remuneração de gente com nome.

import type { Queryable } from "./db";
import { registrar } from "./log";
import { hojeISO } from "./domain";
import type { Autor } from "./receita";
import {
  lerCategoria, lerDespesa, lerFavorecido, lerPagamento, lerRecorrencia, recorrenciaAtivaEm, rotuloFormaPagamento, rotuloGrupo,
  rotuloTipoFavorecido,
  type Categoria, type Despesa, type EntradaDespesa, type Favorecido, type ItemDespesa, type Recorrencia,
} from "./despesas";

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso: string) => iso.split("-").reverse().join("/");
const mesBR = (m: string) => m.split("-").reverse().join("/");
const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export type DadosDespesas = { categorias: Categoria[]; favorecidos: Favorecido[]; recorrencias: Recorrencia[]; despesas: Despesa[] };

type LinhaDespesa = {
  id: number; ref: string; favorecido_id: number; favorecido: string; categoria_id: number | null; area: string | null;
  recorrencia_id: number | null; competencia: string; descricao: string; valor_centavos: string; vencimento: Date; forma: Despesa["forma"];
  documento: string; status: Despesa["status"]; pago_em: Date | null; valor_pago_centavos: string | null; cancelada_em: Date | null;
  motivo_cancelamento: string; notas: string;
};
type LinhaItem = { id: number; despesa_id: number; data: Date | null; descricao: string; categoria_id: number; area: string | null; valor_centavos: string };

function deLinha(r: LinhaDespesa, itens: ItemDespesa[]): Despesa {
  return {
    id: r.id,
    ref: r.ref,
    favorecidoId: r.favorecido_id,
    favorecido: r.favorecido,
    categoriaId: r.categoria_id,
    area: r.area,
    recorrenciaId: r.recorrencia_id,
    competencia: r.competencia,
    descricao: r.descricao,
    valorCentavos: Number(r.valor_centavos),
    vencimento: dia(r.vencimento) ?? "",
    forma: r.forma,
    documento: r.documento,
    status: r.status,
    pagoEm: dia(r.pago_em),
    valorPagoCentavos: r.valor_pago_centavos == null ? null : Number(r.valor_pago_centavos),
    canceladaEm: dia(r.cancelada_em),
    motivoCancelamento: r.motivo_cancelamento,
    notas: r.notas,
    itens,
  };
}
const deItem = (i: LinhaItem): ItemDespesa => ({
  id: i.id, data: dia(i.data), descricao: i.descricao, categoriaId: i.categoria_id, area: i.area, valorCentavos: Number(i.valor_centavos),
});

export async function lerDespesas(sql: Queryable): Promise<DadosDespesas> {
  const [cats, favs, recs, desp, itens] = await Promise.all([
    sql<Categoria[]>`SELECT id, nome, grupo, ativo FROM despesa_categorias ORDER BY ordem, nome`,
    sql<Favorecido[]>`SELECT id, nome, tipo, documento, contato, pagamento, notas, ativo FROM despesa_favorecidos ORDER BY nome`,
    sql<{ id: number; favorecido_id: number; categoria_id: number; area: string | null; descricao: string; valor_centavos: string;
      dia_vencimento: number; vence_mes_seguinte: boolean; forma: Recorrencia["forma"]; inicio: string; fim: string | null; notas: string }[]>`
      SELECT * FROM despesa_recorrencias ORDER BY id`,
    sql<LinhaDespesa[]>`SELECT * FROM despesas ORDER BY vencimento DESC, id DESC`,
    sql<LinhaItem[]>`SELECT * FROM despesa_itens ORDER BY despesa_id, ordem, id`,
  ]);
  const porDespesa = new Map<number, ItemDespesa[]>();
  for (const i of itens) porDespesa.set(i.despesa_id, [...(porDespesa.get(i.despesa_id) ?? []), deItem(i)]);
  return {
    categorias: cats.map((c) => ({ ...c })),
    favorecidos: favs.map((f) => ({ ...f })),
    recorrencias: recs.map((r) => ({
      id: r.id, favorecidoId: r.favorecido_id, categoriaId: r.categoria_id, area: r.area, descricao: r.descricao,
      valorCentavos: Number(r.valor_centavos), diaVencimento: r.dia_vencimento, venceMesSeguinte: r.vence_mes_seguinte, forma: r.forma,
      inicio: r.inicio, fim: r.fim, notas: r.notas,
    })),
    despesas: desp.map((d) => deLinha(d, porDespesa.get(d.id) ?? [])),
  };
}

async function lerDespesa1(tx: Queryable, id: number): Promise<Despesa | null> {
  const [d] = await tx<LinhaDespesa[]>`SELECT * FROM despesas WHERE id = ${id} FOR UPDATE`;
  if (!d) return null;
  const itens = await tx<LinhaItem[]>`SELECT * FROM despesa_itens WHERE despesa_id = ${id} ORDER BY ordem, id`;
  return deLinha(d, itens.map(deItem));
}

/* ---------------- conferências contra o banco ---------------- */

async function nomeDoFavorecido(tx: Queryable, id: number): Promise<string | null> {
  const [f] = await tx<{ nome: string }[]>`SELECT nome FROM despesa_favorecidos WHERE id = ${id}`;
  return f?.nome ?? null;
}
async function nomeDaCategoria(tx: Queryable, id: number): Promise<string | null> {
  const [c] = await tx<{ nome: string }[]>`SELECT nome FROM despesa_categorias WHERE id = ${id}`;
  return c?.nome ?? null;
}
async function areaExiste(tx: Queryable, area: string | null): Promise<boolean> {
  if (area == null) return true;
  const [a] = await tx<{ id: string }[]>`SELECT id FROM areas WHERE id = ${area}`;
  return !!a;
}

/** Confere as referências de uma conta (categoria e produto, da conta e de cada item). */
async function conferirDespesa(tx: Queryable, e: EntradaDespesa): Promise<string | null> {
  const cats = new Set<number>([...(e.categoriaId != null ? [e.categoriaId] : []), ...e.itens.map((i) => i.categoriaId)]);
  for (const id of cats) if (!(await nomeDaCategoria(tx, id))) return "Categoria não encontrada.";
  const areas = new Set<string>([...(e.area ? [e.area] : []), ...e.itens.flatMap((i) => (i.area ? [i.area] : []))]);
  for (const a of areas) if (!(await areaExiste(tx, a))) return "Produto não encontrado.";
  return null;
}

async function gravarItens(tx: Queryable, despesaId: number, e: EntradaDespesa): Promise<void> {
  await tx`DELETE FROM despesa_itens WHERE despesa_id = ${despesaId}`;
  for (const [ordem, i] of e.itens.entries()) {
    await tx`
      INSERT INTO despesa_itens (despesa_id, data, descricao, categoria_id, area, valor_centavos, ordem)
      VALUES (${despesaId}, ${i.data}, ${i.descricao}, ${i.categoriaId}, ${i.area}, ${i.valorCentavos}, ${ordem})`;
  }
}

/* ---------------- cadastros ---------------- */

export const TIPOS_CADASTRO = ["categorias", "favorecidos", "recorrencias"] as const;
export type TipoCadastro = (typeof TIPOS_CADASTRO)[number];
type Resultado = { ok: true; id: number; ref?: string } | { erro: string; status: number };

const autoria = (autor: Autor) => ({ actorUserId: autor.userId, origem: autor.origem, concessaoId: autor.concessaoId, area: null });

function resumoRecorrencia(r: { valorCentavos: number; diaVencimento: number; venceMesSeguinte: boolean; inicio: string; fim: string | null; forma: string }): string {
  return `${reais(r.valorCentavos)}/mês, vence dia ${r.diaVencimento}${r.venceMesSeguinte ? " do mês seguinte" : ""}, ` +
    `${rotuloFormaPagamento(r.forma)}, de ${mesBR(r.inicio)}${r.fim ? ` até ${mesBR(r.fim)}` : " em diante"}`;
}

/** Cria ou altera um cadastro. `id` nulo cria. */
export async function salvarCadastro(tx: Queryable, autor: Autor, tipo: TipoCadastro, id: number | null, body: Record<string, unknown> | null): Promise<Resultado> {
  const log = (entidade: string, texto: string) => registrar(tx, { ...autoria(autor), entidade, campo: "despesa", texto });
  switch (tipo) {
    case "categorias": {
      const c = lerCategoria(body);
      if (typeof c === "string") return { erro: c, status: 400 };
      const [dup] = await tx<{ id: number }[]>`SELECT id FROM despesa_categorias WHERE lower(nome) = lower(${c.nome}) AND id IS DISTINCT FROM ${id}`;
      if (dup) return { erro: "Já existe uma categoria com esse nome.", status: 409 };
      if (id == null) {
        const [{ ordem }] = await tx<{ ordem: number }[]>`SELECT COALESCE(MAX(ordem), -1) + 1 AS ordem FROM despesa_categorias`;
        const [n] = await tx<{ id: number }[]>`
          INSERT INTO despesa_categorias (nome, grupo, ativo, ordem) VALUES (${c.nome}, ${c.grupo}, ${c.ativo}, ${ordem}) RETURNING id`;
        await log(`CAT-${n.id}`, `Criou a categoria de despesa ${c.nome} (${rotuloGrupo(c.grupo)})`);
        return { ok: true, id: n.id };
      }
      const r = await tx`UPDATE despesa_categorias SET nome = ${c.nome}, grupo = ${c.grupo}, ativo = ${c.ativo} WHERE id = ${id}`;
      if (!r.count) return { erro: "Categoria não encontrada.", status: 404 };
      await log(`CAT-${id}`, `Alterou a categoria de despesa ${c.nome} (${rotuloGrupo(c.grupo)})${c.ativo ? "" : ", inativa"}`);
      return { ok: true, id };
    }
    case "favorecidos": {
      const f = lerFavorecido(body);
      if (typeof f === "string") return { erro: f, status: 400 };
      if (id == null) {
        const [n] = await tx<{ id: number }[]>`
          INSERT INTO despesa_favorecidos (nome, tipo, documento, contato, pagamento, notas, ativo)
          VALUES (${f.nome}, ${f.tipo}, ${f.documento}, ${f.contato}, ${f.pagamento}, ${f.notas}, ${f.ativo}) RETURNING id`;
        await log(`FAV-${n.id}`, `Cadastrou o favorecido ${f.nome} (${rotuloTipoFavorecido(f.tipo)})`);
        return { ok: true, id: n.id };
      }
      const r = await tx`
        UPDATE despesa_favorecidos SET nome = ${f.nome}, tipo = ${f.tipo}, documento = ${f.documento}, contato = ${f.contato},
               pagamento = ${f.pagamento}, notas = ${f.notas}, ativo = ${f.ativo}
        WHERE id = ${id}`;
      if (!r.count) return { erro: "Favorecido não encontrado.", status: 404 };
      await log(`FAV-${id}`, `Alterou o favorecido ${f.nome} (${rotuloTipoFavorecido(f.tipo)})${f.ativo ? "" : ", inativo"}`);
      return { ok: true, id };
    }
    case "recorrencias": {
      const r = lerRecorrencia(body);
      if (typeof r === "string") return { erro: r, status: 400 };
      const fav = await nomeDoFavorecido(tx, r.favorecidoId);
      if (!fav) return { erro: "Favorecido não encontrado.", status: 400 };
      if (!(await nomeDaCategoria(tx, r.categoriaId))) return { erro: "Categoria não encontrada.", status: 400 };
      if (!(await areaExiste(tx, r.area))) return { erro: "Produto não encontrado.", status: 400 };
      if (id == null) {
        const [n] = await tx<{ id: number }[]>`
          INSERT INTO despesa_recorrencias (favorecido_id, categoria_id, area, descricao, valor_centavos, dia_vencimento, vence_mes_seguinte,
                                            forma, inicio, fim, notas)
          VALUES (${r.favorecidoId}, ${r.categoriaId}, ${r.area}, ${r.descricao}, ${r.valorCentavos}, ${r.diaVencimento}, ${r.venceMesSeguinte},
                  ${r.forma}, ${r.inicio}, ${r.fim}, ${r.notas}) RETURNING id`;
        await log(`REC-${n.id}`, `Cadastrou a despesa recorrente de ${fav}${r.descricao ? ` (${r.descricao})` : ""}: ${resumoRecorrencia(r)}`);
        return { ok: true, id: n.id };
      }
      const u = await tx`
        UPDATE despesa_recorrencias SET favorecido_id = ${r.favorecidoId}, categoria_id = ${r.categoriaId}, area = ${r.area},
               descricao = ${r.descricao}, valor_centavos = ${r.valorCentavos}, dia_vencimento = ${r.diaVencimento},
               vence_mes_seguinte = ${r.venceMesSeguinte}, forma = ${r.forma}, inicio = ${r.inicio}, fim = ${r.fim}, notas = ${r.notas}
        WHERE id = ${id}`;
      if (!u.count) return { erro: "Recorrência não encontrada.", status: 404 };
      await log(`REC-${id}`, `Alterou a despesa recorrente de ${fav}${r.descricao ? ` (${r.descricao})` : ""}: ${resumoRecorrencia(r)}`);
      return { ok: true, id };
    }
  }
}

/**
 * Exclui um cadastro que nunca foi usado. O que já tem conta ligada não sai, para o histórico
 * não ficar órfão: categoria e favorecido se desativam, recorrência se encerra (data de fim).
 */
export async function excluirCadastro(tx: Queryable, autor: Autor, tipo: TipoCadastro, id: number): Promise<Resultado> {
  const log = (entidade: string, texto: string) => registrar(tx, { ...autoria(autor), entidade, campo: "exclusao", texto });
  switch (tipo) {
    case "categorias": {
      const [{ usos }] = await tx<{ usos: number }[]>`
        SELECT (SELECT count(*) FROM despesas WHERE categoria_id = ${id})::int + (SELECT count(*) FROM despesa_itens WHERE categoria_id = ${id})::int
             + (SELECT count(*) FROM despesa_recorrencias WHERE categoria_id = ${id})::int AS usos`;
      if (usos) return { erro: `A categoria está em ${usos} lançamento(s). Desative em vez de excluir.`, status: 409 };
      const [c] = await tx<{ nome: string }[]>`DELETE FROM despesa_categorias WHERE id = ${id} RETURNING nome`;
      if (!c) return { erro: "Categoria não encontrada.", status: 404 };
      await log(`CAT-${id}`, `Excluiu a categoria de despesa ${c.nome}`);
      return { ok: true, id };
    }
    case "favorecidos": {
      const [{ usos }] = await tx<{ usos: number }[]>`
        SELECT (SELECT count(*) FROM despesas WHERE favorecido_id = ${id})::int
             + (SELECT count(*) FROM despesa_recorrencias WHERE favorecido_id = ${id})::int AS usos`;
      if (usos) return { erro: `O favorecido tem ${usos} conta(s) ou recorrência(s). Desative em vez de excluir.`, status: 409 };
      const [f] = await tx<{ nome: string }[]>`DELETE FROM despesa_favorecidos WHERE id = ${id} RETURNING nome`;
      if (!f) return { erro: "Favorecido não encontrado.", status: 404 };
      await log(`FAV-${id}`, `Excluiu o favorecido ${f.nome}`);
      return { ok: true, id };
    }
    case "recorrencias": {
      const [{ usos }] = await tx<{ usos: number }[]>`SELECT count(*)::int AS usos FROM despesas WHERE recorrencia_id = ${id}`;
      if (usos) return { erro: `A recorrência já gerou ${usos} conta(s). Para encerrar, preencha o mês de fim.`, status: 409 };
      const [r] = await tx<{ nome: string }[]>`
        DELETE FROM despesa_recorrencias r USING despesa_favorecidos f WHERE r.id = ${id} AND f.id = r.favorecido_id RETURNING f.nome`;
      if (!r) return { erro: "Recorrência não encontrada.", status: 404 };
      await log(`REC-${id}`, `Excluiu a despesa recorrente de ${r.nome}`);
      return { ok: true, id };
    }
  }
}

/* ---------------- contas ---------------- */

/**
 * Lança uma conta a pagar. Com `recorrenciaId`, confirma a linha prevista daquela competência:
 * a recorrência precisa valer no mês e não pode já ter conta viva nele; o favorecido é o dela.
 */
export async function lancarDespesa(tx: Queryable, autor: Autor, body: Record<string, unknown> | null): Promise<Resultado> {
  if (!body) return { erro: "Requisição inválida.", status: 400 };
  let recorrenciaId: number | null = null;
  let entrada: Record<string, unknown> = body;

  if (body.recorrenciaId != null && body.recorrenciaId !== "") {
    const n = Number(body.recorrenciaId);
    const [r] = Number.isInteger(n)
      ? await tx<{ id: number; favorecido_id: number; inicio: string; fim: string | null }[]>`
          SELECT id, favorecido_id, inicio, fim FROM despesa_recorrencias WHERE id = ${n} FOR UPDATE`
      : [];
    if (!r) return { erro: "Recorrência não encontrada.", status: 404 };
    recorrenciaId = r.id;
    entrada = { ...body, favorecidoId: r.favorecido_id };
    const competencia = typeof body.competencia === "string" ? body.competencia : "";
    if (!recorrenciaAtivaEm(r, competencia)) return { erro: "A recorrência não vale para esta competência.", status: 400 };
    const [viva] = await tx<{ ref: string }[]>`
      SELECT ref FROM despesas WHERE recorrencia_id = ${r.id} AND competencia = ${competencia} AND status <> 'cancelada'`;
    if (viva) return { erro: `Esta conta já foi lançada (${viva.ref}).`, status: 409 };
  }

  const e = lerDespesa(entrada);
  if (typeof e === "string") return { erro: e, status: 400 };
  const fav = await nomeDoFavorecido(tx, e.favorecidoId);
  if (!fav) return { erro: "Favorecido não encontrado.", status: 400 };
  const ruim = await conferirDespesa(tx, e);
  if (ruim) return { erro: ruim, status: 400 };

  const [nova] = await tx<{ id: number }[]>`
    INSERT INTO despesas (favorecido_id, favorecido, categoria_id, area, recorrencia_id, competencia, descricao, valor_centavos,
                          vencimento, forma, documento, status, notas)
    VALUES (${e.favorecidoId}, ${fav}, ${e.categoriaId}, ${e.area}, ${recorrenciaId}, ${e.competencia}, ${e.descricao}, ${e.valorCentavos},
            ${e.vencimento}, ${e.forma}, ${e.documento}, 'aberta', ${e.notas})
    RETURNING id`;
  const ref = `P-${String(nova.id).padStart(4, "0")}`;
  await tx`UPDATE despesas SET ref = ${ref} WHERE id = ${nova.id}`;
  await gravarItens(tx, nova.id, e);
  await registrar(tx, {
    ...autoria(autor),
    entidade: ref,
    campo: "despesa",
    de: null,
    para: "aberta",
    texto:
      `Lançou a conta a pagar ${ref} de ${fav}${e.descricao ? ` (${e.descricao})` : ""}, competência ${mesBR(e.competencia)}: ` +
      `${reais(e.valorCentavos)}${e.itens.length ? ` em ${e.itens.length} ${e.itens.length === 1 ? "item" : "itens"}` : ""}, ` +
      `vence ${br(e.vencimento)}, ${rotuloFormaPagamento(e.forma)}${e.documento ? `, documento ${e.documento}` : ""}`,
  });
  return { ok: true, id: nova.id, ref };
}

/** Ações sobre uma conta lançada: pagar, estornar, editar, cancelar. */
export async function agirNaDespesa(tx: Queryable, autor: Autor, id: number, body: Record<string, unknown> | null): Promise<Resultado> {
  if (!body) return { erro: "Requisição inválida.", status: 400 };
  const d = await lerDespesa1(tx, id);
  if (!d) return { erro: "Conta não encontrada.", status: 404 };
  const log = (texto: string, de: string | null, para: string | null) =>
    registrar(tx, { ...autoria(autor), entidade: d.ref, campo: "despesa", de, para, texto });

  switch (body.acao) {
    case "pagar": {
      if (d.status !== "aberta") return { erro: "Só conta a pagar (em aberto) recebe pagamento.", status: 409 };
      const p = lerPagamento(body);
      if (typeof p === "string") return { erro: p, status: 400 };
      await tx`
        UPDATE despesas SET status = 'paga', pago_em = ${p.pagoEm}, valor_pago_centavos = ${p.valorPagoCentavos},
               notas = CASE WHEN ${p.notas} = '' THEN notas ELSE ${p.notas} END, atualizado_em = now()
        WHERE id = ${id}`;
      const dif = p.valorPagoCentavos - d.valorCentavos;
      await log(
        `Pagamento da conta ${d.ref} de ${d.favorecido}: ${reais(p.valorPagoCentavos)} em ${br(p.pagoEm)}` +
          (dif ? ` (${dif > 0 ? "a mais" : "a menos"} ${reais(Math.abs(dif))} do que o lançado)` : ""),
        "aberta",
        "paga"
      );
      return { ok: true, id, ref: d.ref };
    }
    case "estornar": {
      if (d.status !== "paga") return { erro: "Só conta paga pode ter o pagamento estornado.", status: 409 };
      await tx`UPDATE despesas SET status = 'aberta', pago_em = NULL, valor_pago_centavos = NULL, atualizado_em = now() WHERE id = ${id}`;
      await log(`Estornou o pagamento da conta ${d.ref} de ${d.favorecido} (era ${reais(d.valorPagoCentavos ?? 0)} em ${br(d.pagoEm ?? hojeISO())})`, "paga", "aberta");
      return { ok: true, id, ref: d.ref };
    }
    case "editar": {
      if (d.status !== "aberta") return { erro: "Só conta em aberto pode ser corrigida. Estorne o pagamento antes.", status: 409 };
      // Conta de recorrência não troca de mês nem de favorecido: é o que a liga à linha do mês.
      const e = lerDespesa(d.recorrenciaId != null ? { ...body, favorecidoId: d.favorecidoId, competencia: d.competencia } : body);
      if (typeof e === "string") return { erro: e, status: 400 };
      const fav = await nomeDoFavorecido(tx, e.favorecidoId);
      if (!fav) return { erro: "Favorecido não encontrado.", status: 400 };
      const ruim = await conferirDespesa(tx, e);
      if (ruim) return { erro: ruim, status: 400 };
      await tx`
        UPDATE despesas SET favorecido_id = ${e.favorecidoId}, favorecido = ${fav}, categoria_id = ${e.categoriaId}, area = ${e.area},
               competencia = ${e.competencia}, descricao = ${e.descricao}, valor_centavos = ${e.valorCentavos}, vencimento = ${e.vencimento},
               forma = ${e.forma}, documento = ${e.documento}, notas = ${e.notas}, atualizado_em = now()
        WHERE id = ${id}`;
      await gravarItens(tx, id, e);
      await log(
        `Corrigiu a conta ${d.ref} de ${fav}: ${reais(e.valorCentavos)}${e.itens.length ? ` em ${e.itens.length} ${e.itens.length === 1 ? "item" : "itens"}` : ""}, ` +
          `competência ${mesBR(e.competencia)}, vence ${br(e.vencimento)}, ${rotuloFormaPagamento(e.forma)}${e.documento ? `, documento ${e.documento}` : ""}`,
        null,
        null
      );
      return { ok: true, id, ref: d.ref };
    }
    case "cancelar": {
      if (d.status === "paga") return { erro: "Conta paga não se cancela: estorne o pagamento antes.", status: 409 };
      if (d.status !== "aberta") return { erro: "Esta conta já está cancelada.", status: 409 };
      const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 500) : "";
      if (!motivo) return { erro: "Diga o motivo do cancelamento.", status: 400 };
      await tx`
        UPDATE despesas SET status = 'cancelada', cancelada_em = ${hojeISO()}, motivo_cancelamento = ${motivo}, atualizado_em = now()
        WHERE id = ${id}`;
      await log(`Cancelou a conta ${d.ref} de ${d.favorecido} (${reais(d.valorCentavos)}): ${motivo}`, "aberta", "cancelada");
      return { ok: true, id, ref: d.ref };
    }
    default:
      return { erro: "Ação inválida.", status: 400 };
  }
}
