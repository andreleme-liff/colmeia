"use client";

// Visão geral em forma de cockpit.
//
// De cima para baixo:
//  1. grandes números — comercial (pipeline aberto, fase final, ganho) e operação (abertas,
//     em atraso, próximos 7 dias);
//  2. gráficos — funil comercial por etapa, pipeline aberto por produto, atividades por
//     status e por prazo;
//  3. gestor e admin — receita dos próximos 12 meses (contratada + provável); só admin — faturamento do mês;
//  4. foco da semana do comercial e da operação, e as alterações recentes (como antes).
//
// Tudo respeita os filtros do cabeçalho (produto e "Quem"): as listas que chegam aqui já vêm
// recortadas. Receita (gestor e admin) e faturamento (só admin) são da empresa inteira.

import { useEffect, useState } from "react";
import { C, MONO, eyebrow, statusColor } from "./tokens";
import { api, type Activity, type Deal } from "./api";
import { CabecalhoSecao, ListaFoco, type PainelDados } from "./views";
import ViaConexao from "./ViaConexao";
import { Grafico, S_CONTRATADA, S_PROVAVEL } from "./Receita";
import { FUNIL, STATUS, areaOf, brl, brlExato, estagioEmAberto, hojeISO, stamp, stageLabel } from "@/lib/domain";
import { ETAPAS_FINAIS, contratadaDoMes, mesDe, rotuloMes, serieMensal, situacaoEfetiva, type Contrato } from "@/lib/forecast";
import { itensDoMes, liquidoEsperado, statusDe, type Fatura } from "@/lib/faturamento";

const DIAS_SEM_MOVIMENTO = 14;
const diasEntreHoje = (iso: string, hoje: string) =>
  Math.round((Date.parse(iso.slice(0, 10) + "T00:00:00Z") - Date.parse(hoje + "T00:00:00Z")) / 86_400_000);

