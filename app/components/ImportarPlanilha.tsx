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
import { STAGES, areaOf, normalizarConta, normalizarTexto, porTexto, slugificar, statusLabel } from "@/lib/domain";
import type { Activity, Deal, LinhaImport, ProdutoCadastro } from "./api";
import { useFecharNoFundo } from "./views";

/**
 * A planilha usa esta frase, em todas as colunas, para dizer "ainda não sabemos nada".
 * Sem tratá-la como vazio, ela vira lixo em quatro campos de seis registros.
 */
const PLACEHOLDER = /^descobrir contato no escrit/i;

/** Aceita variações de acento e caixa nos cabeçalhos das planilhas de oportunidade. */
const COLUNAS: Record<string, keyof LinhaImport | "setor"> = {
  empresa: "conta",
  conta: "conta",
  "regtrack setor": "setor",
  setor: "setor",
  produto: "setor",
  "situacao atual": "situacao",
  situacao: "situacao",
  "proximos passos": "proximoPasso",
  "proximo passo": "proximoPasso",
  "contato cargo": "contato",
  contato: "contato",
  responsavel: "responsavelTexto",
};

/** Cabeçalhos da aba de atividades. `to do` cobre "TO-DO", que a planilha escreve com hífen. */
const COLUNAS_ATIVIDADE: Record<string, "titulo" | "status" | "situacao" | "proximoPasso"> = {
  "to do": "titulo",
  todo: "titulo",
  tarefa: "titulo",
  atividade: "titulo",
  acao: "titulo",
  item: "titulo",
  status: "status",
  "situacao atual": "situacao",
  situacao: "situacao",
  "proximos passos": "proximoPasso",
  "proximo passo": "proximoPasso",
};

const chave = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Linha de rodapé que a planilha usa para totalizar ("TOTAL: 4 empresas", "TOTAL: 13 itens").
 * Sem isto ela viraria uma conta chamada "TOTAL: 4 empresas" em toda importação.
 */
const RODAPE = /^total\b/i;

const COLS_DEAL = "1.5fr 1fr 1.1fr 2fr 0.7fr";
const COLS_ATIV = "2.4fr 0.9fr 1.6fr 0.7fr";
const celaTexto = {
  padding: "10px 12px",
  fontSize: 12,
  color: C.faint,
  lineHeight: 1.45,
  maxHeight: 54,
  overflow: "hidden",
} as const;

/** Status da atividade a partir do texto livre da planilha. Vazio é backlog, não erro. */
function statusSugerido(bruto: string): string {
  const t = chave(bruto);
  if (!t) return "backlog";
  if (/conclu|feito|final|entregue|done|ok/.test(t)) return "concluido";
  if (/revis|valida|aprova/.test(t)) return "revisao";
  if (/andamento|fazendo|progresso|curso|wip/.test(t)) return "andamento";
  return "backlog";
}

/**
 * Estágio inferido do texto da situação. É deliberadamente conservador — na dúvida, o
 * estágio mais atrás, porque adiantar um card indevidamente engana o pipeline.
 *
 * NDA, POC, transferência de dados e refinamento de escopo caem todos em `validacao`: são
 * fases do mesmo trabalho de provar que dá para fazer, e nenhuma delas significa que existe
 * proposta comercial.
 *
 * A ORDEM dos testes é o que resolve o caso ambíguo. "Proposta de POC enviada" fala de
 * proposta e de POC, mas é a POC que está em jogo — checar POC/NDA primeiro devolve
 * `validacao`, que é o estágio mais atrás dos dois. Só cai em `proposta` quem fala de
 * proposta sem falar de POC, como "Proposta LIFF Tax enviada".
 */
function estagioSugerido(situacao: string): string {
  const t = situacao.toLowerCase();
  if (!t || PLACEHOLDER.test(t)) return "lead";
  // `tra\w*fer` de propósito: a planilha real escreve "tranferência", sem o s. Casar só a
  // grafia correta jogaria o card para o início do funil por causa de um typo.
  if (/\bnda\b|\bpoc\b|tra\w*fer[êe]ncia d[eo]s? dados|refinamento de escopo/.test(t)) return "validacao";
  if (/proposta\b/.test(t)) return "proposta";
  if (/reuni[ãa]o|apresenta[çc][ãa]o|fup|contato|aproxima[çc][ãa]o/.test(t)) return "qualificacao";
  return "lead";
}

