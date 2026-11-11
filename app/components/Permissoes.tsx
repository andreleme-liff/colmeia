"use client";

// Cadastros → Pessoas: quem acessa o quê, numa matriz de pessoas × produtos.
//
// A versão anterior abria uma pessoa por vez e cada célula alternava sem acesso → ver → editar
// a cada clique. Para uma pessoa serve; para um time, não: não dava para ver o conjunto, nem
// mudar várias pessoas de uma vez, e chegar em "editar" custava dois cliques e duas idas ao
// servidor por célula.
//
// Aqui o nível é escolhido direto (—, V, E), a linha tem um atalho para todos os produtos, e
// marcando pessoas aparece a barra de ação em lote: definir um nível num produto (ou em todos)
// ou copiar o acesso de outra pessoa. Tudo passa pela mesma rota, que audita célula a célula.

import { useMemo, useState, type CSSProperties } from "react";
import { Button, Switch } from "./ds";
import { C, MONO, dot, eyebrow } from "./tokens";
import type { Pessoa } from "./api";
import { porTexto } from "@/lib/domain";

type Nivel = "edit" | "view" | null;
type AreaCol = { id: string; label: string; short: string; color: string };

const NIVEIS: { nivel: Nivel; letra: string; nome: string; cor: string }[] = [
  { nivel: null, letra: "—", nome: "sem acesso", cor: "var(--liff-text-faint)" },
  { nivel: "view", letra: "V", nome: "ver", cor: "var(--liff-info)" },
  { nivel: "edit", letra: "E", nome: "editar", cor: "var(--liff-success)" },
];

const campo: CSSProperties = {
  background: C.cell,
  border: `1px solid ${C.line}`,
  borderRadius: 4,
  color: C.ink,
  fontFamily: "inherit",
  fontSize: 13,
  padding: "6px 8px",
  minWidth: 0,
};

/** Os três níveis lado a lado; o atual fica pintado. `atual === undefined` é "misturado". */
function Niveis({
  atual,
  travado,
  onEscolher,
  rotulo,
}: {
  atual: Nivel | undefined;
  travado?: boolean;
  onEscolher: (n: Nivel) => void;
  /** Para o leitor de tela e a dica: "Ana em Tax". */
  rotulo: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className="perm-niveis" data-travado={travado ? "1" : undefined}>
      {NIVEIS.map((n) => {
        const ativo = atual === n.nivel;
        return (
          <button
            key={n.letra}
            type="button"
            disabled={travado}
            aria-pressed={ativo}
            title={travado ? "Admin tem edição em tudo por definição do papel" : `${rotulo}: ${n.nome}`}
            onClick={() => !ativo && onEscolher(n.nivel)}
            style={
              ativo
                ? {
                    background: n.nivel ? `color-mix(in srgb, ${n.cor} 18%, transparent)` : C.panel2,
                    color: n.nivel ? (n.nivel === "edit" ? C.success : C.info) : C.dust,
                    fontWeight: 700,
                  }
                : undefined
            }
          >
            {n.letra}
          </button>
        );
      })}
    </div>
  );
}

