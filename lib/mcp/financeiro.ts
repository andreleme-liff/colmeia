// Ferramentas do MCP de receita (forecast) e faturamento. LER a receita é de todos (nov/2026);
// gravar receita e tudo de faturamento é só admin — o catálogo marca
// `soAdmin` e a rota recusa antes de chegar aqui; a checagem abaixo é a segunda barreira.
//
// Gravam pelas MESMAS funções da interface (lib/receita.ts, lib/faturas.ts), na transação que
// também registra a chamada, com a auditoria marcada como vinda desta conexão. Valores entram
// e saem em reais; por dentro, centavos.

import type { Queryable } from "../db";
import { hojeISO, refCanonica, stageLabel, tipoDaRef } from "../domain";
import {
  ETAPAS_FINAIS, ROTULO_SITUACAO, contratadaDoMes, lancamentos, lerContrato, mesDe, rotuloMes, serieMensal,
  situacaoEfetiva, somarMeses, totalNoPeriodo, type Contrato, type SituacaoEfetiva,
} from "../forecast";
import {
  ROTULO_STATUS, aging, diasDeAtraso, itensDoMes, liquidoEsperado, rotuloForma, rotuloTipoFatura, statusDe,
  vencimentoSugerido, type Fatura, type StatusFatura,
} from "../faturamento";
import { atualizarContrato, criarContrato, lerContratos, type Autor } from "../receita";
import { agirNaFatura, emitirFatura, lerFaturas } from "../faturas";
import type { Contexto, Saida } from "./ferramentas";

const reais = (c: number | null | undefined) => (c == null ? null : Math.round(c) / 100);
const centavos = (r: unknown) => (typeof r === "number" ? Math.round(r * 100) : undefined);
const autorDe = (c: Contexto): Autor => ({ userId: c.ctx.user.userId, origem: "mcp", concessaoId: c.acesso.concessaoId });
const negado: Saida = { ok: false, erro: "Restrito à administração." };
const negadoReceita: Saida = { ok: false, erro: "Receita restrita a gestores e à administração." };

type Card = { id: number; ref: string; conta: string; area: string; estagio: string; valor_centavos: string };
async function lerCards(sql: Queryable): Promise<Card[]> {
  return sql<Card[]>`SELECT id, ref, conta, area, estagio, valor_centavos FROM deals`;
}

function efetivos(contratos: Contrato[], cards: Card[]) {
  const porId = new Map(cards.map((d) => [d.id, d]));
  return contratos.map((c) => {
    const card = c.dealId != null ? porId.get(c.dealId) : undefined;
    return { contrato: c, card, efetiva: situacaoEfetiva(c, card ?? null) };
  });
}

function contratoParaSaida(
  c: Contrato,
  card: Card | undefined,
  efetiva: SituacaoEfetiva,
  de: string,
  ate: string,
  base: string
) {
  return {
    ref: c.ref,
    cliente: c.conta,
    produto: c.area,
    situacao: efetiva,
    situacao_rotulo: ROTULO_SITUACAO[efetiva],
    situacao_cadastrada: c.situacao,
    chance: c.chance,
    oportunidade: card ? { ref: card.ref, estagio: card.estagio, estagio_rotulo: stageLabel(card.estagio) } : null,
    inicio_faturamento: c.inicioFaturamento,
    linhas: c.linhas.map((l) => ({
      tipo: l.tipo,
      valor_reais: reais(l.valorCentavos),
      parcelas: l.parcelas,
      comeca_no_mes: l.inicioMes + 1,
      duracao_meses: l.duracaoMeses,
    })),
    cobranca: { cnpj: c.cobranca.cnpj, email: c.cobranca.emailCobranca, dia_vencimento: c.cobranca.diaVencimento, forma: c.cobranca.formaCobranca },
    total_no_horizonte_reais: efetiva === "fora" ? 0 : reais(totalNoPeriodo(c, de, ate)),
    notas: c.notas,
    url: `${base}/receita`,
  };
}

