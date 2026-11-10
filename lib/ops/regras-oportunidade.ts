// Regras de oportunidade: criação, movimento pelas setas e alteração. Puro — ver `comum.ts`.
//
// Mesma convenção das atividades: a ORDEM das checagens é a da rota antiga, para a mensagem
// de erro não mudar quando a entrada tem mais de um problema.
//
// Card comercial v2 (nov/2026): Escopo e Produto saíram da oportunidade — Dor principal e
// Módulos de interesse dizem o mesmo com estrutura — e entraram os campos da planilha do LIFF
// Tax: origem, ponte, contato operacional, ERP, última interação, blocker (tipo e quem
// resolve), motivo da perda e notas. `contato` passou a ser "Contato / sponsor".

import {
  BLOCKER_TIPO_KEYS, ESTAGIO_INICIAL, FUNIL, MOTIVO_PERDA_KEYS, STAGE_KEYS, blockerTipoLabel, brlExato,
  hojeISO, motivoPerdaLabel, stageLabel,
} from "../domain.ts";
import {
  LIMITES, dataOuNula, falha, idDePessoa, isoDoBanco, texto,
  type Falha, type Fatos, type Mudanca, type Permissoes,
} from "./comum.ts";

export type OportunidadeNova = {
  conta: string;
  area: string;
  estagio: string;
  valorCentavos: number;
  responsavelId: number | null;
  proximoPasso: string;
  proximoPassoEm: string | null;
  situacao: string;
  /** Quando a situação foi escrita. Hoje, salvo se quem cria disser outra (a importação diz). */
  situacaoEm: string | null;
  contato: string;
  responsavelTexto: string;
  aceAws: boolean;
  origemId: string | null;
  ponte: string;
  contatoOperacional: string;
  dor: string;
  erp: string;
  ultimaInteracao: string | null;
  blocker: string;
  blockerTipo: string | null;
  blockerDonoId: number | null;
  motivoPerda: string | null;
  motivoPerdaDetalhe: string;
  notas: string;
  modulos: string[];
};

export type OportunidadeAtual = {
  id: number;
  ref: string;
  conta: string;
  escopo: string;
  area: string;
  estagio: string;
  /** O driver devolve BIGINT como string. */
  valor_centavos: string | number;
  proximo_passo: string;
  responsavel_user_id: number | null;
  responsavel: string | null;
  situacao: string;
  situacao_em?: Date | null;
  contato: string;
  responsavel_texto: string;
  proximo_passo_em: Date | null;
  ace_aws: boolean;
  origem_id: string | null;
  ponte: string;
  contato_operacional: string;
  dor: string;
  erp: string;
  ultima_interacao: Date | null;
  blocker: string;
  blocker_tipo: string | null;
  blocker_dono_id: number | null;
  motivo_perda: string | null;
  motivo_perda_detalhe: string;
  notas: string;
  /** Ids dos produtos marcados como módulos de interesse. */
  modulos: string[];
};

type Entrada = Record<string, unknown>;

/** `Number()` e não checagem de tipo, como a rota sempre fez: "1500" do formulário vale. */
function centavosDe(v: unknown): number | null {
  const reais = Number(v);
  if (!Number.isFinite(reais) || reais < 0) return null;
  return Math.round(reais * 100);
}

function booleanoOpcional(v: unknown): boolean | undefined | "invalido" {
  if (v === undefined) return undefined;
  return typeof v === "boolean" ? v : "invalido";
}

/** Valor de uma lista fechada: a chave, `null` (vazio limpa) ou "invalido". */
function deLista(v: unknown, chaves: readonly string[]): string | null | "invalido" {
  if (v === null || v === "") return null;
  return typeof v === "string" && chaves.includes(v) ? v : "invalido";
}

/** Origem: tem de existir no cadastro. Inativa só vale se já era a do registro. */
function origemValida(v: unknown, fatos: Fatos, atual: string | null): string | null | "invalido" {
  if (v === null || v === "") return null;
  if (typeof v !== "string") return "invalido";
  const o = (fatos.origens ?? []).find((x) => x.id === v);
  return o && (o.ativo || o.id === atual) ? o.id : "invalido";
}

