"use client";

// "via Claude": a escrita foi feita por uma conexão externa (MCP) em nome do autor. Mono e
// na cor de destaque, para não se confundir com o nome da pessoa — quem gravou foi o
// aplicativo, com a permissão dela.

import { C, eyebrow } from "./tokens";

export default function ViaConexao({ nome }: { nome: string }) {
  return (
    <span
      title={`Gravado por ${nome}, numa conexão autorizada por esta pessoa`}
      style={{ ...eyebrow(10, C.accent, "0.08em"), marginLeft: 6, whiteSpace: "nowrap" }}
    >
      via {nome}
    </span>
  );
}