/** "não é o momento", "aguardar" — parado, mas não num estágio. */
function pausaSugerida(situacao: string, proximo: string): boolean {
  const t = (situacao + " " + proximo).toLowerCase();
  return /n[ãa]o [ée] o momento|n[ãa]o insistir|aguardar|segundo momento|dificuldades financeiras/.test(t);
}

export type LinhaPrevia = LinhaImport & { setorOriginal: string; existente: boolean };
export type LinhaAtividade = { titulo: string; status: string; situacao: string; proximoPasso: string };
export type LinhaAtividadePrevia = LinhaAtividade & { existente: boolean };

/**
 * Uma aba lida. A planilha real tem três — duas de oportunidade em estágios diferentes e uma
 * de to-dos — e cada uma vira uma importação própria, para a área escolhida.
 */
type Aba =
  | { nome: string; tipo: "oportunidades"; linhas: LinhaPrevia[] }
  | { nome: string; tipo: "atividades"; linhas: LinhaAtividadePrevia[] }
  | { nome: string; tipo: "ignorada"; motivo: string };

/** Aba que rende importação. O predicado é explícito porque `filter` com condição composta
 *  não estreita a união sozinho, e o resto do componente precisa enxergar `linhas`. */
type AbaComLinhas = Exclude<Aba, { tipo: "ignorada" }>;
const rendeLinhas = (a: Aba): a is AbaComLinhas => a.tipo !== "ignorada";

/** Índice da linha de cabeçalho e o mapa de colunas, ou -1 se a aba não é do tipo procurado. */
function acharCabecalho(
  grade: string[][],
  dicionario: Record<string, string>,
  obrigatoria: string
): { i: number; mapa: (string | null)[] } | null {
  // O cabeçalho quase nunca está na primeira linha: as planilhas trazem um título acima.
  // Procura a primeira linha que contenha a coluna que define o tipo da aba.
  const i = grade.findIndex((r) => r.some((c) => dicionario[chave(String(c))] === obrigatoria));
  if (i < 0) return null;
  return { i, mapa: grade[i].map((c) => dicionario[chave(String(c))] ?? null) };
}

