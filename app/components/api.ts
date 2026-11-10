// Cliente da API. Todo erro chega como { error } e vira Error com a mensagem em pt-BR;
// 401 devolve a pessoa para o login.

import type { LinhaImportada } from "@/lib/planilha";

export type Activity = {
  id: number;
  ref: string;
  titulo: string;
  area: string;
  status: string;
  prioridade: string;
  prazo: string | null;
  responsavelId: number | null;
  responsavel: string;
  /** Onde a atividade está agora. O que já foi vive no audit_log. */
  situacao: string;
  proximoPasso: string;
  /** Produto classificado, da mesma vertical da atividade. */
  produtoId: string | null;
  /** Quando o próximo passo acontece. Nulo = sem data; o cronograma assume o fim da semana. */
  proximoPassoEm: string | null;
  podeEditar: boolean;
  /** A oportunidade comercial ligada — só quando quem olha enxerga a área dela. */
  oportunidadeId: number | null;
  oportunidadeRef: string | null;
  oportunidadeConta: string | null;
  /** Há vínculo, com uma oportunidade de área que quem olha não enxerga. */
  oportunidadeOculta: boolean;
};

export type Deal = {
  id: number;
  ref: string;
  conta: string;
  area: string;
  estagio: string;
  valorCentavos: number;
  responsavel: string;
  responsavelId: number | null;
  responsavelTexto: string;
  proximoPasso: string;
  /** Onde a conversa está agora. O histórico do que já foi vive no audit_log. */
  situacao: string;
  /** Quando a situação foi escrita (o "19/OUT" do card). */
  situacaoEm: string | null;
  /** Contato / sponsor: quem decide no cliente. */
  contato: string;
  /** Quando o próximo passo acontece. Nulo = sem data; o cronograma assume o fim da semana. */
  proximoPassoEm: string | null;
  /** Oportunidade já registrada no ACE do AWS Partner Central. */
  aceAws: boolean;
  /** ISO da última mexida no card — ou da criação, se nunca foi editado. */
  atualizadoEm: string;
  podeEditar: boolean;
  origemId: string | null;
  /** Quem abre a porta no cliente (parceiro, indicação). */
  ponte: string;
  contatoOperacional: string;
  dor: string;
  erp: string;
  /** Último contato com o cliente — não a última edição do card. */
  ultimaInteracao: string | null;
  blocker: string;
  blockerTipo: string | null;
  /** Quem, do lado da LIFF, resolve o blocker. */
  blockerDonoId: number | null;
  blockerDono: string | null;
  motivoPerda: string | null;
  motivoPerdaDetalhe: string;
  notas: string;
  /** Ids dos produtos da área marcados como módulos de interesse. */
  modulos: string[];
};

export type Origem = { id: string; label: string; ativo: boolean };

export type ProdutoCadastro = { id: string; label: string; area: string; ativo: boolean };

/** Uma oportunidade da planilha como vai para o servidor — ver `LinhaImportada`. */
export type LinhaImport = LinhaImportada;

export type LinhaImportAtividade = {
  titulo: string;
  status: string;
  situacao: string;
  proximoPasso: string;
};

export type LogEntry = {
  id: number;
  criadoEm: string;
  autor: string;
  /** Nome do aplicativo quando a escrita veio de uma conexão externa (MCP); nulo = interface. */
  via: string | null;
  area: string | null;
  entidade: string;
  texto: string;
};

/** O que acontece com os registros ligados a um cadastro que vai ser excluído. */
export type DestinoExclusao = { acao: "migrar"; para: string | number } | { acao: "excluir" } | { acao: "desvincular" };

export type Pessoa = {
  id: number;
  nome: string;
  email: string;
  papel: string;
  iniciais: string;
  ativo: boolean;
  perms: Record<string, string>;
};

