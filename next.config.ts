import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O sistema mudou de endereço (nov/2026): tudo o que chega em tasks.liff.tech vai para o
  // mesmo caminho em go.liff.tech. Permanente (308), que preserva o método. Sessão e conexões
  // do Claude não atravessam: o cookie é por domínio e o token do MCP fica preso ao endereço
  // em que foi autorizado, então a pessoa entra de novo e reconecta no endereço novo.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "tasks.liff.tech" }],
        destination: "https://go.liff.tech/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // Tela de consentimento do OAuth. Emoldurada num site alheio, ela vira isca para um
        // clique em "Autorizar" que a pessoa não quis dar (clickjacking). E não pode ir para
        // cache: a query carrega o code_challenge e o state de um pedido específico.
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
