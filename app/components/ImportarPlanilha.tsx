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
import { STAGES, areaOf, normalizarConta, slugificar } from "@/lib/domain";
import type { Deal, LinhaImport, ProdutoCadastro } from "./api";

/**
 * A planilha usa esta frase, em todas as colunas, para dizer "ainda não sabemos nada".
 * Sem tratá-la como vazio, ela vira lixo em quatro campos de seis registros.
 */
const PLACEHOLDER = /^descobrir contato no escrit/i;

/** Aceita variações de acento e caixa nos cabeçalhos das duas planilhas. */
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

const chave = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Estágio inferido do texto da situação. É deliberadamente conservador — na dúvida, o
 * estágio mais atrás, porque adiantar um card indevidamente engana o pipeline.
 *
 * NDA, POC, transferência de dados e refinamento de escopo caem todos em `validacao`: são
 * fases do mesmo trabalho de provar que dá para fazer, e nenhuma delas significa que existe
 * proposta comercial. Nada aqui sugere `proposta` ou `negociacao` de propósito — as planilhas
 * não falam de preço, e esses dois estágios devem ser marcados por quem enviou a proposta.
 */
function estagioSugerido(situacao: string): string {
  const t = situacao.toLowerCase();
  if (!t || PLACEHOLDER.test(t)) return "lead";
  // `tra\w*fer` de propósito: a planilha real escreve "tranferência", sem o s. Casar só a
  // grafia correta jogaria o card para o início do funil por causa de um typo.
  if (/\bnda\b|\bpoc\b|tra\w*fer[êe]ncia d[eo]s? dados|refinamento de escopo/.test(t)) return "validacao";
  if (/reuni[ãa]o|apresenta[çc][ãa]o|fup|contato|aproxima[çc][ãa]o/.test(t)) return "qualificacao";
  return "lead";
}

/** "não é o momento", "aguardar" — parado, mas não num estágio. */
function pausaSugerida(situacao: string, proximo: string): boolean {
  const t = (situacao + " " + proximo).toLowerCase();
  return /n[ãa]o [ée] o momento|n[ãa]o insistir|aguardar|segundo momento|dificuldades financeiras/.test(t);
}

export type LinhaPrevia = LinhaImport & { setorOriginal: string; existente: boolean };

