// Funding AWS no banco: leitura e gravação dos seis cadastros. As regras moram em
// `funding.ts`. Toda gravação deixa linha de auditoria, só visível para admin
// (referências PROG-, PASTA-, ARQ- e E-, ver ENTIDADES_SO_ADMIN em log.ts).

import type { Queryable } from "./db";
import { registrar } from "./log";
import type { Autor } from "./receita";
import {
  lerArquetipo, lerCalculadora, lerEstimativa, lerLinha, lerPasta, lerPrograma, rotuloConta, rotuloModelo, rotuloRegiao,
  rotuloStatusFunding, usd,
  type Arquetipo, type Calculadora, type Estimativa, type LinhaFunding, type Pasta, type Programa,
} from "./funding";

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export type Produto = { id: string; label: string; area: string };
export type DadosFunding = { pastas: Pasta[]; produtos: Produto[]; programas: Programa[]; arquetipos: Arquetipo[]; estimativas: Estimativa[] };

export async function lerFunding(sql: Queryable): Promise<DadosFunding> {
  const [pastas, produtos, programas, arqs, calcs, ests, linhas] = await Promise.all([
    sql<{ id: number; nome: string; produto_id: string | null; descricao: string }[]>`
      SELECT id, nome, produto_id, descricao FROM funding_pastas ORDER BY ordem, nome`,
    sql<Produto[]>`SELECT id, label, area FROM produtos WHERE ativo ORDER BY area, ordem, label`,
    sql<{ id: string; label: string; forma: string; descricao: string; ativo: boolean }[]>`
      SELECT id, label, forma, descricao, ativo FROM funding_programas ORDER BY ordem, label`,
    sql<{ id: number; pasta_id: number | null; nome: string; modelo: Arquetipo["modelo"]; descricao: string; ativo: boolean }[]>`
      SELECT id, pasta_id, nome, modelo, descricao, ativo FROM funding_arquetipos ORDER BY ordem, id`,
    sql<{ id: number; arquetipo_id: number; regiao: string; conta: "liff" | "cliente"; porte: string; url: string; custo_mensal_centavos: string; data_preco: Date | null; notas: string }[]>`
      SELECT * FROM funding_calculadoras ORDER BY regiao, conta DESC, id`,
    sql<{ id: number; ref: string; conta: string; deal_id: number | null; arquetipo_id: number | null; regiao: string; porte: string;
      liff_mensal_centavos: string; cliente_mensal_centavos: string; ia_mensal_centavos: string; ia_paga_por: "liff" | "cliente";
      inicio: string | null; duracao_meses: number; notas: string }[]>`
      SELECT * FROM funding_estimativas ORDER BY conta, id`,
    sql<{ id: number; estimativa_id: number; programa_id: string; beneficiario: "liff" | "cliente"; valor_centavos: string; status: LinhaFunding["status"];
      aws_id: string; solicitado_em: Date | null; aprovado_em: Date | null; expira_em: Date | null; notas: string }[]>`
      SELECT * FROM funding_linhas ORDER BY id`,
  ]);
  const calculadoras: Calculadora[] = calcs.map((c) => ({
    id: c.id, arquetipoId: c.arquetipo_id, regiao: c.regiao, conta: c.conta, porte: c.porte, url: c.url,
    custoMensalCentavos: Number(c.custo_mensal_centavos), dataPreco: dia(c.data_preco), notas: c.notas,
  }));
  const ls: LinhaFunding[] = linhas.map((l) => ({
    id: l.id, estimativaId: l.estimativa_id, programaId: l.programa_id, beneficiario: l.beneficiario, valorCentavos: Number(l.valor_centavos),
    status: l.status, awsId: l.aws_id, solicitadoEm: dia(l.solicitado_em), aprovadoEm: dia(l.aprovado_em), expiraEm: dia(l.expira_em), notas: l.notas,
  }));
  return {
    pastas: pastas.map((p) => ({ id: p.id, nome: p.nome, produtoId: p.produto_id, descricao: p.descricao })),
    produtos: produtos.map((p) => ({ ...p })),
    programas: programas.map((p) => ({ ...p })),
    arquetipos: arqs.map((a) => ({
      id: a.id, pastaId: a.pasta_id, nome: a.nome, modelo: a.modelo, descricao: a.descricao, ativo: a.ativo,
      calculadoras: calculadoras.filter((c) => c.arquetipoId === a.id),
    })),
    estimativas: ests.map((e) => ({
      id: e.id, ref: e.ref, conta: e.conta, dealId: e.deal_id, arquetipoId: e.arquetipo_id, regiao: e.regiao, porte: e.porte,
      liffMensalCentavos: Number(e.liff_mensal_centavos), clienteMensalCentavos: Number(e.cliente_mensal_centavos),
      iaMensalCentavos: Number(e.ia_mensal_centavos), iaPagaPor: e.ia_paga_por, inicio: e.inicio, duracaoMeses: e.duracao_meses,
      notas: e.notas, linhas: ls.filter((l) => l.estimativaId === e.id),
    })),
  };
}

