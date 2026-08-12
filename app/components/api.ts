// Cliente da API. Todo erro chega como { error } e vira Error com a mensagem em pt-BR;
// 401 devolve a pessoa para o login.

export type Activity = {
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

export type Deal = {
  id: number;
  ref: string;
  conta: string;
  escopo: string;
  area: string;
  estagio: string;
  valorCentavos: number;
  responsavel: string;
  responsavelId: number | null;
  responsavelTexto: string;
  proximoPasso: string;
  /** Onde a conversa está agora. O histórico do que já foi vive no audit_log. */
  situacao: string;
  contato: string;
  produtoId: string | null;
  /** Paralelo ao estágio: "não é o momento" não é uma casa do funil. */
  pausado: boolean;
  podeEditar: boolean;
};

export type ProdutoCadastro = { id: string; label: string; area: string; ativo: boolean };

export type LinhaImport = {
  conta: string;
  escopo: string;
  estagio: string;
  situacao: string;
  proximoPasso: string;
  contato: string;
  responsavelTexto: string;
  produtoId: string | null;
  pausado: boolean;
};

export type LogEntry = {
  id: number;
  criadoEm: string;
  autor: string;
  area: string | null;
  entidade: string;
  texto: string;
};

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
};

export type AreaCadastro = { id: string; label: string; short: string; cor: string };

export type State = {
  me: Me;
  perms: Record<string, string>;
  areasVisiveis: string[];
  areas: AreaCadastro[];
  produtos: ProdutoCadastro[];
  isAdmin: boolean;
  activities: Activity[];
  deals: Deal[];
  logs: LogEntry[];
  pessoas: Pessoa[];
};

export type NovaAtividade = {
  titulo: string;
  area: string;
  tipo: string;
  status: string;
  prioridade: string;
  prazo: string | null;
  responsavelId: number | null;
};

export type NovaOportunidade = {
  conta: string;
  escopo: string;
  area: string;
  estagio: string;
  valorReais: number;
  proximoPasso: string;
  responsavelId: number | null;
  situacao: string;
  contato: string;
  responsavelTexto: string;
  produtoId: string | null;
  pausado: boolean;
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

  criarAtividade: (dados: NovaAtividade) =>
    req<{ ok: boolean; ref: string }>("/api/activities", { method: "POST", body: JSON.stringify(dados) }),

  criarOportunidade: (dados: NovaOportunidade) =>
    req<{ ok: boolean; ref: string }>("/api/deals", { method: "POST", body: JSON.stringify(dados) }),

  alterarArea: (id: string, patch: { cor?: string; label?: string; short?: string }) =>
    req<{ ok: boolean }>(`/api/areas/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  criarArea: (dados: { label: string; short: string; cor: string }) =>
    req<{ ok: boolean; id: string }>("/api/areas", { method: "POST", body: JSON.stringify(dados) }),

  excluirArea: (id: string) => req<{ ok: boolean }>(`/api/areas/${id}`, { method: "DELETE" }),

  alterarAtividade: (
    id: number,
    patch: { titulo?: string; status?: string; responsavelId?: number | null; prioridade?: string; area?: string }
  ) => req<{ ok: boolean }>(`/api/activities/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  /** Movimento de uma casa pelas setas do card — o servidor calcula o destino. */
  moverOportunidade: (id: number, direcao: 1 | -1) =>
    req<{ ok: boolean }>(`/api/deals/${id}`, { method: "PATCH", body: JSON.stringify({ direcao }) }),

  alterarOportunidade: (id: number, patch: Partial<NovaOportunidade>) =>
    req<{ ok: boolean }>(`/api/deals/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  ciclarPermissao: (userId: number, area: string) =>
    req<{ ok: boolean; nivel: string | null }>(`/api/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ ciclarArea: area }),
    }),

  definirAtivo: (userId: number, ativo: boolean) =>
    req<{ ok: boolean }>(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify({ ativo }) }),

  criarProduto: (dados: { label: string; area: string }) =>
    req<{ ok: boolean; id: string }>("/api/produtos", { method: "POST", body: JSON.stringify(dados) }),

  alterarProduto: (id: string, patch: { label?: string; area?: string; ativo?: boolean }) =>
    req<{ ok: boolean }>(`/api/produtos/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  excluirProduto: (id: string) => req<{ ok: boolean }>(`/api/produtos/${id}`, { method: "DELETE" }),

  importarOportunidades: (area: string, linhas: LinhaImport[]) =>
    req<{ ok: boolean; criadas: number; atualizadas: number; ignoradas: { linha: number; motivo: string }[] }>(
      "/api/import/deals",
      { method: "POST", body: JSON.stringify({ area, linhas }) }
    ),

  sair: () => req<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
};
