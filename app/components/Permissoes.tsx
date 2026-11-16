"use client";

// Cadastros → Pessoas: quem pode o quê.
//
// Não existe mais permissão por produto (nov/2026): todo mundo vê todos os produtos, e o que
// separa as pessoas é o PAPEL — leitura só vê; membro e gestor editam tudo; financeiro também
// cuida do dinheiro (valores de receita, faturamento, despesas); admin administra (pessoas,
// cadastros, funding). Antes havia uma matriz de
// pessoas × produtos; a pedido, ela saiu.
//
// O papel é escolhido direto na linha, e marcando pessoas aparece a ação em lote.

import { useMemo, useState, type CSSProperties } from "react";
import { Switch } from "./ds";
import { C, eyebrow, R } from "./tokens";
import type { Pessoa } from "./api";
import { porTexto } from "@/lib/domain";
import { useOrdem } from "./ordenacao";

const PAPEIS_TELA: { key: string; nome: string; faz: string }[] = [
  { key: "leitura", nome: "leitura", faz: "vê os cards de todos os produtos, não edita; não vê receita" },
  { key: "membro", nome: "membro", faz: "vê e edita cards em todos os produtos; não vê receita" },
  { key: "gestor", nome: "gestor", faz: "como o membro, e também vê a receita" },
  { key: "financeiro", nome: "financeiro", faz: "como o gestor, e também edita a receita e opera faturamento e despesas" },
  { key: "admin", nome: "admin", faz: "como o financeiro, e administra pessoas, cadastros, funding e o changelog" },
];

const campo: CSSProperties = {
  background: C.cell,
  border: `1px solid ${C.line}`,
  borderRadius: R,
  color: C.ink,
  fontFamily: "inherit",
  fontSize: 13,
  padding: "6px 8px",
  minWidth: 0,
};

/** Os papéis lado a lado; o atual fica pintado. `atual === undefined` é "nenhum marcado". */
function Papeis({
  atual,
  travado,
  onEscolher,
  rotulo,
}: {
  atual: string | undefined;
  travado?: string;
  onEscolher: (papel: string) => void;
  rotulo: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className="perm-niveis perm-papeis" data-travado={travado ? "1" : undefined}>
      {PAPEIS_TELA.map((p) => {
        const ativo = atual === p.key;
        return (
          <button
            key={p.key}
            type="button"
            disabled={!!travado}
            aria-pressed={ativo}
            title={travado ?? `${p.nome}: ${p.faz}`}
            onClick={() => !ativo && onEscolher(p.key)}
            style={
              ativo
                ? {
                    background: p.key === "leitura" ? C.panel2 : "color-mix(in srgb, var(--liff-accent) 16%, transparent)",
                    color: p.key === "leitura" ? C.dust : C.ink,
                    fontWeight: 700,
                  }
                : undefined
            }
          >
            {p.nome}
          </button>
        );
      })}
    </div>
  );
}

