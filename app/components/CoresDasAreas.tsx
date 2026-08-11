"use client";

// Transforma o cadastro de áreas nas variáveis CSS que o resto da interface já consome
// (`--liff-app-area-<id>`). Fazendo assim, mudar a cor de uma vertical no cadastro repinta
// tudo — chip, card, barra, tabela, auditoria — sem que nenhum componente saiba disso.
//
// E é o que preserva o comportamento de tema: no claro a cor escolhida é escurecida por
// mistura com Obsidiana, exatamente como os tons Mid do kit precisavam ser para segurar
// sobre Floral White.

import type { AreaCadastro } from "./api";

/** O servidor já valida na escrita; aqui é a segunda barreira, porque isto vira CSS. */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function CoresDasAreas({ areas }: { areas: AreaCadastro[] }) {
  const validas = areas.filter((a) => HEX_RE.test(a.cor) && /^[a-z0-9-]+$/.test(a.id));
  if (!validas.length) return null;

  const css = validas
    .map(
      (a) =>
        `:root{--liff-app-area-${a.id}:${a.cor};}` +
        `:root[data-theme="light"]{--liff-app-area-${a.id}:color-mix(in srgb, ${a.cor} 74%, var(--liff-obsidiana));}`
    )
    .join("\n");

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