/**
 * Módulos de interesse: produtos da área, sem repetição. Devolve a lista em ordem estável ou
 * a mensagem de erro. Produto de outra área é recusado pelo mesmo motivo de antes: o card
 * ficaria classificado com algo que aquela vertical não vende.
 */
function modulosValidos(v: unknown, fatos: Fatos, area: string): string[] | string {
  if (v === null) return [];
  if (!Array.isArray(v)) return "Módulos inválidos.";
  const ids = [...new Set(v)];
  if (ids.length > LIMITES.modulos) return `No máximo ${LIMITES.modulos} módulos.`;
  for (const id of ids) {
    if (typeof id !== "string" || !fatos.produtos.some((p) => p.id === id && p.area === area)) {
      return `Módulo inválido para esta área: ${String(id).slice(0, 40)}.`;
    }
  }
  return (ids as string[]).sort();
}

const nomeDoProduto = (fatos: Fatos, id: string) => fatos.produtos.find((p) => p.id === id)?.label ?? id;
const listaDeModulos = (fatos: Fatos, ids: string[]) => (ids.length ? ids.map((i) => nomeDoProduto(fatos, i)).join(", ") : "—");
const mesmaLista = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function planejarCriacaoOportunidade(
  body: Entrada,
  perm: Permissoes,
  fatos: Fatos
): Falha | { ok: true; linha: OportunidadeNova; auditoria: Mudanca } {
  const conta = typeof body.conta === "string" ? body.conta.trim() : "";
  if (!conta) return falha("A oportunidade precisa de uma conta.");
  if (conta.length > LIMITES.conta) return falha("Nome de conta longo demais.");

  const area = typeof body.area === "string" ? body.area : "";
  if (!perm.areasExistentes.includes(area)) return falha("Área inválida.");
  if (!perm.podeEditar(area)) return falha(`Sem permissão de edição em ${perm.labelArea(area)}.`, 403);

  const estagio = body.estagio ?? ESTAGIO_INICIAL;
  if (typeof estagio !== "string" || !STAGE_KEYS.includes(estagio)) return falha("Estágio inválido.");

  const valorCentavos = centavosDe(body.valorReais ?? 0);
  if (valorCentavos === null) return falha("Valor inválido.");

  let responsavelId: number | null = null;
  if (body.responsavelId != null) {
    const id = idDePessoa(body.responsavelId);
    if (id === undefined || !fatos.pessoas.has(id)) return falha("Responsável inválido.");
    responsavelId = id;
  }

  const modulos = body.modulos === undefined ? [] : modulosValidos(body.modulos, fatos, area);
  if (typeof modulos === "string") return falha(modulos);

  // "Em pausa" deixou de ser interruptor: virou o estágio On hold. Um `pausado` vindo de um
  // cliente antigo é ignorado, como qualquer campo que a regra não conhece — idem `escopo` e
  // `produtoId`, que saíram do card comercial.
  const aceAws = booleanoOpcional(body.aceAws);
  if (aceAws === "invalido") return falha("Requisição inválida.");

  const origemId = origemValida(body.origemId ?? null, fatos, null);
  if (origemId === "invalido") return falha("Origem inválida.");
  const blockerTipo = deLista(body.blockerTipo ?? null, BLOCKER_TIPO_KEYS);
  if (blockerTipo === "invalido") return falha("Tipo de blocker inválido.");
  const motivoPerda = deLista(body.motivoPerda ?? null, MOTIVO_PERDA_KEYS);
  if (motivoPerda === "invalido") return falha("Motivo da perda inválido.");
  let blockerDonoId: number | null = null;
  if (body.blockerDonoId != null) {
    const id = idDePessoa(body.blockerDonoId);
    if (id === undefined || !fatos.pessoas.has(id)) return falha("Quem resolve o blocker é inválido.");
    blockerDonoId = id;
  }

  const linha: OportunidadeNova = {
    conta,
    area,
    estagio,
    valorCentavos,
    responsavelId,
    proximoPasso: texto(body.proximoPasso, LIMITES.proximoPassoOportunidade),
    proximoPassoEm: dataOuNula(body.proximoPassoEm),
    situacao: texto(body.situacao, LIMITES.situacao),
    situacaoEm: texto(body.situacao, LIMITES.situacao) ? (dataOuNula(body.situacaoEm) ?? hojeISO()) : null,
    contato: texto(body.contato, LIMITES.contato),
    responsavelTexto: texto(body.responsavelTexto, LIMITES.responsavelTexto),
    aceAws: aceAws ?? false,
    origemId,
    ponte: texto(body.ponte, LIMITES.ponte),
    contatoOperacional: texto(body.contatoOperacional, LIMITES.contatoOperacional),
    dor: texto(body.dor, LIMITES.dor),
    erp: texto(body.erp, LIMITES.erp),
    ultimaInteracao: dataOuNula(body.ultimaInteracao),
    blocker: texto(body.blocker, LIMITES.blocker),
    blockerTipo,
    blockerDonoId,
    motivoPerda,
    motivoPerdaDetalhe: texto(body.motivoPerdaDetalhe, LIMITES.motivoPerdaDetalhe),
    notas: texto(body.notas, LIMITES.notas),
    modulos,
  };

  return {
    ok: true,
    linha,
    auditoria: {
      campo: "criacao",
      de: null,
      para: stageLabel(estagio),
      texto: `Criou a oportunidade ${conta} (${brlExato(valorCentavos)}) em ${perm.labelArea(area)}`,
    },
  };
}

