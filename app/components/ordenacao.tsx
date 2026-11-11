"use client";

// Ordenação das tabelas pelo título da coluna, igual em todo o sistema.
//
// Um clique ordena crescente, o segundo decrescente, o terceiro devolve a ordem original da
// tabela (que quase sempre já diz alguma coisa: mais recente primeiro, alfabética…). Vazios
// vão sempre para o fim, nas duas direções: "—" não é o menor nem o maior valor.
//
// O estado mora em `useOrdem` (chamado no topo do componente, como todo hook); a ordenação em
// si é `aplicar`, que pode ser chamada depois dos retornos antecipados. Cada tabela diz, por
// coluna, qual valor comparar — o que aparece na célula costuma ser texto formatado, e ordenar
// "R$ 1.250,00" como texto daria errado.

import { useState, type CSSProperties, type ReactNode } from "react";

type Valor = string | number | boolean | null | undefined;
export type Ordem = { chave: string; dir: 1 | -1 } | null;

const vazio = (v: Valor) => v === null || v === undefined || v === "";

function comparar(a: Valor, b: Valor): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base", numeric: true });
}

export function useOrdem(inicial: Ordem = null) {
  const [ordem, setOrdem] = useState<Ordem>(inicial);

  const alternar = (chave: string) =>
    setOrdem((o) => (o?.chave !== chave ? { chave, dir: 1 } : o.dir === 1 ? { chave, dir: -1 } : null));

  /** Devolve os itens na ordem escolhida; sem escolha, na ordem em que vieram. */
  function aplicar<T>(itens: T[], valores: Record<string, (item: T) => Valor>): T[] {
    const de = ordem ? valores[ordem.chave] : undefined;
    if (!ordem || !de) return itens;
    return itens
      .map((item, i) => ({ item, i, v: de(item) }))
      .sort((x, y) => {
        const vx = vazio(x.v);
        const vy = vazio(y.v);
        if (vx || vy) return vx && vy ? x.i - y.i : vx ? 1 : -1;
        return comparar(x.v, y.v) * ordem.dir || x.i - y.i;
      })
      .map((x) => x.item);
  }

  /**
   * Célula de cabeçalho. Com `chave`, o título vira botão de ordenar; sem ela (coluna de ações,
   * de cor, de algo que não se compara) é só o texto, com o mesmo estilo.
   */
  function th(chave: string | null, rotulo: ReactNode, style?: CSSProperties, key?: string | number): ReactNode {
    const k = key ?? chave ?? String(rotulo);
    if (!chave) {
      return (
        <div key={k} role="columnheader" style={style}>
          {rotulo}
        </div>
      );
    }
    const ativa = ordem?.chave === chave ? ordem.dir : 0;
    return (
      <div key={k} role="columnheader" aria-sort={ativa === 1 ? "ascending" : ativa === -1 ? "descending" : "none"} style={style}>
        <button
          type="button"
          className="liff-th"
          data-ativa={ativa ? "1" : undefined}
          onClick={() => alternar(chave)}
          title={ativa === 1 ? "Ordenado crescente. Clique para inverter." : ativa === -1 ? "Ordenado decrescente. Clique para voltar à ordem original." : "Clique para ordenar"}
        >
          {rotulo}
          <span aria-hidden className="liff-th__seta">{ativa === 1 ? "▲" : ativa === -1 ? "▼" : "↕"}</span>
        </button>
      </div>
    );
  }

  return { ordem, alternar, aplicar, th };
}
