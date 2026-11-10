// Regras de oportunidade: criação, movimento pelas setas e alteração. Puro — ver `comum.ts`.
//
// Mesma convenção das atividades: a ORDEM das checagens é a da rota antiga, para a mensagem
// de erro não mudar quando a entrada tem mais de um problema.

import { ESTAGIO_INICIAL, FUNIL, STAGE_KEYS, brlExato, stageLabel } from "../domain.ts";
import {
  LIMITES, dataOuNula, falha, idDePessoa, isoDoBanco, produtoNaArea, texto,
  type Falha, type Fatos, type Mudanca, type Permissoes,
} from "./comum.ts";

export type OportunidadeNova = {
  conta: string;
  escopo: string;
  area: string;
  estagio: string;
  valorCentavos: number;
  responsavelId: number | null;
  proximoPasso: string;
  proximoPassoEm: string | null;
  situacao: string;
  contato: string;
  responsavelTexto: string;
  produtoId: string | null;
  aceAws: boolean;
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
  contato: string;
  responsavel_texto: string;
  produto_id: string | null;
  proximo_passo_em: Date | null;
  ace_aws: boolean;
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

  // O produto precisa pertencer à área escolhida — senão o card ficaria classificado como
  // algo que aquela vertical não vende.
  let produtoId: string | null = null;
  if (body.produtoId) {
    produtoId = produtoNaArea(fatos, body.produtoId, area);
    if (!produtoId) return falha("Produto inválido para esta área.");
  }

  // "Em pausa" deixou de ser interruptor: virou o estágio On hold. Um `pausado` vindo de um
  // cliente antigo é ignorado, como qualquer campo que a regra não conhece.
  const aceAws = booleanoOpcional(body.aceAws);
  if (aceAws === "invalido") return falha("Requisição inválida.");

  const linha: OportunidadeNova = {
    conta,
    escopo: texto(body.escopo, LIMITES.escopo),
    area,
    estagio,
    valorCentavos,
    responsavelId,
    proximoPasso: texto(body.proximoPasso, LIMITES.proximoPassoOportunidade),
    proximoPassoEm: dataOuNula(body.proximoPassoEm),
    situacao: texto(body.situacao, LIMITES.situacao),
    contato: texto(body.contato, LIMITES.contato),
    responsavelTexto: texto(body.responsavelTexto, LIMITES.responsavelTexto),
    produtoId,
    aceAws: aceAws ?? false,
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
  | "area" | "conta" | "escopo" | "estagio" | "valor_centavos" | "proximo_passo"
  | "situacao" | "contato" | "responsavel_texto" | "proximo_passo_em" | "produto_id"
  | "ace_aws" | "responsavel_user_id";

export type PlanoOportunidade = {
  ok: true;
  sets: Partial<Record<ColunaOportunidade, string | number | boolean | null>>;
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

  if (body.escopo !== undefined) {
    const escopo = texto(body.escopo, LIMITES.escopo);
    if (escopo !== atual.escopo) {
      mudancas.push({ campo: "escopo", de: atual.escopo || "—", para: escopo || "—", texto: `Alterou o escopo de ${atual.conta}` });
      sets.escopo = escopo;
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
    { chave: "contato", coluna: "contato", atual: atual.contato, rotulo: "o contato", max: LIMITES.contato },
    {
      chave: "responsavelTexto", coluna: "responsavel_texto", atual: atual.responsavel_texto,
      rotulo: "o responsável (texto)", max: LIMITES.responsavelTexto,
    },
  ] as const;
  for (const t of TEXTOS) {
    if (body[t.chave] === undefined) continue;
    const valor = texto(body[t.chave], t.max);
    if (valor === t.atual) continue;
    mudancas.push({ campo: t.coluna, de: t.atual || "—", para: valor || "—", texto: `Alterou ${t.rotulo} de ${atual.conta}` });
    sets[t.coluna] = valor;
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

  if (body.produtoId !== undefined && body.produtoId !== atual.produto_id) {
    let novo: string | null = null;
    if (body.produtoId) {
      // Contra a área FINAL, que pode ter acabado de mudar nesta mesma requisição.
      novo = produtoNaArea(fatos, body.produtoId, areaFinal);
      if (!novo) return falha("Produto inválido para esta área.");
    }
    // `""` vindo do formulário com o card já sem produto não é mudança — a rota antiga
    // gravava uma linha "— → —" na auditoria nesse caso.
    if (novo !== atual.produto_id) {
      mudancas.push({ campo: "produto", de: atual.produto_id ?? "—", para: novo ?? "—", texto: `Alterou o produto de ${atual.conta}` });
      sets.produto_id = novo;
    }
  } else if (atual.produto_id && areaFinal !== atual.area && !produtoNaArea(fatos, atual.produto_id, areaFinal)) {
    // Mudar SÓ a área deixava o produto da vertical antiga preso ao card: nenhuma tela
    // oferecia aquele produto de volta, e a classificação virava mentira silenciosa.
    mudancas.push({
      campo: "produto",
      de: atual.produto_id,
      para: "—",
      texto: `Removeu o produto de ${atual.conta} — não pertence a ${perm.labelArea(areaFinal)}`,
    });
    sets.produto_id = null;
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

  return { ok: true, sets, mudancas, areaFinal };
}