export default function ImportarPlanilha({
  areasEditaveis,
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
  produtos: ProdutoCadastro[];
  deals: Deal[];
  /** Para marcar na prévia o to-do que já existe na área — dedup é por título. */
  atividades: Activity[];
  salvando: boolean;
  erro: string | null;
  /** As duas listas num handler só: disparadas em paralelo, cada uma fecharia o modal e
   *  sobrescreveria a mensagem da outra. */
  onImportar: (area: string, dados: { deals: LinhaImport[]; atividades: LinhaAtividade[] }) => void;
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

  const produtosDaArea = useMemo(() => produtos.filter((p) => p.area === area && p.ativo), [produtos, area]);

  const abasAtivas = useMemo(
    () => (abas ?? []).filter(rendeLinhas).filter((a) => escolhidas.has(a.nome)),
    [abas, escolhidas]
  );

  /** Setores das abas escolhidas que ainda não existem como produto nesta área. */
  const setoresFaltando = useMemo(() => {
    const existentes = new Set(produtosDaArea.map((p) => p.id));
    const faltam = new Map<string, string>();
    for (const aba of abasAtivas) {
      if (aba.tipo !== "oportunidades") continue;
      for (const l of aba.linhas) {
        if (!l.setorOriginal) continue;
        const id = slugificar(l.setorOriginal);
        if (id && !existentes.has(id)) faltam.set(id, l.setorOriginal);
      }
    }
    return [...faltam.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => porTexto(a.label, b.label));
  }, [abasAtivas, produtosDaArea]);

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

        const cabDeal = acharCabecalho(grade, COLUNAS, "conta");
        if (cabDeal) {
          const linhas: LinhaPrevia[] = [];
          for (const linha of grade.slice(cabDeal.i + 1)) {
            const campos: Record<string, string> = {};
            cabDeal.mapa.forEach((destino, i) => {
              if (!destino) return;
              const bruto = String(linha[i] ?? "").trim();
              campos[destino] = PLACEHOLDER.test(bruto) ? "" : bruto;
            });
            const conta = (campos.conta ?? "").trim();
            if (!conta || RODAPE.test(conta)) continue;

            const situacao = campos.situacao ?? "";
            const proximo = campos.proximoPasso ?? "";
            const setor = campos.setor ?? "";
            linhas.push({
              conta,
              escopo: "",
              estagio: estagioSugerido(situacao),
              situacao,
              proximoPasso: proximo,
              contato: campos.contato ?? "",
              responsavelTexto: campos.responsavelTexto ?? "",
              produtoId: setor ? slugificar(setor) : null,
              pausado: pausaSugerida(situacao, proximo),
              setorOriginal: setor,
              existente: contasExistentes.has(normalizarConta(conta)),
            });
          }
          return linhas.length
            ? { nome, tipo: "oportunidades" as const, linhas }
            : { nome, tipo: "ignorada" as const, motivo: "tem cabeçalho de empresa, mas nenhuma linha preenchida" };
        }

        const cabAtiv = acharCabecalho(grade, COLUNAS_ATIVIDADE, "titulo");
        if (cabAtiv) {
          const linhas: LinhaAtividadePrevia[] = [];
          for (const linha of grade.slice(cabAtiv.i + 1)) {
            const campos: Record<string, string> = {};
            cabAtiv.mapa.forEach((destino, i) => {
              if (!destino) return;
              campos[destino] = String(linha[i] ?? "").trim();
            });
            const titulo = (campos.titulo ?? "").trim();
            if (!titulo || RODAPE.test(titulo)) continue;
            linhas.push({
              titulo,
              status: statusSugerido(campos.status ?? ""),
              situacao: campos.situacao ?? "",
              proximoPasso: campos.proximoPasso ?? "",
              existente: titulosExistentes.has(normalizarTexto(titulo)),
            });
          }
          return linhas.length
            ? { nome, tipo: "atividades" as const, linhas }
            : { nome, tipo: "ignorada" as const, motivo: "tem cabeçalho de to-do, mas nenhuma linha preenchida" };
        }

        return { nome, tipo: "ignorada" as const, motivo: "sem coluna de empresa nem de to-do" };
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

          {erroLeitura && (
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

              {setoresFaltando.length > 0 && (
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
                    A planilha traz {setoresFaltando.length === 1 ? "um setor que ainda não é" : "setores que ainda não são"}{" "}
                    produto em {areaOf(area).label}. Sem cadastrar, {setoresFaltando.length === 1 ? "ele será ignorado" : "eles serão ignorados"} e os
                    cards entram sem produto.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {setoresFaltando.map((s) => (
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
                          : ["CONTA", "PRODUTO", "ESTÁGIO", "SITUAÇÃO", ""]
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
                            const prod = produtosDaArea.find((p) => p.id === l.produtoId);
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
                                <div style={{ padding: "10px 12px", fontSize: 12, color: prod ? C.body : C.ghost }}>
                                  {prod ? prod.label : l.setorOriginal ? `${l.setorOriginal} (sem cadastro)` : "—"}
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
                                <div style={celaTexto}>{l.situacao || "—"}</div>
                                <div style={{ padding: "10px 12px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  <span style={eyebrow(9, l.existente ? C.info : C.success, "0.1em")}>
                                    {l.existente ? "atualiza" : "nova"}
                                  </span>
                                  {l.pausado && <span style={eyebrow(9, C.warning, "0.1em")}>pausada</span>}
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
                  deals: abasAtivas
                    .flatMap((a) => (a.tipo === "oportunidades" ? a.linhas : []))
                    .map((l) => ({
                      conta: l.conta,
                      escopo: l.escopo,
                      estagio: l.estagio,
                      situacao: l.situacao,
                      proximoPasso: l.proximoPasso,
                      contato: l.contato,
                      responsavelTexto: l.responsavelTexto,
                      produtoId: l.produtoId,
                      pausado: l.pausado,
                    })),
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
