// Leituras do MCP. TODA consulta parte de `ctx.areasVisiveis` — a mesma regra da interface:
// o que a pessoa não enxerga na tela, a conexão dela também não enxerga.
//
// O filtro por responsável usa `ehDoResponsavel` de domain.ts, o mesmo do seletor "Quem" da
// tela: o pipeline do Tax guarda o responsável como texto livre ("Bianka"), e um filtro por id
// devolveria zero oportunidades.

import type { Queryable } from "../db";
import type { Ctx } from "../perms";
import { caminhoDe } from "../rotas";
import { ehDoResponsavel, refCanonica, stageLabel, statusLabel, tipoDaRef, type Pessoa } from "../domain";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** `%` e `_` são curingas no ILIKE; a busca é por texto literal. */
function padraoBusca(busca: string): string {
  return `%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function areasDoFiltro(ctx: Ctx, area?: string): string[] {
  if (!area) return ctx.areasVisiveis;
  return ctx.podeVer(area) ? [area] : [];
}

async function pessoasDe(sql: Queryable): Promise<Pessoa[]> {
  return [...(await sql<Pessoa[]>`SELECT id, nome FROM users`)];
}

type LinhaAtividade = {
  ref: string; titulo: string; area: string; status: string; prioridade: string; prazo: Date | null;
  responsavel_user_id: number | null; responsavel: string | null; situacao: string; proximo_passo: string;
  proximo_passo_em: Date | null; produto_id: string | null; atualizado_em: Date | null; criado_em: Date;
  oportunidade_id: number | null; op_ref: string | null; op_conta: string | null; op_area: string | null;
};

function atividadeDto(a: LinhaAtividade, ctx: Ctx, base: string) {
  return {
    ref: a.ref,
    titulo: a.titulo,
    area: a.area,
    area_nome: ctx.labelArea(a.area),
    status: a.status,
    status_nome: statusLabel(a.status),
    prioridade: a.prioridade,
    prazo: iso(a.prazo),
    responsavel_id: a.responsavel_user_id,
    responsavel: a.responsavel,
    situacao: a.situacao,
    proximo_passo: a.proximo_passo,
    proximo_passo_em: iso(a.proximo_passo_em),
    produto_id: a.produto_id,
    atualizado_em: (a.atualizado_em ?? a.criado_em).toISOString(),
    // A oportunidade ligada, só se quem pergunta enxerga a área dela; senão, só o fato de
    // que há vínculo — a mesma regra da tela.
    oportunidade:
      a.oportunidade_id && a.op_area && ctx.podeVer(a.op_area)
        ? { ref: a.op_ref, conta: a.op_conta, url: base + caminhoDe({ view: "comercial", ref: a.op_ref ?? undefined }) }
        : a.oportunidade_id
          ? "ligada a uma oportunidade de área sem acesso"
          : null,
    pode_editar: ctx.podeEditar(a.area),
    url: base + caminhoDe({ view: "operacoes", ref: a.ref }),
  };
}

type LinhaOportunidade = {
  ref: string; conta: string; escopo: string; area: string; estagio: string; valor_centavos: string;
  responsavel_user_id: number | null; responsavel: string | null; responsavel_texto: string;
  proximo_passo: string; proximo_passo_em: Date | null; situacao: string; contato: string;
  produto_id: string | null; ace_aws: boolean; atualizado_em: Date | null; criado_em: Date;
};

function oportunidadeDto(d: LinhaOportunidade, ctx: Ctx, base: string) {
  return {
    ref: d.ref,
    conta: d.conta,
    escopo: d.escopo,
    area: d.area,
    area_nome: ctx.labelArea(d.area),
    estagio: d.estagio,
    estagio_nome: stageLabel(d.estagio),
    valor_reais: Number(d.valor_centavos) / 100,
    responsavel_id: d.responsavel_user_id,
    responsavel: d.responsavel,
    responsavel_texto: d.responsavel_texto,
    proximo_passo: d.proximo_passo,
    proximo_passo_em: iso(d.proximo_passo_em),
    situacao: d.situacao,
    contato: d.contato,
    produto_id: d.produto_id,
    ace_aws: d.ace_aws,
    atualizado_em: (d.atualizado_em ?? d.criado_em).toISOString(),
    pode_editar: ctx.podeEditar(d.area),
    url: base + caminhoDe({ view: "comercial", ref: d.ref }),
  };
}

export type FiltroAtividades = {
  area?: string; status?: string; responsavelId?: number; busca?: string; limite: number;
  /** Só as tarefas ligadas a esta oportunidade (C-0104 ou a forma antiga D-104). */
  oportunidade?: string;
};

/** Id da oportunidade pela referência, se quem pergunta a enxerga. Não enxergar = não existir. */
export async function oportunidadeVisivel(sql: Queryable, ctx: Ctx, refBruta: string): Promise<number | null> {
  const ref = refCanonica(refBruta);
  if (!ref || tipoDaRef(ref) !== "oportunidade") return null;
  const [d] = await sql<{ id: number; area: string }[]>`SELECT id, area FROM deals WHERE ref = ${ref}`;
  return d && ctx.podeVer(d.area) ? d.id : null;
}

export async function listarAtividades(sql: Queryable, ctx: Ctx, f: FiltroAtividades, base: string) {
  const areas = areasDoFiltro(ctx, f.area);
  if (!areas.length) return { itens: [], total: 0 };
  let oportunidadeId: number | null = null;
  if (f.oportunidade) {
    oportunidadeId = await oportunidadeVisivel(sql, ctx, f.oportunidade);
    if (oportunidadeId === null) return { erro: "Oportunidade não encontrada." } as const;
  }
  const linhas = await sql<LinhaAtividade[]>`
    SELECT a.ref, a.titulo, a.area, a.status, a.prioridade, a.prazo, a.responsavel_user_id, u.nome AS responsavel,
           a.situacao, a.proximo_passo, a.proximo_passo_em, a.produto_id, a.atualizado_em, a.criado_em,
           a.oportunidade_id, o.ref AS op_ref, o.conta AS op_conta, o.area AS op_area
    FROM activities a LEFT JOIN users u ON u.id = a.responsavel_user_id
      LEFT JOIN deals o ON o.id = a.oportunidade_id
    WHERE a.area = ANY(${areas})
      ${f.status ? sql`AND a.status = ${f.status}` : sql``}
      ${oportunidadeId !== null ? sql`AND a.oportunidade_id = ${oportunidadeId}` : sql``}
      ${f.busca ? sql`AND (a.titulo ILIKE ${padraoBusca(f.busca)} ESCAPE '\\' OR a.situacao ILIKE ${padraoBusca(f.busca)} ESCAPE '\\'
                          OR a.proximo_passo ILIKE ${padraoBusca(f.busca)} ESCAPE '\\')` : sql``}
    ORDER BY a.ref ASC
  `;
  const filtradas = f.responsavelId
    ? linhas.filter((a) => a.responsavel_user_id === f.responsavelId)
    : [...linhas];
  return { itens: filtradas.slice(0, f.limite).map((a) => atividadeDto(a, ctx, base)), total: filtradas.length };
}

export type FiltroOportunidades = {
  area?: string; estagio?: string; responsavelId?: number; busca?: string; limite: number;
};

export async function listarOportunidades(sql: Queryable, ctx: Ctx, f: FiltroOportunidades, base: string) {
  const areas = areasDoFiltro(ctx, f.area);
  if (!areas.length) return { itens: [], total: 0 };
  const linhas = await sql<LinhaOportunidade[]>`
    SELECT d.ref, d.conta, d.escopo, d.area, d.estagio, d.valor_centavos, d.responsavel_user_id, u.nome AS responsavel,
           d.responsavel_texto, d.proximo_passo, d.proximo_passo_em, d.situacao, d.contato, d.produto_id,
           d.ace_aws, d.atualizado_em, d.criado_em
    FROM deals d LEFT JOIN users u ON u.id = d.responsavel_user_id
    WHERE d.area = ANY(${areas})
      ${f.estagio ? sql`AND d.estagio = ${f.estagio}` : sql``}
      ${f.busca ? sql`AND (d.conta ILIKE ${padraoBusca(f.busca)} ESCAPE '\\' OR d.escopo ILIKE ${padraoBusca(f.busca)} ESCAPE '\\'
                          OR d.situacao ILIKE ${padraoBusca(f.busca)} ESCAPE '\\' OR d.contato ILIKE ${padraoBusca(f.busca)} ESCAPE '\\')` : sql``}
    ORDER BY d.ref ASC
  `;
  let filtradas = [...linhas];
  if (f.responsavelId) {
    // Mesma resolução do seletor "Quem": id quando há, nome no texto livre quando não há.
    const pessoas = await pessoasDe(sql);
    const chave = [`u:${f.responsavelId}`];
    filtradas = filtradas.filter((d) =>
      ehDoResponsavel({ responsavelId: d.responsavel_user_id, responsavelTexto: d.responsavel_texto }, chave, pessoas)
    );
  }
  return { itens: filtradas.slice(0, f.limite).map((d) => oportunidadeDto(d, ctx, base)), total: filtradas.length };
}

/**
 * Um registro e o histórico completo. Mesma regra da rota de histórico: quem não enxerga a
 * área recebe "não encontrado" — sem confirmar que o registro existe.
 */
export async function verRegistro(sql: Queryable, ctx: Ctx, refBruta: string, base: string) {
  const ref = refCanonica(refBruta);
  if (!ref) return null;
  let registro: Record<string, unknown> | null = null;
  let area: string | null = null;
  let refAntiga: string | null = null;

  if (tipoDaRef(ref) === "atividade") {
    const [a] = await sql<(LinhaAtividade & { ref_antiga: string | null })[]>`
      SELECT a.ref, a.titulo, a.area, a.status, a.prioridade, a.prazo, a.responsavel_user_id, u.nome AS responsavel,
             a.situacao, a.proximo_passo, a.proximo_passo_em, a.produto_id, a.atualizado_em, a.criado_em,
           a.oportunidade_id, o.ref AS op_ref, o.conta AS op_conta, o.area AS op_area, a.ref_antiga
      FROM activities a LEFT JOIN users u ON u.id = a.responsavel_user_id
      LEFT JOIN deals o ON o.id = a.oportunidade_id WHERE a.ref = ${ref}
    `;
    if (a && ctx.podeVer(a.area)) {
      refAntiga = a.ref_antiga;
      registro = { tipo: "atividade", ...atividadeDto(a, ctx, base) };
      area = a.area;
    }
  } else {
    const [d] = await sql<(LinhaOportunidade & { ref_antiga: string | null })[]>`
      SELECT d.ref, d.conta, d.escopo, d.area, d.estagio, d.valor_centavos, d.responsavel_user_id, u.nome AS responsavel,
             d.responsavel_texto, d.proximo_passo, d.proximo_passo_em, d.situacao, d.contato, d.produto_id,
             d.ace_aws, d.atualizado_em, d.criado_em, d.ref_antiga
      FROM deals d LEFT JOIN users u ON u.id = d.responsavel_user_id WHERE d.ref = ${ref}
    `;
    if (d && ctx.podeVer(d.area)) {
      refAntiga = d.ref_antiga;
      // O lado operacional desta venda, só nas áreas que quem pergunta enxerga.
      const tarefas = await sql<{ ref: string; titulo: string; status: string; area: string; responsavel: string | null; prazo: Date | null }[]>`
        SELECT a.ref, a.titulo, a.status, a.area, u.nome AS responsavel, a.prazo
        FROM activities a LEFT JOIN users u ON u.id = a.responsavel_user_id
        WHERE a.oportunidade_id = (SELECT id FROM deals WHERE ref = ${ref}) AND a.area = ANY(${ctx.areasVisiveis})
        ORDER BY a.ref
      `;
      registro = {
        tipo: "oportunidade",
        ...oportunidadeDto(d, ctx, base),
        tarefas: tarefas.map((t) => ({
          ref: t.ref, titulo: t.titulo, status: t.status, status_nome: statusLabel(t.status),
          area: t.area, responsavel: t.responsavel, prazo: iso(t.prazo),
          url: base + caminhoDe({ view: "operacoes", ref: t.ref }),
        })),
      };
      area = d.area;
    }
  }
  if (!registro || !area) return null;

  const historico = await sql<{
    criado_em: Date; autor: string | null; campo: string | null; valor_anterior: string | null;
    valor_novo: string | null; texto: string; origem: string | null; cliente: string | null;
  }[]>`
    SELECT l.criado_em, u.nome AS autor, l.campo, l.valor_anterior, l.valor_novo, l.texto, l.origem,
           k.client_nome AS cliente
    FROM audit_log l
    LEFT JOIN users u ON u.id = l.actor_user_id
    LEFT JOIN oauth_concessoes k ON k.id = l.concessao_id
    -- O audit_log guarda a referência que valia quando cada linha foi escrita: antes de
    -- nov/2026, D-104 / A-1012.
    WHERE l.entidade = ${ref} OR (${refAntiga}::text IS NOT NULL AND l.entidade = ${refAntiga})
    ORDER BY l.criado_em DESC, l.id DESC
    LIMIT 100
  `;
  return {
    registro,
    historico: historico.map((h) => ({
      em: h.criado_em.toISOString(),
      autor: h.autor ?? "sistema",
      via: h.origem === "mcp" ? h.cliente ?? "conexão externa" : "interface",
      campo: h.campo,
      de: h.valor_anterior,
      para: h.valor_novo,
      texto: h.texto,
    })),
  };
}

export async function listarCadastros(sql: Queryable, ctx: Ctx) {
  const visiveis = ctx.areasVisiveis;
  const [produtos, pessoas] = await Promise.all([
    sql<{ id: string; label: string; area: string; ativo: boolean }[]>`
      SELECT id, label, area, ativo FROM produtos WHERE area = ANY(${visiveis}) ORDER BY area, ordem, label
    `,
    // Sem e-mail: o modelo precisa de id e nome para atribuir responsável, não de contato.
    sql<{ id: number; nome: string; papel: string; ativo: boolean }[]>`
      SELECT id, nome, papel, ativo FROM users ORDER BY nome
    `,
  ]);
  return {
    areas: visiveis.map((a) => ({ id: a, nome: ctx.labelArea(a), nivel: ctx.podeEditar(a) ? "editar" : "ver" })),
    produtos: [...produtos],
    pessoas: [...pessoas],
  };
}