function faturaParaSaida(f: Fatura, hoje: string, refContrato: string | null, base: string) {
  const s = statusDe(f, hoje);
  return {
    ref: f.ref,
    cliente: f.conta,
    produto: f.area,
    contrato: refContrato,
    tipo: f.tipo,
    o_que: f.tipo === "avulsa" ? f.descricao : `${rotuloTipoFatura(f.tipo)} ${f.parcela}`.trim(),
    competencia: f.competencia,
    status: s,
    status_rotulo: ROTULO_STATUS[s],
    valor_reais: reais(f.valorCentavos),
    retencoes_reais: reais(f.retencoesCentavos),
    liquido_reais: reais(liquidoEsperado(f)),
    emitida_em: f.emitidaEm,
    vencimento: f.vencimento,
    dias_de_atraso: diasDeAtraso(f.vencimento, hoje),
    nf_numero: f.nfNumero || null,
    forma: f.forma ? rotuloForma(f.forma) : null,
    pago_em: f.pagoEm,
    valor_pago_reais: reais(f.valorPagoCentavos),
    cancelada_em: f.canceladaEm,
    motivo_cancelamento: f.motivoCancelamento || null,
    url: `${base}/faturamento`,
  };
}

/** Converte as linhas do MCP (reais, mês 1-based) para o formato do cadastro. */
function linhasParaCadastro(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  return v.map((l: Record<string, unknown>) => ({
    tipo: l.tipo,
    valorCentavos: centavos(l.valor_reais),
    parcelas: l.parcelas ?? 1,
    inicioMes: typeof l.comeca_no_mes === "number" ? l.comeca_no_mes - 1 : 0,
    duracaoMeses: l.duracao_meses ?? null,
  }));
}

async function dealIdDe(sql: Queryable, ref: unknown): Promise<number | null | "invalida"> {
  if (ref === null) return null;
  const r = refCanonica(String(ref));
  if (!r || tipoDaRef(r) !== "oportunidade") return "invalida";
  const [d] = await sql<{ id: number }[]>`SELECT id FROM deals WHERE ref = ${r}`;
  return d ? d.id : "invalida";
}

async function contratoPorRef(sql: Queryable, ref: string): Promise<Contrato | null> {
  const r = ref.toUpperCase();
  return (await lerContratos(sql)).find((c) => c.ref === r) ?? null;
}

async function faturaPorRef(sql: Queryable, ref: string): Promise<Fatura | null> {
  const r = ref.toUpperCase();
  return (await lerFaturas(sql)).find((f) => f.ref === r) ?? null;
}

/* ============================== leitura ============================== */

export async function resumoReceita(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.podeVerReceita) return negadoReceita;
  const horizonte = (a.horizonte_meses as number | undefined) ?? 12;
  const area = a.area as string | undefined;
  const de = mesDe(hojeISO());
  const ate = somarMeses(de, horizonte - 1);
  const [contratos, cards] = await Promise.all([lerContratos(c.sql), lerCards(c.sql)]);
  const naArea = <T extends { area: string }>(l: T[]) => (area ? l.filter((x) => x.area === area) : l);
  const ef = efetivos(naArea(contratos), cards);
  const serie = serieMensal(ef, de, horizonte);
  const comContrato = new Set(contratos.map((x) => x.dealId).filter((x) => x != null));
  const cardsNaArea = naArea(cards);
  const card = (d: Card) => ({ ref: d.ref, cliente: d.conta, estagio: stageLabel(d.estagio), valor_no_card_reais: reais(Number(d.valor_centavos)) });
  return {
    ok: true,
    dados: {
      periodo: { de, ate, meses: horizonte },
      produto: area ?? "todos",
      totais_reais: {
        contratada: reais(serie.reduce((t, m) => t + contratadaDoMes(m), 0)),
        contratada_assinatura: reais(serie.reduce((t, m) => t + m.assinatura, 0)),
        contratada_implantacao: reais(serie.reduce((t, m) => t + m.implantacao, 0)),
        contratada_customizacao: reais(serie.reduce((t, m) => t + m.customizacao, 0)),
        provavel: reais(serie.reduce((t, m) => t + m.provavel, 0)),
        possivel: reais(serie.reduce((t, m) => t + m.possivel, 0)),
      },
      assinatura_mes_atual_reais: reais(serie[0]?.assinatura ?? 0),
      por_mes: serie.map((m) => ({
        mes: m.mes,
        rotulo: rotuloMes(m.mes),
        assinatura: reais(m.assinatura),
        implantacao: reais(m.implantacao),
        customizacao: reais(m.customizacao),
        contratada: reais(contratadaDoMes(m)),
        provavel: reais(m.provavel),
        possivel: reais(m.possivel),
      })),
      pendencias: {
        ganhos_sem_receita: cardsNaArea.filter((d) => d.estagio === "ganho" && !comContrato.has(d.id)).map(card),
        etapas_finais_fora_do_forecast: cardsNaArea
          .filter((d) => (ETAPAS_FINAIS as readonly string[]).includes(d.estagio) && !comContrato.has(d.id))
          .map(card),
        previsoes_fora: ef.filter((e) => e.efetiva === "fora").map((e) => ({ ref: e.contrato.ref, cliente: e.contrato.conta, card: e.card?.ref ?? null })),
      },
      url: `${c.base}/receita`,
    },
  };
}