export const TIPOS = ["pastas", "programas", "arquetipos", "calculadoras", "estimativas", "linhas"] as const;
export type Tipo = (typeof TIPOS)[number];
type Resultado = { ok: true; id: number | string; ref?: string } | { erro: string; status: number };

async function conferirPasta(tx: Queryable, p: { produtoId: string | null }): Promise<string | null> {
  if (!p.produtoId) return null;
  const [prod] = await tx<{ id: string }[]>`SELECT id FROM produtos WHERE id = ${p.produtoId}`;
  return prod ? null : "Módulo não encontrado.";
}
async function nomeDaPasta(tx: Queryable, id: number | null): Promise<string | null | false> {
  if (id == null) return null;
  const [p] = await tx<{ nome: string }[]>`SELECT nome FROM funding_pastas WHERE id = ${id}`;
  return p ? p.nome : false;
}

/** Cria um registro do tipo pedido. */
export async function criar(tx: Queryable, autor: Autor, tipo: Tipo, body: Record<string, unknown> | null): Promise<Resultado> {
  const log = (entidade: string, texto: string) =>
    registrar(tx, { actorUserId: autor.userId, origem: autor.origem, concessaoId: autor.concessaoId, area: null, entidade, campo: "funding", texto });
  switch (tipo) {
    case "pastas": {
      const p = lerPasta(body);
      if (typeof p === "string") return { erro: p, status: 400 };
      const ruim = await conferirPasta(tx, p);
      if (ruim) return { erro: ruim, status: 400 };
      const [{ ordem }] = await tx<{ ordem: number }[]>`SELECT COALESCE(MAX(ordem), -1) + 1 AS ordem FROM funding_pastas`;
      const [n] = await tx<{ id: number }[]>`
        INSERT INTO funding_pastas (nome, produto_id, descricao, ordem) VALUES (${p.nome}, ${p.produtoId}, ${p.descricao}, ${ordem}) RETURNING id`;
      await log(`PASTA-${n.id}`, `Criou a pasta de arquétipos ${p.nome}`);
      return { ok: true, id: n.id };
    }
    case "programas": {
      const p = lerPrograma(body);
      if (typeof p === "string") return { erro: p, status: 400 };
      const [ja] = await tx<{ id: string }[]>`SELECT id FROM funding_programas WHERE id = ${p.id}`;
      if (ja) return { erro: `Já existe um programa com esse nome (${p.id}).`, status: 409 };
      const [{ ordem }] = await tx<{ ordem: number }[]>`SELECT COALESCE(MAX(ordem), -1) + 1 AS ordem FROM funding_programas`;
      await tx`INSERT INTO funding_programas (id, label, forma, descricao, ativo, ordem) VALUES (${p.id}, ${p.label}, ${p.forma}, ${p.descricao}, ${p.ativo}, ${ordem})`;
      await log(`PROG-${p.id}`, `Cadastrou o programa de funding ${p.label}`);
      return { ok: true, id: p.id };
    }
    case "arquetipos": {
      const a = lerArquetipo(body);
      if (typeof a === "string") return { erro: a, status: 400 };
      const pasta = await nomeDaPasta(tx, a.pastaId);
      if (pasta === false) return { erro: "Pasta não encontrada.", status: 400 };
      const [{ ordem }] = await tx<{ ordem: number }[]>`SELECT COALESCE(MAX(ordem), -1) + 1 AS ordem FROM funding_arquetipos`;
      const [n] = await tx<{ id: number }[]>`
        INSERT INTO funding_arquetipos (pasta_id, nome, modelo, descricao, ativo, ordem)
        VALUES (${a.pastaId}, ${a.nome}, ${a.modelo}, ${a.descricao}, ${a.ativo}, ${ordem}) RETURNING id`;
      await log(`ARQ-${n.id}`, `Cadastrou o arquétipo ${a.nome} (${rotuloModelo(a.modelo)})${pasta ? ` na pasta ${pasta}` : ""}`);
      return { ok: true, id: n.id };
    }
    case "calculadoras": {
      const c = lerCalculadora(body);
      if (typeof c === "string") return { erro: c, status: 400 };
      const [arq] = await tx<{ nome: string }[]>`SELECT nome FROM funding_arquetipos WHERE id = ${c.arquetipoId}`;
      if (!arq) return { erro: "Arquétipo não encontrado.", status: 404 };
      const [n] = await tx<{ id: number }[]>`
        INSERT INTO funding_calculadoras (arquetipo_id, regiao, conta, porte, url, custo_mensal_centavos, data_preco, notas)
        VALUES (${c.arquetipoId}, ${c.regiao}, ${c.conta}, ${c.porte}, ${c.url}, ${c.custoMensalCentavos}, ${c.dataPreco}, ${c.notas}) RETURNING id`;
      await log(`ARQ-${c.arquetipoId}`, `Cadastrou calculadora em ${arq.nome}: ${rotuloRegiao(c.regiao)}, ${rotuloConta(c.conta)}${c.porte ? `, porte ${c.porte}` : ""}, ${usd(c.custoMensalCentavos)}/mês`);
      return { ok: true, id: n.id };
    }
    case "estimativas": {
      const e = lerEstimativa(body);
      if (typeof e === "string") return { erro: e, status: 400 };
      const [n] = await tx<{ id: number }[]>`
        INSERT INTO funding_estimativas (conta, deal_id, arquetipo_id, regiao, porte, liff_mensal_centavos, cliente_mensal_centavos,
                                         ia_mensal_centavos, ia_paga_por, inicio, duracao_meses, notas)
        VALUES (${e.conta}, ${e.dealId}, ${e.arquetipoId}, ${e.regiao}, ${e.porte}, ${e.liffMensalCentavos}, ${e.clienteMensalCentavos},
                ${e.iaMensalCentavos}, ${e.iaPagaPor}, ${e.inicio}, ${e.duracaoMeses}, ${e.notas}) RETURNING id`;
      const ref = `E-${String(n.id).padStart(4, "0")}`;
      await tx`UPDATE funding_estimativas SET ref = ${ref} WHERE id = ${n.id}`;
      await log(ref, `Cadastrou a estimativa de consumo AWS de ${e.conta} (${ref}): LIFF ${usd(e.liffMensalCentavos)}/mês, cliente ${usd(e.clienteMensalCentavos)}/mês, IA ${usd(e.iaMensalCentavos)}/mês`);
      return { ok: true, id: n.id, ref };
    }
    case "linhas": {
      const l = lerLinha(body);
      if (typeof l === "string") return { erro: l, status: 400 };
      const [e] = await tx<{ ref: string; conta: string }[]>`SELECT ref, conta FROM funding_estimativas WHERE id = ${l.estimativaId}`;
      if (!e) return { erro: "Estimativa não encontrada.", status: 404 };
      const [p] = await tx<{ label: string }[]>`SELECT label FROM funding_programas WHERE id = ${l.programaId}`;
      if (!p) return { erro: "Programa não encontrado.", status: 400 };
      const [n] = await tx<{ id: number }[]>`
        INSERT INTO funding_linhas (estimativa_id, programa_id, beneficiario, valor_centavos, status, aws_id, solicitado_em, aprovado_em, expira_em, notas)
        VALUES (${l.estimativaId}, ${l.programaId}, ${l.beneficiario}, ${l.valorCentavos}, ${l.status}, ${l.awsId}, ${l.solicitadoEm}, ${l.aprovadoEm}, ${l.expiraEm}, ${l.notas})
        RETURNING id`;
      await log(e.ref, `Funding de ${e.conta}: ${p.label} para ${rotuloConta(l.beneficiario)}, ${usd(l.valorCentavos)}, ${rotuloStatusFunding(l.status).toLowerCase()}`);
      return { ok: true, id: n.id };
    }
  }
}

