"use client";

// Importação de oportunidades a partir de planilha.
//
// A planilha é lida aqui no navegador e vai para o servidor como JSON. Isso dispensa upload
// de arquivo sem perder nada: o servidor revalida cada linha, checa a permissão da área e
// recusa produto que não pertença a ela — ele nunca confia nisto aqui.
//
// A prévia é editável de propósito. O mapeamento de estágio é um chute a partir do texto da
// planilha, e um chute meu não deve virar dado sem alguém olhar.

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Button, Field, Select } from "./ds";
import { C, GHOST_FIX, MONO, eyebrow } from "./tokens";
import { STAGES, areaOf, brl, normalizarConta, normalizarTexto, porTexto, statusLabel } from "@/lib/domain";
import { chaveDeModulo, lerAba, rendeLinhas, type Aba, type LinhaAtividadeImportada } from "@/lib/planilha";
import type { Activity, Deal, LinhaImport, ProdutoCadastro } from "./api";
import { useFecharNoFundo } from "./views";

const COLS_DEAL = "1.4fr 1.3fr 1.1fr 0.9fr 0.8fr 0.6fr";
const COLS_ATIV = "2.4fr 0.9fr 1.6fr 0.7fr";
const celaTexto = {
  padding: "10px 12px",
  fontSize: 12,
  color: C.faint,
  lineHeight: 1.45,
  maxHeight: 54,
  overflow: "hidden",
} as const;