export async function listarContratos(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.podeVerReceita) return negadoReceita;
  const horizonte = (a.horizonte_meses as number | undefined) ?? 12;
  const de = mesDe(hojeISO());
  const ate = somarMeses(de, horizonte - 1);
  const [contratos, cards] = await Promise.all([lerContratos(c.sql), lerCards(c.sql)]);
  const busca = typeof a.busca === "string" ? a.busca.toLowerCase() : "";
  const lista = efetivos(contratos, cards)
    .filter((e) => !a.area || e.contrato.area === a.area)
    .filter((e) => !a.situacao || e.efetiva === a.situacao)
    .filter((e) => !busca || e.contrato.conta.toLowerCase().includes(busca))
    .map((e) => contratoParaSaida(e.contrato, e.card, e.efetiva, de, ate, c.base));
  return { ok: true, dados: { total: lista.length, horizonte: { de, ate }, contratos: lista } };
}

export async function verContrato(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.podeVerReceita) return negadoReceita;
  const contrato = await contratoPorRef(c.sql, a.ref as string);
  if (!contrato) return { ok: false, erro: "Receita não encontrada." };
  const cards = await lerCards(c.sql);
  const [e] = efetivos([contrato], cards);
  const hoje = hojeISO();
  const inicio = mesDe(contrato.inicioFaturamento);
  // Faturamento continua só da administração: os demais veem a receita sem as faturas.
  const faturas = c.ctx.isAdmin ? (await lerFaturas(c.sql)).filter((f) => f.contratoId === contrato.id) : [];
  const historico = await c.sql<{ criado_em: Date; autor: string | null; texto: string; origem: string | null }[]>`
    SELECT l.criado_em, u.nome AS autor, l.texto, l.origem
    FROM audit_log l LEFT JOIN users u ON u.id = l.actor_user_id
    WHERE l.entidade = ${contrato.ref}
    ORDER BY l.criado_em DESC, l.id DESC LIMIT 50
  `;
  return {
    ok: true,
    ref: contrato.ref,
    dados: {
      receita: contratoParaSaida(contrato, e.card, e.efetiva, mesDe(hoje), somarMeses(mesDe(hoje), 11), c.base),
      cronograma_24_meses: lancamentos(contrato, inicio, somarMeses(inicio, 23)).map((l) => ({
        mes: l.mes,
        tipo: l.tipo,
        parcela: l.rotulo,
        valor_reais: reais(l.valorCentavos),
      })),
      ...(c.ctx.isAdmin ? { faturas: faturas.map((f) => faturaParaSaida(f, hoje, contrato.ref, c.base)) } : {}),
      historico: historico.map((h) => ({
        quando: h.criado_em.toISOString(),
        quem: h.autor ?? "sistema",
        via: h.origem === "mcp" ? "conexão" : "interface",
        o_que: h.texto,
      })),
    },
  };
}

