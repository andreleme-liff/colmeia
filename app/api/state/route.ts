// Estado completo já recortado pela permissão do usuário.
// O front recebe só o que pode ver — a filtragem acontece no SQL, não no navegador.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json } from "@/lib/http";
import { porTexto } from "@/lib/domain";
import { DOMINIO_PERMITIDO } from "@/lib/google-oauth";
import { lerConfig } from "@/lib/oauth/protocolo";

export type ActivityDTO = {
  id: number;
  ref: string;
  titulo: string;
  area: string;
  status: string;
  prioridade: string;
  prazo: string | null;
  responsavelId: number | null;
  responsavel: string;
  situacao: string;
  proximoPasso: string;
  produtoId: string | null;
  /** Quando o próximo passo acontece. Nulo = sem data marcada. */
  proximoPassoEm: string | null;
  podeEditar: boolean;
};

export type DealDTO = {
  id: number;
  ref: string;
  conta: string;
  escopo: string;
  area: string;
  estagio: string;
  valorCentavos: number;
  responsavel: string;
  proximoPasso: string;
  /** Última mexida no card, ou a criação se nunca foi editado. */
  atualizadoEm: string;
  podeEditar: boolean;
};

export type LogDTO = {
  id: number;
  criadoEm: string;
  autor: string;
  area: string | null;
  entidade: string;
  texto: string;
};

export type PessoaDTO = {
  id: number;
  nome: string;
  email: string;
  papel: string;
  iniciais: string;
  ativo: boolean;
  perms: Record<string, string>;
};

