// Organizações no MCP: lista, ficha, cadastro e alteração. Mesmas regras da interface
// (rotas /api/clientes) e as mesmas funções de gravação (`lib/clientes-db.ts`):
//  - todos veem todas as organizações (não há mais permissão por produto); cobrança só admin;
//  - cadastra e altera quem tem papel que edita (membro, gestor, admin);
//  - sem mescla e sem exclusão: apagam um registro, e nada é excluído por aqui.

import { estagioEmAberto, refCanonica, stageLabel } from "../domain";
import { caminhoDe } from "../rotas";
import { chaveCliente, cnpjFormatado, lerCliente, papelContatoLabel, type Contato } from "../cliente";
import {
  atualizarCliente, criarCliente, editaOrganizacao, historicoDoCliente, lerClientes, type ClienteLido,
} from "../clientes-db";
import type { Contexto, Saida } from "./ferramentas";

type Exec = (c: Contexto, a: Record<string, unknown>) => Promise<Saida>;
type Oportunidade = { ref: string; cliente_id: number; area: string; estagio: string; valor_centavos: string; proposta_url: string; proximo_passo: string };

const areasDe = (c: Contexto) => (c.ctx.isAdmin ? undefined : c.ctx.areasVisiveis);
const autorDe = (c: Contexto) => ({ userId: c.ctx.user.userId, origem: "mcp" as const, concessaoId: c.acesso.concessaoId });
const emNegociacao = (estagio: string) => estagioEmAberto(estagio) && estagio !== "prospeccao";

/** As oportunidades que a conexão enxerga, por organização. */
async function oportunidadesVisiveis(c: Contexto, clienteId?: number): Promise<Oportunidade[]> {
  if (!c.ctx.areasVisiveis.length) return [];
  return c.sql<Oportunidade[]>`
    SELECT ref, cliente_id, area, estagio, valor_centavos, proposta_url, proximo_passo FROM deals
    WHERE cliente_id IS NOT NULL AND area = ANY(${c.ctx.areasVisiveis}::text[])
      AND (${clienteId ?? null}::int IS NULL OR cliente_id = ${clienteId ?? null})
    ORDER BY ref
  `;
}

/** Onde a organização está no funil, olhando só o que a conexão enxerga. */
function pontoDe(ops: Oportunidade[]): string {
  if (!ops.length) return "sem_oportunidade";
  if (ops.some((o) => o.estagio === "ganho")) return "com_venda_ganha";
  if (ops.some((o) => emNegociacao(o.estagio))) return "em_negociacao";
  if (ops.some((o) => o.estagio === "prospeccao")) return "so_prospeccao";
  return "sem_oportunidade_ativa";
}

function resumo(c: Contexto, o: ClienteLido, ops: Oportunidade[]) {
  const negociando = ops.filter((x) => emNegociacao(x.estagio));
  return {
    ref: o.ref,
    nome: o.nome,
    cnpj: o.cnpj ? cnpjFormatado(o.cnpj) : null,
    segmento: o.segmento || null,
    produtos: [...new Set(ops.map((x) => x.area))].map((a) => ({ id: a, nome: c.ctx.labelArea(a) })),
    ponto: pontoDe(ops),
    oportunidades: ops.length,
    em_negociacao: negociando.length,
    valor_em_negociacao_reais: negociando.reduce((t, x) => t + Number(x.valor_centavos), 0) / 100,
    contatos: o.contatos.length,
    url: c.base + caminhoDe({ view: "clientes" }),
  };
}

/** A organização da referência, se a conexão a enxerga. */
export async function organizacaoPorRef(c: Contexto, ref: unknown): Promise<ClienteLido | null> {
  const m = /^CLI-0*(\d{1,9})$/.exec(String(ref ?? "").trim().toUpperCase());
  if (!m) return null;
  const [o] = await lerClientes(c.sql, Number(m[1]), areasDe(c));
  return o ?? null;
}

export const listarOrganizacoes: Exec = async (c, a) => {
  const todas = await lerClientes(c.sql, undefined, areasDe(c));
  const ops = await oportunidadesVisiveis(c);
  const porOrg = new Map<number, Oportunidade[]>();
  for (const o of ops) porOrg.set(o.cliente_id, [...(porOrg.get(o.cliente_id) ?? []), o]);

  const busca = typeof a.busca === "string" ? a.busca.trim() : "";
  const termo = chaveCliente(busca);
  const digitos = busca.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const area = a.area as string | undefined;
  const ponto = a.ponto as string | undefined;
  const limite = (a.limite as number | undefined) ?? 50;

  const filtradas = todas
    .map((o) => ({ o, ops: (porOrg.get(o.id) ?? []).filter((x) => !area || x.area === area) }))
    .filter(({ ops: l }) => !area || l.length > 0)
    .filter(({ o }) => {
      if (!busca) return true;
      const palheiro = chaveCliente([o.nome, o.razaoSocial, o.ref, ...o.outrosNomes, ...o.contatos.flatMap((k) => [k.nome, k.email])].join(" "));
      return (!!termo && palheiro.includes(termo)) || (digitos.length >= 3 && o.cnpj.includes(digitos));
    })
    .filter(({ ops: l }) => !ponto || pontoDe(l) === ponto);
  return { ok: true, dados: { itens: filtradas.slice(0, limite).map(({ o, ops: l }) => resumo(c, o, l)), total: filtradas.length } };
};