export default function Permissoes({
  pessoas,
  areas,
  meuId,
  onDefinir,
  onCopiar,
  onAtivo,
  onEditar,
}: {
  pessoas: Pessoa[];
  areas: AreaCol[];
  meuId: number;
  /** Grava o mesmo mapa produto → nível para todas as pessoas dadas. */
  onDefinir: (usuarios: number[], permissoes: Record<string, Nivel>) => void;
  onCopiar: (usuarios: number[], de: number) => void;
  onAtivo: (userId: number, ativo: boolean) => void;
  onEditar?: (id: number) => void;
}) {
  const [busca, setBusca] = useState("");
  const [verInativos, setVerInativos] = useState(false);
  const [marcados, setMarcados] = useState<number[]>([]);
  const [loteArea, setLoteArea] = useState("*");
  const [copiarDe, setCopiarDe] = useState("");

  const inativos = pessoas.filter((p) => !p.ativo).length;
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pessoas
      .filter((p) => (verInativos || p.ativo) && (!q || `${p.nome} ${p.email} ${p.papel}`.toLowerCase().includes(q)))
      .sort((a, b) => porTexto(a.nome, b.nome));
  }, [pessoas, busca, verInativos]);

  // Admin não entra em seleção: a matriz não se aplica a ele.
  const marcaveis = visiveis.filter((p) => p.papel !== "admin").map((p) => p.id);
  // A seleção vale só para quem está na tela: filtrar e depois aplicar não pode alcançar
  // gente que a busca escondeu.
  const selecao = marcados.filter((id) => marcaveis.includes(id));
  const todosMarcados = marcaveis.length > 0 && selecao.length === marcaveis.length;

  const nivelDe = (p: Pessoa, area: string): Nivel =>
    p.papel === "admin" ? "edit" : p.perms[area] === "edit" ? "edit" : p.perms[area] === "view" ? "view" : null;
  /** O nível comum a todos os produtos da pessoa, ou `undefined` se varia. */
  const nivelGeral = (p: Pessoa): Nivel | undefined => {
    const ns = new Set(areas.map((a) => nivelDe(p, a.id)));
    return ns.size === 1 ? [...ns][0] : undefined;
  };
  const emTodos = (n: Nivel) => Object.fromEntries(areas.map((a) => [a.id, n]));

  const colunas = `34px minmax(190px, 1.4fr) 84px repeat(${areas.length}, 84px) 52px`;
  const largura = 34 + 190 + 84 + areas.length * 84 + 52;

  return (
    <div>
      {/* Barra de cima: busca e, com gente marcada, a ação em lote. */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "10px 16px", background: C.canvas, borderBottom: `1px solid ${C.line}`, minHeight: 52,
        }}
      >
        {selecao.length === 0 ? (
          <>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, e-mail ou papel"
              aria-label="Buscar pessoa"
              style={{ ...campo, flex: "1 1 220px", maxWidth: 320 }}
            />
            <span style={{ ...eyebrow(10, C.faint, "0.1em"), flex: 1 }}>
              {visiveis.length} {visiveis.length === 1 ? "pessoa" : "pessoas"} · — sem acesso · V ver · E editar
            </span>
            {inativos > 0 && (
              <span onClick={() => setVerInativos((v) => !v)} style={{ ...eyebrow(10, C.dust, "0.1em"), cursor: "pointer" }}>
                {verInativos ? "ocultar" : "mostrar"} {inativos} {inativos === 1 ? "inativa" : "inativas"}
              </span>
            )}
          </>
        ) : (
          <>
            <span style={eyebrow(10, C.accent, "0.1em")}>
              {selecao.length} {selecao.length === 1 ? "pessoa marcada" : "pessoas marcadas"}
            </span>
            <span style={{ fontSize: 13, color: C.body }}>definir em</span>
            <select value={loteArea} onChange={(e) => setLoteArea(e.target.value)} aria-label="Produto" style={campo}>
              <option value="*">todos os produtos</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <Niveis
              atual={undefined}
              rotulo="Aplicar às pessoas marcadas"
              onEscolher={(n) => onDefinir(selecao, loteArea === "*" ? emTodos(n) : { [loteArea]: n })}
            />
            <span style={{ fontSize: 13, color: C.faint }}>ou copiar de</span>
            <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)} aria-label="Copiar o acesso de" style={{ ...campo, maxWidth: 170 }}>
              <option value="">— pessoa —</option>
              {pessoas
                .filter((p) => !selecao.includes(p.id))
                .sort((a, b) => porTexto(a.nome, b.nome))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              disabled={!copiarDe}
              onClick={() => {
                const origem = pessoas.find((p) => String(p.id) === copiarDe);
                if (!origem) return;
                // Copiar deixa igual: quem tinha acesso que a origem não tem, perde.
                if (!window.confirm(`Deixar o acesso de ${selecao.length} pessoa(s) igual ao de ${origem.nome}? O acesso atual delas é substituído.`)) return;
                onCopiar(selecao, origem.id);
                setCopiarDe("");
              }}
            >
              copiar
            </Button>
            <span style={{ flex: 1 }} />
            <span onClick={() => setMarcados([])} style={{ ...eyebrow(10, C.dust, "0.1em"), cursor: "pointer" }}>
              limpar seleção
            </span>
          </>
        )}
      </div>

      <div className="liff-scroll-x">
        <div style={{ minWidth: largura }}>
          <div style={{ display: "grid", gridTemplateColumns: colunas, alignItems: "end", borderBottom: `1px solid ${C.line}`, background: C.canvas }}>
            <div className="perm-fixa" style={{ left: 0, padding: "10px 0 10px 12px", background: C.canvas }}>
              <input
                type="checkbox"
                checked={todosMarcados}
                disabled={!marcaveis.length}
                onChange={() => setMarcados(todosMarcados ? [] : marcaveis)}
                aria-label="Marcar todas as pessoas da lista"
                title="Marcar todas as pessoas da lista"
              />
            </div>
            <div className="perm-fixa" style={{ left: 34, padding: "10px 8px", background: C.canvas, ...eyebrow(10, C.faint) }}>PESSOA</div>
            <div style={{ padding: "10px 6px", ...eyebrow(10, C.faint), textAlign: "center" }} title="Aplica o mesmo nível em todos os produtos da pessoa">
              TODOS
            </div>
            {areas.map((a) => (
              <div key={a.id} title={`LIFF ${a.label}`} style={{ padding: "10px 6px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minWidth: 0 }}>
                <span style={{ ...dot(a.color), flex: "none" }} />
                <span style={{ ...eyebrow(10, C.dust, "0.08em"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.short}</span>
              </div>
            ))}
            <div style={{ padding: "10px 6px", ...eyebrow(10, C.faint), textAlign: "center" }}>ATIVA</div>
          </div>

          {visiveis.map((p) => {
            const admin = p.papel === "admin";
            const marcado = selecao.includes(p.id);
            // Cor cheia e não transparente: as duas primeiras colunas ficam fixas na rolagem
            // lateral e o que passa por baixo não pode aparecer através delas.
            const fundo = marcado ? "color-mix(in srgb, var(--liff-accent) 8%, var(--liff-surface-cell))" : C.cell;
            return (
              <div
                key={p.id}
                style={{
                  display: "grid", gridTemplateColumns: colunas, alignItems: "center",
                  borderBottom: `1px solid ${C.line}`,
                  background: fundo,
                  opacity: p.ativo ? 1 : 0.55,
                }}
              >
                <div className="perm-fixa" style={{ left: 0, padding: "0 0 0 12px", background: fundo, alignSelf: "stretch", display: "flex", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={admin}
                    onChange={() => setMarcados(marcado ? selecao.filter((x) => x !== p.id) : [...selecao, p.id])}
                    aria-label={`Marcar ${p.nome}`}
                    title={admin ? "Admin tem edição em tudo; não entra em ação em lote" : undefined}
                  />
                </div>
                <div
                  className={onEditar ? "perm-fixa perm-pessoa perm-pessoa--abre" : "perm-fixa perm-pessoa"}
                  onClick={onEditar ? () => onEditar(p.id) : undefined}
                  style={{ left: 34, background: fundo }}
                  title={onEditar ? `${p.email}\nClique para editar nome, e-mail e papel` : p.email}
                >
                  <div style={{ fontSize: 14, color: C.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.nome}
                    {p.ativo ? "" : " (inativa)"}
                  </div>
                  <div style={{ ...eyebrow(10, admin ? C.accent : C.faint, "0.1em") }}>{p.papel}</div>
                </div>
                {admin ? (
                  <div style={{ gridColumn: `span ${areas.length + 1}`, padding: "0 8px", fontFamily: MONO, fontSize: 11, color: C.faint }}>
                    edita todos os produtos, por definição do papel
                  </div>
                ) : (
                  <>
                    <div className="perm-celula perm-celula--todos">
                      <Niveis atual={nivelGeral(p)} rotulo={`${p.nome} em todos os produtos`} onEscolher={(n) => onDefinir([p.id], emTodos(n))} />
                    </div>
                    {areas.map((a) => (
                      <div key={a.id} className="perm-celula">
                        <Niveis atual={nivelDe(p, a.id)} rotulo={`${p.nome} em ${a.label}`} onEscolher={(n) => onDefinir([p.id], { [a.id]: n })} />
                      </div>
                    ))}
                  </>
                )}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Switch
                    checked={p.ativo}
                    disabled={p.id === meuId}
                    title={p.id === meuId ? "Você não pode desativar a própria conta" : "Ativa ou corta o acesso"}
                    onChange={(v) => onAtivo(p.id, v)}
                  />
                </div>
              </div>
            );
          })}
          {!visiveis.length && (
            <div style={{ padding: "22px 16px", fontSize: 13, color: C.faint }}>Ninguém com esse filtro.</div>
          )}
        </div>
      </div>
    </div>
  );
}