export async function GET() {
  const ctx = await requireCtx();
  if (ctx instanceof Response) return ctx;

  const sql = await getDb();
  const areas = ctx.areasVisiveis;

  // Sem nenhuma área liberada, o usuário existe mas não enxerga nada — estado válido,
  // é como uma conta nova entra até a administração liberar.
  const [atividades, oportunidades, logs] = await Promise.all([
    sql<
      {
        id: number; ref: string; titulo: string; area: string; status: string;
        prioridade: string; prazo: Date | null; responsavel_user_id: number | null; responsavel: string | null;
        situacao: string; proximo_passo: string; proximo_passo_em: Date | null; produto_id: string | null;
        oportunidade_id: number | null; op_ref: string | null; op_conta: string | null; op_area: string | null;
      }[]
    >`
      SELECT a.id, a.ref, a.titulo, a.area, a.status, a.prioridade, a.prazo,
             a.responsavel_user_id, a.situacao, a.proximo_passo, a.proximo_passo_em, a.produto_id,
             u.nome AS responsavel, a.oportunidade_id, o.ref AS op_ref, o.conta AS op_conta, o.area AS op_area
      FROM activities a
      LEFT JOIN users u ON u.id = a.responsavel_user_id
      LEFT JOIN deals o ON o.id = a.oportunidade_id
      WHERE a.area = ANY(${areas})
      ORDER BY a.ref ASC
    `,
    sql<
      {
        id: number; ref: string; conta: string; area: string; estagio: string;
        valor_centavos: string; responsavel: string | null; responsavel_user_id: number | null;
        proximo_passo: string; situacao: string; contato: string; responsavel_texto: string;
        mexido_em: Date; proximo_passo_em: Date | null; ace_aws: boolean;
        origem_id: string | null; ponte: string; contato_operacional: string; dor: string; erp: string;
        ultima_interacao: Date | null; blocker: string; blocker_tipo: string | null;
        blocker_dono_id: number | null; blocker_dono: string | null; motivo_perda: string | null;
        motivo_perda_detalhe: string; notas: string; modulos: string[];
      }[]
    >`
      SELECT d.id, d.ref, d.conta, d.area, d.estagio, d.valor_centavos,
             u.nome AS responsavel, d.responsavel_user_id, d.proximo_passo,
             d.situacao, d.contato, d.responsavel_texto, d.proximo_passo_em, d.ace_aws,
             d.origem_id, d.ponte, d.contato_operacional, d.dor, d.erp, d.ultima_interacao,
             d.blocker, d.blocker_tipo, d.blocker_dono_id, bd.nome AS blocker_dono,
             d.motivo_perda, d.motivo_perda_detalhe, d.notas,
             COALESCE((SELECT array_agg(m.produto_id ORDER BY m.produto_id) FROM oportunidade_modulos m
                       WHERE m.deal_id = d.id), '{}') AS modulos,
             -- Card nunca editado tem atualizado_em nulo; nesse caso a idade conta da criação,
             -- que é o que faz sentido para "está parado há quanto tempo".
             COALESCE(d.atualizado_em, d.criado_em) AS mexido_em
      FROM deals d
      LEFT JOIN users u ON u.id = d.responsavel_user_id
      LEFT JOIN users bd ON bd.id = d.blocker_dono_id
      WHERE d.area = ANY(${areas})
      ORDER BY d.ref ASC
    `,
    sql<
      { id: number; criado_em: Date; autor: string | null; area: string | null; entidade: string; texto: string; via: string | null }[]
    >`
      SELECT l.id, l.criado_em, u.nome AS autor, l.area, l.entidade, l.texto,
             CASE WHEN l.origem = 'mcp' THEN COALESCE(k.client_nome, 'conexão externa') END AS via
      FROM audit_log l
      LEFT JOIN users u ON u.id = l.actor_user_id
      LEFT JOIN oauth_concessoes k ON k.id = l.concessao_id
      WHERE l.area IS NULL OR l.area = ANY(${areas})
      ORDER BY l.criado_em DESC, l.id DESC
      LIMIT 200
    `,
  ]);

  // A lista de pessoas alimenta o seletor de responsável e a tela de cadastros; a matriz de
  // permissões só é montada para quem administra.
  const pessoas = await sql<
    { id: number; nome: string; email: string; papel: string; iniciais: string; ativo: boolean }[]
  >`SELECT id, nome, email, papel, iniciais, ativo FROM users ORDER BY id ASC`;

  // Cadastro das verticais: rótulo, sigla e cor. Vai inteiro para o cliente, que transforma
  // a cor em variável CSS.
  const areasCadastro = await sql<
    { id: string; label: string; short: string; cor: string; planilha_url: string | null }[]
  >`
    SELECT id, label, short, cor, planilha_url FROM areas ORDER BY ordem ASC, id ASC
  `;

  // Produtos de todas as áreas visíveis. O formulário só oferece os da área escolhida.
  const origens = await sql<{ id: string; label: string; ativo: boolean }[]>`
    SELECT id, label, ativo FROM origens ORDER BY ordem, label
  `;

  const produtos = await sql<{ id: string; label: string; area: string; ativo: boolean }[]>`
    SELECT id, label, area, ativo FROM produtos WHERE area = ANY(${areas}) ORDER BY ordem ASC, id ASC
  `;

  /**
   * Ordem alfabética dos cadastros, aqui e não no SQL: a collation do banco decide como
   * "Ática" se compara com "Atlas", e ela não é a mesma em toda instalação. `porTexto` usa
   * pt-BR e dá o mesmo resultado em qualquer ambiente.
   *
   * Ordenar de uma vez neste ponto vale por todos os consumidores — os seletores de área,
   * responsável e produto, as tabelas de cadastro e a matriz de permissões saem daqui.
   * O `ORDER BY` das queries continua valendo como desempate estável.
   */
  pessoas.sort((a, b) => porTexto(a.nome, b.nome));
  areasCadastro.sort((a, b) => porTexto(a.label, b.label));
  produtos.sort((a, b) => porTexto(a.label, b.label));
  oportunidades.sort((a, b) => porTexto(a.conta, b.conta));

  const permLinhas = ctx.isAdmin
    ? await sql<{ user_id: number; area: string; nivel: string }[]>`
        SELECT user_id, area, nivel FROM user_area_perms
      `
    : [];
  const permPorUser = new Map<number, Record<string, string>>();
  for (const p of permLinhas) {
    const atual = permPorUser.get(p.user_id) ?? {};
    atual[p.area] = p.nivel;
    permPorUser.set(p.user_id, atual);
  }

  return json({
    me: {
      id: ctx.user.userId,
      nome: ctx.user.nome,
      email: ctx.user.email,
      papel: ctx.user.papel,
      iniciais: ctx.user.iniciais,
      avatarUrl: ctx.user.avatarUrl,
      preferencias: ctx.user.preferencias,
    },
    perms: ctx.perms,
    areasVisiveis: ctx.areasVisiveis,
    areas: areasCadastro.map((a) => ({ ...a, planilhaUrl: a.planilha_url })),
    produtos,
    isAdmin: ctx.isAdmin,
    // O formulário de pré-cadastro precisa dizer qual domínio o login aceita, e a fonte
    // dessa verdade é uma variável de ambiente do servidor.
    dominioLogin: DOMINIO_PERMITIDO,
    sheetsConectado: ctx.user.temSheets,
    // A tela de Conexões só ensina a conectar quando o MCP está ligado neste ambiente.
    mcpHabilitado: lerConfig(process.env).habilitado,
    // Cadastro de origens: todas (as inativas também, para o card mostrar a que já estava).
    origens: [...origens],
    activities: atividades.map((a) => ({
      id: a.id,
      ref: a.ref,
      titulo: a.titulo,
      area: a.area,
      status: a.status,
      prioridade: a.prioridade,
      prazo: a.prazo ? a.prazo.toISOString().slice(0, 10) : null,
      responsavelId: a.responsavel_user_id,
      responsavel: a.responsavel ?? "—",
      situacao: a.situacao,
      proximoPasso: a.proximo_passo,
      produtoId: a.produto_id,
      proximoPassoEm: a.proximo_passo_em ? a.proximo_passo_em.toISOString().slice(0, 10) : null,
      podeEditar: ctx.podeEditar(a.area),
      // A oportunidade ligada, só se quem olha enxerga a área dela. Tarefa de Operações
      // ligada a uma venda de outra vertical mostra que HÁ vínculo, sem abrir a carteira alheia.
      ...(a.oportunidade_id && a.op_area && ctx.podeVer(a.op_area)
        ? { oportunidadeId: a.oportunidade_id, oportunidadeRef: a.op_ref, oportunidadeConta: a.op_conta, oportunidadeOculta: false }
        : { oportunidadeId: null, oportunidadeRef: null, oportunidadeConta: null, oportunidadeOculta: !!a.oportunidade_id }),
    })),
    deals: oportunidades.map((d) => ({
      id: d.id,
      ref: d.ref,
      conta: d.conta,
      area: d.area,
      estagio: d.estagio,
      valorCentavos: Number(d.valor_centavos),
      responsavel: d.responsavel ?? "—",
      responsavelId: d.responsavel_user_id,
      responsavelTexto: d.responsavel_texto,
      proximoPasso: d.proximo_passo,
      situacao: d.situacao,
      contato: d.contato,
      proximoPassoEm: d.proximo_passo_em ? d.proximo_passo_em.toISOString().slice(0, 10) : null,
      aceAws: d.ace_aws,
      origemId: d.origem_id,
      ponte: d.ponte,
      contatoOperacional: d.contato_operacional,
      dor: d.dor,
      erp: d.erp,
      ultimaInteracao: d.ultima_interacao ? d.ultima_interacao.toISOString().slice(0, 10) : null,
      blocker: d.blocker,
      blockerTipo: d.blocker_tipo,
      blockerDonoId: d.blocker_dono_id,
      blockerDono: d.blocker_dono,
      motivoPerda: d.motivo_perda,
      motivoPerdaDetalhe: d.motivo_perda_detalhe,
      notas: d.notas,
      modulos: d.modulos,
      atualizadoEm: d.mexido_em.toISOString(),
      podeEditar: ctx.podeEditar(d.area),
    })),
    logs: logs.map((l) => ({
      id: l.id,
      criadoEm: l.criado_em.toISOString(),
      autor: l.autor ?? "sistema",
      via: l.via,
      area: l.area,
      entidade: l.entidade,
      texto: l.texto,
    })),
    pessoas: pessoas.map((p) => ({
      id: p.id,
      nome: p.nome,
      email: p.email,
      papel: p.papel,
      iniciais: p.iniciais,
      ativo: p.ativo,
      perms: permPorUser.get(p.id) ?? {},
    })),
  });
}