export default function ImportarPlanilha({
  areasEditaveis,
  areasComPlanilha,
  sheetsConectado,
  produtos,
  deals,
  atividades,
  salvando,
  erro,
  onImportar,
  onCriarProduto,
  onFechar,
}: {
  areasEditaveis: { id: string; label: string }[];
  /** Verticais que têm planilha do Drive configurada — só nelas o botão de sincronizar faz sentido. */
  areasComPlanilha: Set<string>;
  sheetsConectado: boolean;
  produtos: ProdutoCadastro[];
  deals: Deal[];
  /** Para marcar na prévia o to-do que já existe na área — dedup é por título. */
  atividades: Activity[];
  salvando: boolean;
  erro: string | null;
  /** As duas listas num handler só: disparadas em paralelo, cada uma fecharia o modal e
   *  sobrescreveria a mensagem da outra. */
  onImportar: (area: string, dados: { deals: LinhaImport[]; atividades: LinhaAtividadeImportada[] }) => void;
  onCriarProduto: (label: string, area: string) => Promise<void>;
  onFechar: () => void;
}) {
  // Em branco: importar 40 linhas na vertical errada é o erro mais caro desta tela, e a
  // área pré-selecionada era exatamente o que o deixava passar despercebido.
  const [area, setArea] = useState("");
  const [abas, setAbas] = useState<Aba[] | null>(null);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [arquivo, setArquivo] = useState<string>("");
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  /** Quando o servidor devolve 428, falta autorizar o Google — vira um convite, não um erro. */
  const [precisaConectar, setPrecisaConectar] = useState(false);

  const produtosDaArea = useMemo(() => produtos.filter((p) => p.area === area && p.ativo), [produtos, area]);

  const abasAtivas = useMemo(
    () => (abas ?? []).filter(rendeLinhas).filter((a) => escolhidas.has(a.nome)),
    [abas, escolhidas]
  );

  /**
   * Módulos citados nas abas escolhidas que ainda não existem como produto nesta área. O
   * casamento é pela chave sem espaço nem pontuação: "Lifftax Starter" da planilha é o
   * "LIFF Tax Starter" do cadastro. Sem cadastrar, o módulo é ignorado na importação.
   */
  const modulosFaltando = useMemo(() => {
    const existentes = new Set(produtosDaArea.map((p) => chaveDeModulo(p.label)));
    const faltam = new Map<string, string>();
    for (const aba of abasAtivas) {
      if (aba.tipo !== "oportunidades") continue;
      for (const l of aba.linhas) {
        for (const m of l.modulos) {
          const k = chaveDeModulo(m);
          if (k && !existentes.has(k)) faltam.set(k, m);
        }
      }
    }
    return [...faltam.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => porTexto(a.label, b.label));
  }, [abasAtivas, produtosDaArea]);
  const nomeDoModulo = (m: string) => produtosDaArea.find((p) => chaveDeModulo(p.label) === chaveDeModulo(m))?.label;

  /**
   * Lê TODAS as abas do arquivo e classifica cada uma pelo cabeçalho: quem tem coluna de
   * empresa vira oportunidade, quem tem coluna de to-do vira atividade. Antes só a primeira
   * aba era lida, e uma planilha de três abas entrava pela metade sem avisar.
   */
  async function lerArquivo(file: File) {
    setErroLeitura(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const contasExistentes = new Set(deals.filter((d) => d.area === area).map((d) => normalizarConta(d.conta)));
      const titulosExistentes = new Set(
        atividades.filter((a) => a.area === area).map((a) => normalizarTexto(a.titulo))
      );

      const lidas: Aba[] = wb.SheetNames.map((nome) => {
        const grade = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[nome], {
          header: 1,
          blankrows: false,
          defval: "",
        });
        return lerAba(nome, grade, { contas: contasExistentes, titulos: titulosExistentes });
      });

      if (!lidas.some(rendeLinhas)) {
        throw new Error(
          "Nenhuma aba tem coluna de empresa/conta ou de to-do. Confira se o cabeçalho está na planilha."
        );
      }

      setAbas(lidas);
      // Tudo o que dá para importar já vem marcado: a planilha é do time, não uma amostra.
      setEscolhidas(new Set(lidas.filter(rendeLinhas).map((a) => a.nome)));
      setArquivo(file.name);
    } catch (e) {
      setAbas(null);
      setEscolhidas(new Set());
      setErroLeitura(e instanceof Error ? e.message : "Não consegui ler a planilha.");
    }
  }

  /**
   * Sincroniza com a planilha do Drive. O servidor lê e classifica exatamente como o leitor
   * de arquivo, então daqui para baixo a prévia é a mesma — inclusive a marcação do que
   * atualiza em vez de criar, e a edição do estágio linha a linha.
   */
  async function sincronizar() {
    setErroLeitura(null);
    setPrecisaConectar(false);
    setSincronizando(true);
    try {
      const r = await fetch(`/api/sheets/preview?area=${encodeURIComponent(area)}`);
      const dados = (await r.json()) as { abas?: Aba[]; error?: string };
      if (r.status === 428) {
        setPrecisaConectar(true);
        setErroLeitura(dados.error ?? "Conecte sua conta Google para ler a planilha.");
        return;
      }
      if (!r.ok) throw new Error(dados.error ?? "Não consegui ler a planilha.");

      const lidas = dados.abas ?? [];
      if (!lidas.some(rendeLinhas)) {
        throw new Error("A planilha não tem nenhuma aba com coluna de empresa/conta ou de to-do.");
      }
      setAbas(lidas);
      setEscolhidas(new Set(lidas.filter(rendeLinhas).map((a) => a.nome)));
      setArquivo("planilha do Drive");
    } catch (e) {
      setAbas(null);
      setEscolhidas(new Set());
      setErroLeitura(e instanceof Error ? e.message : "Não consegui ler a planilha.");
    } finally {
      setSincronizando(false);
    }
  }

  /** Troca o estágio de uma linha dentro da aba certa. */
  function mudarEstagio(nomeAba: string, indice: number, estagio: string) {
    setAbas((as) =>
      as!.map((a) =>
        a.nome === nomeAba && a.tipo === "oportunidades"
          ? { ...a, linhas: a.linhas.map((l, j) => (j === indice ? { ...l, estagio } : l)) }
          : a
      )
    );
  }

  // Selecionar texto na prévia e soltar o mouse fora do painel fechava o modal no meio da
  // seleção; ver o comentário de `useFecharNoFundo`.
  const fundo = useFecharNoFundo(onFechar);

  const totalLinhas = abasAtivas.reduce((s, a) => s + a.linhas.length, 0);
  const novas = abasAtivas.reduce((s, a) => s + a.linhas.filter((l) => !l.existente).length, 0);
  const atualiza = totalLinhas - novas;

  return (
    <div
      {...fundo}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,16,20,0.78)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 980,
          maxWidth: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          background: C.panel,
          border: `1px solid ${C.line}`,
        }}
      >
        <div style={{ padding: "24px 26px", borderBottom: `1px solid ${C.line}` }}>
          <div style={eyebrow(10, C.accent)}>LIFF/ IMPORTAÇÃO</div>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink, marginTop: 6 }}>
            Importar planilha
          </div>
        </div>

        <div style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field
              label="Área de destino"
              required
              hint="Todas as linhas entram nesta vertical. Escolha antes de abrir o arquivo."
            >
              <Select
                options={[
                  { value: "", label: "— escolha a vertical —" },
                  ...areasEditaveis.map((a) => ({ value: a.id, label: a.label })),
                ]}
                value={area}
                onChange={(v) => {
                  setArea(v);
                  // A marcação de "já existe" foi calculada contra a área anterior; trocar
                  // de área invalida a prévia inteira.
                  setAbas(null);
                  setEscolhidas(new Set());
                }}
              />
            </Field>
            <Field label="Arquivo" hint="A planilha é lida aqui no navegador; nada sobe antes de você confirmar.">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                // Sem área não dá para ler: a prévia marca "já existe" comparando com o que
                // há NAQUELA vertical, e sem ela a marcação sairia toda errada.
                disabled={!area}
                onChange={(e) => e.target.files?.[0] && void lerArquivo(e.target.files[0])}
                style={{
                  width: "100%",
                  background: C.code,
                  border: `1px solid ${C.line}`,
                  borderRadius: 6,
                  color: C.ink,
                  fontSize: 13,
                  padding: "9px 11px",
                }}
              />
            </Field>
          </div>

          {/* Sincronizar aparece só onde há planilha configurada — sem isso o botão
              prometeria algo que a vertical não tem. */}
          {area && areasComPlanilha.has(area) && (
            <div
              style={{
                border: `1px solid ${C.line}`,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <Button variant="outline" size="sm" disabled={sincronizando} onClick={() => void sincronizar()}>
                {sincronizando ? "lendo a planilha…" : "sincronizar com o Drive"}
              </Button>
              <span style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, flex: 1, minWidth: 220 }}>
                Lê a planilha configurada em {areaOf(area).label} usando o seu acesso do Google. Nada
                é gravado antes de você conferir a prévia.
                {!sheetsConectado && " Na primeira vez, o Google vai pedir sua autorização."}
              </span>
            </div>
          )}

          {precisaConectar && (
            <div style={{ border: `1px solid ${C.warning}`, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: C.body, lineHeight: 1.6, flex: 1, minWidth: 240 }}>
                O sistema precisa da sua autorização para ler planilhas do seu Google. O acesso é
                de leitura, e o login continua sem pedir isso de quem não sincroniza.
              </span>
              <Button
                variant="solid"
                size="sm"
                onClick={() => {
                  window.location.href = `/api/sheets/conectar?voltar=${encodeURIComponent(window.location.pathname)}`;
                }}
              >
                autorizar no Google
              </Button>
            </div>
          )}

          {erroLeitura && !precisaConectar && (
            <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erroLeitura}</div>
          )}

          {abas && (
            <>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
                <span style={eyebrow(11, C.dust)}>
                  {arquivo} · {abas.length} aba(s) · {totalLinhas} linha(s) selecionada(s)
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.success }}>{novas} a criar</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.info }}>{atualiza} a atualizar</span>
              </div>

              {/* Cada aba é uma importação própria, e não uma escolha de qual usar: a
                  planilha do time traz o funil dividido em duas e os to-dos numa terceira. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 1, background: C.line }}>
                {abas.map((aba) => {
                  const ignorada = aba.tipo === "ignorada";
                  const marcada = escolhidas.has(aba.nome);
                  return (
                    <label
                      key={aba.nome}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "11px 14px",
                        background: C.cell,
                        cursor: ignorada ? "default" : "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        disabled={ignorada}
                        checked={marcada && !ignorada}
                        onChange={(e) =>
                          setEscolhidas((s) => {
                            const novo = new Set(s);
                            if (e.target.checked) novo.add(aba.nome);
                            else novo.delete(aba.nome);
                            return novo;
                          })
                        }
                        style={{ accentColor: C.accent, width: 15, height: 15, cursor: "inherit" }}
                      />
                      <span style={{ fontSize: 13, color: ignorada ? C.ghost : C.ink, flex: 1, minWidth: 0 }}>
                        {aba.nome}
                      </span>
                      {ignorada ? (
                        <span style={{ fontSize: 12, color: C.ghost }}>{aba.motivo}</span>
                      ) : (
                        <>
                          <span style={eyebrow(9, aba.tipo === "atividades" ? C.info : C.accent, "0.1em")}>
                            {aba.tipo}
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
                            {aba.linhas.length} linha(s)
                          </span>
                        </>
                      )}
                    </label>
                  );
                })}
              </div>

              {modulosFaltando.length > 0 && (
                <div
                  style={{
                    border: `1px solid ${C.warning}`,
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: C.body }}>
                    A planilha traz {modulosFaltando.length === 1 ? "um módulo que ainda não é" : "módulos que ainda não são"}{" "}
                    produto em {areaOf(area).label}. Sem cadastrar, {modulosFaltando.length === 1 ? "ele será ignorado" : "eles serão ignorados"} nos
                    cards.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {modulosFaltando.map((s) => (
                      <Button
                        key={s.id}
                        variant="outline"
                        size="sm"
                        onClick={() => void onCriarProduto(s.label, area)}
                      >
                        + cadastrar {s.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Uma prévia por aba escolhida. O estágio continua editável linha a linha:
                  a inferência é um chute a partir do texto, e chute meu não vira dado sem
                  alguém olhar. */}
              {abasAtivas.map((aba) => (
                <div key={aba.nome} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={eyebrow(10, C.dust, "0.12em")}>
                    {aba.nome} · {aba.linhas.length} {aba.tipo === "atividades" ? "atividade(s)" : "oportunidade(s)"}
                  </div>
                  <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}` }}>
                    <div style={{ minWidth: aba.tipo === "atividades" ? 620 : 860 }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: aba.tipo === "atividades" ? COLS_ATIV : COLS_DEAL,
                          background: C.canvas,
                          borderBottom: `1px solid ${C.line}`,
                        }}
                      >
                        {(aba.tipo === "atividades"
                          ? ["ATIVIDADE", "STATUS", "SITUAÇÃO", ""]
                          : ["CONTA", "MÓDULOS", "ESTÁGIO", "DONO", "VALOR", ""]
                        ).map((h, i) => (
                          <div key={i} style={{ padding: "10px 12px", ...eyebrow(10, C.faint) }}>
                            {h}
                          </div>
                        ))}
                      </div>

                      {aba.tipo === "atividades"
                        ? aba.linhas.map((l, i) => (
                            <div
                              key={i}
                              style={{
                                display: "grid",
                                gridTemplateColumns: COLS_ATIV,
                                borderBottom: `1px solid ${C.line}`,
                                alignItems: "center",
                                background: C.cell,
                              }}
                            >
                              <div style={{ padding: "10px 12px", fontSize: 13, color: C.ink, lineHeight: 1.4 }}>
                                {l.titulo}
                              </div>
                              <div style={{ padding: "10px 12px", ...eyebrow(10, C.dust, "0.08em") }}>
                                {statusLabel(l.status)}
                              </div>
                              <div style={celaTexto}>{l.situacao || "—"}</div>
                              <div style={{ padding: "10px 12px" }}>
                                <span style={eyebrow(9, l.existente ? C.info : C.success, "0.1em")}>
                                  {l.existente ? "atualiza" : "nova"}
                                </span>
                              </div>
                            </div>
                          ))
                        : aba.linhas.map((l, i) => {
                            return (
                              <div
                                key={i}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: COLS_DEAL,
                                  borderBottom: `1px solid ${C.line}`,
                                  alignItems: "center",
                                  background: C.cell,
                                }}
                              >
                                <div style={{ padding: "10px 12px", fontSize: 13, color: C.ink }}>{l.conta}</div>
                                <div style={{ padding: "10px 12px", fontSize: 12, color: C.body, lineHeight: 1.4 }}>
                                  {l.modulos.length
                                    ? l.modulos.map((m, k) => (
                                        <span key={k} style={{ color: nomeDoModulo(m) ? C.body : C.ghost }}>
                                          {k > 0 && " · "}
                                          {nomeDoModulo(m) ?? `${m} (sem cadastro)`}
                                        </span>
                                      ))
                                    : <span style={{ color: C.ghost }}>—</span>}
                                </div>
                                <div style={{ padding: "6px 8px" }}>
                                  <select
                                    value={l.estagio}
                                    onChange={(e) => mudarEstagio(aba.nome, i, e.target.value)}
                                    style={{
                                      width: "100%",
                                      background: C.canvas,
                                      border: `1px solid ${C.line}`,
                                      borderRadius: 4,
                                      color: C.ink,
                                      fontSize: 12,
                                      padding: "6px 8px",
                                    }}
                                  >
                                    {STAGES.map((s) => (
                                      <option key={s.key} value={s.key}>
                                        {s.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div style={{ padding: "10px 12px", fontSize: 12, color: l.responsavelTexto ? C.body : C.ghost }}>
                                  {l.responsavelTexto || "—"}
                                </div>
                                <div style={{ padding: "10px 12px", fontFamily: MONO, fontSize: 12, color: l.valorReais ? C.body : C.ghost }}>
                                  {l.valorReais ? brl(Math.round(l.valorReais * 100)) : "—"}
                                </div>
                                <div style={{ padding: "10px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  <span style={eyebrow(9, l.existente ? C.info : C.success, "0.1em")}>
                                    {l.existente ? "atualiza" : "nova"}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
              cancelar
            </Button>
            <Button
              variant="solid"
              size="sm"
              disabled={salvando || !totalLinhas || !area}
              onClick={() => {
                // Abas do mesmo tipo viram uma chamada só. São tabelas diferentes, com
                // rotas e deduplicação diferentes, mas agrupá-las por tipo deixa a
                // auditoria com um resumo por tipo em vez de um por aba.
                onImportar(area, {
                  // A linha vai inteira, com nomes em texto: o servidor casa dono, origem e
                  // módulos com os cadastros — a regra de quem é quem mora num lugar só.
                  deals: abasAtivas
                    .flatMap((a) => (a.tipo === "oportunidades" ? a.linhas : []))
                    .map(({ existente: _existente, ...l }) => {
                      void _existente;
                      return l;
                    }),
                  atividades: abasAtivas
                    .flatMap((a) => (a.tipo === "atividades" ? a.linhas : []))
                    .map((l) => ({
                      titulo: l.titulo,
                      status: l.status,
                      situacao: l.situacao,
                      proximoPasso: l.proximoPasso,
                    })),
                });
              }}
            >
              {salvando ? "importando…" : `importar ${totalLinhas} linha(s)`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
