import type { Metadata } from "next";
import { Rethink_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// As duas famílias do sistema, nos papéis fixos da marca: Rethink Sans para leitura humana,
// JetBrains Mono para linguagem técnica.
const rethink = Rethink_Sans({
  variable: "--font-rethink",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "LIFF Ops — sistema de gestão de atividades",
  description: "Atividade comercial, execução operacional, cadastros e administração da LIFF.",
  robots: { index: false, follow: false },
};

// Aplica o tema antes do primeiro paint, senão a página pisca no fundo errado.
const ANTI_FLASH = `(()=>{let t;try{t=localStorage.getItem("liff-ops-theme")}catch(e){}
if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}
document.documentElement.dataset.theme=t})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${rethink.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