export type ColunaOportunidade =
  | "area" | "conta" | "estagio" | "valor_centavos" | "proximo_passo"
  | "situacao" | "situacao_em" | "contato" | "responsavel_texto" | "proximo_passo_em"
  | "ace_aws" | "responsavel_user_id"
  | "origem_id" | "ponte" | "contato_operacional" | "dor" | "erp" | "ultima_interacao"
  | "blocker" | "blocker_tipo" | "blocker_dono_id" | "motivo_perda" | "motivo_perda_detalhe" | "notas";

export type PlanoOportunidade = {
  ok: true;
  sets: Partial<Record<ColunaOportunidade, string | number | boolean | null>>;
  /** Lista NOVA de módulos, quando mudou. Ausente = não mexer. */
  modulos?: string[];
  mudancas: Mudanca[];
  areaFinal: string;
};

function precondicao(atual: OportunidadeAtual, perm: Permissoes): Falha | null {
  // 404 e não 403: quem não enxerga a área não deve nem saber que o registro existe.
  if (!perm.podeVer(atual.area)) return falha("Oportunidade não encontrada.", 404);
  if (!perm.podeEditar(atual.area)) return falha("Sem permissão de edição nesta área.", 403);
  return null;
}

/**
 * O movimento de uma casa no pipeline, feito pelas setas do card. O cliente manda a direção
 * e o servidor calcula o destino, para não dar para pular etapas.
 *
 * As setas andam só pelo FUNIL (Prospecção → … → Ganho). On hold e Lost são desvios, não
 * casas: a seta não leva até eles nem tira deles — para isso, arrastar ou o formulário.
 */
export function planejarMovimento(
  atual: OportunidadeAtual,
  direcaoBruta: unknown,
  perm: Permissoes
): Falha | PlanoOportunidade {
  const barrado = precondicao(atual, perm);
  if (barrado) return barrado;

  const direcao = Number(direcaoBruta);
  if (direcao !== 1 && direcao !== -1) return falha("Direção inválida.");

  const i = FUNIL.indexOf(atual.estagio as (typeof FUNIL)[number]);
  if (i < 0) return falha(`${stageLabel(atual.estagio)} não é uma casa do funil: arraste o card ou use o formulário.`);
  const j = Math.max(0, Math.min(FUNIL.length - 1, i + direcao));
  if (i === j) return { ok: true, sets: {}, mudancas: [], areaFinal: atual.area };

  return {
    ok: true,
    sets: { estagio: FUNIL[j] },
    mudancas: [{
      campo: "estagio",
      de: FUNIL[i],
      para: FUNIL[j],
      texto: `Moveu ${atual.conta} de ${stageLabel(FUNIL[i])} para ${stageLabel(FUNIL[j])}`,
    }],
    areaFinal: atual.area,
  };
}

