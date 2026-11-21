import type { Metadata } from "next";
import "./globals.css";

// As duas famílias (Rethink Sans para leitura humana, Roboto Mono para linguagem
// técnica) vêm do `fonts.css` do design system, importado em globals.css — não de
// `next/font`. Ver o comentário lá: o next/font baixa os woff2 durante o build e um 404
// do fonts.gstatic.com derrubava o deploy inteiro.

export const metadata: Metadata = {
  title: "Colméia — Gestão Organizacional",
  description: "Gestão organizacional: pipeline comercial, organizações, operações, receita e administração.",
  robots: { index: false, follow: false },
};

// Aplica o tema antes do primeiro paint, senão a página pisca no fundo errado.
// O misto é o claro com o menu lateral em Obsidiana (data-aside), ver tokens.ts.
const ANTI_FLASH = `(()=>{let t;try{t=localStorage.getItem("colmeia-theme")}catch(e){}
if(t!=="light"&&t!=="dark"&&t!=="misto"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}
const h=document.documentElement;h.dataset.theme=t==="dark"?"dark":"light";if(t==="misto")h.dataset.aside="obsidiana"})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