export default function ImportarPlanilha({
  areasEditaveis,
  produtos,
  deals,
  salvando,
  erro,
  onImportar,
  onCriarProduto,
  onFechar,
}: {
  areasEditaveis: { id: string; label: string }[];
  produtos: ProdutoCadastro[];
  deals: Deal[];
  salvando: boolean;
  erro: string | null;
  onImportar: (area: string, linhas: LinhaImport[]) => void;
  onCriarProduto: (label: string, area: string) => Promise<void>;
  onFechar: () => void;
}) {
  const [area, setArea] = useState(areasEditaveis[0]?.id ?? "");
  const [linhas, setLinhas] = useState<LinhaPrevia[] | null>(null);
  const [arquivo, setArquivo] = useState<string>("");
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);

  const produtosDaArea = useMemo(() => produtos.filter((p) => p.area === area && p.ativo), [produtos, area]);

  /** Setores da planilha que ainda não existem como produto nesta área. */
  const setoresFaltando = useMemo(() => {
    if (!linhas) return [];
    const existentes = new Set(produtosDaArea.map((p) => p.id));
    const faltam = new Map<string, string>();
    for (const l of linhas) {
      if (!l.setorOriginal) continue;
      const id = slugificar(l.setorOriginal);
      if (id && !existentes.has(id)) faltam.set(id, l.setorOriginal);
    }
    return [...faltam.entries()].map(([id, label]) => ({ id, label }));
  }, [linhas, produtosDaArea]);

  async function lerArquivo(file: File) {
    setErroLeitura(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grade = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: "" });

      // O cabeçalho nem sempre está na primeira linha — as duas planilhas têm um título
      // acima dele. Procura a primeira linha que contenha uma coluna reconhecida.
      const iCab = grade.findIndex((r) => r.some((c) => COLUNAS[chave(String(c))] === "conta"));
      if (iCab < 0) throw new Error("Não achei uma coluna de empresa/conta na planilha.");

      const mapa = grade[iCab].map((c) => COLUNAS[chave(String(c))] ?? null);
      const contasExistentes = new Set(deals.filter((d) => d.area === area).map((d) => normalizarConta(d.conta)));

      const lidas: LinhaPrevia[] = [];
      for (const linha of grade.slice(iCab + 1)) {
        const campos: Record<string, string> = {};
        mapa.forEach((destino, i) => {
          if (!destino) return;
          const bruto = String(linha[i] ?? "").trim();
          campos[destino] = PLACEHOLDER.test(bruto) ? "" : bruto;
        });
        const conta = (campos.conta ?? "").trim();
        if (!conta) continue;

        const situacao = campos.situacao ?? "";
        const proximo = campos.proximoPasso ?? "";
        const setor = campos.setor ?? "";
        lidas.push({
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

      if (!lidas.length) throw new Error("A planilha não tem nenhuma linha com empresa preenchida.");
      setLinhas(lidas);
      setArquivo(file.name);
    } catch (e) {
      setLinhas(null);
      setErroLeitura(e instanceof Error ? e.message : "Não consegui ler a planilha.");
    }
  }

  const novas = linhas?.filter((l) => !l.existente).length ?? 0;
  const atualiza = linhas?.filter((l) => l.existente).length ?? 0;

  return (
    <div
      onClick={onFechar}
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
          <div style={eyebrow(10, C.accent)}>LIFF/ COMERCIAL</div>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink, marginTop: 6 }}>
            Importar planilha
          </div>
        </div>

        <div style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Área de destino" required hint="Todas as linhas entram nesta vertical.">
              <Select
                options={areasEditaveis.map((a) => ({ value: a.id, label: a.label }))}
                value={area}
                onChange={(v) => {
                  setArea(v);
                  setLinhas(null);
                }}
              />
            </Field>
            <Field label="Arquivo" hint="A planilha é lida aqui no navegador; nada sobe antes de você confirmar.">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
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

          {linhas && (
            <>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
                <span style={eyebrow(11, C.dust)}>
                  {arquivo} · {linhas.length} linha(s)
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.success }}>{novas} a criar</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.info }}>{atualiza} a atualizar</span>
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

              <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}` }}>
                <div style={{ minWidth: 860 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.5fr 1fr 1.1fr 2fr 0.7fr",
                      background: C.canvas,
                      borderBottom: `1px solid ${C.line}`,
                    }}
                  >
                    {["CONTA", "PRODUTO", "ESTÁGIO", "SITUAÇÃO", ""].map((h, i) => (
                      <div key={i} style={{ padding: "10px 12px", ...eyebrow(10, C.faint) }}>
                        {h}
                      </div>
                    ))}
                  </div>
                  {linhas.map((l, i) => {
                    const prod = produtosDaArea.find((p) => p.id === l.produtoId);
                    return (
                      <div
                        key={i}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.5fr 1fr 1.1fr 2fr 0.7fr",
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
                            onChange={(e) =>
                              setLinhas((ls) =>
                                ls!.map((x, j) => (j === i ? { ...x, estagio: e.target.value } : x))
                              )
                            }
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
                        <div
                          style={{
                            padding: "10px 12px",
                            fontSize: 12,
                            color: C.faint,
                            lineHeight: 1.45,
                            maxHeight: 54,
                            overflow: "hidden",
                          }}
                        >
                          {l.situacao || "—"}
                        </div>
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
              disabled={salvando || !linhas?.length || !area}
              onClick={() =>
                linhas &&
                onImportar(
                  area,
                  linhas.map((l) => ({
                    conta: l.conta,
                    escopo: l.escopo,
                    estagio: l.estagio,
                    situacao: l.situacao,
                    proximoPasso: l.proximoPasso,
                    contato: l.contato,
                    responsavelTexto: l.responsavelTexto,
                    produtoId: l.produtoId,
                    pausado: l.pausado,
                  }))
                )
              }
            >
              {salvando ? "importando…" : `importar ${linhas?.length ?? 0} linha(s)`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