export function planejarAtualizacaoOportunidade(
  atual: OportunidadeAtual,
  body: Entrada,
  perm: Permissoes,
  fatos: Fatos
): Falha | PlanoOportunidade {
  const barrado = precondicao(atual, perm);
  if (barrado) return barrado;

  const sets: PlanoOportunidade["sets"] = {};
  const mudancas: Mudanca[] = [];

  // Trocar de área exige permissão nas duas pontas: tirar da origem e colocar no destino.
  if (body.area !== undefined && body.area !== atual.area) {
    const destino = typeof body.area === "string" ? body.area : "";
    if (!perm.areasExistentes.includes(destino)) return falha("Área inválida.");
    if (!perm.podeEditar(destino)) return falha(`Sem permissão de edição em ${perm.labelArea(destino)}.`, 403);
    mudancas.push({
      campo: "area",
      de: atual.area,
      para: destino,
      texto: `Moveu ${atual.conta} de ${perm.labelArea(atual.area)} para ${perm.labelArea(destino)}`,
    });
    sets.area = destino;
  }

  if (body.conta !== undefined) {
    const conta = typeof body.conta === "string" ? body.conta.trim() : "";
    if (!conta) return falha("A oportunidade precisa de uma conta.");
    if (conta.length > LIMITES.conta) return falha("Nome de conta longo demais.");
    if (conta !== atual.conta) {
      mudancas.push({ campo: "conta", de: atual.conta, para: conta, texto: `Renomeou a conta de ${atual.conta} para ${conta}` });
      sets.conta = conta;
    }
  }

  if (body.estagio !== undefined && body.estagio !== atual.estagio) {
    if (typeof body.estagio !== "string" || !STAGE_KEYS.includes(body.estagio)) return falha("Estágio inválido.");
    mudancas.push({
      campo: "estagio",
      de: atual.estagio,
      para: body.estagio,
      texto: `Moveu ${atual.conta} de ${stageLabel(atual.estagio)} para ${stageLabel(body.estagio)}`,
    });
    sets.estagio = body.estagio;
  }

  if (body.valorReais !== undefined) {
    const centavos = centavosDe(body.valorReais);
    if (centavos === null) return falha("Valor inválido.");
    const antes = Number(atual.valor_centavos);
    if (centavos !== antes) {
      mudancas.push({
        campo: "valor",
        de: brlExato(antes),
        para: brlExato(centavos),
        texto: `Alterou o valor de ${atual.conta} de ${brlExato(antes)} para ${brlExato(centavos)}`,
      });
      sets.valor_centavos = centavos;
    }
  }

  if (body.proximoPasso !== undefined) {
    const proximo = texto(body.proximoPasso, LIMITES.proximoPassoOportunidade);
    if (proximo !== atual.proximo_passo) {
      mudancas.push({
        campo: "proximo_passo",
        de: atual.proximo_passo || "—",
        para: proximo || "—",
        texto: `Próximo passo de ${atual.conta}: ${proximo || "—"}`,
      });
      sets.proximo_passo = proximo;
    }
  }

  // Campos de texto livre: mesmo tratamento para todos, e o log guarda o par anterior/novo.
  const TEXTOS = [
    { chave: "situacao", coluna: "situacao", atual: atual.situacao, rotulo: "a situação", max: LIMITES.situacao },
    { chave: "contato", coluna: "contato", atual: atual.contato, rotulo: "o contato / sponsor", max: LIMITES.contato },
    {
      chave: "responsavelTexto", coluna: "responsavel_texto", atual: atual.responsavel_texto,
      rotulo: "o responsável (texto)", max: LIMITES.responsavelTexto,
    },
    { chave: "ponte", coluna: "ponte", atual: atual.ponte, rotulo: "a ponte", max: LIMITES.ponte },
    {
      chave: "contatoOperacional", coluna: "contato_operacional", atual: atual.contato_operacional,
      rotulo: "o contato operacional", max: LIMITES.contatoOperacional,
    },
    { chave: "dor", coluna: "dor", atual: atual.dor, rotulo: "a dor principal", max: LIMITES.dor },
    { chave: "erp", coluna: "erp", atual: atual.erp, rotulo: "o ERP", max: LIMITES.erp },
    { chave: "blocker", coluna: "blocker", atual: atual.blocker, rotulo: "o blocker", max: LIMITES.blocker },
    {
      chave: "motivoPerdaDetalhe", coluna: "motivo_perda_detalhe", atual: atual.motivo_perda_detalhe,
      rotulo: "o detalhe da perda", max: LIMITES.motivoPerdaDetalhe,
    },
    { chave: "notas", coluna: "notas", atual: atual.notas, rotulo: "as notas", max: LIMITES.notas },
  ] as const;
  for (const t of TEXTOS) {
    if (body[t.chave] === undefined) continue;
    const valor = texto(body[t.chave], t.max);
    if (valor === t.atual) continue;
    mudancas.push({ campo: t.coluna, de: t.atual || "—", para: valor || "—", texto: `Alterou ${t.rotulo} de ${atual.conta}` });
    sets[t.coluna] = valor;
    // A data da situação anda junto com o texto: é o "19/OUT" do card. Quem atualiza pode dizer
    // a data (a importação diz a da planilha); sem isso, é hoje.
    if (t.coluna === "situacao") sets.situacao_em = valor ? (dataOuNula(body.situacaoEm) ?? hojeISO()) : null;
  }

  // `null` explícito limpa a data — é assim que se tira um item do cronograma sem apagar o
  // texto do passo.
  if (body.proximoPassoEm !== undefined) {
    const nova = dataOuNula(body.proximoPassoEm);
    const antiga = isoDoBanco(atual.proximo_passo_em);
    if (nova !== antiga) {
      mudancas.push({
        campo: "proximo_passo_em",
        de: antiga ?? "—",
        para: nova ?? "—",
        texto: `Alterou a data do próximo passo de ${atual.conta}`,
      });
      sets.proximo_passo_em = nova;
    }
  }

  const areaFinal = (sets.area as string | undefined) ?? atual.area;

  // Datas novas: última interação com o cliente. `null` limpa, como no próximo passo.
  if (body.ultimaInteracao !== undefined) {
    const nova = dataOuNula(body.ultimaInteracao);
    const antiga = isoDoBanco(atual.ultima_interacao);
    if (nova !== antiga) {
      mudancas.push({ campo: "ultima_interacao", de: antiga ?? "—", para: nova ?? "—", texto: `Alterou a última interação com ${atual.conta}` });
      sets.ultima_interacao = nova;
    }
  }

  // Módulos de interesse, contra a área FINAL — que pode ter mudado nesta mesma requisição.
  // Mudar SÓ a área derruba os módulos que não são da vertical nova, com registro.
  let modulos: string[] | undefined;
  const atuais = [...atual.modulos].sort();
  if (body.modulos !== undefined) {
    const novos = modulosValidos(body.modulos, fatos, areaFinal);
    if (typeof novos === "string") return falha(novos);
    if (!mesmaLista(novos, atuais)) modulos = novos;
  } else if (areaFinal !== atual.area) {
    const ficam = atuais.filter((id) => fatos.produtos.some((p) => p.id === id && p.area === areaFinal));
    if (!mesmaLista(ficam, atuais)) modulos = ficam;
  }
  if (modulos) {
    mudancas.push({
      campo: "modulos",
      de: listaDeModulos(fatos, atuais),
      para: listaDeModulos(fatos, modulos),
      texto: `Alterou os módulos de interesse de ${atual.conta}`,
    });
  }

  if (body.origemId !== undefined) {
    const origem = origemValida(body.origemId, fatos, atual.origem_id);
    if (origem === "invalido") return falha("Origem inválida.");
    if (origem !== atual.origem_id) {
      const rotulo = (id: string | null) => (id ? ((fatos.origens ?? []).find((o) => o.id === id)?.label ?? id) : "—");
      mudancas.push({ campo: "origem", de: rotulo(atual.origem_id), para: rotulo(origem), texto: `Alterou a origem de ${atual.conta}` });
      sets.origem_id = origem;
    }
  }

  if (body.blockerTipo !== undefined) {
    const tipo = deLista(body.blockerTipo, BLOCKER_TIPO_KEYS);
    if (tipo === "invalido") return falha("Tipo de blocker inválido.");
    if (tipo !== atual.blocker_tipo) {
      mudancas.push({
        campo: "blocker_tipo",
        de: blockerTipoLabel(atual.blocker_tipo) || "—",
        para: blockerTipoLabel(tipo) || "—",
        texto: `Alterou o tipo de blocker de ${atual.conta}`,
      });
      sets.blocker_tipo = tipo;
    }
  }

  if (body.blockerDonoId !== undefined && body.blockerDonoId !== atual.blocker_dono_id) {
    let novoId: number | null = null;
    if (body.blockerDonoId !== null) {
      const id = idDePessoa(body.blockerDonoId);
      if (id === undefined || !fatos.pessoas.has(id)) return falha("Quem resolve o blocker é inválido.");
      novoId = id;
    }
    const nome = (id: number | null) => (id === null ? "—" : (fatos.pessoas.get(id) ?? `#${id}`));
    mudancas.push({
      campo: "blocker_dono",
      de: nome(atual.blocker_dono_id),
      para: nome(novoId),
      texto: `Alterou quem resolve o blocker de ${atual.conta}`,
    });
    sets.blocker_dono_id = novoId;
  }

  if (body.motivoPerda !== undefined) {
    const motivo = deLista(body.motivoPerda, MOTIVO_PERDA_KEYS);
    if (motivo === "invalido") return falha("Motivo da perda inválido.");
    if (motivo !== atual.motivo_perda) {
      mudancas.push({
        campo: "motivo_perda",
        de: motivoPerdaLabel(atual.motivo_perda) || "—",
        para: motivoPerdaLabel(motivo) || "—",
        texto: `Alterou o motivo da perda de ${atual.conta}`,
      });
      sets.motivo_perda = motivo;
    }
  }

  const aceAws = booleanoOpcional(body.aceAws);
  if (aceAws === "invalido") return falha("Requisição inválida.");
  if (aceAws !== undefined && aceAws !== atual.ace_aws) {
    mudancas.push({
      campo: "ace_aws",
      de: String(atual.ace_aws),
      para: String(aceAws),
      texto: `${aceAws ? "Registrou" : "Desmarcou o registro de"} ${atual.conta} no ACE da AWS`,
    });
    sets.ace_aws = aceAws;
  }

  if (body.responsavelId !== undefined && body.responsavelId !== atual.responsavel_user_id) {
    let nomeNovo = "—";
    let novoId: number | null = null;
    if (body.responsavelId !== null) {
      const id = idDePessoa(body.responsavelId);
      const nome = id === undefined ? undefined : fatos.pessoas.get(id);
      if (id === undefined || nome === undefined) return falha("Responsável inválido.");
      nomeNovo = nome;
      novoId = id;
    }
    mudancas.push({
      campo: "responsavel",
      de: atual.responsavel ?? "—",
      para: nomeNovo,
      texto: `Alterou o responsável de ${atual.conta} de ${atual.responsavel ?? "—"} para ${nomeNovo}`,
    });
    sets.responsavel_user_id = novoId;
  }

  return { ok: true, sets, modulos, mudancas, areaFinal };
}
