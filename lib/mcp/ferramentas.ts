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
  notas: "notas",
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

const EXECUTORES: Record<NomeFerramenta, Executor> = {
  contexto: async (c) => ({
    ok: true,
    dados: {
      pessoa: { id: c.ctx.user.userId, nome: c.ctx.user.nome, papel: c.ctx.user.papel },
      conexao: {
        cliente: c.acesso.clientNome,
        escopos: c.acesso.escopos.split(" "),
        pode_gravar: temEscopo(c.acesso.escopos, "escrita"),
        observacao: temEscopo(c.acesso.escopos, "escrita")
          ? "Grava só nas verticais com nível 'editar'. Nada pode ser excluído por esta conexão."
          : "Esta conexão só lê. Para gravar, a pessoa precisa reconectar marcando 'Gravar' na tela de autorização.",
      },
      areas: c.ctx.areasVisiveis.map((a) => ({ id: a, nome: c.ctx.labelArea(a), nivel: c.ctx.podeEditar(a) ? "editar" : "ver" })),
      status_atividade: STATUS.map((s) => ({ id: s.key, nome: s.label })),
      estagios_oportunidade: STAGES.map((s) => ({ id: s.key, nome: s.label })),
      prioridades: [...PRIORIDADES],
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
    const r = await criarOportunidade(c.sql, c.ctx, paraNucleo(a), autorDe(c));
    if (ehFalha(r)) return { ok: false, erro: r.erro };
    return depoisDeGravar(c, r.ref, { criado: true });
  },

  atualizar_oportunidade: async (c, a) => {
    const id = await idPorRef(c, "oportunidade", a.ref as string);
    if (!id) return { ok: false, erro: "Oportunidade não encontrada." };
    const r = await atualizarOportunidade(c.sql, c.ctx, id, paraNucleo(semRef(a)), autorDe(c));
    if (ehFalha(r)) return { ok: false, erro: r.erro };
    return depoisDeGravar(c, r.ref, { campos_alterados: r.mudancas });
  },
};

export const FERRAMENTAS: Ferramenta[] = CATALOGO.map((d) => ({ ...d, executar: EXECUTORES[d.name] }));
