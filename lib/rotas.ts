// Tradução entre a URL e o estado da tela.
//
// Fica fora dos componentes porque as duas pontas precisam concordar: o servidor usa para
// recusar caminho inexistente antes de renderizar, e o cliente para montar os links e ler o
// que veio na barra de endereço.
//
// O identificador na URL é a REFERÊNCIA (D-01, A-101), não o id numérico. É o que já aparece
// no drawer e na auditoria, é estável, e um link colado no WhatsApp fica legível.

import { NAV } from "./domain";

/** Seções que viram caminho. `overview` é a raiz e não aparece na URL. */
export const VIEWS = NAV.map((n) => n.key) as readonly string[];

/** Abas de Cadastros que viram segmento próprio. */
export const CAD_TABS_URL = ["pessoas", "produtos", "areas"];

/** Prefixo da referência aceito em cada seção. Fora daqui, a seção não abre card. */
const REF_DA_VIEW: Record<string, RegExp> = {
  comercial: /^D-\d+$/,
  operacoes: /^A-\d+$/,
};

export type Rota = {
  view: string;
  /** Aba de Cadastros, quando a seção é `cadastros`. */
  tab?: string;
  /** Referência do card aberto, em caixa alta. */
  ref?: string;
};

/**
 * Lê os segmentos da URL. Devolve `null` para caminho que não existe — quem chama decide se
 * isso vira 404 (servidor) ou volta para a visão geral (cliente).
 */
export function lerRota(segmentos: string[] | undefined): Rota | null {
  const partes = (segmentos ?? []).filter(Boolean);
  if (!partes.length) return { view: "overview" };

  const [primeiro, segundo, ...resto] = partes;
  if (resto.length) return null;

  const view = primeiro.toLowerCase();
  if (!VIEWS.includes(view)) return null;
  // `/overview` existe como caminho, mas a forma canônica da visão geral é a raiz.
  if (view === "overview") return segundo ? null : { view: "overview" };

  if (!segundo) return { view };

  if (view === "cadastros") {
    const tab = segundo.toLowerCase();
    return CAD_TABS_URL.includes(tab) ? { view, tab } : null;
  }

  const formato = REF_DA_VIEW[view];
  if (!formato) return null;
  const ref = segundo.toUpperCase();
  return formato.test(ref) ? { view, ref } : null;
}

/** Caminho canônico de um estado de tela. É o que vai para a barra de endereço e para o link. */
export function caminhoDe({ view, tab, ref }: Rota): string {
  if (view === "overview") return "/";
  if (view === "cadastros" && tab) return `/cadastros/${tab}`;
  if (ref && REF_DA_VIEW[view]) return `/${view}/${ref}`;
  return `/${view}`;
}

/**
 * Caminho interno seguro para voltar depois do consentimento.
 *
 * `startsWith("/")` sozinho NÃO basta: `//evil.com` também começa com barra, e é uma URL
 * protocolo-relativa — `new URL("//evil.com", origin)` resolve para outro domínio. Seria um
 * redirecionamento aberto, exatamente o tipo de coisa que se usa para phishing em cima de um
 * domínio confiável.
 */
export function caminhoInternoSeguro(bruto: string | null | undefined, padrao = "/comercial"): string {
  const v = (bruto ?? "").trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return padrao;
  return v;
}
