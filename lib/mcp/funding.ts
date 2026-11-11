// Ferramentas do MCP de funding AWS. Só admin (o catálogo marca `soAdmin`, a rota recusa
// antes; a checagem aqui é a segunda barreira). Gravam pelas mesmas funções da tela
// (lib/funding-db.ts), com a auditoria marcada como vinda desta conexão. Valores em US$ na
// entrada e na saída; por dentro, centavos de dólar.

import type { Queryable } from "../db";
import {
  GARANTIDO, cobertura, consumo, funding, rotuloConta, rotuloModelo, rotuloRegiao, rotuloStatusFunding, sugestaoDaCalculadora,
  type Estimativa,
} from "../funding";
import { alterar, criar, lerFunding } from "../funding-db";
import type { Autor } from "../receita";
import type { Contexto, Saida } from "./ferramentas";

const usd = (c: number | null | undefined) => (c == null ? null : Math.round(c) / 100);
const cents = (v: unknown) => (typeof v === "number" ? Math.round(v * 100) : undefined);
const autorDe = (c: Contexto): Autor => ({ userId: c.ctx.user.userId, origem: "mcp", concessaoId: c.acesso.concessaoId });
const negado: Saida = { ok: false, erro: "Restrito à administração." };

function estimativaParaSaida(e: Estimativa, nomeArq: (id: number | null) => string | null, nomeProg: (id: string) => string, base: string) {
  const c = consumo(e);
  const f = funding(e);
  const cob = cobertura(e);
  return {
    ref: e.ref,
    cliente: e.conta,
    arquetipo_id: e.arquetipoId,
    arquetipo: nomeArq(e.arquetipoId),
    regiao: e.regiao,
    porte: e.porte,
    consumo_mensal_usd: { liff: usd(c.mensal.liff), cliente: usd(c.mensal.cliente), ia: usd(e.iaMensalCentavos), ia_paga_por: e.iaPagaPor },
    inicio: e.inicio,
    duracao_meses: e.duracaoMeses,
    consumo_no_periodo_usd: { liff: usd(c.liff), cliente: usd(c.cliente), total: usd(c.total) },
    funding_usd: { garantido: usd(f.garantido), em_andamento: usd(f.emAndamento), garantido_liff: usd(f.garantidoLiff), garantido_cliente: usd(f.garantidoCliente) },
    cobertura_percentual: cob == null ? null : Math.round(cob * 1000) / 10,
    linhas: e.linhas.map((l) => ({
      linha_id: l.id,
      programa: l.programaId,
      programa_nome: nomeProg(l.programaId),
      beneficiario: l.beneficiario,
      valor_usd: usd(l.valorCentavos),
      status: l.status,
      status_rotulo: rotuloStatusFunding(l.status),
      garantido: GARANTIDO.includes(l.status),
      aws_id: l.awsId || null,
      solicitado_em: l.solicitadoEm,
      aprovado_em: l.aprovadoEm,
      expira_em: l.expiraEm,
      notas: l.notas || null,
    })),
    notas: e.notas || null,
    url: `${base}/funding`,
  };
}

async function carregar(sql: Queryable) {
  const d = await lerFunding(sql);
  const nomeArq = (id: number | null) => (id == null ? null : d.arquetipos.find((a) => a.id === id)?.nome ?? null);
  const nomeProg = (id: string) => d.programas.find((p) => p.id === id)?.label ?? id;
  return { ...d, nomeArq, nomeProg };
}

/* ============================== leitura ============================== */

export async function resumoFunding(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  const d = await carregar(c.sql);
  const busca = typeof a.busca === "string" ? a.busca.toLowerCase() : "";
  const ests = d.estimativas.filter((e) => !busca || e.conta.toLowerCase().includes(busca));
  const total = ests.reduce((t, e) => t + consumo(e).total, 0);
  const garantido = ests.reduce((t, e) => t + funding(e).garantido, 0);
  return {
    ok: true,
    dados: {
      totais_usd: {
        consumo_mensal_liff: usd(ests.reduce((t, e) => t + consumo(e).mensal.liff, 0)),
        consumo_mensal_cliente: usd(ests.reduce((t, e) => t + consumo(e).mensal.cliente, 0)),
        consumo_no_periodo: usd(total),
        funding_garantido: usd(garantido),
        funding_em_andamento: usd(ests.reduce((t, e) => t + funding(e).emAndamento, 0)),
      },
      cobertura_percentual: total ? Math.round((garantido / total) * 1000) / 10 : null,
      estimativas: ests.map((e) => estimativaParaSaida(e, d.nomeArq, d.nomeProg, c.base)),
      url: `${c.base}/funding`,
    },
  };
}

