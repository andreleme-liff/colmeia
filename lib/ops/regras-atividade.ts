// Regras de atividade: criação e alteração. Puro — ver o cabeçalho de `comum.ts`.
//
// A ORDEM das checagens é a das rotas antigas, de propósito: quando a entrada tem dois
// problemas, a mensagem devolvida continua sendo a mesma de antes, e a interface (que mostra
// o texto do erro) não muda de comportamento.

import { PRIORIDADES, STATUS_KEYS, ddmm, statusLabel } from "../domain.ts";
import {
  LIMITES, dataOuNula, falha, idDePessoa, isoDoBanco, produtoNaArea, texto,
  type Falha, type Fatos, type Mudanca, type Permissoes,
} from "./comum.ts";

export type AtividadeNova = {
  titulo: string;
  area: string;
  status: string;
  prioridade: string;
  prazo: string | null;
  responsavelId: number | null;
  situacao: string;
  proximoPasso: string;
  proximoPassoEm: string | null;
  produtoId: string | null;
};

/** A linha como ela está no banco, com o nome do responsável já resolvido. */
export type AtividadeAtual = {
  id: number;
  ref: string;
  titulo: string;
  area: string;
  status: string;
  prioridade: string;
  responsavel_user_id: number | null;
  responsavel: string | null;
  situacao: string;
  proximo_passo: string;
  proximo_passo_em: Date | null;
  produto_id: string | null;
  prazo: Date | null;
};

type Entrada = Record<string, unknown>;

export function planejarCriacaoAtividade(
  body: Entrada,
  perm: Permissoes,
  fatos: Fatos
): Falha | { ok: true; linha: AtividadeNova; auditoria: Mudanca } {
  const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";
  if (!titulo) return falha("A atividade precisa de um título.");
  if (titulo.length > LIMITES.titulo) return falha("Título longo demais.");

  const area = typeof body.area === "string" ? body.area : "";
  if (!perm.areasExistentes.includes(area)) return falha("Área inválida.");
  if (!perm.podeEditar(area)) return falha(`Sem permissão de edição em ${perm.labelArea(area)}.`, 403);

  const status = body.status ?? "backlog";
  if (typeof status !== "string" || !STATUS_KEYS.includes(status)) return falha("Status inválido.");

  const prioridade = body.prioridade ?? "media";
  if (typeof prioridade !== "string" || !(PRIORIDADES as readonly string[]).includes(prioridade)) {
    return falha("Prioridade inválida.");
  }

  // Produto pertence a uma vertical; aceitar um de outra área criaria uma classificação que
  // a tela de cadastros nunca mostraria junto.
  let produtoId: string | null = null;
  if (body.produtoId) {
    produtoId = produtoNaArea(fatos, body.produtoId, area);
    if (!produtoId) return falha("Produto inválido para esta área.");
  }

  let responsavelId: number | null = null;
  if (body.responsavelId != null) {
    const id = idDePessoa(body.responsavelId);
    if (id === undefined || !fatos.pessoas.has(id)) return falha("Responsável inválido.");
    responsavelId = id;
  }

  const linha: AtividadeNova = {
    titulo,
    area,
    status,
    prioridade,
    prazo: dataOuNula(body.prazo),
    responsavelId,
    situacao: texto(body.situacao, LIMITES.situacao),
    proximoPasso: texto(body.proximoPasso, LIMITES.proximoPassoAtividade),
    // Nula é comum — quem escreve o passo nem sempre sabe quando; o cronograma trata nulo
    // como fim da semana corrente.
    proximoPassoEm: dataOuNula(body.proximoPassoEm),
    produtoId,
  };

  return {
    ok: true,
    linha,
    auditoria: {
      campo: "criacao",
      de: null,
      para: statusLabel(status),
      texto: `Criou "${titulo}" em ${perm.labelArea(area)}`,
    },
  };
}

/** Colunas que a alteração pode tocar. A lista fecha o conjunto: nada fora dela vira SQL. */
export type ColunaAtividade =
  | "area" | "titulo" | "status" | "prioridade" | "situacao" | "proximo_passo"
  | "responsavel_user_id" | "prazo" | "proximo_passo_em" | "produto_id";

export type PlanoAtualizacao = {
  ok: true;
  sets: Partial<Record<ColunaAtividade, string | number | null>>;
  mudancas: Mudanca[];
  /** A auditoria fica na área de destino, senão o registro da própria mudança sumiria para
   *  quem enxerga a área nova. */
  areaFinal: string;
};

