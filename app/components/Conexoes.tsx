"use client";

// Cadastros → Conexões. Os aplicativos externos (o Claude, por enquanto) que alguém autorizou
// a agir em seu nome pelo MCP. Cada pessoa vê as suas; a administração vê todas.
//
// Três perguntas por linha: QUEM autorizou O QUÊ, se está sendo USADA, e como CORTAR. As
// revogadas ficam visíveis por 30 dias, com motivo — "o Claude parou de funcionar" costuma
// ter resposta aqui.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "./ds";
import { C, MONO, eyebrow, mesh, R } from "./tokens";
import { stamp } from "@/lib/domain";

type Conexao = {
  id: number;
  pessoa: string;
  minha: boolean;
  cliente: string;
  clienteHost: string;
  retorno: string;
  escopos: string[];
  criadoEm: string;
  ultimoUsoEm: string | null;
  revogadoEm: string | null;
  motivo: string | null;
  revogadoPor: string | null;
  chamadas7d: number;
  gravacoes7d: number;
};

/** A origem da página não muda enquanto ela está aberta: não há o que assinar. */
const nadaMuda = () => () => {};

const CHIP = (cor: string) => ({
  ...eyebrow(10, cor, "0.1em"),
  border: `1px solid color-mix(in srgb, ${cor} 40%, transparent)`,
  background: `color-mix(in srgb, ${cor} 10%, transparent)`,
  padding: "3px 7px",
  borderRadius: R,
  whiteSpace: "nowrap" as const,
});