export default function Painel({
  dados,
  atividades,
  oportunidades,
  todasOportunidades,
  meId,
  isAdmin,
  podeVerReceita,
  area,
  gatilho,
  onAbrirAtividade,
  onAbrirDeal,
  onIr,
}: {
  dados: PainelDados;
  /** Já recortadas por produto e "Quem". */
  atividades: Activity[];
  oportunidades: Deal[];
  /** Todas as visíveis, sem recorte: a situação da receita depende do estágio do card. */
  todasOportunidades: Deal[];
  meId: number;
  isAdmin: boolean;
  /** Gestor e admin veem o resumo de receita; o faturamento ao lado é só de admin. */
  podeVerReceita: boolean;
  area: string;
  gatilho: number | undefined;
  onAbrirAtividade: (ref: string) => void;
  onAbrirDeal: (ref: string) => void;
  onIr: (view: string) => void;
}) {
  const hoje = hojeISO();

  // ---------- comercial ----------
  const abertas = oportunidades.filter((d) => estagioEmAberto(d.estagio));
  const soma = (l: Deal[]) => l.reduce((t, d) => t + d.valorCentavos, 0);
  const finais = abertas.filter((d) => (ETAPAS_FINAIS as readonly string[]).includes(d.estagio));
  const ganhas = oportunidades.filter((d) => d.estagio === "ganho");
  const paradas = abertas.filter((d) => diasEntreHoje(d.atualizadoEm, hoje) <= -DIAS_SEM_MOVIMENTO);
  const funil = FUNIL.map((k) => {
    const l = oportunidades.filter((d) => d.estagio === k);
    return { key: k, label: stageLabel(k), qtd: l.length, valor: soma(l) };
  });
  const foraDoFunil = oportunidades.filter((d) => d.estagio === "on_hold" || d.estagio === "lost");
  const porVertical = Object.entries(
    abertas.reduce<Record<string, Deal[]>>((acc, d) => ((acc[d.area] ??= []).push(d), acc), {})
  )
    .map(([id, l]) => ({ id, label: areaOf(id).label, cor: areaOf(id).color, qtd: l.length, valor: soma(l) }))
    .sort((a, b) => b.valor - a.valor);

  // ---------- operação ----------
  const emAberto = atividades.filter((a) => a.status !== "concluido");
  const minhas = emAberto.filter((a) => a.responsavelId === meId);
  const dias = (a: Activity) => (a.prazo ? diasEntreHoje(a.prazo, hoje) : null);
  const atrasadas = emAberto.filter((a) => (dias(a) ?? 0) < 0);
  const faixasPrazo = [
    { label: "Em atraso", cor: C.error, l: atrasadas },
    { label: "Hoje", cor: C.warning, l: emAberto.filter((a) => dias(a) === 0) },
    { label: "Próximos 7 dias", cor: C.warning, l: emAberto.filter((a) => { const d = dias(a); return d !== null && d > 0 && d <= 7; }) },
    { label: "Depois", cor: C.success, l: emAberto.filter((a) => (dias(a) ?? -1) > 7) },
    { label: "Sem prazo", cor: C.faint, l: emAberto.filter((a) => !a.prazo) },
  ];
  const porStatus = STATUS.map((s) => ({ key: s.key, label: s.label, cor: statusColor(s.key), qtd: atividades.filter((a) => a.status === s.key).length }));

  return (
    <div className="pn">
      <div style={{ display: "flex", alignItems: "baseline", gap: "4px 14px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: C.ink }}>{dados.saudacao.titulo}</span>
        <span style={{ fontSize: 14, color: C.dust }}>
          {dados.saudacao.linha.map((t, i) =>
            typeof t === "string" ? (
              t
            ) : (
              <a
                key={i}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if ("ref" in t) (t.ref.startsWith("T-") ? onAbrirAtividade : onAbrirDeal)(t.ref);
                  else onIr(t.ir);
                }}
                title={"ref" in t ? t.ref : undefined}
                style={{ color: C.accent, textDecoration: "none", fontWeight: 600 }}
              >
                {t.texto}
              </a>
            )
          )}
        </span>
      </div>

      {/* ---------- 1 · grandes números ---------- */}
      <div className="pn-kpis">
        <Kpi grupo="Comercial" rotulo="Pipeline aberto" valor={brl(soma(abertas))} detalhe={`${abertas.length} oportunidades`} onClick={() => onIr("comercial")} />
        <Kpi grupo="Comercial" rotulo="Fase final" valor={brl(soma(finais))} detalhe={`${finais.length} em proposta, validação ou contrato`} onClick={() => onIr("comercial")} />
        <Kpi grupo="Comercial" rotulo="Ganho" valor={brl(soma(ganhas))} detalhe={`${ganhas.length} fechadas`} tom="ok" onClick={() => onIr("comercial")} />
        <Kpi grupo="Operação" rotulo="Atividades abertas" valor={String(emAberto.length)} detalhe={`${minhas.length} com você`} onClick={() => onIr("operacoes")} />
        <Kpi
          grupo="Operação"
          rotulo="Em atraso"
          valor={String(atrasadas.length)}
          detalhe={paradas.length ? `+ ${paradas.length} oportunidade${paradas.length > 1 ? "s" : ""} parada${paradas.length > 1 ? "s" : ""} há ${DIAS_SEM_MOVIMENTO}+ dias` : "nenhuma oportunidade parada"}
          tom={atrasadas.length ? "erro" : "ok"}
          onClick={() => onIr("operacoes")}
        />
        <Kpi
          grupo="Operação"
          rotulo="Próximos 7 dias"
          valor={String(faixasPrazo[1].l.length + faixasPrazo[2].l.length)}
          detalhe={`${faixasPrazo[1].l.length} para hoje`}
          tom={faixasPrazo[1].l.length ? "aviso" : undefined}
          onClick={() => onIr("cronograma")}
        />
      </div>

      {/* ---------- 2 · gráficos ---------- */}
      <div className="pn-linha">
        <section className="pn-painel">
          <CabecalhoSecao titulo="FUNIL COMERCIAL" acao={{ texto: "pipeline →", onClick: () => onIr("comercial") }} />
          <Barras
            itens={funil.map((f) => ({ chave: f.key, rotulo: f.label, valor: f.valor, texto: brl(f.valor), qtd: f.qtd, cor: f.key === "ganho" ? "var(--liff-success)" : "var(--liff-accent)" }))}
            vazio="Nenhuma oportunidade no recorte."
          />
          {foraDoFunil.length > 0 && (
            <div className="pn-nota">
              Fora do funil: {foraDoFunil.filter((d) => d.estagio === "on_hold").length} em on hold ·{" "}
              {foraDoFunil.filter((d) => d.estagio === "lost").length} perdidas
            </div>
          )}
        </section>
        <section className="pn-painel">
          <CabecalhoSecao titulo="PIPELINE ABERTO POR PRODUTO" />
          <Barras
            itens={porVertical.map((v) => ({ chave: v.id, rotulo: v.label, valor: v.valor, texto: brl(v.valor), qtd: v.qtd, cor: v.cor }))}
            vazio="Nada em aberto no recorte."
          />
        </section>
      </div>

      <div className="pn-linha">
        <section className="pn-painel">
          <CabecalhoSecao titulo="ATIVIDADES POR STATUS" acao={{ texto: "quadro →", onClick: () => onIr("operacoes") }} />
          <BarraEmpilhada itens={porStatus.map((s) => ({ chave: s.key, rotulo: s.label, qtd: s.qtd, cor: s.cor }))} />
        </section>
        <section className="pn-painel">
          <CabecalhoSecao titulo="PRAZOS DO QUE ESTÁ ABERTO" acao={{ texto: "cronograma →", onClick: () => onIr("cronograma") }} />
          <Barras
            itens={faixasPrazo.map((f) => ({ chave: f.label, rotulo: f.label, valor: f.l.length, texto: String(f.l.length), cor: f.cor }))}
            vazio="Nenhuma atividade aberta."
          />
        </section>
      </div>

      {/* ---------- 3 · receita (gestor e admin) e faturamento (só admin) ---------- */}
      {podeVerReceita && <Financeiro comFaturamento={isAdmin} area={area} oportunidades={todasOportunidades} hoje={hoje} gatilho={gatilho} onIr={onIr} />}

      {/* ---------- 4 · foco e alterações, como antes ---------- */}
      <section className="pn-painel">
        <CabecalhoSecao titulo="COMERCIAL · FOCO DA SEMANA" acao={{ texto: "ver pipeline →", onClick: () => onIr("comercial") }} />
        <ListaFoco linhas={dados.focoComercial} vazio="Nada exigindo atenção no pipeline esta semana." onAbrir={onAbrirDeal} />
      </section>
      <section className="pn-painel">
        <CabecalhoSecao titulo="OPERAÇÃO · FOCO DA SEMANA" acao={{ texto: "ver quadro →", onClick: () => onIr("operacoes") }} />
        <ListaFoco linhas={dados.focoAtividades} vazio="Nenhuma atividade em atraso, com prazo próximo ou em execução." onAbrir={onAbrirAtividade} />
      </section>
      <section className="pn-painel">
        <CabecalhoSecao titulo="ALTERAÇÕES RECENTES" acao={isAdmin ? { texto: "changelog completo →", onClick: () => onIr("auditoria") } : undefined} />
        {dados.logs.length === 0 && <div style={{ fontSize: 14, color: C.faint }}>Nada registrado ainda.</div>}
        {dados.logs.map((l) => (
          <div key={l.id} className="liff-painel-log" style={{ display: "grid", gap: 20, alignItems: "baseline", padding: "12px 0", borderTop: `1px solid ${C.panel2}` }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{stamp(l.criadoEm)}</span>
            <span style={{ fontSize: 14, color: C.dust }}>
              {l.autor}
              {l.via && <ViaConexao nome={l.via} />}
            </span>
            <span style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>{l.texto}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ============================== peças ============================== */

function Kpi({
  grupo,
  rotulo,
  valor,
  detalhe,
  tom,
  onClick,
}: {
  grupo: string;
  rotulo: string;
  valor: string;
  detalhe: string;
  tom?: "ok" | "aviso" | "erro";
  onClick?: () => void;
}) {
  return (
    <button type="button" className="pn-kpi" data-tom={tom} onClick={onClick}>
      <span style={eyebrow(9, C.faint, "0.14em")}>{grupo}</span>
      <span style={eyebrow(10, C.dust, "0.12em")}>{rotulo}</span>
      <span className="pn-kpi__valor">{valor}</span>
      <span className="pn-kpi__detalhe">{detalhe}</span>
    </button>
  );
}

/** Barras horizontais com rótulo e valor escritos: uma série, sem legenda. */
/** `qtd`, quando vem, vira uma segunda coluna de números, alinhada entre as linhas. */
function Barras({ itens, vazio }: { itens: { chave: string; rotulo: string; valor: number; texto: string; qtd?: number; cor: string }[]; vazio: string }) {
  const max = Math.max(0, ...itens.map((i) => i.valor));
  if (!itens.length || max === 0) return <div style={{ fontSize: 13, color: C.faint }}>{vazio}</div>;
  return (
    <div className="pn-barras">
      {itens.map((i) => (
        <div key={i.chave} className="pn-barra">
          <span className="pn-barra__rotulo">{i.rotulo}</span>
          <span className="pn-barra__trilho">
            {i.valor > 0 && <span className="pn-barra__valor" style={{ width: `${(i.valor / max) * 100}%`, background: i.cor }} />}
          </span>
          {i.qtd === undefined ? (
            <span className="pn-barra__texto">{i.texto}</span>
          ) : (
            // Duas colunas de verdade: o valor numa, a quantidade na outra, cada uma com a sua
            // largura — os números ficam um embaixo do outro mesmo sem linha de grade.
            <span className="pn-barra__texto pn-barra__texto--duas">
              <span style={{ color: i.valor > 0 ? undefined : "var(--liff-text-faint)" }}>{i.texto}</span>
              <span style={{ color: i.qtd > 0 ? undefined : "var(--liff-text-faint)" }} title={`${i.qtd} ${i.qtd === 1 ? "oportunidade" : "oportunidades"}`}>
                {i.qtd}
              </span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Um total dividido em partes: barra única empilhada + legenda com as contagens. */
function BarraEmpilhada({ itens }: { itens: { chave: string; rotulo: string; qtd: number; cor: string }[] }) {
  const total = itens.reduce((t, i) => t + i.qtd, 0);
  if (!total) return <div style={{ fontSize: 13, color: C.faint }}>Nenhuma atividade no recorte.</div>;
  return (
    <>
      <div className="pn-empilhada" role="img" aria-label={itens.map((i) => `${i.rotulo}: ${i.qtd}`).join(", ")}>
        {itens
          .filter((i) => i.qtd > 0)
          .map((i) => (
            <span key={i.chave} style={{ flexGrow: i.qtd, background: i.cor }} title={`${i.rotulo}: ${i.qtd}`} />
          ))}
      </div>
      <div className="pn-legenda">
        {itens.map((i) => (
          <div key={i.chave}>
            <span aria-hidden className="pn-legenda__marca" style={{ background: i.cor }} />
            <span>{i.rotulo}</span>
            <strong>{i.qtd}</strong>
            <span className="pn-legenda__pct">{Math.round((i.qtd / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Receita (gestor e admin) e faturamento (só admin): busca os contratos e as faturas e resume. */
function Financeiro({
  comFaturamento,
  area,
  oportunidades,
  hoje,
  gatilho,
  onIr,
}: {
  comFaturamento: boolean;
  area: string;
  oportunidades: Deal[];
  hoje: string;
  gatilho: number | undefined;
  onIr: (view: string) => void;
}) {
  const [dados, setDados] = useState<{ contratos: Contrato[]; faturas: Fatura[] } | null>(null);
  const [falha, setFalha] = useState(false);
  useEffect(() => {
    let vivo = true;
    // Faturamento é rota só da administração: o gestor nem pergunta.
    Promise.all([api.receitas(), comFaturamento ? api.faturas() : Promise.resolve({ faturas: [] as Fatura[] })]).then(
      ([r, f]) => vivo && setDados({ contratos: r.contratos, faturas: f.faturas }),
      () => vivo && setFalha(true)
    );
    return () => {
      vivo = false;
    };
  }, [gatilho, comFaturamento]);

  if (falha) return null;
  if (!dados) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>carregando receita…</div>;

  const porId = new Map(oportunidades.map((d) => [d.id, d]));
  const naArea = <T extends { area: string }>(l: T[]) => l.filter((x) => area === "all" || x.area === area);
  const contratos = naArea(dados.contratos);
  const efetivos = contratos.map((c) => ({ contrato: c, efetiva: situacaoEfetiva(c, c.dealId != null ? porId.get(c.dealId) : null) }));
  const mes = mesDe(hoje);
  const serie = serieMensal(efetivos, mes, 12);
  const contratada = serie.reduce((t, m) => t + contratadaDoMes(m), 0);
  const provavel = serie.reduce((t, m) => t + m.provavel, 0);

  const contratado = new Set(efetivos.filter((e) => e.efetiva === "contratada").map((e) => e.contrato.id));
  const faturas = naArea(dados.faturas);
  const aEmitir = naArea(itensDoMes(dados.contratos, (c) => contratado.has(c.id), dados.faturas, mes, hoje)).filter((i) => i.status === "a_emitir");
  const abertas = faturas.filter((f) => f.status === "emitida");
  const vencidas = abertas.filter((f) => statusDe(f, hoje) === "vencida");
  const recebido = faturas.filter((f) => f.status === "paga" && f.pagoEm && mesDe(f.pagoEm) === mes);
  const somaLiq = (l: Fatura[]) => l.reduce((t, f) => t + liquidoEsperado(f), 0);

  return (
    <div className={comFaturamento ? "pn-linha pn-linha--larga" : undefined}>
      <section className="pn-painel">
        <CabecalhoSecao
          titulo={`RECEITA · ${rotuloMes(mes).toUpperCase()} A ${rotuloMes(serie[serie.length - 1].mes).toUpperCase()}`}
          acao={{ texto: "forecast →", onClick: () => onIr("receita") }}
        />
        <div className="pn-mini">
          <Mini rotulo="Contratada · 12 meses" valor={contratada} />
          <Mini rotulo={`Assinatura em ${rotuloMes(mes)}`} valor={serie[0]?.assinatura ?? 0} />
          <Mini rotulo="Provável · 12 meses" valor={provavel} />
        </div>
        <ul className="rec-legenda" aria-label="Legenda" style={{ marginBottom: 6 }}>
          {[S_CONTRATADA, S_PROVAVEL].map((x) => (
            <li key={x.key}>
              <span aria-hidden className="rec-legenda__marca" style={{ background: x.cor }} />
              {x.label}
            </li>
          ))}
        </ul>
        <Grafico serie={serie} series={[S_CONTRATADA, S_PROVAVEL]} />
      </section>
      {comFaturamento && <section className="pn-painel">
        <CabecalhoSecao titulo={`FATURAMENTO · ${rotuloMes(mes).toUpperCase()}`} acao={{ texto: "faturamento →", onClick: () => onIr("faturamento") }} />
        <div className="pn-fat">
          <Mini rotulo="A emitir este mês" valor={aEmitir.reduce((t, i) => t + i.valorCentavos, 0)} detalhe={`${aEmitir.length} fatura${aEmitir.length === 1 ? "" : "s"}`} />
          <Mini rotulo="Em aberto" valor={somaLiq(abertas)} detalhe={`${abertas.length} fatura${abertas.length === 1 ? "" : "s"}`} />
          <Mini rotulo="Vencido" valor={somaLiq(vencidas)} detalhe={vencidas.length ? `${vencidas.length} em atraso` : "nada vencido"} tom={vencidas.length ? "erro" : "ok"} />
          <Mini rotulo="Recebido este mês" valor={recebido.reduce((t, f) => t + (f.valorPagoCentavos ?? 0), 0)} detalhe={`${recebido.length} baixa${recebido.length === 1 ? "" : "s"}`} />
        </div>
      </section>}
    </div>
  );
}

function Mini({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: number; detalhe?: string; tom?: "ok" | "erro" }) {
  return (
    <div className="pn-mini__item" data-tom={tom}>
      <span style={eyebrow(10, C.faint, "0.12em")}>{rotulo}</span>
      <span className="pn-mini__valor" title={brlExato(valor)}>
        {brl(valor)}
      </span>
      {detalhe && <span className="pn-kpi__detalhe">{detalhe}</span>}
    </div>
  );
}
