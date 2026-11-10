import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
