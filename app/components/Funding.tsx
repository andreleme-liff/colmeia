"use client";

// Funding AWS (só admin).
//
// Três abas:
//  · ESTIMATIVAS — por oportunidade: consumo previsto na conta da LIFF, na do cliente e de IA,
//    e as linhas de funding (programa, quem recebe, valor, status, ID na AWS). No topo, o
//    consumo somado e quanto dele o funding garantido cobre.
//  · ARQUÉTIPOS — em pastas, uma por Módulo (ex.: LIFF Tax Reform): os modelos de
//    implantação (SaaS LIFF, dedicado, híbrido, 100% cliente) com as calculadoras oficiais da
//    AWS de cada um, por região, porte e conta que paga.
//  · PROGRAMAS — o catálogo de programas de funding (POC Credits, POC Cash, MAP…).
//
// Regras em `lib/funding.ts`. A ligação da estimativa com o card do comercial existe no banco
// (`dealId`), mas ainda não aparece aqui — vem numa próxima etapa.

import { useOrdem } from "./ordenacao";
import { useEffect, useState } from "react";
import { Button, Field, Input, Select } from "./ds";
import { C, GHOST_FIX, MONO, eyebrow } from "./tokens";
import { api } from "./api";
import { Modal } from "./views";
import {
  CONTAS, FORMAS_FUNDING, MODELOS_OPERACAO, PORTES, REGIOES, STATUS_FUNDING, cobertura, consumo, funding, rotuloConta,
  rotuloModelo, rotuloRegiao, rotuloStatusFunding, sugestaoDaCalculadora, usd, usdCurto,
  type Arquetipo, type Calculadora, type Estimativa, type LinhaFunding, type Pasta, type Programa,
} from "@/lib/funding";

type Produto = { id: string; label: string; area: string };
type Dados = { pastas: Pasta[]; produtos: Produto[]; programas: Programa[]; arquetipos: Arquetipo[]; estimativas: Estimativa[] };
type Aba = "estimativas" | "arquetipos" | "programas";
type Abrir =
  | { tipo: "estimativa"; id: number | null }
  | { tipo: "arquetipo"; id: number | null; pastaId?: number | null }
  | { tipo: "pasta"; id: number | null }
  | { tipo: "calculadora"; arquetipoId: number; calc: Calculadora | null }
  | { tipo: "programa"; programa: Programa | null };

