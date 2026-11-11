// Cliente da API. Todo erro chega como { error } e vira Error com a mensagem em pt-BR;
// 401 devolve a pessoa para o login.


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
  /** Módulo classificado, do mesmo produto da atividade. */
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
  propostaUrl: string;
  /** Organização a que esta oportunidade pertence. */
  clienteId: number | null;
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
  /** O papel verdadeiro. Difere de `papel` só quando um admin está no modo "ver como". */
  papelReal: string;
  iniciais: string;
  avatarUrl: string | null;
  /**
   * O que a pessoa deixou escolhido, ausente até ela escolher. Tudo string: é um JSONB de
   * texto para texto, e um tipo misto aqui convidaria a um `=== true` falhando contra
   * "true". `responsaveis` são as chaves do filtro separadas por vírgula; vazio é "todos".
   */
  preferencias: { tema?: string; area?: string; responsaveis?: string; densidade?: string; menu?: string; recolhidasComercial?: string; recolhidasOperacoes?: string };
};

export type AreaCadastro = { id: string; label: string; short: string; cor: string };

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
  /** Se o servidor MCP está ligado (MCP_HABILITADO=1) neste ambiente. */
  mcpHabilitado: boolean;
  activities: Activity[];
  deals: Deal[];
  logs: LogEntry[];
  pessoas: Pessoa[];
  /** Cadastro de organizações visível: a oportunidade escolhe a conta daqui. */
  organizacoes: OrganizacaoResumo[];
};

export type OrganizacaoResumo = { id: number; ref: string; nome: string; chaves: string[] };

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
  /** Organização do cadastro; `null` = nome novo, o servidor cadastra. */
  clienteId?: number | null;
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
  propostaUrl: string;
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
  /** Forecast de receita (só admin). */
  receitas: () => req<{ contratos: import("@/lib/forecast").Contrato[] }>("/api/receita"),
  criarReceita: (corpo: Record<string, unknown>) =>
    req<{ ok: boolean; ref: string }>("/api/receita", { method: "POST", body: JSON.stringify(corpo) }),
  alterarReceita: (id: number, corpo: Record<string, unknown>) =>
    req<{ ok: boolean }>(`/api/receita/${id}`, { method: "PATCH", body: JSON.stringify(corpo) }),
  excluirReceita: (id: number) => req<{ ok: boolean }>(`/api/receita/${id}`, { method: "DELETE" }),
  /** Organizações: lista para todos (recortada por produto); cadastrar, mesclar e excluir, só admin. */
  clientes: () => req<{ clientes: import("@/lib/clientes-db").ClienteLido[] }>("/api/clientes"),
  historicoCliente: (id: number) => req<{ eventos: import("@/lib/clientes-db").EventoCliente[] }>(`/api/clientes/${id}`),
  criarCliente: (corpo: Record<string, unknown>) =>
    req<{ ok: boolean; id: number; ref: string }>("/api/clientes", { method: "POST", body: JSON.stringify(corpo) }),
  alterarCliente: (id: number, corpo: Record<string, unknown>) =>
    req<{ ok: boolean; mudancas: number }>(`/api/clientes/${id}`, { method: "PATCH", body: JSON.stringify(corpo) }),
  excluirCliente: (id: number) => req<{ ok: boolean }>(`/api/clientes/${id}`, { method: "DELETE" }),
  mesclarCliente: (id: number, em: number) =>
    req<{ ok: boolean; ref: string }>(`/api/clientes/${id}/mesclar`, { method: "POST", body: JSON.stringify({ em }) }),
  /** Avisa que a pessoa está usando a tela; o servidor decide se é visita nova (30 min parado). */
  visita: (secao: string) => req<{ ok: boolean; novaVisita: boolean }>("/api/me/visita", { method: "POST", body: JSON.stringify({ secao }) }),
  /** Admin: passa a ver (e agir) como outro papel; `null` volta ao normal. */
  verComo: (papel: string | null) => req<{ ok: boolean; verComo: string | null }>("/api/me/ver-como", { method: "POST", body: JSON.stringify({ papel }) }),
  /** Faturamento (só admin). */
  faturas: () => req<{ faturas: import("@/lib/faturamento").Fatura[] }>("/api/faturamento"),
  emitirFatura: (corpo: Record<string, unknown>) =>
    req<{ ok: boolean; ref: string }>("/api/faturamento", { method: "POST", body: JSON.stringify(corpo) }),
  acaoFatura: (id: number, corpo: Record<string, unknown>) =>
    req<{ ok: boolean }>(`/api/faturamento/${id}`, { method: "PATCH", body: JSON.stringify(corpo) }),
  /** Funding AWS (só admin). */
  funding: () =>
    req<{
      pastas: import("@/lib/funding").Pasta[];
      produtos: { id: string; label: string; area: string }[];
      programas: import("@/lib/funding").Programa[];
      arquetipos: import("@/lib/funding").Arquetipo[];
      estimativas: import("@/lib/funding").Estimativa[];
    }>("/api/funding"),
  fundingCriar: (tipo: string, corpo: Record<string, unknown>) =>
    req<{ ok: boolean; id: number | string; ref?: string }>(`/api/funding/${tipo}`, { method: "POST", body: JSON.stringify(corpo) }),
  fundingAlterar: (tipo: string, id: number | string, corpo: Record<string, unknown>) =>
    req<{ ok: boolean }>(`/api/funding/${tipo}/${encodeURIComponent(String(id))}`, { method: "PATCH", body: JSON.stringify(corpo) }),
  fundingExcluir: (tipo: string, id: number | string) =>
    req<{ ok: boolean }>(`/api/funding/${tipo}/${encodeURIComponent(String(id))}`, { method: "DELETE" }),
  auditoria: () => req<{ limite: number; logs: (LogEntry & { autorId: number | null })[] }>("/api/logs"),

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

  /** Define o nível de várias pessoas em vários produtos, ou copia o acesso de uma pessoa. */
  definirPermissoes: (
    dados: { usuarios: number[] } & ({ permissoes: Record<string, "edit" | "view" | null> } | { copiarDe: number })
  ) => req<{ ok: boolean; mudancas: number; ignorados: number }>("/api/users/permissoes", { method: "POST", body: JSON.stringify(dados) }),

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

  salvarPreferencias: (patch: { tema?: string; area?: string; responsaveis?: string; densidade?: string; menu?: string; recolhidasComercial?: string; recolhidasOperacoes?: string }) =>
    req<{ ok: boolean }>("/api/me/preferencias", { method: "PATCH", body: JSON.stringify(patch) }),

  sair: () => req<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
};