export type Me = {
  id: number;
  nome: string;
  email: string;
  papel: string;
  iniciais: string;
  avatarUrl: string | null;
  /**
   * O que a pessoa deixou escolhido, ausente até ela escolher. Tudo string: é um JSONB de
   * texto para texto, e um tipo misto aqui convidaria a um `=== true` falhando contra
   * "true". `responsaveis` são as chaves do filtro separadas por vírgula; vazio é "todos".
   */
  preferencias: { tema?: string; area?: string; responsaveis?: string; densidade?: string; menu?: string };
};

export type AreaCadastro = { id: string; label: string; short: string; cor: string; planilhaUrl: string | null };

export type State = {
  me: Me;
  perms: Record<string, string>;
  areasVisiveis: string[];
  areas: AreaCadastro[];
  produtos: ProdutoCadastro[];
  origens: Origem[];
  isAdmin: boolean;
  /** Domínio aceito no login — vem do servidor, alimenta o cadastro de pessoa. */
  dominioLogin: string;
  /** Se esta pessoa já autorizou a leitura de planilhas do Drive. */
  sheetsConectado: boolean;
  /** Se o servidor MCP está ligado (MCP_HABILITADO=1) neste ambiente. */
  mcpHabilitado: boolean;
  activities: Activity[];
  deals: Deal[];
  logs: LogEntry[];
  pessoas: Pessoa[];
};

export type NovaAtividade = {
  titulo: string;
  area: string;
  status: string;
  prioridade: string;
  prazo: string | null;
  responsavelId: number | null;
  situacao: string;
  proximoPasso: string;
  produtoId: string | null;
  proximoPassoEm: string | null;
};

export type NovaOportunidade = {
  conta: string;
  area: string;
  estagio: string;
  valorReais: number;
  proximoPasso: string;
  responsavelId: number | null;
  situacao: string;
  contato: string;
  responsavelTexto: string;
  proximoPassoEm: string | null;
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

async function req<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers ?? {});
  if (opts.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Não autenticado.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Ocorreu um erro.");
  return data as T;
}