export async function listarFaturas(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  const hoje = hojeISO();
  const limite = (a.limite as number | undefined) ?? 50;
  const status = a.status as (StatusFatura | "em_aberto") | undefined;
  const busca = typeof a.busca === "string" ? a.busca.toLowerCase() : "";
  const [contratos, cards, faturas] = await Promise.all([lerContratos(c.sql), lerCards(c.sql), lerFaturas(c.sql)]);
  const refPorId = new Map(contratos.map((x) => [x.id, x.ref]));
  const casa = (s: StatusFatura) => !status || (status === "em_aberto" ? s === "emitida" || s === "vencida" : s === status);
  const naArea = <T extends { area: string }>(l: T[]) => (a.area ? l.filter((x) => x.area === a.area) : l);
  const contem = (...t: (string | null | undefined)[]) => !busca || t.some((x) => x && x.toLowerCase().includes(busca));

  let itens: Record<string, unknown>[];
  if (typeof a.competencia === "string") {
    const ef = efetivos(contratos, cards);
    const contratado = new Set(ef.filter((e) => e.efetiva === "contratada").map((e) => e.contrato.id));
    itens = naArea(itensDoMes(contratos, (x) => contratado.has(x.id), faturas, a.competencia, hoje))
      .filter((i) => casa(i.status) && contem(i.conta, i.contratoRef, i.fatura?.ref, i.fatura?.nfNumero))
      .map((i) =>
        i.fatura
          ? faturaParaSaida(i.fatura, hoje, i.contratoRef, c.base)
          : {
              status: "a_emitir",
              status_rotulo: ROTULO_STATUS.a_emitir,
              cliente: i.conta,
              produto: i.area,
              contrato: i.contratoRef,
              tipo: i.tipo,
              o_que: `${rotuloTipoFatura(i.tipo)} ${i.parcela}`,
              competencia: i.competencia,
              valor_reais: reais(i.valorCentavos),
              para_emitir: { contrato: i.contratoRef, tipo: i.tipo, competencia: i.competencia },
            }
      );
  } else {
    if (status === "a_emitir") return { ok: false, erro: "Para ver o que está a emitir, informe a `competencia` (AAAA-MM)." };
    itens = naArea(faturas)
      .filter((f) => casa(statusDe(f, hoje)) && contem(f.conta, f.ref, f.nfNumero, f.descricao))
      .sort((x, y) => (x.vencimento ?? "").localeCompare(y.vencimento ?? ""))
      .map((f) => faturaParaSaida(f, hoje, f.contratoId != null ? refPorId.get(f.contratoId) ?? null : null, c.base));
  }
  const faixas = aging(naArea(faturas), hoje);
  return {
    ok: true,
    dados: {
      total: itens.length,
      faturas: itens.slice(0, limite),
      em_aberto_por_atraso: faixas.map((f) => ({ faixa: f.label, quantidade: f.qtd, valor_reais: reais(f.valor) })),
      url: `${c.base}/faturamento`,
    },
  };
}

/* ============================== gravação ============================== */

export async function criarContratoMcp(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  let dealId: number | null = null;
  if (a.oportunidade !== undefined) {
    const d = await dealIdDe(c.sql, a.oportunidade);
    if (d === "invalida") return { ok: false, erro: "Oportunidade não encontrada." };
    dealId = d;
  }
  const cob = (a.cobranca ?? {}) as Record<string, unknown>;
  const entrada = lerContrato({
    conta: a.conta,
    area: a.area,
    dealId,
    situacao: a.situacao,
    chance: a.chance ?? null,
    inicioFaturamento: a.inicio_faturamento,
    notas: a.notas ?? "",
    linhas: linhasParaCadastro(a.linhas),
    cobranca: { cnpj: cob.cnpj, emailCobranca: cob.email, diaVencimento: cob.dia_vencimento, formaCobranca: cob.forma },
  });
  if (typeof entrada === "string") return { ok: false, erro: entrada };
  const r = await criarContrato(c.sql, autorDe(c), entrada);
  if ("erro" in r) return { ok: false, erro: r.erro };
  return verDepois(c, r.ref, { criado: true });
}

export async function atualizarContratoMcp(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  const atual = await contratoPorRef(c.sql, a.ref as string);
  if (!atual) return { ok: false, erro: "Receita não encontrada." };
  let dealId = atual.dealId;
  if (a.oportunidade !== undefined) {
    const d = await dealIdDe(c.sql, a.oportunidade);
    if (d === "invalida") return { ok: false, erro: "Oportunidade não encontrada." };
    dealId = d;
  }
  const cob = (a.cobranca ?? {}) as Record<string, unknown>;
  const situacao = (a.situacao as string | undefined) ?? atual.situacao;
  const entrada = lerContrato({
    conta: a.conta ?? atual.conta,
    area: a.area ?? atual.area,
    dealId,
    situacao,
    // Mudou para prevista sem dizer a chance: assume alta (provável), como a tela.
    chance: a.chance !== undefined ? a.chance : situacao === "prevista" ? atual.chance ?? "alta" : null,
    inicioFaturamento: a.inicio_faturamento ?? atual.inicioFaturamento,
    notas: a.notas ?? atual.notas,
    linhas:
      a.linhas !== undefined
        ? linhasParaCadastro(a.linhas)
        : atual.linhas.map((l) => ({ ...l })),
    cobranca: {
      cnpj: cob.cnpj ?? atual.cobranca.cnpj,
      emailCobranca: cob.email ?? atual.cobranca.emailCobranca,
      diaVencimento: cob.dia_vencimento ?? atual.cobranca.diaVencimento,
      formaCobranca: cob.forma ?? atual.cobranca.formaCobranca,
    },
  });
  if (typeof entrada === "string") return { ok: false, erro: entrada };
  const r = await atualizarContrato(c.sql, autorDe(c), atual.id, entrada);
  if ("erro" in r) return { ok: false, erro: r.erro };
  return verDepois(c, r.ref, { atualizado: true });
}

