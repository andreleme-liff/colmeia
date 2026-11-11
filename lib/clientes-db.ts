// Clientes no banco: leitura, vínculo com oportunidades e contratos, gravação e mescla.
// As regras (chave do nome, CNPJ, validação) moram em `cliente.ts`.
//
// Três tabelas:
//  - `clientes`: o cadastro;
//  - `cliente_chaves`: os nomes normalizados que caem em cada cliente. A chave principal é a
//    do nome atual; as outras vêm de mesclas e de nomes antigos. É por aqui que uma
//    oportunidade encontra o cliente dela;
//  - `cliente_contatos`: as pessoas do lado do cliente.
// `deals.cliente_id` e `contratos.cliente_id` apontam para o cadastro (SET NULL na exclusão).

import type { Queryable } from "./db";
import { registrar } from "./log";
import {
  chaveCliente, chaveContato, cnpjLimpo, contatosDoTexto,
  type Cliente, type Contato, type EntradaCliente, type PapelContato,
} from "./cliente";

/** Quem grava. `userId` nulo = o próprio sistema (a carga inicial, na migração). */
export type AutorCliente = { userId: number | null; origem: "mcp" | null; concessaoId: number | null };
const marca = (a: AutorCliente) => ({ actorUserId: a.userId, origem: a.origem, concessaoId: a.concessaoId });
export const SISTEMA: AutorCliente = { userId: null, origem: null, concessaoId: null };

type Linha = {
  id: number; ref: string; nome: string; razao_social: string; cnpj: string; inscricao_municipal: string;
  site: string; segmento: string; endereco: string; email_cobranca: string; dia_vencimento: number | null;
  forma_cobranca: string | null; notas: string; criado_em: Date;
  contatos: { id: number; nome: string; cargo: string; email: string; telefone: string; papel: string; notas: string }[];
  outros_nomes: string[];
  chaves: string[];
};

export type ClienteLido = Cliente & {
  chaves: string[];
  /** Preenchido pela rota: admin, ou quem edita algum produto em que a organização tem oportunidade. */
  podeEditar?: boolean;
};

/**
 * `areas`: quando vem (quem não é admin), as organizações com ao menos uma oportunidade num
 * desses produtos, mais as que não têm oportunidade nenhuma. É a mesma regra do resto do sistema: o que a pessoa não enxerga não existe.
 */
