// Execução das ferramentas do MCP. O catálogo (nomes, esquemas, anotações, quem grava) está
// em `catalogo.ts`; aqui, cada nome do catálogo ganha o seu executor — e `Record<NomeFerramenta, …>`
// faz o TypeScript recusar o build se alguma ferramenta do catálogo ficar sem executor.

import type { Queryable } from "../db";
import type { Ctx } from "../perms";
import type { Acesso } from "../oauth/servidor";
import { PRIORIDADES, STAGES, STATUS, refCanonica, tipoDaRef } from "../domain";
import { ehFalha, type Autor } from "../ops/comum";
import { atualizarAtividade, criarAtividade } from "../ops/atividades";
import { atualizarOportunidade, criarOportunidade } from "../ops/oportunidades";
import { listarAtividades, listarCadastros, listarOportunidades, verRegistro } from "../ops/leitura";
import { temEscopo } from "../oauth/protocolo";
import { CATALOGO, type Definicao, type NomeFerramenta } from "./catalogo";
import {
  atualizarContratoMcp, cancelarFaturaMcp, corrigirFaturaMcp, criarContratoMcp, emitirFaturaMcp, estornarPagamentoMcp,
  listarContratos, listarFaturas, registrarPagamentoMcp, resumoReceita, verContrato,
} from "./financeiro";
import {
  atualizarEstimativa, atualizarFunding, criarEstimativa, listarArquetipos, registrarFunding, resumoFunding, salvarCalculadora,
  verEstimativa,
} from "./funding";
import { atualizarOrganizacao, criarOrganizacao, listarOrganizacoes, organizacaoPorRef, verOrganizacao } from "./organizacoes";

export type Contexto = { sql: Queryable; ctx: Ctx; acesso: Acesso; base: string };
export type Saida = { ok: true; dados: Record<string, unknown>; ref?: string } | { ok: false; erro: string };
type Executor = (c: Contexto, args: Record<string, unknown>) => Promise<Saida>;
export type Ferramenta = Definicao & { executar: Executor };

/** Nome no MCP (snake_case) → nome no núcleo. `undefined` fica de fora; `null` passa. */
const MAPA: Record<string, string> = {
  titulo: "titulo", area: "area", status: "status", prioridade: "prioridade", prazo: "prazo",
  responsavel_id: "responsavelId", situacao: "situacao", proximo_passo: "proximoPasso",
  proximo_passo_em: "proximoPassoEm", produto_id: "produtoId", conta: "conta", estagio: "estagio",
  valor_reais: "valorReais", contato: "contato", responsavel_texto: "responsavelTexto",
  ace_aws: "aceAws", oportunidade: "oportunidade",
  origem: "origemId", ponte: "ponte", contato_operacional: "contatoOperacional", dor: "dor", modulos: "modulos",
  erp: "erp", ultima_interacao: "ultimaInteracao", blocker: "blocker", blocker_tipo: "blockerTipo",
  blocker_quem_resolve: "blockerDonoId", motivo_perda: "motivoPerda", motivo_perda_detalhe: "motivoPerdaDetalhe",
  notas: "notas", proposta_url: "propostaUrl",
  assinatura_mensal_reais: "propAssinaturaReais", implantacao_reais: "propImplantacaoReais",
  implantacao_parcelas: "propImplantacaoParcelas", customizacao_reais: "propCustomizacaoReais",
  customizacao_parcelas: "propCustomizacaoParcelas", arquetipo_id: "arquetipoId", registro_aws: "awsAdicionar",
};

function paraNucleo(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) if (MAPA[k] && v !== undefined) out[MAPA[k]] = v;
  return out;
}

const autorDe = (c: Contexto): Autor => ({ userId: c.ctx.user.userId, origem: "mcp", concessaoId: c.acesso.concessaoId });

function semRef(a: Record<string, unknown>): Record<string, unknown> {
  const resto = { ...a };
  delete resto.ref;
  return resto;
}

async function idPorRef(c: Contexto, tipo: "atividade" | "oportunidade", ref: string): Promise<number | null> {
  const r = refCanonica(ref);
  if (!r || tipoDaRef(r) !== tipo) return null;
  const linhas =
    tipo === "atividade"
      ? await c.sql<{ id: number; area: string }[]>`SELECT id, area FROM activities WHERE ref = ${r}`
      : await c.sql<{ id: number; area: string }[]>`SELECT id, area FROM deals WHERE ref = ${r}`;
  // Não enxerga = não existe, como na interface.
  return linhas[0] && c.ctx.podeVer(linhas[0].area) ? linhas[0].id : null;
}