async function verDepois(c: Contexto, ref: string, extra: Record<string, unknown>): Promise<Saida> {
  const visto = await verContrato(c, { ref });
  return visto.ok ? { ok: true, ref, dados: { ...extra, ...visto.dados } } : { ok: true, ref, dados: { ...extra, ref } };
}

export async function emitirFaturaMcp(c: Contexto, a: Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  const hoje = hojeISO();
  const competencia = a.competencia as string;
  const emissao = {
    emitidaEm: (a.emitida_em as string | undefined) ?? hoje,
    nfNumero: a.nf_numero ?? "",
    retencoesCentavos: centavos(a.retencoes_reais) ?? 0,
    valorCentavos: centavos(a.valor_reais),
    notas: a.notas ?? "",
  };
  let corpo: Record<string, unknown>;
  if (a.avulsa) {
    if (a.contrato || a.tipo) return { ok: false, erro: "Fatura avulsa não leva `contrato` nem `tipo`." };
    const av = a.avulsa as Record<string, unknown>;
    if (a.valor_reais === undefined) return { ok: false, erro: "Fatura avulsa precisa de `valor_reais`." };
    corpo = {
      origem: "avulsa", conta: av.conta, area: av.area, descricao: av.descricao, competencia,
      vencimento: a.vencimento ?? emissao.emitidaEm, forma: a.forma ?? "boleto", ...emissao,
    };
  } else {
    if (!a.contrato || !a.tipo) return { ok: false, erro: "Informe `contrato` e `tipo` (ou `avulsa`)." };
    const contrato = await contratoPorRef(c.sql, a.contrato as string);
    if (!contrato) return { ok: false, erro: "Receita não encontrada." };
    corpo = {
      origem: "cronograma",
      contratoId: contrato.id,
      tipo: a.tipo,
      competencia,
      vencimento: a.vencimento ?? vencimentoSugerido(competencia, contrato.cobranca.diaVencimento, emissao.emitidaEm),
      forma: a.forma ?? contrato.cobranca.formaCobranca,
      ...emissao,
    };
  }
  const r = await emitirFatura(c.sql, autorDe(c), corpo);
  if ("erro" in r) return { ok: false, erro: r.erro };
  const f = await faturaPorRef(c.sql, r.ref);
  return { ok: true, ref: r.ref, dados: { emitida: true, fatura: f ? faturaParaSaida(f, hoje, (a.contrato as string | undefined)?.toUpperCase() ?? null, c.base) : { ref: r.ref } } };
}

async function agir(c: Contexto, ref: string, corpo: (f: Fatura) => Record<string, unknown>): Promise<Saida> {
  if (!c.ctx.isAdmin) return negado;
  const f = await faturaPorRef(c.sql, ref);
  if (!f) return { ok: false, erro: "Fatura não encontrada." };
  const r = await agirNaFatura(c.sql, autorDe(c), f.id, corpo(f));
  if ("erro" in r) return { ok: false, erro: r.erro };
  const depois = await faturaPorRef(c.sql, r.ref);
  return { ok: true, ref: r.ref, dados: { fatura: depois ? faturaParaSaida(depois, hojeISO(), null, c.base) : { ref: r.ref } } };
}

export const registrarPagamentoMcp = (c: Contexto, a: Record<string, unknown>) =>
  agir(c, a.fatura as string, (f) => ({
    acao: "pagar",
    pagoEm: (a.pago_em as string | undefined) ?? hojeISO(),
    valorPagoCentavos: centavos(a.valor_recebido_reais) ?? liquidoEsperado(f),
    notas: a.notas ?? "",
  }));

export const corrigirFaturaMcp = (c: Contexto, a: Record<string, unknown>) =>
  agir(c, a.fatura as string, (f) => ({
    acao: "editar",
    emitidaEm: a.emitida_em ?? f.emitidaEm,
    vencimento: a.vencimento ?? f.vencimento,
    nfNumero: a.nf_numero ?? f.nfNumero,
    forma: a.forma ?? f.forma,
    valorCentavos: centavos(a.valor_reais) ?? f.valorCentavos,
    retencoesCentavos: centavos(a.retencoes_reais) ?? f.retencoesCentavos,
    notas: a.notas ?? f.notas,
  }));

export const estornarPagamentoMcp = (c: Contexto, a: Record<string, unknown>) => agir(c, a.fatura as string, () => ({ acao: "estornar" }));

export const cancelarFaturaMcp = (c: Contexto, a: Record<string, unknown>) =>
  agir(c, a.fatura as string, () => ({ acao: "cancelar", motivo: a.motivo }));
