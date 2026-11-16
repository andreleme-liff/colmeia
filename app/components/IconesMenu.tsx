// Ícones do menu lateral e dos controles da lateral. Traço de 1.5 em grade de 24, na cor do
// texto (`currentColor`): o item ativo e o hover pintam o ícone junto com o rótulo.

import type { ReactNode } from "react";

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none" }}
    >
      {children}
    </svg>
  );
}

const DESENHOS: Record<string, ReactNode> = {
  // Visão geral: painel em quatro blocos.
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </>
  ),
  // Comercial: funil.
  comercial: <path d="M3.5 4.5h17l-6.5 8v6l-4 2v-8l-6.5-8Z" />,
  // Operações: quadro em colunas.
  operacoes: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M9.5 3.5v17M15 3.5v17" />
      <path d="M5.5 7h2M11.5 7h2M17 7h1.5M5.5 10h2M11.5 10h2" />
    </>
  ),
  // Cronograma: calendário.
  cronograma: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
    </>
  ),
  // Auditoria: relógio com seta de volta (histórico).
  auditoria: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 4v4h4" />
      <path d="M12 8v4.5l3 2" />
    </>
  ),
  // Conexões: dois elos.
  conexoes: (
    <>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </>
  ),
  // Receita: barras crescendo com a linha de tendência.
  receita: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M6.5 20.5v-5M11 20.5v-8M15.5 20.5v-6M20 20.5V9" />
      <path d="M5 11l5-4.5 4 3 5.5-5.5" />
    </>
  ),
  // Clientes: prédio (a empresa do outro lado).
  clientes: (
    <>
      <path d="M4.5 20.5V5.5l8-2v17" />
      <path d="M12.5 9.5l7 2v9" />
      <path d="M3 20.5h18M7.5 8.5h2M7.5 12h2M7.5 15.5h2M15.5 14.5h1.5M15.5 17.5h1.5" />
    </>
  ),
  // Faturamento: documento com o cifrão.
  faturamento: (
    <>
      <path d="M6 3.5h9l3.5 3.5v13.5H6Z" />
      <path d="M15 3.5V7h3.5" />
      <path d="M12 10v7M14 11.3c-.4-.6-1.1-.9-2-.9-1.2 0-2 .6-2 1.4 0 1.9 4 1 4 2.9 0 .8-.9 1.5-2 1.5-.9 0-1.7-.4-2.1-1" />
    </>
  ),
  // Despesas: carteira (o que sai do caixa).
  despesas: (
    <>
      <path d="M4 7.5h14.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18Z" />
      <path d="M4 7.5V6a1.5 1.5 0 0 1 1.5-1.5H16v3" />
      <path d="M20 11.5h-3.5a2 2 0 0 0 0 4H20" />
    </>
  ),
  // Funding: nuvem com seta para cima (crédito entrando na conta).
  funding: (
    <>
      <path d="M7 18.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 9.6 4.5 4.5 0 0 0 7 18.5Z" />
      <path d="M12 16.5v-6M9.5 13l2.5-2.5 2.5 2.5" />
    </>
  ),
  // Cadastros: base de dados.
  cadastros: (
    <>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
      <path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13" />
      <path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
    </>
  ),
};

export function IconeMenu({ chave }: { chave: string }) {
  return <Svg>{DESENHOS[chave] ?? <circle cx="12" cy="12" r="3" />}</Svg>;
}

/** Recolher (seta para a esquerda contra a borda) ou expandir (para a direita). */
export function IconeRecolher({ recolhido }: { recolhido: boolean }) {
  return (
    <Svg size={16}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M9 3.5v17" />
      <path d={recolhido ? "M13 9.5l2.5 2.5-2.5 2.5" : "M16 9.5L13.5 12l2.5 2.5"} />
    </Svg>
  );
}

export function IconeSol() {
  return (
    <Svg size={16}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </Svg>
  );
}

export function IconeLua() {
  return (
    <Svg size={16}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </Svg>
  );
}

export function IconeSair() {
  return (
    <Svg size={16}>
      <path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4" />
      <path d="M10 16l-4-4 4-4M6 12h9" />
    </Svg>
  );
}