/** Altera um registro (substitui os campos pelos do corpo, já validados). */
export async function alterar(tx: Queryable, autor: Autor, tipo: Tipo, id: string, body: Record<string, unknown> | null): Promise<Resultado> {
  const log = (entidade: string, texto: string) =>
    registrar(tx, { actorUserId: autor.userId, origem: autor.origem, concessaoId: autor.concessaoId, area: null, entidade, campo: "funding", texto });
  const n = Number(id);
  switch (tipo) {
    case "pastas": {
      const p = lerPasta(body);
      if (typeof p === "string") return { erro: p, status: 400 };
      const ruim = await conferirPasta(tx, p);
      if (ruim) return { erro: ruim, status: 400 };
      const r = await tx`UPDATE funding_pastas SET nome = ${p.nome}, produto_id = ${p.produtoId}, descricao = ${p.descricao} WHERE id = ${n}`;
      if (!r.count) return { erro: "Pasta não encontrada.", status: 404 };
      await log(`PASTA-${n}`, `Alterou a pasta de arquétipos ${p.nome}`);
      return { ok: true, id: n };
    }
    case "programas": {
      const p = lerPrograma(body, id);
      if (typeof p === "string") return { erro: p, status: 400 };
      const r = await tx`UPDATE funding_programas SET label = ${p.label}, forma = ${p.forma}, descricao = ${p.descricao}, ativo = ${p.ativo} WHERE id = ${id}`;
      if (!r.count) return { erro: "Programa não encontrado.", status: 404 };
      await log(`PROG-${id}`, `Alterou o programa de funding ${p.label}${p.ativo ? "" : " (inativo)"}`);
      return { ok: true, id };
    }
    case "arquetipos": {
      const a = lerArquetipo(body);
      if (typeof a === "string") return { erro: a, status: 400 };
      const pasta = await nomeDaPasta(tx, a.pastaId);
      if (pasta === false) return { erro: "Pasta não encontrada.", status: 400 };
      const r = await tx`
        UPDATE funding_arquetipos SET pasta_id = ${a.pastaId}, nome = ${a.nome}, modelo = ${a.modelo}, descricao = ${a.descricao}, ativo = ${a.ativo}
        WHERE id = ${n}`;
      if (!r.count) return { erro: "Arquétipo não encontrado.", status: 404 };
      await log(`ARQ-${n}`, `Alterou o arquétipo ${a.nome} (${rotuloModelo(a.modelo)})${pasta ? `, pasta ${pasta}` : ", sem pasta"}${a.ativo ? "" : ", inativo"}`);
      return { ok: true, id: n };
    }
    case "calculadoras": {
      const c = lerCalculadora(body);
      if (typeof c === "string") return { erro: c, status: 400 };
      const r = await tx`
        UPDATE funding_calculadoras SET regiao = ${c.regiao}, conta = ${c.conta}, porte = ${c.porte}, url = ${c.url},
               custo_mensal_centavos = ${c.custoMensalCentavos}, data_preco = ${c.dataPreco}, notas = ${c.notas}
        WHERE id = ${n} AND arquetipo_id = ${c.arquetipoId}`;
      if (!r.count) return { erro: "Calculadora não encontrada.", status: 404 };
      await log(`ARQ-${c.arquetipoId}`, `Alterou calculadora: ${rotuloRegiao(c.regiao)}, ${rotuloConta(c.conta)}${c.porte ? `, porte ${c.porte}` : ""}, ${usd(c.custoMensalCentavos)}/mês${c.url ? "" : " (sem link)"}`);
      return { ok: true, id: n };
    }
    case "estimativas": {
      const e = lerEstimativa(body);
      if (typeof e === "string") return { erro: e, status: 400 };
      const [atual] = await tx<{ ref: string }[]>`SELECT ref FROM funding_estimativas WHERE id = ${n}`;
      if (!atual) return { erro: "Estimativa não encontrada.", status: 404 };
      await tx`
        UPDATE funding_estimativas SET conta = ${e.conta}, arquetipo_id = ${e.arquetipoId}, regiao = ${e.regiao}, porte = ${e.porte},
               liff_mensal_centavos = ${e.liffMensalCentavos}, cliente_mensal_centavos = ${e.clienteMensalCentavos},
               ia_mensal_centavos = ${e.iaMensalCentavos}, ia_paga_por = ${e.iaPagaPor}, inicio = ${e.inicio},
               duracao_meses = ${e.duracaoMeses}, notas = ${e.notas}, atualizado_em = now()
        WHERE id = ${n}`;
      await log(atual.ref, `Alterou a estimativa de ${e.conta}: LIFF ${usd(e.liffMensalCentavos)}/mês, cliente ${usd(e.clienteMensalCentavos)}/mês, IA ${usd(e.iaMensalCentavos)}/mês, ${e.duracaoMeses} meses`);
      return { ok: true, id: n, ref: atual.ref };
    }
    case "linhas": {
      const l = lerLinha(body);
      if (typeof l === "string") return { erro: l, status: 400 };
      const [e] = await tx<{ ref: string; conta: string }[]>`
        SELECT e.ref, e.conta FROM funding_linhas fl JOIN funding_estimativas e ON e.id = fl.estimativa_id WHERE fl.id = ${n}`;
      if (!e) return { erro: "Linha de funding não encontrada.", status: 404 };
      const [p] = await tx<{ label: string }[]>`SELECT label FROM funding_programas WHERE id = ${l.programaId}`;
      if (!p) return { erro: "Programa não encontrado.", status: 400 };
      await tx`
        UPDATE funding_linhas SET programa_id = ${l.programaId}, beneficiario = ${l.beneficiario}, valor_centavos = ${l.valorCentavos},
               status = ${l.status}, aws_id = ${l.awsId}, solicitado_em = ${l.solicitadoEm}, aprovado_em = ${l.aprovadoEm},
               expira_em = ${l.expiraEm}, notas = ${l.notas}
        WHERE id = ${n}`;
      await log(e.ref, `Funding de ${e.conta}: ${p.label} agora ${rotuloStatusFunding(l.status).toLowerCase()}, ${usd(l.valorCentavos)}${l.awsId ? ` (${l.awsId})` : ""}`);
      return { ok: true, id: n };
    }
  }
}