export default function Permissoes({
  pessoas,
  meuId,
  onPapel,
  onAtivo,
  onEditar,
}: {
  pessoas: Pessoa[];
  meuId: number;
  /** Define o mesmo papel para todas as pessoas dadas. */
  onPapel: (usuarios: number[], papel: string) => void;
  onAtivo: (userId: number, ativo: boolean) => void;
  onEditar?: (id: number) => void;
}) {
  const [busca, setBusca] = useState("");
  const [verInativos, setVerInativos] = useState(false);
  const [marcados, setMarcados] = useState<number[]>([]);
  const ord = useOrdem();

  const inativos = pessoas.filter((p) => !p.ativo).length;
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pessoas
      .filter((p) => (verInativos || p.ativo) && (!q || `${p.nome} ${p.email} ${p.papel}`.toLowerCase().includes(q)))
      .sort((a, b) => porTexto(a.nome, b.nome));
  }, [pessoas, busca, verInativos]);

  // A própria pessoa não entra em seleção: ninguém muda o próprio papel em lote por engano.
  const marcaveis = visiveis.filter((p) => p.id !== meuId).map((p) => p.id);
  // A seleção vale só para quem está na tela: filtrar e depois aplicar não pode alcançar
  // gente que a busca escondeu.
  const selecao = marcados.filter((id) => marcaveis.includes(id));
  const todosMarcados = marcaveis.length > 0 && selecao.length === marcaveis.length;

  const aplicarEmLote = (papel: string) => {
    if (papel === "admin" && !window.confirm(`Tornar ${selecao.length} pessoa(s) admin? Admin edita tudo e administra o sistema.`)) return;
    onPapel(selecao, papel);
  };

  const colunas = "34px minmax(200px, 1.4fr) 300px 60px";

  return (
    <div>
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
              {visiveis.length} {visiveis.length === 1 ? "pessoa" : "pessoas"} · todos veem todos os produtos; o papel define quem edita
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
            <span style={{ fontSize: 13, color: C.body }}>definir o papel</span>
            <Papeis atual={undefined} rotulo="Aplicar às pessoas marcadas" onEscolher={aplicarEmLote} />
            <span style={{ flex: 1 }} />
            <span onClick={() => setMarcados([])} style={{ ...eyebrow(10, C.dust, "0.1em"), cursor: "pointer" }}>
              limpar seleção
            </span>
          </>
        )}
      </div>

      <div className="liff-scroll-x">
        <div style={{ minWidth: 620 }}>
          <div style={{ display: "grid", gridTemplateColumns: colunas, alignItems: "end", borderBottom: `1px solid ${C.line}`, background: C.canvas }}>
            <div style={{ padding: "10px 0 10px 12px" }}>
              <input
                type="checkbox"
                checked={todosMarcados}
                disabled={!marcaveis.length}
                onChange={() => setMarcados(todosMarcados ? [] : marcaveis)}
                aria-label="Marcar todas as pessoas da lista"
                title="Marcar todas as pessoas da lista"
              />
            </div>
            {ord.th("pessoa", "PESSOA", { padding: "10px 8px", ...eyebrow(10, C.faint) })}
            {ord.th("papel", "PAPEL", { padding: "10px 6px", ...eyebrow(10, C.faint) })}
            {ord.th("ativa", "ATIVA", { padding: "10px 6px", ...eyebrow(10, C.faint), textAlign: "center" })}
          </div>

          {ord
            // Papel na ordem de acesso (leitura → admin), não alfabética.
            .aplicar(visiveis, { pessoa: (p) => p.nome, papel: (p) => PAPEIS_TELA.findIndex((x) => x.key === p.papel), ativa: (p) => p.ativo })
            .map((p) => {
            const eu = p.id === meuId;
            const marcado = selecao.includes(p.id);
            return (
              <div
                key={p.id}
                style={{
                  display: "grid", gridTemplateColumns: colunas, alignItems: "center",
                  borderBottom: `1px solid ${C.line}`,
                  background: marcado ? "color-mix(in srgb, var(--liff-accent) 8%, var(--liff-surface-cell))" : C.cell,
                  opacity: p.ativo ? 1 : 0.55,
                }}
              >
                <div style={{ padding: "0 0 0 12px" }}>
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={eu}
                    onChange={() => setMarcados(marcado ? selecao.filter((x) => x !== p.id) : [...selecao, p.id])}
                    aria-label={`Marcar ${p.nome}`}
                    title={eu ? "É você: mude o próprio papel pela edição do cadastro" : undefined}
                  />
                </div>
                <div
                  className={onEditar ? "perm-pessoa perm-pessoa--abre" : "perm-pessoa"}
                  onClick={onEditar ? () => onEditar(p.id) : undefined}
                  title={onEditar ? `${p.email}\nClique para editar nome e e-mail` : p.email}
                >
                  <div style={{ fontSize: 14, color: C.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.nome}
                    {p.ativo ? "" : " (inativa)"}
                  </div>
                  <div style={{ fontSize: 12, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</div>
                </div>
                <div style={{ padding: "9px 6px" }}>
                  <Papeis
                    atual={p.papel}
                    travado={eu && p.papel === "admin" ? "Você não pode tirar o próprio papel de admin" : undefined}
                    rotulo={`Papel de ${p.nome}`}
                    onEscolher={(papel) => {
                      if (papel === "admin" && !window.confirm(`Tornar ${p.nome} admin? Admin edita tudo e administra o sistema.`)) return;
                      onPapel([p.id], papel);
                    }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Switch
                    checked={p.ativo}
                    disabled={eu}
                    title={eu ? "Você não pode desativar a própria conta" : "Ativa ou corta o acesso"}
                    onChange={(v) => onAtivo(p.id, v)}
                  />
                </div>
              </div>
            );
          })}
          {visiveis.length === 0 && <div style={{ padding: "18px 16px", fontSize: 13, color: C.faint }}>Ninguém com esse filtro.</div>}
        </div>
      </div>

      <div style={{ display: "grid", gap: 4, padding: "12px 16px", borderTop: `1px solid ${C.line}`, background: C.canvas }}>
        {PAPEIS_TELA.map((p) => (
          <div key={p.key} style={{ fontSize: 12.5, color: C.faint }}>
            <strong style={{ color: C.body, fontWeight: 600 }}>{p.nome}</strong>: {p.faz}
          </div>
        ))}
      </div>
    </div>
  );
}