export async function listarArquetipos(c: Contexto): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  const d = await lerFunding(c.sql);
  return {
    ok: true,
    dados: {
      arquetipos: d.arquetipos.map((a) => ({
        id: a.id,
        nome: a.nome,
        modelo: a.modelo,
        modelo_rotulo: rotuloModelo(a.modelo),
        descricao: a.descricao,
        ativo: a.ativo,
        calculadoras: a.calculadoras.map((k) => ({
          regiao: k.regiao,
          regiao_rotulo: rotuloRegiao(k.regiao),
          conta: k.conta,
          conta_rotulo: rotuloConta(k.conta),
          porte: k.porte,
          custo_mensal_usd: usd(k.custoMensalCentavos),
          link: k.url || null,
          data_preco: k.dataPreco,
          notas: k.notas || null,
        })),
      })),
      programas: d.programas.map((p) => ({ id: p.id, nome: p.label, forma: p.forma, descricao: p.descricao, ativo: p.ativo })),
    },
  };
}

export async function verEstimativa(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  const d = await carregar(c.sql);
  const e = d.estimativas.find((x) => x.ref === String(a.ref).toUpperCase());
  if (!e) return { ok: false, erro: "Estimativa não encontrada." };
  const historico = await c.sql<{ criado_em: Date; autor: string | null; texto: string; origem: string | null }[]>`
    SELECT l.criado_em, u.nome AS autor, l.texto, l.origem
    FROM audit_log l LEFT JOIN users u ON u.id = l.actor_user_id
    WHERE l.entidade = ${e.ref} ORDER BY l.criado_em DESC, l.id DESC LIMIT 50
  `;
  return {
    ok: true,
    ref: e.ref,
    dados: {
      estimativa: estimativaParaSaida(e, d.nomeArq, d.nomeProg, c.base),
      historico: historico.map((h) => ({ quando: h.criado_em.toISOString(), quem: h.autor ?? "sistema", via: h.origem === "mcp" ? "conexão" : "interface", o_que: h.texto })),
    },
  };
}

/* ============================== gravação ============================== */

/** Monta o corpo da estimativa para o cadastro a partir dos argumentos (sobre a atual, se houver). */
async function corpoEstimativa(c: Contexto, a: Record<string, unknown>, atual?: Estimativa): Promise<Record<string, unknown> | string> {
  const arquetipoId = a.arquetipo_id !== undefined ? a.arquetipo_id : atual?.arquetipoId ?? null;
  const regiao = (a.regiao as string | undefined) ?? atual?.regiao;
  const porte = (a.porte as string | undefined) ?? atual?.porte ?? "M";
  let liff = cents(a.liff_mensal_usd) ?? atual?.liffMensalCentavos ?? 0;
  let cliente = cents(a.cliente_mensal_usd) ?? atual?.clienteMensalCentavos ?? 0;
  if (a.usar_calculadora) {
    const { arquetipos } = await lerFunding(c.sql);
    const arq = arquetipos.find((x) => x.id === arquetipoId);
    if (!arq) return "Para usar a calculadora, informe um `arquetipo_id` válido.";
    const s = sugestaoDaCalculadora(arq, String(regiao), porte);
    if (!s.achou) return `O arquétipo ${arq.nome} não tem calculadora para ${regiao}, porte ${porte}. Cadastre com \`salvar_calculadora\` ou informe os valores.`;
    if (a.liff_mensal_usd === undefined) liff = s.liff;
    if (a.cliente_mensal_usd === undefined) cliente = s.cliente;
  }
  return {
    conta: a.conta ?? atual?.conta,
    arquetipoId,
    regiao,
    porte,
    liffMensalCentavos: liff,
    clienteMensalCentavos: cliente,
    iaMensalCentavos: cents(a.ia_mensal_usd) ?? atual?.iaMensalCentavos ?? 0,
    iaPagaPor: a.ia_paga_por ?? atual?.iaPagaPor ?? "liff",
    inicio: a.inicio !== undefined ? a.inicio : atual?.inicio ?? null,
    duracaoMeses: a.duracao_meses ?? atual?.duracaoMeses ?? 12,
    notas: a.notas ?? atual?.notas ?? "",
  };
}

async function depois(c: Contexto, ref: string, extra: Record<string, unknown>): Promise<Saida> {
  const v = await verEstimativa(c, { ref });
  return v.ok ? { ok: true, ref, dados: { ...extra, ...v.dados } } : { ok: true, ref, dados: { ...extra, ref } };
}