export const api = {
  estado: () => req<State>("/api/state"),
  /** Auditoria completa (até 10.000 linhas), fora do estado para não pesar as outras telas. */
  auditoria: () => req<{ limite: number; logs: (LogEntry & { autorId: number | null })[] }>("/api/logs"),

  criarAtividade: (dados: NovaAtividade) =>
    req<{ ok: boolean; ref: string }>("/api/activities", { method: "POST", body: JSON.stringify(dados) }),

  criarOportunidade: (dados: NovaOportunidade) =>
    req<{ ok: boolean; ref: string }>("/api/deals", { method: "POST", body: JSON.stringify(dados) }),

  alterarArea: (id: string, patch: { cor?: string; label?: string; short?: string; planilhaUrl?: string | null }) =>
    req<{ ok: boolean }>(`/api/areas/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  criarArea: (dados: { label: string; short: string; cor: string }) =>
    req<{ ok: boolean; id: string }>("/api/areas", { method: "POST", body: JSON.stringify(dados) }),

  excluirArea: (id: string) => req<{ ok: boolean }>(`/api/areas/${id}`, { method: "DELETE" }),

  alterarAtividade: (
    id: number,
    patch: {
      titulo?: string;
      status?: string;
      responsavelId?: number | null;
      prioridade?: string;
      area?: string;
      prazo?: string | null;
      situacao?: string;
      proximoPasso?: string;
      produtoId?: string | null;
      proximoPassoEm?: string | null;
      /** Id da oportunidade comercial ligada; `null` desliga. */
      oportunidade?: number | null;
    }
  ) => req<{ ok: boolean }>(`/api/activities/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  /** Movimento de uma casa pelas setas do card — o servidor calcula o destino. */
  moverOportunidade: (id: number, direcao: 1 | -1) =>
    req<{ ok: boolean }>(`/api/deals/${id}`, { method: "PATCH", body: JSON.stringify({ direcao }) }),

  alterarOportunidade: (id: number, patch: Partial<NovaOportunidade>) =>
    req<{ ok: boolean }>(`/api/deals/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  excluirOportunidade: (id: number) => req<{ ok: boolean }>(`/api/deals/${id}`, { method: "DELETE" }),
  excluirAtividade: (id: number) => req<{ ok: boolean }>(`/api/activities/${id}`, { method: "DELETE" }),

  ciclarPermissao: (userId: number, area: string) =>
    req<{ ok: boolean; nivel: string | null }>(`/api/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ ciclarArea: area }),
    }),

  definirAtivo: (userId: number, ativo: boolean) =>
    req<{ ok: boolean }>(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify({ ativo }) }),

  criarPessoa: (dados: { nome: string; email: string; papel: string }) =>
    req<{ ok: boolean; id: number }>("/api/users", { method: "POST", body: JSON.stringify(dados) }),

  criarOrigem: (dados: { label: string }) =>
    req<{ ok: boolean; id: string }>("/api/origens", { method: "POST", body: JSON.stringify(dados) }),

  alterarOrigem: (id: string, patch: { label?: string; ativo?: boolean }) =>
    req<{ ok: boolean }>(`/api/origens/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) }),

  criarProduto: (dados: { label: string; area: string }) =>
    req<{ ok: boolean; id: string }>("/api/produtos", { method: "POST", body: JSON.stringify(dados) }),

  alterarProduto: (id: string, patch: { label?: string; area?: string; ativo?: boolean }) =>
    req<{ ok: boolean }>(`/api/produtos/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  usosDoProduto: (id: string) =>
    req<{
      atividades: { ref: string; titulo: string }[];
      oportunidades: { ref: string; conta: string; modulos: number }[];
      destinos: { id: string; label: string }[];
    }>(`/api/produtos/${encodeURIComponent(id)}/usos`),

  /** Sem `destino` só passa quando não há nada ligado ao produto. */
  excluirProduto: (id: string, destino?: DestinoExclusao) =>
    req<{ ok: boolean; ligados: number }>(`/api/produtos/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: destino ? JSON.stringify(destino) : undefined,
    }),

  alterarPessoa: (id: number, patch: { nome?: string; email?: string; papel?: string }) =>
    req<{ ok: boolean }>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  usosDaPessoa: (id: number) =>
    req<{
      atividades: { ref: string; titulo: string }[];
      oportunidades: { ref: string; conta: string }[];
      blockers: { ref: string; conta: string }[];
      conexoes: number;
      destinos: { id: number; nome: string }[];
    }>(`/api/users/${id}/usos`),

  excluirPessoa: (id: number, destino?: DestinoExclusao) =>
    req<{ ok: boolean; ligados: number }>(`/api/users/${id}`, {
      method: "DELETE",
      body: destino ? JSON.stringify(destino) : undefined,
    }),

  importarOportunidades: (area: string, linhas: LinhaImport[]) =>
    req<{
      ok: boolean;
      criadas: number;
      atualizadas: number;
      ignoradas: { linha: number; motivo: string }[];
      avisos: { linha: number; aviso: string }[];
    }>(
      "/api/import/deals",
      { method: "POST", body: JSON.stringify({ area, linhas }) }
    ),

  importarAtividades: (area: string, linhas: LinhaImportAtividade[]) =>
    req<{ ok: boolean; criadas: number; atualizadas: number; ignoradas: { linha: number; motivo: string }[] }>(
      "/api/import/activities",
      { method: "POST", body: JSON.stringify({ area, linhas }) }
    ),

  salvarPreferencias: (patch: { tema?: string; area?: string; responsaveis?: string; densidade?: string }) =>
    req<{ ok: boolean }>("/api/me/preferencias", { method: "PATCH", body: JSON.stringify(patch) }),

  /** Prévia da planilha do Drive. 428 = falta conectar a conta Google. */
  previaPlanilha: (area: string) =>
    req<{ ok: boolean; abas: unknown[] }>(`/api/sheets/preview?area=${encodeURIComponent(area)}`),

  desconectarSheets: () => req<{ ok: boolean }>("/api/sheets/conectar", { method: "DELETE" }),

  sair: () => req<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
};