/** Exclui. Pasta com arquétipos não sai; programa em uso não sai (desative); arquétipo leva as calculadoras e solta as estimativas. */
export async function excluir(tx: Queryable, autor: Autor, tipo: Tipo, id: string): Promise<Resultado> {
  const log = (entidade: string, texto: string) =>
    registrar(tx, { actorUserId: autor.userId, origem: autor.origem, concessaoId: autor.concessaoId, area: null, entidade, campo: "exclusao", texto });
  const n = Number(id);
  switch (tipo) {
    case "pastas": {
      const [{ usos }] = await tx<{ usos: number }[]>`SELECT count(*)::int AS usos FROM funding_arquetipos WHERE pasta_id = ${n}`;
      if (usos) return { erro: `A pasta tem ${usos} arquétipo(s). Mova ou exclua os arquétipos antes.`, status: 409 };
      const [p] = await tx<{ nome: string }[]>`DELETE FROM funding_pastas WHERE id = ${n} RETURNING nome`;
      if (!p) return { erro: "Pasta não encontrada.", status: 404 };
      await log(`PASTA-${n}`, `Excluiu a pasta de arquétipos ${p.nome}`);
      return { ok: true, id: n };
    }
    case "programas": {
      const [{ usos }] = await tx<{ usos: number }[]>`SELECT count(*)::int AS usos FROM funding_linhas WHERE programa_id = ${id}`;
      if (usos) return { erro: `O programa está em ${usos} linha(s) de funding. Desative em vez de excluir.`, status: 409 };
      const [p] = await tx<{ label: string }[]>`DELETE FROM funding_programas WHERE id = ${id} RETURNING label`;
      if (!p) return { erro: "Programa não encontrado.", status: 404 };
      await log(`PROG-${id}`, `Excluiu o programa de funding ${p.label}`);
      return { ok: true, id };
    }
    case "arquetipos": {
      const [a] = await tx<{ nome: string }[]>`DELETE FROM funding_arquetipos WHERE id = ${n} RETURNING nome`;
      if (!a) return { erro: "Arquétipo não encontrado.", status: 404 };
      await log(`ARQ-${n}`, `Excluiu o arquétipo ${a.nome} e as calculadoras dele`);
      return { ok: true, id: n };
    }
    case "calculadoras": {
      const [c] = await tx<{ arquetipo_id: number; regiao: string; conta: string }[]>`
        DELETE FROM funding_calculadoras WHERE id = ${n} RETURNING arquetipo_id, regiao, conta`;
      if (!c) return { erro: "Calculadora não encontrada.", status: 404 };
      await log(`ARQ-${c.arquetipo_id}`, `Excluiu a calculadora de ${rotuloRegiao(c.regiao)}, ${rotuloConta(c.conta)}`);
      return { ok: true, id: n };
    }
    case "estimativas": {
      const [e] = await tx<{ ref: string; conta: string }[]>`DELETE FROM funding_estimativas WHERE id = ${n} RETURNING ref, conta`;
      if (!e) return { erro: "Estimativa não encontrada.", status: 404 };
      await log(e.ref, `Excluiu a estimativa de ${e.conta} (${e.ref}) e as linhas de funding dela`);
      return { ok: true, id: n };
    }
    case "linhas": {
      const [e] = await tx<{ ref: string; conta: string; label: string }[]>`
        SELECT e.ref, e.conta, p.label FROM funding_linhas fl JOIN funding_estimativas e ON e.id = fl.estimativa_id
        JOIN funding_programas p ON p.id = fl.programa_id WHERE fl.id = ${n}`;
      if (!e) return { erro: "Linha de funding não encontrada.", status: 404 };
      await tx`DELETE FROM funding_linhas WHERE id = ${n}`;
      await log(e.ref, `Excluiu o funding ${e.label} de ${e.conta}`);
      return { ok: true, id: n };
    }
  }
}