export function planejarAtualizacaoAtividade(
  atual: AtividadeAtual,
  body: Entrada,
  perm: Permissoes,
  fatos: Fatos
): Falha | PlanoAtualizacao {
  // 404 e não 403: quem não enxerga a área não deve nem saber que o registro existe.
  if (!perm.podeVer(atual.area)) return falha("Atividade não encontrada.", 404);
  if (!perm.podeEditar(atual.area)) return falha("Sem permissão de edição nesta área.", 403);

  const sets: PlanoAtualizacao["sets"] = {};
  const mudancas: Mudanca[] = [];

  // Mudar de área exige permissão nas DUAS pontas: tirar da origem e colocar no destino.
  // Só a origem deixaria alguém empurrar trabalho para uma área que não administra; só o
  // destino deixaria tirar trabalho de uma área alheia.
  if (body.area !== undefined && body.area !== atual.area) {
    const destino = typeof body.area === "string" ? body.area : "";
    if (!perm.areasExistentes.includes(destino)) return falha("Área inválida.");
    if (!perm.podeEditar(destino)) return falha(`Sem permissão de edição em ${perm.labelArea(destino)}.`, 403);
    mudancas.push({
      campo: "area",
      de: atual.area,
      para: destino,
      texto: `Moveu de ${perm.labelArea(atual.area)} para ${perm.labelArea(destino)}`,
    });
    sets.area = destino;
  }

  if (body.titulo !== undefined) {
    const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";
    if (!titulo) return falha("A atividade precisa de um título.");
    if (titulo.length > LIMITES.titulo) return falha("Título longo demais.");
    if (titulo !== atual.titulo) {
      mudancas.push({ campo: "titulo", de: atual.titulo, para: titulo, texto: `Renomeou a atividade para "${titulo}"` });
      sets.titulo = titulo;
    }
  }

  if (body.status !== undefined && body.status !== atual.status) {
    if (typeof body.status !== "string" || !STATUS_KEYS.includes(body.status)) return falha("Status inválido.");
    mudancas.push({
      campo: "status",
      de: atual.status,
      para: body.status,
      texto: `Alterou status de ${statusLabel(atual.status)} para ${statusLabel(body.status)}`,
    });
    sets.status = body.status;
  }

  if (body.prioridade !== undefined && body.prioridade !== atual.prioridade) {
    if (typeof body.prioridade !== "string" || !(PRIORIDADES as readonly string[]).includes(body.prioridade)) {
      return falha("Prioridade inválida.");
    }
    mudancas.push({
      campo: "prioridade",
      de: atual.prioridade,
      para: body.prioridade,
      texto: `Alterou prioridade de ${atual.prioridade} para ${body.prioridade}`,
    });
    sets.prioridade = body.prioridade;
  }

  // Texto livre: o log guarda o par anterior/novo, então o que estava escrito antes nunca se
  // perde ao ser sobrescrito.
  const TEXTOS = [
    { chave: "situacao", coluna: "situacao", atual: atual.situacao, rotulo: "a situação", max: LIMITES.situacao },
    {
      chave: "proximoPasso", coluna: "proximo_passo", atual: atual.proximo_passo,
      rotulo: "o próximo passo", max: LIMITES.proximoPassoAtividade,
    },
  ] as const;
  for (const t of TEXTOS) {
    if (body[t.chave] === undefined) continue;
    const valor = texto(body[t.chave], t.max);
    if (valor === t.atual) continue;
    mudancas.push({
      campo: t.coluna,
      de: t.atual || "—",
      para: valor || "—",
      texto: `Alterou ${t.rotulo} de "${atual.titulo}"`,
    });
    sets[t.coluna] = valor;
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
      texto: `Alterou responsável de ${atual.responsavel ?? "—"} para ${nomeNovo}`,
    });
    sets.responsavel_user_id = novoId;
  }

  // Prazo. Dava para definir na criação e nunca mais corrigir até ganhar este bloco.
  if (body.prazo !== undefined) {
    const novo = dataOuNula(body.prazo);
    const antigo = isoDoBanco(atual.prazo);
    if (novo !== antigo) {
      mudancas.push({
        campo: "prazo",
        de: antigo ?? "—",
        para: novo ?? "—",
        texto: `Alterou o prazo de "${atual.titulo}" de ${ddmm(antigo)} para ${ddmm(novo)}`,
      });
      sets.prazo = novo;
    }
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
        texto: `Alterou a data do próximo passo de "${atual.titulo}"`,
      });
      sets.proximo_passo_em = nova;
    }
  }

  const areaFinal = (sets.area as string | undefined) ?? atual.area;

  /**
   * Produto e área andam juntos: o produto pertence a uma vertical.
   *  · Produto informado — tem de existir na área FINAL, que pode ter mudado agora mesmo.
   *  · Produto NÃO informado, mas a área mudou — o produto antigo pode ter ficado órfão; cai,
   *    com registro, senão o card ficaria classificado com produto de outra vertical.
   */
  if (body.produtoId !== undefined) {
    let novo: string | null = null;
    if (body.produtoId) {
      novo = produtoNaArea(fatos, body.produtoId, areaFinal);
      if (!novo) return falha("Produto inválido para esta área.");
    }
    if (novo !== atual.produto_id) {
      mudancas.push({
        campo: "produto",
        de: atual.produto_id ?? "—",
        para: novo ?? "—",
        texto: `Alterou o produto de "${atual.titulo}"`,
      });
      sets.produto_id = novo;
    }
  } else if (areaFinal !== atual.area && atual.produto_id && !produtoNaArea(fatos, atual.produto_id, areaFinal)) {
    mudancas.push({
      campo: "produto",
      de: atual.produto_id,
      para: "—",
      texto: `Removeu o produto de "${atual.titulo}" — não pertence a ${perm.labelArea(areaFinal)}`,
    });
    sets.produto_id = null;
  }

  return { ok: true, sets, mudancas, areaFinal };
}