async function ficha(c: Contexto, o: ClienteLido) {
  const ops = await oportunidadesVisiveis(c, o.id);
  const eventos = await historicoDoCliente(c.sql, o.id, areasDe(c));
  // Ler a receita é de todos (ver `ver_receita` para valores e cronograma).
  const receitas = await c.sql<{ ref: string; area: string; situacao: string }[]>`
    SELECT ref, area, situacao FROM contratos WHERE cliente_id = ${o.id} ORDER BY ref
  `;
  return {
    ...resumo(c, o, ops),
    razao_social: o.razaoSocial || null,
    inscricao_municipal: o.inscricaoMunicipal || null,
    site: o.site || null,
    endereco: o.endereco || null,
    notas: o.notas,
    outros_nomes: o.outrosNomes,
    pode_editar: c.ctx.isAdmin || (await editaOrganizacao(c.sql, o.id, c.ctx.areasEditaveis)),
    contatos: o.contatos.map((k) => ({
      nome: k.nome, cargo: k.cargo || null, email: k.email || null, telefone: k.telefone || null,
      papel: k.papel, papel_nome: papelContatoLabel(k.papel), notas: k.notas || null,
    })),
    oportunidades: ops.map((x) => ({
      ref: x.ref,
      produto: x.area,
      produto_nome: c.ctx.labelArea(x.area),
      estagio: x.estagio,
      estagio_nome: stageLabel(x.estagio),
      valor_reais: Number(x.valor_centavos) / 100,
      proximo_passo: x.proximo_passo || null,
      proposta_url: x.proposta_url || null,
      url: c.base + caminhoDe({ view: "comercial", ref: refCanonica(x.ref) ?? x.ref }),
    })),
    receitas: receitas.map((r) => ({ ref: r.ref, produto: r.area, produto_nome: c.ctx.labelArea(r.area), situacao: r.situacao })),
    // Cobrança: só a administração, como na interface.
    ...(c.ctx.isAdmin ? { cobranca: { email: o.emailCobranca || null, dia_vencimento: o.diaVencimento, forma: o.formaCobranca } } : {}),
    linha_do_tempo: eventos.slice(0, 50).map((e) => ({ quando: e.criadoEm, quem: e.autor, registro: e.entidade, o_que: e.texto, valor: e.para })),
  };
}

export const verOrganizacao: Exec = async (c, a) => {
  const o = await organizacaoPorRef(c, a.organizacao);
  if (!o) return { ok: false, erro: "Organização não encontrada." };
  return { ok: true, ref: o.ref, dados: { organizacao: await ficha(c, o) } };
};

/** Campos do MCP (snake_case) por cima do cadastro atual: só o que veio muda. */
function corpoDoCadastro(c: Contexto, a: Record<string, unknown>, atual: ClienteLido | null): Record<string, unknown> {
  const txt = (k: string, v: string) => (typeof a[k] === "string" ? (a[k] as string) : v);
  const cob = c.ctx.isAdmin && a.cobranca && typeof a.cobranca === "object" ? (a.cobranca as Record<string, unknown>) : {};
  const contatos: Contato[] | undefined = Array.isArray(a.contatos) ? (a.contatos as Contato[]) : undefined;
  return {
    nome: txt("nome", atual?.nome ?? ""),
    razaoSocial: txt("razao_social", atual?.razaoSocial ?? ""),
    cnpj: txt("cnpj", atual?.cnpj ?? ""),
    inscricaoMunicipal: txt("inscricao_municipal", atual?.inscricaoMunicipal ?? ""),
    segmento: txt("segmento", atual?.segmento ?? ""),
    site: txt("site", atual?.site ?? ""),
    endereco: txt("endereco", atual?.endereco ?? ""),
    notas: txt("notas", atual?.notas ?? ""),
    // Quem não é admin nunca muda a cobrança: fica a que já estava (vazia, numa nova).
    emailCobranca: typeof cob.email === "string" ? cob.email : (atual?.emailCobranca ?? ""),
    diaVencimento: cob.dia_vencimento !== undefined ? cob.dia_vencimento : (atual?.diaVencimento ?? null),
    formaCobranca: cob.forma !== undefined ? cob.forma : (atual?.formaCobranca ?? null),
    contatos,
  };
}

export const criarOrganizacao: Exec = async (c, a) => {
  if (!c.ctx.isAdmin && c.ctx.areasEditaveis.length === 0) return { ok: false, erro: "Sem permissão para cadastrar organizações." };
  const e = lerCliente(corpoDoCadastro(c, a, null));
  if (typeof e === "string") return { ok: false, erro: e };
  const r = await criarCliente(c.sql, autorDe(c), e);
  if ("erro" in r) return { ok: false, erro: r.erro };
  const [nova] = await lerClientes(c.sql, r.id);
  return { ok: true, ref: r.ref, dados: { criado: true, ref: r.ref, organizacao: await ficha(c, nova) } };
};

export const atualizarOrganizacao: Exec = async (c, a) => {
  const atual = await organizacaoPorRef(c, a.organizacao);
  if (!atual) return { ok: false, erro: "Organização não encontrada." };
  if (!c.ctx.isAdmin && !(await editaOrganizacao(c.sql, atual.id, c.ctx.areasEditaveis))) {
    return { ok: false, erro: "Sem permissão de edição nesta organização." };
  }
  const e = lerCliente(corpoDoCadastro(c, a, atual));
  if (typeof e === "string") return { ok: false, erro: e };
  const r = await atualizarCliente(c.sql, autorDe(c), atual.id, e);
  if ("erro" in r) return { ok: false, erro: r.erro };
  const [depois] = await lerClientes(c.sql, atual.id);
  return { ok: true, ref: r.ref, dados: { campos_alterados: r.mudancas, ref: r.ref, organizacao: await ficha(c, depois) } };
};
