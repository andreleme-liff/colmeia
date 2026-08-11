// Estado completo já recortado pela permissão do usuário.
// O front recebe só o que pode ver — a filtragem acontece no SQL, não no navegador.

import { getDb } from "@/lib/db";
import { requireCtx } from "@/lib/perms";
import { json } from "@/lib/http";

export type ActivityDTO = {
  id: number;
  ref: string;
  titulo: string;
  area: string;
  tipo: string;
  status: string;
  prioridade: string;
  prazo: string | null;
  responsavelId: number | null;
  responsavel: string;
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
        id: number; ref: string; titulo: string; area: string; tipo: string; status: string;
        prioridade: string; prazo: Date | null; responsavel_user_id: number | null; responsavel: string | null;
      }[]
    >`
      SELECT a.id, a.ref, a.titulo, a.area, a.tipo, a.status, a.prioridade, a.prazo,
             a.responsavel_user_id, u.nome AS responsavel
      FROM activities a
      LEFT JOIN users u ON u.id = a.responsavel_user_id
      WHERE a.area = ANY(${areas})
      ORDER BY a.ref ASC
    `,
    sql<
      {
        id: number; ref: string; conta: string; escopo: string; area: string; estagio: string;
        valor_centavos: string; responsavel: string | null; proximo_passo: string;
      }[]
    >`
      SELECT d.id, d.ref, d.conta, d.escopo, d.area, d.estagio, d.valor_centavos,
             u.nome AS responsavel, d.proximo_passo
      FROM deals d
      LEFT JOIN users u ON u.id = d.responsavel_user_id
      WHERE d.area = ANY(${areas})
      ORDER BY d.ref ASC
    `,
    sql<
      { id: number; criado_em: Date; autor: string | null; area: string | null; entidade: string; texto: string }[]
    >`
      SELECT l.id, l.criado_em, u.nome AS autor, l.area, l.entidade, l.texto
      FROM audit_log l
      LEFT JOIN users u ON u.id = l.actor_user_id
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
  const areasCadastro = await sql<{ id: string; label: string; short: string; cor: string }[]>`
    SELECT id, label, short, cor FROM areas ORDER BY ordem ASC, id ASC
  `;

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
    },
    perms: ctx.perms,
    areasVisiveis: ctx.areasVisiveis,
    areas: areasCadastro,
    isAdmin: ctx.isAdmin,
    activities: atividades.map((a) => ({
      id: a.id,
      ref: a.ref,
      titulo: a.titulo,
      area: a.area,
      tipo: a.tipo,
      status: a.status,
      prioridade: a.prioridade,
      prazo: a.prazo ? a.prazo.toISOString().slice(0, 10) : null,
      responsavelId: a.responsavel_user_id,
      responsavel: a.responsavel ?? "—",
      podeEditar: ctx.podeEditar(a.area),
    })),
    deals: oportunidades.map((d) => ({
      id: d.id,
      ref: d.ref,
      conta: d.conta,
      escopo: d.escopo,
      area: d.area,
      estagio: d.estagio,
      valorCentavos: Number(d.valor_centavos),
      responsavel: d.responsavel ?? "—",
      proximoPasso: d.proximo_passo,
      podeEditar: ctx.podeEditar(d.area),
    })),
    logs: logs.map((l) => ({
      id: l.id,
      criadoEm: l.criado_em.toISOString(),
      autor: l.autor ?? "sistema",
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