export default function Conexoes({ mcpHabilitado }: { mcpHabilitado: boolean }) {
  const [lista, setLista] = useState<Conexao[] | null>(null);
  const [todas, setTodas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [revogando, setRevogando] = useState<number | null>(null);

  const aplicar = useCallback((d: { conexoes: Conexao[]; todas: boolean }) => {
    setLista(d.conexoes);
    setTodas(!!d.todas);
    setErro(null);
  }, []);

  const buscar = useCallback(async () => {
    const r = await fetch("/api/conexoes");
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "Não foi possível carregar as conexões.");
    return d as { conexoes: Conexao[]; todas: boolean };
  }, []);

  useEffect(() => {
    // Carga da aba: a lista não vem no estado geral porque só esta tela usa.
    let vivo = true;
    buscar()
      .then((d) => vivo && aplicar(d))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : "Falha ao carregar."));
    return () => {
      vivo = false;
    };
  }, [buscar, aplicar]);

  // O endereço do MCP depende de onde o app roda. No servidor não há `window`; a versão do
  // servidor é o caminho relativo, e o cliente troca pelo absoluto sem divergir na hidratação.
  const urlMcp = useSyncExternalStore(
    nadaMuda,
    () => `${window.location.origin}/api/mcp`,
    () => "/api/mcp"
  );
  const origem = urlMcp.replace(/\/api\/mcp$/, "");

  async function revogar(c: Conexao) {
    const de = c.minha ? "sua conexão" : `a conexão de ${c.pessoa}`;
    if (!window.confirm(`Revogar ${de} com ${c.cliente}? O aplicativo perde o acesso na próxima chamada.`)) return;
    setRevogando(c.id);
    try {
      const r = await fetch(`/api/conexoes/${c.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Não foi possível revogar.");
      aplicar(await buscar());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao revogar.");
    } finally {
      setRevogando(null);
    }
  }

  const ativas = lista?.filter((c) => !c.revogadoEm) ?? [];
  const revogadas = lista?.filter((c) => c.revogadoEm) ?? [];

  return (
    <div className="liff-cad-split" style={mesh({ display: "grid", gap: 1 })}>
      {/* Sem largura mínima nem rolagem lateral, ao contrário das tabelas de cadastro: cada
          linha é um bloco que quebra o texto, e o botão Revogar precisa estar sempre à vista
          — no celular inclusive, que é onde se revoga às pressas. */}
      <div style={{ background: C.cell, minWidth: 0 }}>
        <div>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.line}`, background: C.canvas, ...eyebrow(10, C.faint) }}>
            {todas ? "Conexões de todas as pessoas" : "Suas conexões"}
          </div>

          {erro && <div style={{ padding: 16, fontSize: 13, color: C.error }}>{erro}</div>}
          {!lista && !erro && <div style={{ padding: 16, fontFamily: MONO, fontSize: 11, color: C.faint }}>carregando…</div>}
          {lista && !lista.length && (
            <div style={{ padding: "22px 16px", fontSize: 14, lineHeight: 1.6, color: C.faint, maxWidth: "52ch" }}>
              Nenhuma conexão. Quando você autorizar um assistente (Claude, ChatGPT, Amazon Quick) a acessar o LIFF go, ela aparece aqui — com o que pode
              fazer, quando foi usada pela última vez e o botão para cortar o acesso.
            </div>
          )}

          {[...ativas, ...revogadas].map((c) => {
            const grava = c.escopos.includes("escrita");
            const morta = !!c.revogadoEm;
            return (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                  padding: "14px 16px",
                  borderBottom: `1px solid ${C.line}`,
                  opacity: morta ? 0.55 : 1,
                }}
              >
                <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{c.cliente}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{c.clienteHost}</span>
                    {todas && <span style={{ fontSize: 13, color: C.body }}>· {c.pessoa}{c.minha ? " (você)" : ""}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={CHIP(grava ? C.warning : C.info)}>{grava ? "ler e gravar" : "só ler"}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>volta para {c.retorno}</span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
                    {morta ? (
                      <>
                        revogada {stamp(c.revogadoEm!)}
                        {c.revogadoPor ? ` por ${c.revogadoPor}` : " pelo sistema"} — {c.motivo}
                      </>
                    ) : (
                      <>
                        autorizada {stamp(c.criadoEm)} · {c.ultimoUsoEm ? `último uso ${stamp(c.ultimoUsoEm)}` : "ainda não usada"}
                        {" · "}7 dias: {c.chamadas7d} {c.chamadas7d === 1 ? "chamada" : "chamadas"}
                        {grava && `, ${c.gravacoes7d} ${c.gravacoes7d === 1 ? "gravação" : "gravações"}`}
                      </>
                    )}
                  </div>
                </div>
                {!morta && (
                  <Button variant="outline" size="xs" disabled={revogando === c.id} onClick={() => void revogar(c)}>
                    {revogando === c.id ? "revogando…" : "revogar"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: C.cell, padding: 22 }}>
        <div style={{ ...eyebrow(11, C.dust), marginBottom: 18 }}>CONECTAR UM ASSISTENTE</div>
        {!mcpHabilitado ? (
          // Desligado: não ensinar um endereço que responde 404.
          <div style={{ fontSize: 13, lineHeight: 1.6, color: C.faint }}>
            O acesso por MCP ainda não foi ligado neste ambiente. Quando a administração ligar, as instruções para
            conectar aparecem aqui.
          </div>
        ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 13, lineHeight: 1.6, color: C.body }}>
          <div>
            O LIFF go é um servidor MCP: um assistente de IA conectado a ele consulta e atualiza cards conversando. No
            aplicativo, adicione um servidor MCP remoto (às vezes chamado de conector ou app personalizado) com o endereço:
            <code style={{ display: "block", marginTop: 6, fontFamily: MONO, fontSize: 12, color: C.ink, background: C.code, padding: "8px 10px", overflowWrap: "anywhere" }}>
              {urlMcp}
            </code>
            <div style={{ marginTop: 6, fontSize: 12, color: C.faint }}>
              Deixe os campos de OAuth (client ID, segredo) em branco: o aplicativo se identifica sozinho e o login é o
              Google de sempre.
            </div>
          </div>
          <div>
            <div style={{ ...eyebrow(10, C.faint, "0.12em"), marginBottom: 6 }}>aplicativos aceitos</div>
            <div>
              <strong style={{ color: C.ink, fontWeight: 600 }}>Claude</strong> (claude.ai, app desktop e Claude Code),{" "}
              <strong style={{ color: C.ink, fontWeight: 600 }}>ChatGPT</strong> e{" "}
              <strong style={{ color: C.ink, fontWeight: 600 }}>Amazon Quick</strong>. Outros aplicativos precisam ser
              liberados pela administração antes de conseguirem conectar.
            </div>
          </div>
          <div>
            <div style={{ ...eyebrow(10, C.faint, "0.12em"), marginBottom: 6 }}>amazon quick: preenchimento manual</div>
            O Quick não se identifica sozinho. Em Connectors → Model Context Protocol (MCP), informe o endereço acima e,
            na autenticação, escolha User authentication (OAuth), marque <em>Public OAuth client</em> e preencha:
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", marginTop: 8, alignItems: "baseline" }}>
              {[
                ["Client ID", "amazon-quick"],
                ["Authorization URL", `${origem}/oauth/autorizar`],
                ["Token URL", `${origem}/api/oauth/token`],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} style={{ display: "contents" }}>
                  <span style={{ fontSize: 12, color: C.faint, whiteSpace: "nowrap" }}>{rotulo}</span>
                  <code style={{ fontFamily: MONO, fontSize: 12, color: C.ink, background: C.code, padding: "4px 8px", overflowWrap: "anywhere" }}>{valor}</code>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: C.faint }}>
              Redirect URL: mantenha o que o próprio Quick preenche. Client Secret: em branco.
            </div>
          </div>
          <div>
            <div style={{ ...eyebrow(10, C.faint, "0.12em"), marginBottom: 6 }}>linha de comando (claude code)</div>
            <code style={{ display: "block", fontFamily: MONO, fontSize: 12, color: C.ink, background: C.code, padding: "8px 10px", overflowWrap: "anywhere" }}>
              claude mcp add --transport http liff-go {urlMcp}
            </code>
          </div>
          <div style={{ fontSize: 12, color: C.faint }}>
            A conexão age em seu nome: vê o que você vê e grava só se o seu papel edita — nunca exclui nada. Cada
            gravação aparece no histórico do registro marcada com o nome do aplicativo.
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