const paraCentavos = (t: string) => {
  const n = Number(t.replace(/[US$\s.]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
const deCentavos = (c: number) => (c ? (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const TOM_STATUS: Record<string, string> = Object.fromEntries(STATUS_FUNDING.map((s) => [s.key, s.tom]));

export default function Funding({ gatilho }: { gatilho: number | undefined }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [aba, setAba] = useState<Aba>("estimativas");
  const [abrir, setAbrir] = useState<Abrir | null>(null);

  useEffect(() => {
    let vivo = true;
    api.funding().then(
      (d) => vivo && (setDados(d), setFalha(null)),
      (e: unknown) => vivo && setFalha(e instanceof Error ? e.message : "Não foi possível carregar o funding.")
    );
    return () => {
      vivo = false;
    };
  }, [gatilho, versao]);

  if (falha && !dados) return <div style={{ fontSize: 14, color: C.error }}>{falha}</div>;
  if (!dados) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>carregando funding…</div>;

  const recarregar = () => setVersao((v) => v + 1);
  const arqPorId = new Map(dados.arquetipos.map((a) => [a.id, a]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div role="group" aria-label="Seção" className="liff-densidade">
          {([["estimativas", `estimativas · ${dados.estimativas.length}`], ["arquetipos", `arquétipos · ${dados.arquetipos.length}`], ["programas", `programas · ${dados.programas.length}`]] as const).map(([k, r]) => (
            <button key={k} type="button" aria-pressed={aba === k} onClick={() => setAba(k)}>
              {r}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: "auto" }}>
          {aba === "estimativas" && (
            <Button variant="solid" size="sm" onClick={() => setAbrir({ tipo: "estimativa", id: null })}>
              + estimativa
            </Button>
          )}
          {aba === "arquetipos" && (
            <span style={{ display: "flex", gap: 10 }}>
              <Button variant="ghost" size="sm" onClick={() => setAbrir({ tipo: "pasta", id: null })} style={GHOST_FIX}>
                + pasta
              </Button>
              <Button variant="solid" size="sm" onClick={() => setAbrir({ tipo: "arquetipo", id: null })}>
                + arquétipo
              </Button>
            </span>
          )}
          {aba === "programas" && (
            <Button variant="solid" size="sm" onClick={() => setAbrir({ tipo: "programa", programa: null })}>
              + programa
            </Button>
          )}
        </span>
      </div>

      {aba === "estimativas" && <Estimativas dados={dados} arqPorId={arqPorId} onAbrir={(id) => setAbrir({ tipo: "estimativa", id })} />}
      {aba === "arquetipos" && (
        <Arquetipos
          dados={dados}
          onPasta={(id) => setAbrir({ tipo: "pasta", id })}
          onNovoNaPasta={(pastaId) => setAbrir({ tipo: "arquetipo", id: null, pastaId })}
          onEditar={(id) => setAbrir({ tipo: "arquetipo", id })}
          onCalc={(arquetipoId, calc) => setAbrir({ tipo: "calculadora", arquetipoId, calc })}
        />
      )}
      {aba === "programas" && <Programas programas={dados.programas} onAbrir={(p) => setAbrir({ tipo: "programa", programa: p })} />}

      {abrir?.tipo === "estimativa" && (
        <FormEstimativa
          key={abrir.id ?? "nova"}
          estimativa={abrir.id != null ? dados.estimativas.find((e) => e.id === abrir.id) ?? null : null}
          dados={dados}
          onFechar={() => setAbrir(null)}
          onCriada={(id) => {
            setAbrir({ tipo: "estimativa", id });
            recarregar();
          }}
          onMudou={recarregar}
        />
      )}
      {abrir?.tipo === "arquetipo" && (
        <FormArquetipo
          arquetipo={abrir.id != null ? arqPorId.get(abrir.id) ?? null : null}
          pastas={dados.pastas}
          pastaInicial={abrir.pastaId ?? (dados.pastas.length === 1 ? dados.pastas[0].id : null)}
          onFechar={() => setAbrir(null)}
          onMudou={() => {
            setAbrir(null);
            recarregar();
          }}
        />
      )}
      {abrir?.tipo === "pasta" && (
        <FormPasta
          pasta={abrir.id != null ? dados.pastas.find((p) => p.id === abrir.id) ?? null : null}
          produtos={dados.produtos}
          qtd={abrir.id != null ? dados.arquetipos.filter((a) => a.pastaId === abrir.id).length : 0}
          onFechar={() => setAbrir(null)}
          onMudou={() => {
            setAbrir(null);
            recarregar();
          }}
        />
      )}
      {abrir?.tipo === "calculadora" && (
        <FormCalculadora
          arquetipo={arqPorId.get(abrir.arquetipoId)!}
          calc={abrir.calc}
          onFechar={() => setAbrir(null)}
          onMudou={() => {
            setAbrir(null);
            recarregar();
          }}
        />
      )}
      {abrir?.tipo === "programa" && (
        <FormPrograma
          programa={abrir.programa}
          onFechar={() => setAbrir(null)}
          onMudou={() => {
            setAbrir(null);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

/* ============================== estimativas ============================== */

function Estimativas({ dados, arqPorId, onAbrir }: { dados: Dados; arqPorId: Map<number, Arquetipo>; onAbrir: (id: number) => void }) {
  const ests = dados.estimativas;
  const ord = useOrdem();
  const somaMes = (k: "liff" | "cliente") => ests.reduce((t, e) => t + consumo(e).mensal[k], 0);
  const totalPeriodo = ests.reduce((t, e) => t + consumo(e).total, 0);
  const garantido = ests.reduce((t, e) => t + funding(e).garantido, 0);
  const andamento = ests.reduce((t, e) => t + funding(e).emAndamento, 0);
  const cols = "1.5fr 1.2fr 0.9fr 0.8fr 0.8fr 0.8fr 0.9fr 1fr";

  return (
    <>
      <div className="rec-numeros">
        <Numero rotulo="Consumo · conta LIFF" valor={`${usdCurto(somaMes("liff"))}/mês`} detalhe="Inclui IA quando a LIFF paga" />
        <Numero rotulo="Consumo · conta do cliente" valor={`${usdCurto(somaMes("cliente"))}/mês`} detalhe="O cliente paga a AWS direto" />
        <Numero rotulo="Funding garantido" valor={usdCurto(garantido)} detalhe={totalPeriodo ? `cobre ${Math.round((garantido / totalPeriodo) * 100)}% do consumo previsto (${usdCurto(totalPeriodo)})` : "sem consumo previsto"} />
        <Numero rotulo="Funding em andamento" valor={usdCurto(andamento)} detalhe="Planejado ou solicitado" />
      </div>
      {ests.length === 0 ? (
        <div style={{ fontSize: 14, color: C.faint, lineHeight: 1.6, maxWidth: 640 }}>
          Nenhuma estimativa ainda. Use “+ estimativa”: escolha o arquétipo, a região e o porte, puxe os valores das calculadoras e registre
          os programas de funding da oportunidade.
        </div>
      ) : (
        <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}` }}>
          <div style={{ minWidth: 1080 }}>
            <div className="fat-linha fat-linha--cab" style={{ gridTemplateColumns: cols }}>
              {(
                [
                  ["conta", "CLIENTE"], ["arquetipo", "ARQUÉTIPO"], ["regiao", "REGIÃO · PORTE"], ["liff", "LIFF/MÊS"], ["cliente", "CLIENTE/MÊS"],
                  ["ia", "IA/MÊS"], ["total", "NO PERÍODO"], ["garantido", "FUNDING GARANTIDO"],
                ] as const
              ).map(([chave, h], k) => ord.th(chave, h, { ...eyebrow(10, C.faint), textAlign: k >= 3 ? "right" : "left" }))}
            </div>
            {ord
              .aplicar(ests, {
                conta: (e) => e.conta,
                arquetipo: (e) => (e.arquetipoId != null ? arqPorId.get(e.arquetipoId)?.nome : null),
                regiao: (e) => `${e.regiao} ${e.porte ?? ""}`,
                liff: (e) => consumo(e).mensal.liff,
                cliente: (e) => e.clienteMensalCentavos,
                ia: (e) => e.iaMensalCentavos || null,
                total: (e) => consumo(e).total,
                garantido: (e) => funding(e).garantido,
              })
              .map((e) => {
              const a = e.arquetipoId != null ? arqPorId.get(e.arquetipoId) : undefined;
              const c = consumo(e);
              const f = funding(e);
              const cob = cobertura(e);
              return (
                <div key={e.id} className="fat-linha liff-hover-row" style={{ gridTemplateColumns: cols, cursor: "pointer" }} onClick={() => onAbrir(e.id)}>
                  <div style={{ minWidth: 0 }}>
                    <div className="fat-cliente">{e.conta}</div>
                    <div className="fat-meta">
                      {e.ref} · {e.linhas.length} linha{e.linhas.length === 1 ? "" : "s"} de funding
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a?.nome ?? "—"}</div>
                    <div className="fat-meta">{a ? rotuloModelo(a.modelo) : ""}</div>
                  </div>
                  <div className="fat-meta" style={{ fontSize: 11.5 }}>
                    {e.regiao} · {e.porte || "—"}
                  </div>
                  <div className="fat-num">{usd(c.mensal.liff)}</div>
                  <div className="fat-num">{usd(e.clienteMensalCentavos)}</div>
                  <div className="fat-num">{e.iaMensalCentavos ? `${usd(e.iaMensalCentavos)} · ${e.iaPagaPor === "liff" ? "LIFF" : "cliente"}` : "—"}</div>
                  <div className="fat-num">{usd(c.total)}</div>
                  <div className="fat-num">
                    {usd(f.garantido)}
                    {cob != null && (
                      <div className="fd-cobertura" title={`${Math.round(cob * 100)}% do consumo previsto`}>
                        <span style={{ width: `${Math.min(100, cob * 100)}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function FormEstimativa({
  estimativa: e,
  dados,
  onFechar,
  onCriada,
  onMudou,
}: {
  estimativa: Estimativa | null;
  dados: Dados;
  onFechar: () => void;
  onCriada: (id: number) => void;
  onMudou: () => void;
}) {
  const [conta, setConta] = useState(e?.conta ?? "");
  const [arquetipoId, setArquetipoId] = useState(e?.arquetipoId != null ? String(e.arquetipoId) : "");
  const [regiao, setRegiao] = useState(e?.regiao ?? "us-east-1");
  const [porte, setPorte] = useState(e?.porte ?? "M");
  const [liff, setLiff] = useState(deCentavos(e?.liffMensalCentavos ?? 0));
  const [cliente, setCliente] = useState(deCentavos(e?.clienteMensalCentavos ?? 0));
  const [ia, setIa] = useState(deCentavos(e?.iaMensalCentavos ?? 0));
  const [iaPagaPor, setIaPagaPor] = useState<"liff" | "cliente">(e?.iaPagaPor ?? "liff");
  const [inicio, setInicio] = useState(e?.inicio ?? "");
  const [duracao, setDuracao] = useState(String(e?.duracaoMeses ?? 12));
  const [notas, setNotas] = useState(e?.notas ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linhaAberta, setLinhaAberta] = useState<LinhaFunding | "nova" | null>(null);

  const arq = dados.arquetipos.find((a) => String(a.id) === arquetipoId);
  const sug = sugestaoDaCalculadora(arq, regiao, porte);
  const corpo = {
    conta, arquetipoId: arquetipoId || null, regiao, porte,
    liffMensalCentavos: paraCentavos(liff), clienteMensalCentavos: paraCentavos(cliente), iaMensalCentavos: paraCentavos(ia),
    iaPagaPor, inicio: inicio || null, duracaoMeses: Number(duracao) || 0, notas,
  };
  const previa: Estimativa = { id: 0, ref: "", dealId: null, linhas: e?.linhas ?? [], ...corpo, arquetipoId: arq?.id ?? null, inicio: corpo.inicio };
  const c = consumo(previa);
  const f = funding(previa);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      if (e) {
        await api.fundingAlterar("estimativas", e.id, corpo);
        onMudou();
      } else {
        const r = await api.fundingCriar("estimativas", corpo);
        onCriada(Number(r.id));
      }
    } catch (x) {
      setErro(x instanceof Error ? x.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };
  const excluir = async () => {
    if (!e || !window.confirm(`Excluir a estimativa de ${e.conta} (${e.ref}) e as linhas de funding dela?`)) return;
    await api.fundingExcluir("estimativas", e.id);
    onMudou();
    onFechar();
  };

  return (
    <Modal titulo={e ? `${e.conta} · ${e.ref}` : "Nova estimativa de consumo AWS"} eyebrowTexto="LIFF/ FUNDING · ESTIMATIVA" onFechar={onFechar} largura={1120}>
      <div className="cortina-duas">
        <div className="cortina-col">
          <div style={eyebrow(10, C.dust, "0.14em")}>CONSUMO PREVISTO</div>
          <Field label="Cliente / oportunidade" required>
            <Input value={conta} onChange={setConta} placeholder="Ex.: Medley" />
          </Field>
          <Field label="Arquétipo" hint={arq ? `${rotuloModelo(arq.modelo)} · ${arq.descricao}` : "Como o produto vai rodar para este cliente."}>
            <Select value={arquetipoId} onChange={setArquetipoId} options={[{ value: "", label: "— escolha —" }, ...dados.arquetipos.filter((a) => a.ativo || String(a.id) === arquetipoId).map((a) => ({ value: String(a.id), label: rotuloArquetipo(a, dados.pastas) }))]} />
          </Field>
          <div className="rec-form__duas">
            <Field label="Região">
              <Select value={regiao} onChange={setRegiao} options={REGIOES.map((r) => ({ value: r.key, label: r.label }))} />
            </Field>
            <Field label="Porte">
              <Select value={porte} onChange={setPorte} options={PORTES.map((p) => ({ value: p, label: p }))} />
            </Field>
          </div>
          {arq && (
            <div className="fd-sugestao">
              {sug.achou ? (
                <>
                  <span>
                    Calculadoras de {rotuloRegiao(regiao)}, porte {porte}: LIFF {usd(sug.liff)}/mês · cliente {usd(sug.cliente)}/mês
                  </span>
                  <button
                    type="button"
                    className="rec-link"
                    onClick={() => {
                      setLiff(deCentavos(sug.liff));
                      setCliente(deCentavos(sug.cliente));
                    }}
                  >
                    usar esses valores
                  </button>
                </>
              ) : (
                <span>Este arquétipo não tem calculadora para {regiao}, porte {porte}. Cadastre na aba Arquétipos ou digite os valores.</span>
              )}
            </div>
          )}
          <div className="rec-form__duas">
            <Field label="Conta LIFF (US$/mês)" hint="O que a LIFF paga à AWS por este cliente.">
              <Input value={liff} onChange={setLiff} placeholder="0,00" />
            </Field>
            <Field label="Conta do cliente (US$/mês)" hint="O que o cliente paga à AWS direto.">
              <Input value={cliente} onChange={setCliente} placeholder="0,00" />
            </Field>
          </div>
          <div className="rec-form__duas">
            <Field label="IA (US$/mês)" hint="Bedrock, conforme o uso previsto.">
              <Input value={ia} onChange={setIa} placeholder="0,00" />
            </Field>
            <Field label="Quem paga a IA">
              <div role="group" aria-label="Quem paga a IA" className="liff-densidade">
                {CONTAS.map((x) => (
                  <button key={x.key} type="button" aria-pressed={iaPagaPor === x.key} onClick={() => setIaPagaPor(x.key)}>
                    {x.key === "liff" ? "LIFF" : "cliente"}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className="rec-form__duas">
            <Field label="Início do consumo" hint="Mês em que a conta começa a rodar.">
              <input type="month" value={inicio} onChange={(x) => setInicio(x.target.value)} className="rec-notas" style={{ padding: "9px 12px" }} />
            </Field>
            <Field label="Duração (meses)" hint="Período considerado no total e na cobertura.">
              <Input value={duracao} onChange={(v) => setDuracao(v.replace(/\D/g, "").slice(0, 2))} />
            </Field>
          </div>
          <Field label="Notas">
            <textarea value={notas} onChange={(x) => setNotas(x.target.value)} rows={3} className="rec-notas" placeholder="Premissas de volume, contexto da oportunidade, quem é o AM na AWS…" />
          </Field>
          <div className="fat-resumo">
            <span>No período ({Number(duracao) || 0} meses)</span>
            <strong>{usd(c.total)}</strong>
          </div>
          <div className="fd-split">
            <span>LIFF {usd(c.liff)}</span>
            <span>cliente {usd(c.cliente)}</span>
          </div>
          {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            {e ? (
              <button type="button" className="rec-link" style={{ color: C.error }} onClick={() => void excluir()}>
                excluir estimativa
              </button>
            ) : (
              <span />
            )}
            <span style={{ display: "flex", gap: 10 }}>
              <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
                fechar
              </Button>
              <Button variant="solid" size="sm" disabled={salvando || !conta.trim()} onClick={() => void salvar()}>
                {salvando ? "salvando…" : e ? "salvar estimativa" : "criar estimativa"}
              </Button>
            </span>
          </div>
        </div>

        <div className="cortina-col">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={eyebrow(10, C.dust, "0.14em")}>FUNDING</div>
            {e && (
              <button type="button" className="rec-link" onClick={() => setLinhaAberta("nova")}>
                + programa
              </button>
            )}
          </div>
          {!e ? (
            <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.6 }}>Crie a estimativa primeiro; depois registre aqui os programas de funding dela.</div>
          ) : (
            <>
              <div className="fd-funding-resumo">
                <div>
                  <span style={eyebrow(9, C.faint, "0.12em")}>Garantido</span>
                  <strong>{usd(f.garantido)}</strong>
                </div>
                <div>
                  <span style={eyebrow(9, C.faint, "0.12em")}>Em andamento</span>
                  <strong>{usd(f.emAndamento)}</strong>
                </div>
                <div>
                  <span style={eyebrow(9, C.faint, "0.12em")}>Cobertura</span>
                  <strong>{c.total ? `${Math.round((f.garantido / c.total) * 100)}%` : "—"}</strong>
                </div>
              </div>
              {e.linhas.length === 0 && linhaAberta == null && <div style={{ fontSize: 13, color: C.faint }}>Nenhum programa registrado.</div>}
              {e.linhas.map((l) => (
                <button key={l.id} type="button" className="fd-linha" onClick={() => setLinhaAberta(l)}>
                  <span>
                    <strong>{dados.programas.find((p) => p.id === l.programaId)?.label ?? l.programaId}</strong>
                    <span className="fat-meta">
                      {" "}
                      · {rotuloConta(l.beneficiario)}
                      {l.awsId ? ` · ${l.awsId}` : ""}
                      {l.expiraEm ? ` · expira ${l.expiraEm.split("-").reverse().join("/")}` : ""}
                    </span>
                  </span>
                  <span className="fat-num">{usd(l.valorCentavos)}</span>
                  <span className={`cop-tag cop-tag--${TOM_STATUS[l.status] ?? "neutro"}`}>{rotuloStatusFunding(l.status)}</span>
                </button>
              ))}
              {linhaAberta != null && (
                <FormLinha
                  key={linhaAberta === "nova" ? "nova" : linhaAberta.id}
                  estimativaId={e.id}
                  linha={linhaAberta === "nova" ? null : linhaAberta}
                  programas={dados.programas}
                  modelo={dados.arquetipos.find((a) => a.id === e.arquetipoId)?.modelo}
                  onFechar={() => setLinhaAberta(null)}
                  onMudou={() => {
                    setLinhaAberta(null);
                    onMudou();
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function FormLinha({
  estimativaId,
  linha: l,
  programas,
  modelo,
  onFechar,
  onMudou,
}: {
  estimativaId: number;
  linha: LinhaFunding | null;
  programas: Programa[];
  modelo?: string;
  onFechar: () => void;
  onMudou: () => void;
}) {
  // Quem recebe por padrão: no híbrido e no 100% cliente o consumo é na conta do cliente.
  const [programaId, setProgramaId] = useState(l?.programaId ?? "");
  const [beneficiario, setBeneficiario] = useState<"liff" | "cliente">(l?.beneficiario ?? (modelo === "hibrido" || modelo === "cliente" ? "cliente" : "liff"));
  const [valor, setValor] = useState(deCentavos(l?.valorCentavos ?? 0));
  const [status, setStatus] = useState<string>(l?.status ?? "planejado");
  const [awsId, setAwsId] = useState(l?.awsId ?? "");
  const [solicitadoEm, setSolicitadoEm] = useState(l?.solicitadoEm ?? "");
  const [aprovadoEm, setAprovadoEm] = useState(l?.aprovadoEm ?? "");
  const [expiraEm, setExpiraEm] = useState(l?.expiraEm ?? "");
  const [notas, setNotas] = useState(l?.notas ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const corpo = { estimativaId, programaId, beneficiario, valorCentavos: paraCentavos(valor), status, awsId, solicitadoEm, aprovadoEm, expiraEm, notas };
  const fazer = async (f: () => Promise<unknown>) => {
    setErro(null);
    try {
      await f();
      onMudou();
    } catch (x) {
      setErro(x instanceof Error ? x.message : "Não foi possível salvar.");
    }
  };
  const data = (valor: string, set: (v: string) => void) => (
    <input type="date" value={valor} onChange={(x) => set(x.target.value)} className="rec-notas" style={{ padding: "8px 10px" }} />
  );
  return (
    <div className="fd-form-linha">
      <div style={eyebrow(10, C.accent, "0.12em")}>{l ? "EDITAR PROGRAMA" : "NOVO PROGRAMA"}</div>
      <div className="rec-form__duas">
        <Field label="Programa" required>
          <Select value={programaId} onChange={setProgramaId} options={[{ value: "", label: "— escolha —" }, ...programas.filter((p) => p.ativo || p.id === programaId).map((p) => ({ value: p.id, label: `${p.label} · ${FORMAS_FUNDING.find((x) => x.key === p.forma)?.label}` }))]} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={setStatus} options={STATUS_FUNDING.map((s) => ({ value: s.key, label: s.label }))} />
        </Field>
      </div>
      <div className="rec-form__duas">
        <Field label="Valor (US$)">
          <Input value={valor} onChange={setValor} placeholder="0,00" size="sm" />
        </Field>
        <Field label="Quem recebe">
          <div role="group" aria-label="Quem recebe" className="liff-densidade">
            {CONTAS.map((x) => (
              <button key={x.key} type="button" aria-pressed={beneficiario === x.key} onClick={() => setBeneficiario(x.key)}>
                {x.key === "liff" ? "LIFF" : "cliente"}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="ID na AWS" hint="Fund request, oportunidade do Partner Central ou código do crédito.">
        <Input value={awsId} onChange={setAwsId} placeholder="Ex.: FR-123456" size="sm" />
      </Field>
      <div className="fd-tres">
        <Field label="Solicitado em">{data(solicitadoEm, setSolicitadoEm)}</Field>
        <Field label="Aprovado em">{data(aprovadoEm, setAprovadoEm)}</Field>
        <Field label="Expira em">{data(expiraEm, setExpiraEm)}</Field>
      </div>
      <Field label="Notas">
        <textarea value={notas} onChange={(x) => setNotas(x.target.value)} rows={2} className="rec-notas" />
      </Field>
      {erro && <div style={{ fontFamily: MONO, fontSize: 11, color: C.error }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        {l ? (
          <button type="button" className="rec-link" style={{ color: C.error }} onClick={() => window.confirm("Excluir esta linha de funding?") && void fazer(() => api.fundingExcluir("linhas", l.id))}>
            excluir
          </button>
        ) : (
          <span />
        )}
        <span style={{ display: "flex", gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
            cancelar
          </Button>
          <Button variant="solid" size="sm" disabled={!programaId} onClick={() => void fazer(() => (l ? api.fundingAlterar("linhas", l.id, corpo) : api.fundingCriar("linhas", corpo)))}>
            {l ? "salvar" : "adicionar"}
          </Button>
        </span>
      </div>
    </div>
  );
}

/* ============================== arquétipos ============================== */

/** "LIFF Tax Reform · 1 · Compartilhado" quando há pasta. */
export function rotuloArquetipo(a: Arquetipo, pastas: Pasta[]): string {
  const p = pastas.find((x) => x.id === a.pastaId);
  return p ? `${p.nome} · ${a.nome}` : a.nome;
}

function IconePasta({ aberta }: { aberta: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flex: "none" }}>
      {aberta ? (
        <path d="M1.5 4.5v8h11l2-5.5H4l-2 5.5M1.5 4.5V3h4l1.5 1.5H12v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      ) : (
        <path d="M1.5 3h4L7 4.5h7.5v8.5h-13z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function Arquetipos({
  dados,
  onPasta,
  onNovoNaPasta,
  onEditar,
  onCalc,
}: {
  dados: Dados;
  onPasta: (id: number) => void;
  onNovoNaPasta: (pastaId: number | null) => void;
  onEditar: (id: number) => void;
  onCalc: (arquetipoId: number, calc: Calculadora | null) => void;
}) {
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const alternar = (k: string) =>
    setFechadas((f) => {
      const n = new Set(f);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const semPasta = dados.arquetipos.filter((a) => a.pastaId == null || !dados.pastas.some((p) => p.id === a.pastaId));
  const grupos: { chave: string; pasta: Pasta | null; lista: Arquetipo[] }[] = [
    ...dados.pastas.map((p) => ({ chave: String(p.id), pasta: p, lista: dados.arquetipos.filter((a) => a.pastaId === p.id) })),
    ...(semPasta.length ? [{ chave: "sem", pasta: null, lista: semPasta }] : []),
  ];
  if (!grupos.length) return <div style={{ fontSize: 14, color: C.faint }}>Nenhuma pasta ainda. Crie uma por Módulo com “+ pasta”.</div>;

  const paineis = (lista: Arquetipo[]) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {lista.map((a) => (
        <section key={a.id} className="pn-painel" style={a.ativo ? undefined : { opacity: 0.6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>{a.nome}</span>
                <span className={`cop-tag cop-tag--${a.modelo === "saas_liff" ? "info" : a.modelo === "hibrido" ? "warning" : a.modelo === "cliente" ? "sucesso" : "neutro"}`}>{rotuloModelo(a.modelo)}</span>
                {!a.ativo && <span className="fat-meta">inativo</span>}
              </div>
              <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.5, marginTop: 6, maxWidth: 820 }}>{a.descricao}</div>
            </div>
            <span style={{ display: "flex", gap: 14, flex: "none" }}>
              <button type="button" className="rec-link" onClick={() => onCalc(a.id, null)}>
                + calculadora
              </button>
              <button type="button" className="rec-link" onClick={() => onEditar(a.id)}>
                editar
              </button>
            </span>
          </div>
          {a.calculadoras.length === 0 ? (
            <div style={{ fontSize: 13, color: C.faint }}>Nenhuma calculadora cadastrada.</div>
          ) : (
            <div style={{ border: `1px solid ${C.line}` }}>
              {a.calculadoras.map((c) => (
                <div key={c.id} className="fat-linha liff-hover-row fd-calc" onClick={() => onCalc(a.id, c)} style={{ cursor: "pointer" }}>
                  <span style={{ fontSize: 13, color: C.body }}>{rotuloRegiao(c.regiao)}</span>
                  <span className={`cop-tag cop-tag--${c.conta === "liff" ? "info" : "warning"}`}>{rotuloConta(c.conta)}</span>
                  <span className="fat-meta">porte {c.porte || "—"}</span>
                  <span className="fat-num">{usd(c.custoMensalCentavos)}/mês</span>
                  <span className="fat-meta" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.notas}</span>
                  <span onClick={(x) => x.stopPropagation()} style={{ textAlign: "right" }}>
                    {c.url ? (
                      <a className="rec-link" href={c.url} target="_blank" rel="noreferrer noopener">
                        abrir na AWS ↗
                      </a>
                    ) : (
                      <span className="fat-meta" style={{ color: "var(--cop-ink-warning)" }}>sem link</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {grupos.map(({ chave, pasta, lista }) => {
        const aberta = !fechadas.has(chave);
        const produto = pasta?.produtoId ? dados.produtos.find((p) => p.id === pasta.produtoId) : undefined;
        return (
          <section key={chave} className="fd-pasta">
            <div className="fd-pasta__topo">
              <button type="button" className="fd-pasta__nome" aria-expanded={aberta} onClick={() => alternar(chave)}>
                <span aria-hidden="true" className="fd-pasta__seta">{aberta ? "▾" : "▸"}</span>
                <IconePasta aberta={aberta} />
                <span>{pasta ? pasta.nome : "Sem pasta"}</span>
              </button>
              {produto && <span className="cop-tag cop-tag--neutro">{produto.label}</span>}
              <span className="fat-meta">
                {lista.length} {lista.length === 1 ? "arquétipo" : "arquétipos"}
              </span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 14 }}>
                <button type="button" className="rec-link" onClick={() => onNovoNaPasta(pasta?.id ?? null)}>
                  + arquétipo
                </button>
                {pasta && (
                  <button type="button" className="rec-link" onClick={() => onPasta(pasta.id)}>
                    editar pasta
                  </button>
                )}
              </span>
            </div>
            {pasta?.descricao && aberta && <div className="fd-pasta__desc">{pasta.descricao}</div>}
            {aberta && (lista.length ? paineis(lista) : <div style={{ fontSize: 13, color: C.faint, padding: "4px 0 0 26px" }}>Pasta vazia.</div>)}
          </section>
        );
      })}
    </div>
  );
}

function FormArquetipo({
  arquetipo: a,
  pastas,
  pastaInicial,
  onFechar,
  onMudou,
}: {
  arquetipo: Arquetipo | null;
  pastas: Pasta[];
  pastaInicial: number | null;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [pastaId, setPastaId] = useState(a ? (a.pastaId != null ? String(a.pastaId) : "") : pastaInicial != null ? String(pastaInicial) : "");
  const [nome, setNome] = useState(a?.nome ?? "");
  const [modelo, setModelo] = useState<string>(a?.modelo ?? "saas_liff");
  const [descricao, setDescricao] = useState(a?.descricao ?? "");
  const [ativo, setAtivo] = useState(a?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const corpo = { pastaId: pastaId || null, nome, modelo, descricao, ativo };
  const fazer = async (f: () => Promise<unknown>) => {
    setErro(null);
    try {
      await f();
      onMudou();
    } catch (x) {
      setErro(x instanceof Error ? x.message : "Não foi possível salvar.");
    }
  };
  return (
    <Modal titulo={a ? a.nome : "Novo arquétipo"} eyebrowTexto="LIFF/ FUNDING · ARQUÉTIPO" onFechar={onFechar} largura={640}>
      <Field label="Pasta" hint="O Módulo a que este arquétipo pertence.">
        <Select value={pastaId} onChange={setPastaId} options={[{ value: "", label: "— sem pasta —" }, ...pastas.map((p) => ({ value: String(p.id), label: p.nome }))]} />
      </Field>
      <Field label="Nome" required>
        <Input value={nome} onChange={setNome} placeholder="Ex.: 3 · No ambiente do cliente (célula)" />
      </Field>
      <Field label="Modelo de operação" hint={MODELOS_OPERACAO.find((m) => m.key === modelo)?.descricao}>
        <Select value={modelo} onChange={setModelo} options={MODELOS_OPERACAO.map((m) => ({ value: m.key, label: m.label }))} />
      </Field>
      <Field label="Descrição">
        <textarea value={descricao} onChange={(x) => setDescricao(x.target.value)} rows={4} className="rec-notas" />
      </Field>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: C.body }}>
        <input type="checkbox" checked={ativo} onChange={(x) => setAtivo(x.target.checked)} /> Ativo (aparece na escolha das estimativas)
      </label>
      {erro && <div style={{ fontFamily: MONO, fontSize: 11, color: C.error }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        {a ? (
          <button type="button" className="rec-link" style={{ color: C.error }} onClick={() => window.confirm(`Excluir ${a.nome} e as calculadoras dele? As estimativas ficam, sem arquétipo.`) && void fazer(() => api.fundingExcluir("arquetipos", a.id))}>
            excluir arquétipo
          </button>
        ) : (
          <span />
        )}
        <span style={{ display: "flex", gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
            cancelar
          </Button>
          <Button variant="solid" size="sm" disabled={!nome.trim()} onClick={() => void fazer(() => (a ? api.fundingAlterar("arquetipos", a.id, corpo) : api.fundingCriar("arquetipos", corpo)))}>
            salvar
          </Button>
        </span>
      </div>
    </Modal>
  );
}

function FormCalculadora({ arquetipo: a, calc: c, onFechar, onMudou }: { arquetipo: Arquetipo; calc: Calculadora | null; onFechar: () => void; onMudou: () => void }) {
  const [regiao, setRegiao] = useState(c?.regiao ?? "us-east-1");
  const [conta, setConta] = useState<"liff" | "cliente">(c?.conta ?? (a.modelo === "cliente" ? "cliente" : "liff"));
  const [porte, setPorte] = useState(c?.porte ?? "M");
  const [url, setUrl] = useState(c?.url ?? "");
  const [custo, setCusto] = useState(deCentavos(c?.custoMensalCentavos ?? 0));
  const [dataPreco, setDataPreco] = useState(c?.dataPreco ?? "");
  const [notas, setNotas] = useState(c?.notas ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const corpo = { arquetipoId: a.id, regiao, conta, porte, url, custoMensalCentavos: paraCentavos(custo), dataPreco, notas };
  const fazer = async (f: () => Promise<unknown>) => {
    setErro(null);
    try {
      await f();
      onMudou();
    } catch (x) {
      setErro(x instanceof Error ? x.message : "Não foi possível salvar.");
    }
  };
  return (
    <Modal titulo={c ? `Calculadora · ${a.nome}` : `Nova calculadora · ${a.nome}`} eyebrowTexto="LIFF/ FUNDING · CALCULADORA AWS" onFechar={onFechar} largura={640}>
      <Field label="Link da calculadora oficial" hint="O endereço compartilhável da AWS Pricing Calculator (Share → link público).">
        <Input value={url} onChange={setUrl} placeholder="https://calculator.aws/#/estimate?id=…" />
      </Field>
      <div className="rec-form__duas">
        <Field label="Região">
          <Select value={regiao} onChange={setRegiao} options={REGIOES.map((r) => ({ value: r.key, label: r.label }))} />
        </Field>
        <Field label="Conta que paga">
          <div role="group" aria-label="Conta que paga" className="liff-densidade">
            {CONTAS.map((x) => (
              <button key={x.key} type="button" aria-pressed={conta === x.key} onClick={() => setConta(x.key)}>
                {x.key === "liff" ? "LIFF" : "cliente"}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="fd-tres">
        <Field label="Porte">
          <Select value={porte} onChange={setPorte} options={PORTES.map((p) => ({ value: p, label: p }))} />
        </Field>
        <Field label="Custo mensal (US$)">
          <Input value={custo} onChange={setCusto} placeholder="0,00" />
        </Field>
        <Field label="Preços de">
          <input type="date" value={dataPreco} onChange={(x) => setDataPreco(x.target.value)} className="rec-notas" style={{ padding: "9px 12px" }} />
        </Field>
      </div>
      <Field label="Notas">
        <textarea value={notas} onChange={(x) => setNotas(x.target.value)} rows={3} className="rec-notas" placeholder="Premissas: instâncias, endpoints, volume de dados…" />
      </Field>
      {erro && <div style={{ fontFamily: MONO, fontSize: 11, color: C.error }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        {c ? (
          <button type="button" className="rec-link" style={{ color: C.error }} onClick={() => window.confirm("Excluir esta calculadora?") && void fazer(() => api.fundingExcluir("calculadoras", c.id))}>
            excluir
          </button>
        ) : (
          <span />
        )}
        <span style={{ display: "flex", gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
            cancelar
          </Button>
          <Button variant="solid" size="sm" onClick={() => void fazer(() => (c ? api.fundingAlterar("calculadoras", c.id, corpo) : api.fundingCriar("calculadoras", corpo)))}>
            salvar
          </Button>
        </span>
      </div>
    </Modal>
  );
}

function FormPasta({
  pasta: p,
  produtos,
  qtd,
  onFechar,
  onMudou,
}: {
  pasta: Pasta | null;
  produtos: Produto[];
  qtd: number;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [nome, setNome] = useState(p?.nome ?? "");
  const [produtoId, setProdutoId] = useState(p?.produtoId ?? "");
  const [descricao, setDescricao] = useState(p?.descricao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const corpo = { nome, produtoId: produtoId || null, descricao };
  const fazer = async (f: () => Promise<unknown>) => {
    setErro(null);
    try {
      await f();
      onMudou();
    } catch (x) {
      setErro(x instanceof Error ? x.message : "Não foi possível salvar.");
    }
  };
  const escolherProduto = (v: string) => {
    setProdutoId(v);
    const prod = produtos.find((x) => x.id === v);
    if (prod && !nome.trim()) setNome(prod.label);
  };
  return (
    <Modal titulo={p ? p.nome : "Nova pasta de arquétipos"} eyebrowTexto="LIFF/ FUNDING · PASTA" onFechar={onFechar} largura={560}>
      <Field label="Módulo" hint="Opcional. Liga a pasta a um item do cadastro.">
        <Select value={produtoId} onChange={escolherProduto} options={[{ value: "", label: "— nenhum —" }, ...produtos.map((x) => ({ value: x.id, label: x.label }))]} />
      </Field>
      <Field label="Nome" required>
        <Input value={nome} onChange={setNome} placeholder="Ex.: LIFF Tax Reform" />
      </Field>
      <Field label="Descrição">
        <textarea value={descricao} onChange={(x) => setDescricao(x.target.value)} rows={3} className="rec-notas" placeholder="De onde vêm os números, versão do documento de custos…" />
      </Field>
      {erro && <div style={{ fontFamily: MONO, fontSize: 11, color: C.error }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        {p ? (
          qtd ? (
            <span className="fat-meta">Para excluir, mova ou exclua os {qtd} arquétipo(s) da pasta.</span>
          ) : (
            <button type="button" className="rec-link" style={{ color: C.error }} onClick={() => window.confirm(`Excluir a pasta ${p.nome}?`) && void fazer(() => api.fundingExcluir("pastas", p.id))}>
              excluir pasta
            </button>
          )
        ) : (
          <span />
        )}
        <span style={{ display: "flex", gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
            cancelar
          </Button>
          <Button variant="solid" size="sm" disabled={!nome.trim()} onClick={() => void fazer(() => (p ? api.fundingAlterar("pastas", p.id, corpo) : api.fundingCriar("pastas", corpo)))}>
            salvar
          </Button>
        </span>
      </div>
    </Modal>
  );
}

/* ============================== programas ============================== */

function Programas({ programas, onAbrir }: { programas: Programa[]; onAbrir: (p: Programa) => void }) {
  return (
    <div style={{ border: `1px solid ${C.line}` }}>
      {programas.map((p) => (
        <div key={p.id} className="fat-linha liff-hover-row fd-prog" onClick={() => onAbrir(p)} style={{ cursor: "pointer", opacity: p.ativo ? 1 : 0.55 }}>
          <span className="fat-cliente">{p.label}</span>
          <span className={`cop-tag cop-tag--${p.forma === "cash" ? "sucesso" : "info"}`}>{FORMAS_FUNDING.find((f) => f.key === p.forma)?.label}</span>
          <span style={{ fontSize: 13, color: C.faint }}>{p.descricao}</span>
          <span className="fat-meta">{p.ativo ? "" : "inativo"}</span>
        </div>
      ))}
    </div>
  );
}

function FormPrograma({ programa: p, onFechar, onMudou }: { programa: Programa | null; onFechar: () => void; onMudou: () => void }) {
  const [label, setLabel] = useState(p?.label ?? "");
  const [forma, setForma] = useState<string>(p?.forma ?? "credito");
  const [descricao, setDescricao] = useState(p?.descricao ?? "");
  const [ativo, setAtivo] = useState(p?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const corpo = { label, forma, descricao, ativo };
  const fazer = async (f: () => Promise<unknown>) => {
    setErro(null);
    try {
      await f();
      onMudou();
    } catch (x) {
      setErro(x instanceof Error ? x.message : "Não foi possível salvar.");
    }
  };
  return (
    <Modal titulo={p ? p.label : "Novo programa de funding"} eyebrowTexto="LIFF/ FUNDING · PROGRAMA" onFechar={onFechar} largura={560}>
      <Field label="Nome" required>
        <Input value={label} onChange={setLabel} placeholder="Ex.: MAP · Migrate" />
      </Field>
      <Field label="Forma">
        <div role="group" aria-label="Forma" className="liff-densidade">
          {FORMAS_FUNDING.map((x) => (
            <button key={x.key} type="button" aria-pressed={forma === x.key} onClick={() => setForma(x.key)}>
              {x.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Descrição">
        <textarea value={descricao} onChange={(x) => setDescricao(x.target.value)} rows={3} className="rec-notas" placeholder="Regras, limites, quem aprova…" />
      </Field>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: C.body }}>
        <input type="checkbox" checked={ativo} onChange={(x) => setAtivo(x.target.checked)} /> Ativo
      </label>
      {erro && <div style={{ fontFamily: MONO, fontSize: 11, color: C.error }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        {p ? (
          <button type="button" className="rec-link" style={{ color: C.error }} onClick={() => window.confirm(`Excluir ${p.label}?`) && void fazer(() => api.fundingExcluir("programas", p.id))}>
            excluir
          </button>
        ) : (
          <span />
        )}
        <span style={{ display: "flex", gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
            cancelar
          </Button>
          <Button variant="solid" size="sm" disabled={!label.trim()} onClick={() => void fazer(() => (p ? api.fundingAlterar("programas", p.id, corpo) : api.fundingCriar("programas", corpo)))}>
            salvar
          </Button>
        </span>
      </div>
    </Modal>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe: string }) {
  return (
    <div className="rec-numero">
      <div style={eyebrow(10, C.faint, "0.12em")}>{rotulo}</div>
      <div className="rec-numero__valor">{valor}</div>
      <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.45 }}>{detalhe}</div>
    </div>
  );
}