async function depoisDeGravar(c: Contexto, ref: string, extra: Record<string, unknown>): Promise<Saida> {
  const visto = await verRegistro(c.sql, c.ctx, ref, c.base);
  return { ok: true, ref, dados: { ...extra, ref, url: (visto?.registro as { url?: string })?.url, registro: visto?.registro ?? null } };
}

/**
 * Corpo da oportunidade para o núcleo. `organizacao` (CLI-…) vira o id do cadastro; sem ela,
 * vale o nome em `conta`. Na criação, uma das duas é obrigatória.
 */
async function comOrganizacao(c: Contexto, a: Record<string, unknown>): Promise<Record<string, unknown>> {
  const corpo = paraNucleo(a);
  if (a.organizacao === undefined) return corpo;
  const org = await organizacaoPorRef(c, a.organizacao);
  if (!org) return { erro: "Organização não encontrada." };
  return { ...corpo, clienteId: org.id, conta: org.nome };
}

const EXECUTORES: Record<NomeFerramenta, Executor> = {
  contexto: async (c) => ({
    ok: true,
    dados: {
      pessoa: {
        id: c.ctx.user.userId, nome: c.ctx.user.nome, papel: c.ctx.user.papel,
        // Permissão é por papel: leitura só vê; os demais editam todos os produtos.
        edita: c.ctx.user.papel !== "leitura",
      },
      conexao: {
        cliente: c.acesso.clientNome,
        escopos: c.acesso.escopos.split(" "),
        pode_gravar: temEscopo(c.acesso.escopos, "escrita"),
        observacao: temEscopo(c.acesso.escopos, "escrita")
          ? "Grava se o papel da pessoa permite editar (membro, gestor ou admin); leitura não grava. Nada pode ser excluído por esta conexão."
          : "Esta conexão só lê. Para gravar, a pessoa precisa reconectar marcando 'Gravar' na tela de autorização.",
      },
      produtos: c.ctx.areasVisiveis.map((a) => ({ id: a, nome: c.ctx.labelArea(a), nivel: c.ctx.podeEditar(a) ? "editar" : "ver" })),
      status_atividade: STATUS.map((s) => ({ id: s.key, nome: s.label })),
      estagios_oportunidade: STAGES.map((s) => ({ id: s.key, nome: s.label })),
      prioridades: [...PRIORIDADES],
      organizacoes:
        "Toda oportunidade pertence a uma organização do cadastro (refs CLI-0000): listar_organizacoes, ver_organizacao e, com permissão de gravar, criar_organizacao e atualizar_organizacao. Ao criar oportunidade, prefira `organizacao` a `conta`.",
      receita_e_faturamento: c.ctx.isAdmin
        ? "Disponível (admin): receita, faturamento e funding AWS — resumo_receita, listar_receitas, ver_receita, listar_faturas, resumo_funding, listar_arquetipos, ver_estimativa e, com permissão de gravar, receitas, faturas, estimativas, funding e calculadoras."
        : "Receita: só leitura (resumo_receita, listar_receitas, ver_receita). Cadastrar ou alterar receita, faturamento e funding são restritos à administração.",
      app: c.base,
    },
  }),

  listar_cadastros: async (c) => ({ ok: true, dados: await listarCadastros(c.sql, c.ctx) }),

  listar_atividades: async (c, a) => {
    const r = await listarAtividades(c.sql, c.ctx, {
      area: a.area as string | undefined,
      status: a.status as string | undefined,
      responsavelId: a.responsavel_id as number | undefined,
      busca: a.busca as string | undefined,
      oportunidade: a.oportunidade as string | undefined,
      limite: (a.limite as number | undefined) ?? 50,
    }, c.base);
    if ("erro" in r && r.erro) return { ok: false, erro: r.erro };
    return { ok: true, dados: r };
  },

  listar_oportunidades: async (c, a) => ({
    ok: true,
    dados: await listarOportunidades(c.sql, c.ctx, {
      area: a.area as string | undefined,
      estagio: a.estagio as string | undefined,
      responsavelId: a.responsavel_id as number | undefined,
      busca: a.busca as string | undefined,
      limite: (a.limite as number | undefined) ?? 50,
    }, c.base),
  }),

  ver_registro: async (c, a) => {
    const r = await verRegistro(c.sql, c.ctx, a.ref as string, c.base);
    return r ? { ok: true, ref: refCanonica(a.ref as string) ?? undefined, dados: r } : { ok: false, erro: "Registro não encontrado." };
  },

  criar_atividade: async (c, a) => {
    const r = await criarAtividade(c.sql, c.ctx, paraNucleo(a), autorDe(c));
    if (ehFalha(r)) return { ok: false, erro: r.erro };
    return depoisDeGravar(c, r.ref, { criado: true });
  },

  atualizar_atividade: async (c, a) => {
    const id = await idPorRef(c, "atividade", a.ref as string);
    if (!id) return { ok: false, erro: "Atividade não encontrada." };
    const r = await atualizarAtividade(c.sql, c.ctx, id, paraNucleo(semRef(a)), autorDe(c));
    if (ehFalha(r)) return { ok: false, erro: r.erro };
    return depoisDeGravar(c, r.ref, { campos_alterados: r.mudancas });
  },

  criar_oportunidade: async (c, a) => {
    const corpo = await comOrganizacao(c, a);
    if ("erro" in corpo) return { ok: false, erro: corpo.erro as string };
    const r = await criarOportunidade(c.sql, c.ctx, corpo, autorDe(c));
    if (ehFalha(r)) return { ok: false, erro: r.erro };
    return depoisDeGravar(c, r.ref, { criado: true });
  },

  atualizar_oportunidade: async (c, a) => {
    const id = await idPorRef(c, "oportunidade", a.ref as string);
    if (!id) return { ok: false, erro: "Oportunidade não encontrada." };
    const corpo = await comOrganizacao(c, semRef(a));
    if ("erro" in corpo) return { ok: false, erro: corpo.erro as string };
    const r = await atualizarOportunidade(c.sql, c.ctx, id, corpo, autorDe(c));
    if (ehFalha(r)) return { ok: false, erro: r.erro };
    return depoisDeGravar(c, r.ref, { campos_alterados: r.mudancas });
  },

  // Organizações — ver `organizacoes.ts`.
  listar_organizacoes: listarOrganizacoes,
  ver_organizacao: verOrganizacao,
  criar_organizacao: criarOrganizacao,
  atualizar_organizacao: atualizarOrganizacao,

  // Receita e faturamento (só admin) — ver `financeiro.ts`.
  resumo_receita: resumoReceita,
  listar_receitas: listarContratos,
  ver_receita: verContrato,
  listar_faturas: listarFaturas,
  criar_receita: criarContratoMcp,
  atualizar_receita: atualizarContratoMcp,
  emitir_fatura: emitirFaturaMcp,
  registrar_pagamento: registrarPagamentoMcp,
  corrigir_fatura: corrigirFaturaMcp,
  estornar_pagamento: estornarPagamentoMcp,
  cancelar_fatura: cancelarFaturaMcp,

  // Funding AWS (só admin) — ver `funding.ts`.
  resumo_funding: resumoFunding,
  listar_arquetipos: listarArquetipos,
  ver_estimativa: verEstimativa,
  criar_estimativa: criarEstimativa,
  atualizar_estimativa: atualizarEstimativa,
  registrar_funding: registrarFunding,
  atualizar_funding: atualizarFunding,
  salvar_calculadora: salvarCalculadora,
};

/**
 * Vocabulário (nov/2026): na interface e no MCP, a antiga "vertical" se chama **produto** e o
 * antigo "módulo / produto" se chama **módulo**. No banco e no núcleo continuam `area` e
 * `produto_id`. Os esquemas do catálogo já usam os nomes novos; aqui eles voltam aos nomes do
 * núcleo antes de chegar aos executores — inclusive dentro de objetos aninhados (`avulsa`).
 */
const PARA_O_NUCLEO: Record<string, string> = { produto: "area", modulo_id: "produto_id" };

export function argsDoNucleo(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(argsDoNucleo);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[PARA_O_NUCLEO[k] ?? k] = argsDoNucleo(x);
  return out;
}

export const FERRAMENTAS: Ferramenta[] = CATALOGO.map((d) => ({
  ...d,
  executar: (c, a) => EXECUTORES[d.name](c, argsDoNucleo(a) as Record<string, unknown>),
}));