export async function lerClientes(sql: Queryable, id?: number, areas?: string[]): Promise<ClienteLido[]> {
  const rows = await sql<Linha[]>`
    SELECT c.id, c.ref, c.nome, c.razao_social, c.cnpj, c.inscricao_municipal, c.site, c.segmento, c.endereco,
           c.email_cobranca, c.dia_vencimento, c.forma_cobranca, c.notas, c.criado_em,
           COALESCE((SELECT json_agg(json_build_object('id', k.id, 'nome', k.nome, 'cargo', k.cargo, 'email', k.email,
                                                      'telefone', k.telefone, 'papel', k.papel, 'notas', k.notas)
                                     ORDER BY k.ordem, k.id)
                     FROM cliente_contatos k WHERE k.cliente_id = c.id), '[]'::json) AS contatos,
           COALESCE((SELECT array_agg(x.nome ORDER BY x.nome) FROM cliente_chaves x
                     WHERE x.cliente_id = c.id AND NOT x.principal), '{}') AS outros_nomes,
           COALESCE((SELECT array_agg(x.chave) FROM cliente_chaves x WHERE x.cliente_id = c.id), '{}') AS chaves
    FROM clientes c
    WHERE (${id ?? null}::int IS NULL OR c.id = ${id ?? null})
      AND (${areas ?? null}::text[] IS NULL
           OR EXISTS (SELECT 1 FROM deals d WHERE d.cliente_id = c.id AND d.area = ANY(${areas ?? []}::text[]))
           -- Organização sem oportunidade nenhuma não é de produto nenhum: todos enxergam.
           OR NOT EXISTS (SELECT 1 FROM deals d WHERE d.cliente_id = c.id))
    ORDER BY lower(c.nome) ASC, c.id ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    ref: r.ref,
    nome: r.nome,
    razaoSocial: r.razao_social,
    cnpj: r.cnpj,
    inscricaoMunicipal: r.inscricao_municipal,
    site: r.site,
    segmento: r.segmento,
    endereco: r.endereco,
    emailCobranca: r.email_cobranca,
    diaVencimento: r.dia_vencimento,
    formaCobranca: r.forma_cobranca,
    notas: r.notas,
    contatos: r.contatos.map((k) => ({ ...k, papel: k.papel as PapelContato })),
    outrosNomes: r.outros_nomes,
    chaves: r.chaves,
    criadoEm: r.criado_em.toISOString(),
  }));
}

// ---------- vínculo pelo nome ----------

/**
 * O cliente de um nome de conta: o que já responde por essa chave, ou um novo.
 * `null` quando o nome não tem letra nem número (não dá para deduplicar o que não tem chave).
 */
export async function clienteDaConta(
  tx: Queryable,
  conta: string,
  autor: AutorCliente,
  origemTexto: string
): Promise<number | null> {
  const chave = chaveCliente(conta);
  if (!chave) return null;
  const [existente] = await tx<{ cliente_id: number }[]>`SELECT cliente_id FROM cliente_chaves WHERE chave = ${chave}`;
  if (existente) return existente.cliente_id;

  const nome = conta.trim().replace(/\s+/g, " ").slice(0, 200);
  const [novo] = await tx<{ id: number }[]>`INSERT INTO clientes (nome) VALUES (${nome}) RETURNING id`;
  // Dois pedidos ao mesmo tempo com o mesmo nome: só um fica com a chave; o outro desfaz o
  // cadastro que acabou de criar e usa o do vencedor.
  const [minha] = await tx<{ chave: string }[]>`
    INSERT INTO cliente_chaves (chave, cliente_id, nome, principal) VALUES (${chave}, ${novo.id}, ${nome}, true)
    ON CONFLICT (chave) DO NOTHING RETURNING chave
  `;
  if (!minha) {
    await tx`DELETE FROM clientes WHERE id = ${novo.id}`;
    const [outro] = await tx<{ cliente_id: number }[]>`SELECT cliente_id FROM cliente_chaves WHERE chave = ${chave}`;
    return outro?.cliente_id ?? null;
  }
  const ref = refDoCliente(novo.id);
  await tx`UPDATE clientes SET ref = ${ref} WHERE id = ${novo.id}`;
  await registrar(tx, {
    ...marca(autor),
    area: null,
    entidade: ref,
    campo: "criacao",
    de: null,
    para: nome,
    texto: `Cadastrou a organização ${nome} (${ref}) a partir ${origemTexto}`,
  });
  return novo.id;
}

export const refDoCliente = (id: number) => `CLI-${String(id).padStart(4, "0")}`;

/** Acrescenta ao cliente os contatos que ele ainda não tem (compara pelo nome). */
async function semearContatos(tx: Queryable, clienteId: number, novos: Contato[]): Promise<void> {
  if (!novos.length) return;
  const atuais = await tx<{ nome: string }[]>`SELECT nome FROM cliente_contatos WHERE cliente_id = ${clienteId}`;
  const tem = new Set(atuais.map((a) => chaveContato(a.nome)));
  let ordem = atuais.length;
  for (const c of novos) {
    const k = chaveContato(c.nome);
    if (!k || tem.has(k)) continue;
    tem.add(k);
    await tx`
      INSERT INTO cliente_contatos (cliente_id, nome, cargo, email, telefone, papel, notas, ordem)
      VALUES (${clienteId}, ${c.nome}, ${c.cargo}, ${c.email}, ${c.telefone}, ${c.papel}, ${c.notas}, ${ordem++})
    `;
  }
}

/**
 * Liga a oportunidade ao cliente do nome dela (criando o cadastro se for o primeiro) e leva
 * para o cliente os contatos escritos no card. Chamada na criação, na troca de nome e na
 * carga inicial.
 */
export async function vincularOportunidade(
  tx: Queryable,
  dealId: number,
  autor: AutorCliente,
  /** Organização escolhida no cadastro. Sem ela, vale a do nome escrito na oportunidade. */
  escolhida?: number
): Promise<number | null> {
  const [d] = await tx<{ ref: string; conta: string; contato: string; contato_operacional: string; cliente_id: number | null }[]>`
    SELECT ref, conta, contato, contato_operacional, cliente_id FROM deals WHERE id = ${dealId}
  `;
  if (!d) return null;
  const clienteId = escolhida ?? (await clienteDaConta(tx, d.conta, autor, `da oportunidade ${d.ref}`));
  if (clienteId !== d.cliente_id) await tx`UPDATE deals SET cliente_id = ${clienteId} WHERE id = ${dealId}`;
  if (clienteId != null) {
    // O nome é dado mestre da organização: a oportunidade mostra o do cadastro, não a grafia
    // que alguém digitou. `conta` continua existindo como cópia, para busca, relatório e MCP.
    await tx`UPDATE deals d SET conta = c.nome FROM clientes c WHERE d.id = ${dealId} AND c.id = ${clienteId} AND d.conta <> c.nome`;
    await semearContatos(tx, clienteId, [
      ...contatosDoTexto(d.contato, "sponsor"),
      ...contatosDoTexto(d.contato_operacional, "operacional"),
    ]);
    if (d.cliente_id != null && d.cliente_id !== clienteId) await removerSeIntocado(tx, d.cliente_id);
  }
  return clienteId;
}

/**
 * Cadastro que nasceu sozinho de uma oportunidade, nunca foi editado e ficou sem nada ligado:
 * some. É o que acontece quando alguém corrige um erro de digitação no nome da conta — sem
 * isto, cada correção deixaria um cliente fantasma.
 */
async function removerSeIntocado(tx: Queryable, clienteId: number): Promise<void> {
  const [c] = await tx<{ ref: string; nome: string; intocado: boolean }[]>`
    SELECT c.ref, c.nome,
           (c.atualizado_em IS NULL
            AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.cliente_id = c.id)
            AND NOT EXISTS (SELECT 1 FROM contratos k WHERE k.cliente_id = c.id)) AS intocado
    FROM clientes c WHERE c.id = ${clienteId}
  `;
  if (!c?.intocado) return;
  await tx`DELETE FROM clientes WHERE id = ${clienteId}`;
  await registrar(tx, {
    actorUserId: null,
    area: null,
    entidade: c.ref,
    campo: "exclusao",
    de: c.nome,
    para: null,
    texto: `Removeu a organização ${c.nome} (${c.ref}): ficou sem oportunidade e nunca tinha sido editada`,
  });
}

/**
 * Liga o contrato ao cliente (o da oportunidade dele, ou o do nome) e completa os dados de
 * cobrança nos dois sentidos: só preenche o que está VAZIO, nunca troca um valor por outro.
 * O contrato pode ter cobrança própria, diferente da do cadastro.
 */
export async function vincularContrato(tx: Queryable, contratoId: number, autor: AutorCliente): Promise<void> {
  const [k] = await tx<{ ref: string; conta: string; deal_id: number | null; cnpj: string; email_cobranca: string }[]>`
    SELECT ref, conta, deal_id, cnpj, email_cobranca FROM contratos WHERE id = ${contratoId}
  `;
  if (!k) return;
  let clienteId: number | null = null;
  if (k.deal_id != null) {
    const [d] = await tx<{ cliente_id: number | null }[]>`SELECT cliente_id FROM deals WHERE id = ${k.deal_id}`;
    clienteId = d?.cliente_id ?? null;
  }
  clienteId ??= await clienteDaConta(tx, k.conta, autor, `da receita ${k.ref}`);
  await tx`UPDATE contratos SET cliente_id = ${clienteId} WHERE id = ${contratoId}`;
  if (clienteId == null) return;

  const [c] = await tx<{ cnpj: string; email_cobranca: string }[]>`
    SELECT cnpj, email_cobranca FROM clientes WHERE id = ${clienteId} FOR UPDATE
  `;
  // O CNPJ do contrato é texto livre; só sobe para o cadastro se for um CNPJ de verdade e
  // nenhum outro cliente já o tiver (o índice único recusaria e derrubaria a transação).
  const doContrato = cnpjLimpo(k.cnpj);
  if (!c.cnpj && doContrato) {
    const [dono] = await tx<{ id: number }[]>`SELECT id FROM clientes WHERE cnpj = ${doContrato}`;
    if (!dono) await tx`UPDATE clientes SET cnpj = ${doContrato} WHERE id = ${clienteId}`;
  }
  if (!c.email_cobranca && k.email_cobranca.trim()) {
    await tx`UPDATE clientes SET email_cobranca = ${k.email_cobranca.trim().toLowerCase().slice(0, 200)} WHERE id = ${clienteId}`;
  }
  if (!k.cnpj.trim() && c.cnpj) await tx`UPDATE contratos SET cnpj = ${c.cnpj} WHERE id = ${contratoId}`;
  if (!k.email_cobranca.trim() && c.email_cobranca) {
    await tx`UPDATE contratos SET email_cobranca = ${c.email_cobranca} WHERE id = ${contratoId}`;
  }
}

/**
 * Carga: liga tudo o que ainda não tem cliente. Roda na migração, a cada subida, e por isso
 * só toca o que está sem vínculo: a primeira vez extrai os clientes das oportunidades que já
 * existem, e depois disso não acha nada para fazer.
 */
export async function ligarPendentes(sql: Queryable): Promise<void> {
  const deals = await sql<{ id: number }[]>`SELECT id FROM deals WHERE cliente_id IS NULL ORDER BY id`;
  for (const d of deals) await vincularOportunidade(sql, d.id, SISTEMA);
  const contratos = await sql<{ id: number }[]>`SELECT id FROM contratos WHERE cliente_id IS NULL ORDER BY id`;
  for (const k of contratos) await vincularContrato(sql, k.id, SISTEMA);
  await propagarNome(sql, null);
}

/**
 * Leva o nome do cadastro para as oportunidades e receitas ligadas a ele (todas, ou as de uma
 * organização). Fatura não muda: é registro fiscal do que foi emitido com aquele nome.
 */
async function propagarNome(tx: Queryable, clienteId: number | null): Promise<void> {
  await tx`
    UPDATE deals d SET conta = c.nome FROM clientes c
    WHERE d.cliente_id = c.id AND d.conta <> c.nome AND (${clienteId}::int IS NULL OR c.id = ${clienteId})
  `;
  await tx`
    UPDATE contratos k SET conta = c.nome FROM clientes c
    WHERE k.cliente_id = c.id AND k.conta <> c.nome AND (${clienteId}::int IS NULL OR c.id = ${clienteId})
  `;
}

// ---------- gravação ----------

type Falha = { erro: string; status: number };

async function gravarContatos(tx: Queryable, clienteId: number, contatos: Contato[]): Promise<void> {
  await tx`DELETE FROM cliente_contatos WHERE cliente_id = ${clienteId}`;
  let ordem = 0;
  for (const c of contatos) {
    await tx`
      INSERT INTO cliente_contatos (cliente_id, nome, cargo, email, telefone, papel, notas, ordem)
      VALUES (${clienteId}, ${c.nome}, ${c.cargo}, ${c.email}, ${c.telefone}, ${c.papel}, ${c.notas}, ${ordem++})
    `;
  }
}

async function conferirCnpj(tx: Queryable, cnpj: string, idAtual: number | null): Promise<string | null> {
  if (!cnpj) return null;
  const [dono] = await tx<{ nome: string; ref: string }[]>`
    SELECT nome, ref FROM clientes WHERE cnpj = ${cnpj} AND (${idAtual}::int IS NULL OR id <> ${idAtual})
  `;
  return dono ? `Este CNPJ já está na organização ${dono.nome} (${dono.ref}). Se for a mesma, mescle as duas.` : null;
}

export async function criarCliente(tx: Queryable, autor: AutorCliente, e: EntradaCliente): Promise<{ id: number; ref: string } | Falha> {
  const chave = chaveCliente(e.nome);
  const [dono] = await tx<{ nome: string; ref: string }[]>`
    SELECT c.nome, c.ref FROM cliente_chaves x JOIN clientes c ON c.id = x.cliente_id WHERE x.chave = ${chave}
  `;
  if (dono) return { erro: `Já existe uma organização com esse nome: ${dono.nome} (${dono.ref}).`, status: 409 };
  const cnpjEmUso = await conferirCnpj(tx, e.cnpj, null);
  if (cnpjEmUso) return { erro: cnpjEmUso, status: 409 };

  const [novo] = await tx<{ id: number }[]>`
    INSERT INTO clientes (nome, razao_social, cnpj, inscricao_municipal, site, segmento, endereco, email_cobranca,
                          dia_vencimento, forma_cobranca, notas, atualizado_em)
    VALUES (${e.nome}, ${e.razaoSocial}, ${e.cnpj}, ${e.inscricaoMunicipal}, ${e.site}, ${e.segmento}, ${e.endereco},
            ${e.emailCobranca}, ${e.diaVencimento}, ${e.formaCobranca}, ${e.notas}, now())
    RETURNING id
  `;
  const ref = refDoCliente(novo.id);
  await tx`UPDATE clientes SET ref = ${ref} WHERE id = ${novo.id}`;
  await tx`INSERT INTO cliente_chaves (chave, cliente_id, nome, principal) VALUES (${chave}, ${novo.id}, ${e.nome}, true)`;
  if (e.contatos) await gravarContatos(tx, novo.id, e.contatos);
  await registrar(tx, {
    ...marca(autor), area: null, entidade: ref, campo: "criacao", de: null, para: e.nome,
    texto: `Cadastrou a organização ${e.nome} (${ref})`,
  });
  return { id: novo.id, ref };
}

const ROTULOS: [keyof EntradaCliente, string][] = [
  ["nome", "nome"], ["razaoSocial", "razão social"], ["cnpj", "CNPJ"], ["inscricaoMunicipal", "inscrição municipal"],
  ["site", "site"], ["segmento", "segmento"], ["endereco", "endereço"], ["emailCobranca", "e-mail de cobrança"],
  ["diaVencimento", "dia de vencimento"], ["formaCobranca", "forma de cobrança"], ["notas", "notas"],
];

const resumoContatos = (cs: Contato[]) => cs.map((c) => [c.nome, c.cargo, c.email, c.telefone, c.papel, c.notas].join("|")).join("\n");

export async function atualizarCliente(
  tx: Queryable,
  autor: AutorCliente,
  id: number,
  e: EntradaCliente
): Promise<{ ref: string; mudancas: number } | Falha> {
  const [existe] = await tx<{ id: number }[]>`SELECT id FROM clientes WHERE id = ${id} FOR UPDATE`;
  if (!existe) return { erro: "Organização não encontrada.", status: 404 };
  const [antes] = await lerClientes(tx, id);

  const chave = chaveCliente(e.nome);
  const [dono] = await tx<{ cliente_id: number; nome: string; ref: string }[]>`
    SELECT x.cliente_id, c.nome, c.ref FROM cliente_chaves x JOIN clientes c ON c.id = x.cliente_id WHERE x.chave = ${chave}
  `;
  if (dono && dono.cliente_id !== id) {
    return { erro: `Já existe uma organização com esse nome: ${dono.nome} (${dono.ref}). Se for a mesma, mescle as duas.`, status: 409 };
  }
  const cnpjEmUso = await conferirCnpj(tx, e.cnpj, id);
  if (cnpjEmUso) return { erro: cnpjEmUso, status: 409 };

  await tx`
    UPDATE clientes SET nome = ${e.nome}, razao_social = ${e.razaoSocial}, cnpj = ${e.cnpj},
           inscricao_municipal = ${e.inscricaoMunicipal}, site = ${e.site}, segmento = ${e.segmento},
           endereco = ${e.endereco}, email_cobranca = ${e.emailCobranca}, dia_vencimento = ${e.diaVencimento},
           forma_cobranca = ${e.formaCobranca}, notas = ${e.notas}, atualizado_em = now()
    WHERE id = ${id}
  `;
  // O nome antigo continua valendo como chave: oportunidade criada com ele cai neste cliente.
  await tx`UPDATE cliente_chaves SET principal = false WHERE cliente_id = ${id}`;
  await tx`
    INSERT INTO cliente_chaves (chave, cliente_id, nome, principal) VALUES (${chave}, ${id}, ${e.nome}, true)
    ON CONFLICT (chave) DO UPDATE SET principal = true, nome = EXCLUDED.nome
  `;

  await propagarNome(tx, id);

  let mudancas = 0;
  for (const [campo, rotulo] of ROTULOS) {
    const de = String(antes[campo as keyof Cliente] ?? "");
    const para = String(e[campo] ?? "");
    if (de === para) continue;
    mudancas++;
    await registrar(tx, {
      ...marca(autor), area: null, entidade: antes.ref, campo: String(campo), de: de || "—", para: para || "—",
      texto: `Alterou ${rotulo} da organização ${e.nome}`,
    });
  }
  if (e.contatos) {
    const de = resumoContatos(antes.contatos);
    const para = resumoContatos(e.contatos);
    if (de !== para) {
      await gravarContatos(tx, id, e.contatos);
      mudancas++;
      await registrar(tx, {
        ...marca(autor), area: null, entidade: antes.ref, campo: "contatos",
        de: antes.contatos.map((c) => c.nome).join(", ") || "—",
        para: e.contatos.map((c) => c.nome).join(", ") || "—",
        texto: `Alterou os contatos da organização ${e.nome}`,
      });
    }
  }
  return { ref: antes.ref, mudancas };
}

/** Só exclui cliente sem nada ligado: com oportunidade ou contrato, o caminho é mesclar. */
export async function excluirCliente(tx: Queryable, autor: AutorCliente, id: number): Promise<{ ok: true } | Falha> {
  const [c] = await tx<{ ref: string; nome: string; deals: number; contratos: number }[]>`
    SELECT c.ref, c.nome,
           (SELECT count(*)::int FROM deals d WHERE d.cliente_id = c.id) AS deals,
           (SELECT count(*)::int FROM contratos k WHERE k.cliente_id = c.id) AS contratos
    FROM clientes c WHERE c.id = ${id} FOR UPDATE
  `;
  if (!c) return { erro: "Organização não encontrada.", status: 404 };
  if (c.deals || c.contratos) {
    return {
      erro: `${c.nome} tem ${c.deals} oportunidade(s) e ${c.contratos} receita(s) cadastrada(s). Mescle com outra organização em vez de excluir.`,
      status: 409,
    };
  }
  await tx`DELETE FROM clientes WHERE id = ${id}`;
  await registrar(tx, {
    ...marca(autor), area: null, entidade: c.ref, campo: "exclusao", de: c.nome, para: null,
    texto: `Excluiu a organização ${c.nome} (${c.ref})`,
  });
  return { ok: true };
}

/**
 * Mescla: tudo o que é de `origem` passa para `destino`, e `origem` deixa de existir.
 * Oportunidades, contratos e chaves mudam de dono; contatos entram se o destino ainda não tem
 * alguém com aquele nome; campos do cadastro só preenchem o que no destino está vazio.
 */
export async function mesclarClientes(
  tx: Queryable,
  autor: AutorCliente,
  origemId: number,
  destinoId: number
): Promise<{ ref: string } | Falha> {
  if (origemId === destinoId) return { erro: "Escolha duas organizações diferentes.", status: 400 };
  // Trava na mesma ordem sempre, para duas mesclas cruzadas não se esperarem para sempre.
  await tx`SELECT id FROM clientes WHERE id IN (${origemId}, ${destinoId}) ORDER BY id FOR UPDATE`;
  const [origem] = await lerClientes(tx, origemId);
  const [destino] = await lerClientes(tx, destinoId);
  if (!origem || !destino) return { erro: "Organização não encontrada.", status: 404 };

  await tx`UPDATE deals SET cliente_id = ${destinoId} WHERE cliente_id = ${origemId}`;
  await tx`UPDATE contratos SET cliente_id = ${destinoId} WHERE cliente_id = ${origemId}`;
  await tx`UPDATE cliente_chaves SET cliente_id = ${destinoId}, principal = false WHERE cliente_id = ${origemId}`;
  await semearContatos(tx, destinoId, origem.contatos);

  const vazio = (v: unknown) => v == null || v === "";
  const notas = [destino.notas, origem.notas].filter(Boolean).join("\n\n").slice(0, 4000);
  // O CNPJ sai da origem antes de entrar no destino: o índice único não aceita os dois ao mesmo tempo.
  await tx`UPDATE clientes SET cnpj = '' WHERE id = ${origemId}`;
  await tx`
    UPDATE clientes SET
      razao_social = ${vazio(destino.razaoSocial) ? origem.razaoSocial : destino.razaoSocial},
      cnpj = ${vazio(destino.cnpj) ? origem.cnpj : destino.cnpj},
      inscricao_municipal = ${vazio(destino.inscricaoMunicipal) ? origem.inscricaoMunicipal : destino.inscricaoMunicipal},
      site = ${vazio(destino.site) ? origem.site : destino.site},
      segmento = ${vazio(destino.segmento) ? origem.segmento : destino.segmento},
      endereco = ${vazio(destino.endereco) ? origem.endereco : destino.endereco},
      email_cobranca = ${vazio(destino.emailCobranca) ? origem.emailCobranca : destino.emailCobranca},
      dia_vencimento = ${destino.diaVencimento ?? origem.diaVencimento},
      forma_cobranca = ${destino.formaCobranca ?? origem.formaCobranca},
      notas = ${notas},
      atualizado_em = now()
    WHERE id = ${destinoId}
  `;
  await tx`DELETE FROM clientes WHERE id = ${origemId}`;
  await propagarNome(tx, destinoId);
  await registrar(tx, {
    ...marca(autor), area: null, entidade: destino.ref, campo: "mescla", de: `${origem.nome} (${origem.ref})`, para: destino.nome,
    texto: `Mesclou a organização ${origem.nome} (${origem.ref}) em ${destino.nome} (${destino.ref})`,
  });
  return { ref: destino.ref };
}

// ---------- histórico ----------

export type EventoCliente = {
  id: number;
  criadoEm: string;
  autor: string;
  entidade: string;
  campo: string | null;
  de: string | null;
  para: string | null;
  texto: string;
};

/**
 * O que aconteceu com o cliente, do mais recente para o mais antigo: a linha do tempo das
 * oportunidades dele (criação, estágio, situação, próximo passo, proposta, última interação),
 * dos contratos e do próprio cadastro. Sai do changelog; nada é digitado duas vezes.
 */
/** `areas` (quem não é admin): só o que é do cadastro e das oportunidades desses produtos; receita fica de fora. */
export async function historicoDoCliente(sql: Queryable, id: number, areas?: string[]): Promise<EventoCliente[]> {
  const linhas = await sql<
    { id: number; criado_em: Date; autor: string | null; entidade: string; campo: string | null; valor_anterior: string | null; valor_novo: string | null; texto: string }[]
  >`
    WITH refs AS (
      SELECT ref FROM clientes WHERE id = ${id}
      UNION SELECT ref FROM deals WHERE cliente_id = ${id}
        AND (${areas ?? null}::text[] IS NULL OR area = ANY(${areas ?? []}::text[]))
      UNION SELECT ref_antiga FROM deals WHERE cliente_id = ${id} AND ref_antiga IS NOT NULL
        AND (${areas ?? null}::text[] IS NULL OR area = ANY(${areas ?? []}::text[]))
      UNION SELECT ref FROM contratos WHERE cliente_id = ${id} AND ${areas ?? null}::text[] IS NULL
    )
    SELECT l.id, l.criado_em, u.nome AS autor, l.entidade, l.campo, l.valor_anterior, l.valor_novo, l.texto
    FROM audit_log l LEFT JOIN users u ON u.id = l.actor_user_id
    WHERE l.entidade IN (SELECT ref FROM refs)
      AND (l.entidade LIKE 'CLI-%' OR l.entidade LIKE 'R-%'
           OR l.campo IN ('criacao', 'estagio', 'situacao', 'proximo_passo', 'proposta_url', 'ultima_interacao', 'valor', 'motivo_perda'))
    ORDER BY l.criado_em DESC, l.id DESC
    LIMIT 300
  `;
  return linhas.map((l) => ({
    id: l.id,
    criadoEm: l.criado_em.toISOString(),
    autor: l.autor ?? "sistema",
    entidade: l.entidade,
    campo: l.campo,
    de: l.valor_anterior,
    para: l.valor_novo,
    texto: l.texto,
  }));
}
