"use client";

// Transforma o cadastro de áreas nas variáveis CSS que o resto da interface já consome
// (`--liff-app-area-<id>`). Fazendo assim, mudar a cor de um produto no cadastro repinta
// tudo — chip, card, barra, tabela, auditoria — sem que nenhum componente saiba disso.
//
// São duas variáveis por produto:
//   --liff-app-area-<id>      a cor do cadastro, sem mexer. Vale para tudo que é MARCA de
//                             cor: bolinha, faixa do card, barra de gráfico. É a mesma nos
//                             dois temas, para o produto ter a cor que foi escolhida.
//   --liff-app-area-<id>-ink  a mesma cor para TEXTO. No claro é escurecida com Obsidiana,
//                             porque uma cor viva não segura leitura sobre Floral White.
// Antes havia uma só, escurecida no claro para servir ao texto — e as marcas pagavam junto:
// todas ficavam acinzentadas e parecidas entre si.

import type { AreaCadastro } from "./api";

/** O servidor já valida na escrita; aqui é a segunda barreira, porque isto vira CSS. */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function CoresDasAreas({ areas }: { areas: AreaCadastro[] }) {
  const validas = areas.filter((a) => HEX_RE.test(a.cor) && /^[a-z0-9-]+$/.test(a.id));
  if (!validas.length) return null;

  const css = validas
    .map(
      (a) =>
        `:root,:root[data-theme="light"]{--liff-app-area-${a.id}:${a.cor};--liff-app-area-${a.id}-ink:${a.cor};}` +
        `:root[data-theme="light"]{--liff-app-area-${a.id}-ink:color-mix(in srgb, ${a.cor} 62%, var(--liff-obsidiana));}`
    )
    .join("\n");

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