export async function criarEstimativa(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  const corpo = await corpoEstimativa(c, a);
  if (typeof corpo === "string") return { ok: false, erro: corpo };
  const r = await criar(c.sql, autorDe(c), "estimativas", corpo);
  if ("erro" in r) return { ok: false, erro: r.erro };
  return depois(c, r.ref!, { criada: true });
}

export async function atualizarEstimativa(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  const { estimativas } = await lerFunding(c.sql);
  const atual = estimativas.find((x) => x.ref === String(a.ref).toUpperCase());
  if (!atual) return { ok: false, erro: "Estimativa não encontrada." };
  const corpo = await corpoEstimativa(c, a, atual);
  if (typeof corpo === "string") return { ok: false, erro: corpo };
  const r = await alterar(c.sql, autorDe(c), "estimativas", String(atual.id), corpo);
  if ("erro" in r) return { ok: false, erro: r.erro };
  return depois(c, atual.ref, { atualizada: true });
}

export async function registrarFunding(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  const { estimativas } = await lerFunding(c.sql);
  const e = estimativas.find((x) => x.ref === String(a.estimativa).toUpperCase());
  if (!e) return { ok: false, erro: "Estimativa não encontrada." };
  const r = await criar(c.sql, autorDe(c), "linhas", {
    estimativaId: e.id,
    programaId: a.programa,
    beneficiario: a.beneficiario,
    valorCentavos: cents(a.valor_usd),
    status: a.status,
    awsId: a.aws_id ?? "",
    solicitadoEm: a.solicitado_em ?? null,
    aprovadoEm: a.aprovado_em ?? null,
    expiraEm: a.expira_em ?? null,
    notas: a.notas ?? "",
  });
  if ("erro" in r) return { ok: false, erro: r.erro };
  return depois(c, e.ref, { registrado: true, linha_id: r.id });
}

export async function atualizarFunding(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  const { estimativas } = await lerFunding(c.sql);
  const e = estimativas.find((x) => x.linhas.some((l) => l.id === a.linha_id));
  const l = e?.linhas.find((x) => x.id === a.linha_id);
  if (!e || !l) return { ok: false, erro: "Linha de funding não encontrada." };
  const r = await alterar(c.sql, autorDe(c), "linhas", String(l.id), {
    estimativaId: e.id,
    programaId: a.programa ?? l.programaId,
    beneficiario: a.beneficiario ?? l.beneficiario,
    valorCentavos: cents(a.valor_usd) ?? l.valorCentavos,
    status: a.status ?? l.status,
    awsId: a.aws_id ?? l.awsId,
    solicitadoEm: a.solicitado_em !== undefined ? a.solicitado_em : l.solicitadoEm,
    aprovadoEm: a.aprovado_em !== undefined ? a.aprovado_em : l.aprovadoEm,
    expiraEm: a.expira_em !== undefined ? a.expira_em : l.expiraEm,
    notas: a.notas ?? l.notas,
  });
  if ("erro" in r) return { ok: false, erro: r.erro };
  return depois(c, e.ref, { atualizado: true, linha_id: l.id });
}

export async function salvarCalculadora(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  const { arquetipos } = await lerFunding(c.sql);
  const arq = arquetipos.find((x) => x.id === a.arquetipo_id);
  if (!arq) return { ok: false, erro: "Arquétipo não encontrado." };
  const existente = arq.calculadoras.find((k) => k.regiao === a.regiao && k.conta === a.conta && k.porte === a.porte);
  const corpo = {
    arquetipoId: arq.id,
    regiao: a.regiao,
    conta: a.conta,
    porte: a.porte,
    url: a.url ?? existente?.url ?? "",
    custoMensalCentavos: cents(a.custo_mensal_usd),
    dataPreco: a.data_preco !== undefined ? a.data_preco : existente?.dataPreco ?? null,
    notas: a.notas ?? existente?.notas ?? "",
  };
  const r = existente
    ? await alterar(c.sql, autorDe(c), "calculadoras", String(existente.id), corpo)
    : await criar(c.sql, autorDe(c), "calculadoras", corpo);
  if ("erro" in r) return { ok: false, erro: r.erro };
  return {
    ok: true,
    ref: `ARQ-${arq.id}`,
    dados: {
      [existente ? "atualizada" : "criada"]: true,
      arquetipo: arq.nome,
      regiao: a.regiao,
      conta: a.conta,
      porte: a.porte,
      custo_mensal_usd: a.custo_mensal_usd,
      link: corpo.url || null,
    },
  };
}
