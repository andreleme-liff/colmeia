"use client";

// As telas do sistema. São puramente de apresentação: recebem dados já recortados e
// devolvem eventos. Quem decide o que pode ser alterado é o servidor — `podeEditar` que
// chega em cada registro é o eco daquela decisão, usado só para desenhar o estado.

import { useState, type CSSProperties, type MouseEvent, type ReactNode, useRef } from "react";
import { Button, Field, Input, Select, Switch } from "./ds";
import { C, GHOST_FIX, MONO, SANS, dot, eyebrow, mesh, prioColor, statusColor } from "./tokens";
import type { Activity, AreaCadastro, Deal, LogEntry, Pessoa } from "./api";
import SeletorArea, { type OpcaoArea } from "./SeletorArea";
import Historico from "./Historico";
import {
  ADMIN_CARDS, PAPEIS, STAGES, STATUS, areaOf, brl, ddmm, porTexto, stamp, statusLabel, todasAreas,
} from "@/lib/domain";

/* =========================================================
   Visão geral
   ========================================================= */

export type HeroNumero = { label: string; valor: string; hint: string; cor: string };
/**
 * Linha de foco. A mesma forma serve para atividade e para oportunidade: as duas listas
 * respondem a mesma pergunta — o que merece atenção esta semana — e ficarem paralelas é o
 * que deixa o painel legível de cima a baixo.
 */
export type LinhaFoco = {
  ref: string;
  /** Por que está aqui: "atraso", "hoje", "D+3", "parada 23d", "alta". */
  sinal: string;
  sinalCor: string;
  titulo: string;
  /** Quadradinho da vertical, à esquerda do título. Só no comercial. */
  cor?: string;
  contexto: string;
  meta: string;
  metaCor: string;
  podeAbrir: boolean;
};
export type MetricaComercial = { label: string; valor: string; cor: string };
export type PainelDados = {
  escopoFrase: string;
  escopoAreas: string;
  hero: HeroNumero[];
  comercial: MetricaComercial[];
  focoComercial: LinhaFoco[];
  atividades: MetricaComercial[];
  focoAtividades: LinhaFoco[];
  logs: LogEntry[];
};

/** Título de seção com um link à direita. Repetido três vezes no painel. */
function CabecalhoSecao({ titulo, meta, acao }: { titulo: string; meta?: string; acao?: { texto: string; onClick: () => void } }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, marginBottom: 24 }}>
      <div style={eyebrow(11, C.dust)}>{titulo}</div>
      {meta && <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint, textAlign: "right" }}>{meta}</span>}
      {acao && (
        <span
          role="button"
          onClick={acao.onClick}
          style={{ ...eyebrow(10, C.accent, "0.12em"), cursor: "pointer", whiteSpace: "nowrap" }}
        >
          {acao.texto}
        </span>
      )}
    </div>
  );
}

/** Faixa de métricas de uma seção. Idêntica no comercial e nas atividades. */
function FaixaMetricas({ itens }: { itens: MetricaComercial[] }) {
  return (
    <div style={{ display: "flex", gap: 56, flexWrap: "wrap", marginBottom: 30 }}>
      {itens.map((c) => (
        <div key={c.label}>
          <div style={eyebrow(10, C.faint, "0.14em")}>{c.label}</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.035em", color: c.cor, lineHeight: 1.1, marginTop: 6 }}>
            {c.valor}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Foco da semana de uma seção. A primeira coluna diz POR QUE a linha está ali — atraso,
 * prazo, parada, prioridade —, que é a informação que a lista existe para dar.
 */
function ListaFoco({
  linhas,
  vazio,
  onAbrir,
}: {
  linhas: LinhaFoco[];
  vazio: string;
  onAbrir: (ref: string) => void;
}) {
  return (
    <>
      <div style={{ ...eyebrow(10, C.faint, "0.12em"), marginBottom: 4 }}>FOCO DA SEMANA · CLIQUE PARA ABRIR</div>
      {linhas.length === 0 && <div style={{ fontSize: 14, color: C.faint, paddingTop: 14 }}>{vazio}</div>}
      {linhas.map((l) => (
        <div
          key={l.ref}
          className={l.podeAbrir ? "liff-hover-row liff-painel-linha" : "liff-painel-linha"}
          onClick={() => l.podeAbrir && onAbrir(l.ref)}
          title={l.podeAbrir ? "Abrir" : "Somente leitura nesta área"}
          style={{
            display: "grid",
            gap: 20,
            alignItems: "center",
            padding: "14px 0",
            borderTop: `1px solid ${C.panel2}`,
            cursor: l.podeAbrir ? "pointer" : "default",
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 12, color: l.sinalCor }}>{l.sinal}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 15, color: C.ink, lineHeight: 1.4, minWidth: 0 }}>
            {l.cor && <span style={{ width: 8, height: 8, borderRadius: 2, background: l.cor, flex: "none" }} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.titulo}</span>
          </span>
          <span style={{ fontSize: 13, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {l.contexto}
          </span>
          <span style={{ ...eyebrow(11, l.metaCor, "0.08em"), textAlign: "right" }}>{l.meta}</span>
        </div>
      ))}
    </>
  );
}

/**
 * Painel inicial. O desenho é documental de propósito: seções separadas por fio, sem card,
 * sem sombra, sem canto arredondado — a hierarquia vem do tamanho do número e do espaço.
 *
 * As cores vêm dos tokens e não dos HEX do handoff: o desenho é só escuro, e o sistema tem
 * os dois temas. Cada HEX do documento tem um alias equivalente aqui.
 */
export function Overview({
  dados,
  onAbrirAtividade,
  onAbrirDeal,
  onVerPipeline,
  onVerQuadro,
  onVerAuditoria,
}: {
  dados: PainelDados;
  onAbrirAtividade: (ref: string) => void;
  onAbrirDeal: (ref: string) => void;
  onVerPipeline: () => void;
  onVerQuadro: () => void;
  onVerAuditoria: () => void;
}) {
  return (
    <div style={{ maxWidth: 1180 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", paddingBottom: 34 }}>
        <span style={{ fontSize: 15, color: C.dust }}>{dados.escopoFrase}</span>
        <span style={eyebrow(11, C.faint, "0.1em")}>{dados.escopoAreas}</span>
      </div>

      {/* `nowrap` no número: valores longos quebravam a coluna, e a forma curta do dinheiro
          existe justamente para caber aqui. */}
      <div className="liff-hero" style={{ display: "grid", gap: 40, paddingBottom: 44, borderBottom: `1px solid ${C.line}` }}>
        {dados.hero.map((k) => (
          <div key={k.label}>
            <div style={eyebrow(10, C.faint)}>{k.label}</div>
            <div
              style={{
                fontSize: 60,
                fontWeight: 800,
                letterSpacing: "-0.04em",
                color: k.cor,
                lineHeight: 0.98,
                marginTop: 10,
                whiteSpace: "nowrap",
              }}
            >
              {k.valor}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: C.faint, marginTop: 8 }}>{k.hint}</div>
          </div>
        ))}
      </div>

      {/* Comercial antes de atividades: a pergunta "como está a receita" vem antes de "o que
          estou executando" para quem abre o sistema de manhã. */}
      <section style={{ padding: "40px 0", borderBottom: `1px solid ${C.line}` }}>
        <CabecalhoSecao titulo="COMERCIAL" acao={{ texto: "ver pipeline →", onClick: onVerPipeline }} />
        <FaixaMetricas itens={dados.comercial} />
        <ListaFoco
          linhas={dados.focoComercial}
          vazio="Nada exigindo atenção no pipeline esta semana."
          onAbrir={onAbrirDeal}
        />
      </section>

      <section style={{ padding: "40px 0", borderBottom: `1px solid ${C.line}` }}>
        <CabecalhoSecao titulo="ATIVIDADES" acao={{ texto: "ver quadro →", onClick: onVerQuadro }} />
        <FaixaMetricas itens={dados.atividades} />
        <ListaFoco
          linhas={dados.focoAtividades}
          vazio="Nenhuma atividade em atraso, com prazo próximo ou em execução."
          onAbrir={onAbrirAtividade}
        />
      </section>

      <section style={{ padding: "40px 0 12px" }}>
        <CabecalhoSecao titulo="ALTERAÇÕES RECENTES" acao={{ texto: "auditoria completa →", onClick: onVerAuditoria }} />
        {dados.logs.length === 0 && <div style={{ fontSize: 14, color: C.faint }}>Nada registrado ainda.</div>}
        {dados.logs.map((l) => (
          <div
            key={l.id}
            className="liff-painel-log"
            style={{ display: "grid", gap: 20, alignItems: "baseline", padding: "13px 0", borderTop: `1px solid ${C.panel2}` }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{stamp(l.criadoEm)}</span>
            <span style={{ fontSize: 14, color: C.dust }}>{l.autor}</span>
            <span style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>{l.texto}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

/* =========================================================
   Comercial — pipeline por estágio
   ========================================================= */
export type ColunaDeal = { key: string; label: string; total: string; cards: Deal[] };

export function Comercial({
  colunas,
  produtos,
  onMover,
  onSoltar,
  onAbrir,
}: {
  colunas: ColunaDeal[];
  produtos: { id: string; label: string }[];
  onMover: (id: number, dir: 1 | -1) => void;
  /** Arrastar manda o estágio de destino; as setas mandam a direção. Ver o comentário abaixo. */
  onSoltar: (id: number, estagio: string) => void;
  onAbrir: (id: number) => void;
}) {
  // Coluna sob o cursor durante o arraste. Sem esta marca, um funil de seis colunas não deixa
  // claro onde o card vai cair.
  const [alvo, setAlvo] = useState<string | null>(null);

  return (
    <div style={mesh({ display: "flex", gap: 1, overflowX: "auto" })}>
      {colunas.map((col) => (
        <div
          key={col.key}
          onDragOver={(e) => {
            e.preventDefault();
            if (alvo !== col.key) setAlvo(col.key);
          }}
          onDragLeave={(e) => {
            // Só limpa ao sair da coluna de verdade: entrar num filho dispara dragleave no pai.
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo((a) => (a === col.key ? null : a));
          }}
          onDrop={(e) => {
            e.preventDefault();
            setAlvo(null);
            const id = Number(e.dataTransfer.getData("text/plain"));
            if (!Number.isInteger(id)) return;
            // Soltar na própria coluna não é alteração; sem isto viraria um PATCH à toa.
            if (col.cards.some((c) => c.id === id)) return;
            onSoltar(id, col.key);
          }}
          style={{
            background: alvo === col.key ? C.panel2 : C.cell,
            minWidth: 236,
            flex: 1,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={eyebrow(11, C.dust, "0.14em")}>{col.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{col.total}</span>
          </div>
          {col.cards.map((d) => {
            const cor = areaOf(d.area).color;
            return (
              <div
                key={d.id}
                className={d.podeEditar ? "liff-hover-card" : undefined}
                draggable={d.podeEditar}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", String(d.id))}
                onDragEnd={() => setAlvo(null)}
                onClick={() => d.podeEditar && onAbrir(d.id)}
                title={d.podeEditar ? "Arraste para mover de estágio, ou clique para editar" : "Somente leitura nesta área"}
                style={{
                  background: C.panel,
                  border: `1px solid ${C.line}`,
                  borderTop: `2px solid ${cor}`,
                  padding: 14,
                  cursor: d.podeEditar ? "pointer" : "default",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, justifyContent: "space-between" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{d.conta}</div>
                  {d.pausado && <span style={eyebrow(9, C.warning, "0.1em")}>pausada</span>}
                </div>

                {/* Produto é o que se vende; a cor continua sendo a da área, para não haver
                    duas dimensões cromáticas competindo no mesmo card. */}
                {d.produtoId && (
                  <div style={{ ...eyebrow(9, C.dust, "0.12em"), marginTop: 6 }}>
                    {produtos.find((p) => p.id === d.produtoId)?.label ?? d.produtoId}
                  </div>
                )}

                {(d.situacao || d.escopo) && (
                  <div
                    style={{
                      fontSize: 12,
                      color: C.faint,
                      marginTop: 6,
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {d.situacao || d.escopo}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: cor }}>{brl(d.valorCentavos)}</span>
                  <span style={eyebrow(10, C.faint, "0.1em")}>{d.responsavel.split(" ")[0]}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 12,
                    borderTop: `1px solid ${C.line}`,
                    paddingTop: 10,
                  }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{d.proximoPasso}</span>
                  {/* As setas ficam mesmo com o arraste: arrastar não existe em navegador de
                      celular, e sem elas o card ficaria imóvel no telefone. */}
                  <span style={{ display: "flex", gap: 6 }}>
                    {([-1, 1] as const).map((dir) => (
                      <span
                        key={dir}
                        draggable={false}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (d.podeEditar) onMover(d.id, dir);
                        }}
                        title={d.podeEditar ? "Mover uma casa" : "Sem permissão de edição nesta área"}
                        style={{
                          cursor: d.podeEditar ? "pointer" : "not-allowed",
                          fontFamily: MONO,
                          fontSize: 12,
                          color: d.podeEditar ? C.dust : C.ghost,
                          padding: "0 5px",
                          border: `1px solid ${C.line}`,
                        }}
                      >
                        {dir < 0 ? "←" : "→"}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   Cronograma — a semana pela frente, misturando os dois tipos
   ========================================================= */
export type ItemCronograma = {
  ref: string;
  tipo: "oportunidade" | "atividade";
  titulo: string;
  detalhe: string;
  quando: string;
  semData: boolean;
  atrasado: boolean;
  podeAbrir: boolean;
};
export type BlocoArea = { areaId: string; label: string; cor: string; itens: ItemCronograma[] };
export type Semana = { chave: string; rotulo: string; titulo: string; total: number; areas: BlocoArea[] };

/**
 * Cronograma. Uma linha do tempo por semana, e dentro dela um bloco por área.
 *
 * Oportunidade e atividade aparecem juntas de propósito: quem planeja a semana de uma
 * vertical não separa "o que é venda" de "o que é execução" — separa por quando acontece. O
 * tipo vira um rótulo na linha, não uma tela diferente.
 */
export function Cronograma({
  semanas,
  onAbrir,
}: {
  semanas: Semana[];
  onAbrir: (ref: string, tipo: "oportunidade" | "atividade") => void;
}) {
  if (!semanas.length) {
    return (
      <div style={{ fontSize: 14, color: C.faint, lineHeight: 1.6, maxWidth: 560 }}>
        Nada agendado. O cronograma se monta a partir da data do próximo passo de cada
        oportunidade e atividade — preencha o campo “Quando” num card para ele aparecer aqui.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1180 }}>
      {semanas.map((s) => (
        <section key={s.chave} style={{ paddingBottom: 40, marginBottom: 40, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span style={eyebrow(11, s.chave === "atrasado" ? C.error : C.dust)}>{s.titulo}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{s.rotulo}</span>
            </div>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
              {s.total} {s.total === 1 ? "item" : "itens"}
            </span>
          </div>

          {s.areas.map((bloco) => (
            <div key={bloco.areaId} style={{ marginBottom: 26 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: bloco.cor, flex: "none" }} />
                <span style={eyebrow(10, C.dust, "0.12em")}>{bloco.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: C.ghost }}>{bloco.itens.length}</span>
              </div>
              {bloco.itens.map((i) => (
                <div
                  key={i.ref}
                  className={i.podeAbrir ? "liff-hover-row liff-cronograma-linha" : "liff-cronograma-linha"}
                  onClick={() => i.podeAbrir && onAbrir(i.ref, i.tipo)}
                  title={i.podeAbrir ? "Abrir" : "Somente leitura nesta área"}
                  style={{
                    display: "grid",
                    gap: 20,
                    alignItems: "baseline",
                    padding: "12px 0",
                    borderTop: `1px solid ${C.panel2}`,
                    cursor: i.podeAbrir ? "pointer" : "default",
                  }}
                >
                  {/* Data em itálico quando foi assumida e não informada: o cronograma não
                      pode fingir que alguém marcou o dia. */}
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      color: i.atrasado ? C.error : i.semData ? C.ghost : C.faint,
                      fontStyle: i.semData ? "italic" : "normal",
                    }}
                  >
                    {i.quando}
                  </span>
                  <span style={eyebrow(9, i.tipo === "oportunidade" ? C.accent : C.info, "0.1em")}>
                    {i.tipo === "oportunidade" ? "oport." : "ativ."}
                  </span>
                  <span style={{ fontSize: 14, color: C.ink, lineHeight: 1.4, minWidth: 0 }}>{i.titulo}</span>
                  <span style={{ fontSize: 13, color: C.faint, lineHeight: 1.5, minWidth: 0 }}>{i.detalhe}</span>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/* =========================================================
   Operações — kanban com arrastar e soltar
   ========================================================= */
export type ColunaBoard = { key: string; label: string; cards: Activity[] };

export function Operacoes({
  colunas,
  produtos,
  onSoltar,
  onAbrir,
}: {
  colunas: ColunaBoard[];
  produtos: { id: string; label: string }[];
  onSoltar: (id: number, status: string) => void;
  onAbrir: (id: number) => void;
}) {
  const [alvo, setAlvo] = useState<string | null>(null);

  return (
    <>
      <div style={mesh({ display: "flex", gap: 1, overflowX: "auto", alignItems: "stretch" })}>
        {colunas.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              if (alvo !== col.key) setAlvo(col.key);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo((a) => (a === col.key ? null : a));
            }}
            onDrop={(e) => {
              e.preventDefault();
              setAlvo(null);
              const id = Number(e.dataTransfer.getData("text/plain"));
              if (!Number.isInteger(id)) return;
              if (col.cards.some((c) => c.id === id)) return;
              onSoltar(id, col.key);
            }}
            style={{
              background: alvo === col.key ? C.panel2 : C.cell,
              minWidth: 262,
              flex: 1,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 420,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                borderBottom: `1px solid ${C.line}`,
                paddingBottom: 10,
              }}
            >
              <span style={eyebrow(11, C.dust, "0.14em")}>{col.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{col.cards.length}</span>
            </div>
            {col.cards.map((c) => {
              const area = areaOf(c.area);
              return (
                <div
                  key={c.id}
                  className="liff-hover-card"
                  draggable={c.podeEditar}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", String(c.id))}
                  onDragEnd={() => setAlvo(null)}
                  onClick={() => onAbrir(c.id)}
                  style={{
                    background: C.panel,
                    border: `1px solid ${C.line}`,
                    borderLeft: `2px solid ${area.color}`,
                    padding: 14,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={eyebrow(10, area.color, "0.12em")}>{area.short}</span>
                    <span style={eyebrow(10, prioColor(c.prioridade), "0.12em")}>{c.prioridade}</span>
                  </div>
                  <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.4, marginTop: 9, fontWeight: 600 }}>
                    {c.titulo}
                  </div>

                  {/* Produto abaixo do título, como no card do Comercial. A cor continua
                      sendo a da área, para não haver duas dimensões cromáticas competindo. */}
                  {c.produtoId && (
                    <div style={{ ...eyebrow(9, C.dust, "0.12em"), marginTop: 6 }}>
                      {produtos.find((p) => p.id === c.produtoId)?.label ?? c.produtoId}
                    </div>
                  )}

                  {/* Cortada em três linhas, como no card do Comercial: o card responde "onde
                      isto está" de relance; o texto inteiro fica no drawer. */}
                  {c.situacao && (
                    <div
                      style={{
                        fontSize: 12,
                        color: C.faint,
                        marginTop: 8,
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {c.situacao}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 12,
                      fontFamily: MONO,
                      fontSize: 10,
                      color: C.faint,
                    }}
                  >
                    <span>{c.responsavel.split(" ")[0]}</span>
                    <span>{ddmm(c.prazo)}</span>
                  </div>

                  {c.proximoPasso && (
                    <div
                      style={{
                        marginTop: 10,
                        borderTop: `1px solid ${C.line}`,
                        paddingTop: 10,
                        fontFamily: MONO,
                        fontSize: 10,
                        color: C.faint,
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {c.proximoPasso}
                    </div>
                  )}

                  {/* As mesmas setas do pipeline, pelo mesmo motivo: arrastar não existe em
                      navegador de celular, e sem elas o card ficaria imóvel no telefone. */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 6,
                      marginTop: 10,
                      borderTop: `1px solid ${C.line}`,
                      paddingTop: 10,
                    }}
                  >
                    {([-1, 1] as const).map((dir) => {
                      const i = STATUS.findIndex((s) => s.key === c.status);
                      const destino = STATUS[i + dir];
                      const ativo = c.podeEditar && !!destino;
                      return (
                        <span
                          key={dir}
                          draggable={false}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (ativo) onSoltar(c.id, destino.key);
                          }}
                          title={
                            !c.podeEditar
                              ? "Sem permissão de edição nesta área"
                              : destino
                                ? `Mover para ${destino.label}`
                                : "Já está na ponta do quadro"
                          }
                          style={{
                            cursor: ativo ? "pointer" : "not-allowed",
                            fontFamily: MONO,
                            fontSize: 12,
                            color: ativo ? C.dust : C.ghost,
                            padding: "0 5px",
                            border: `1px solid ${C.line}`,
                          }}
                        >
                          {dir < 0 ? "←" : "→"}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
        Arraste os cards entre as colunas, ou use as setas — o movimento é gravado no log com autor e horário.
        Cards de áreas sem permissão de edição não se movem.
      </div>
    </>
  );
}

/* =========================================================
   Atividades — tabela plana
   ========================================================= */
// A coluna liberada pelo tipo vai para o título, que é o que mais quebra em duas linhas.
const ACT_COLS = "2.9fr 1fr 1fr 0.8fr 0.9fr";

export function Atividades({
  rows,
  critico,
  onAbrir,
}: {
  rows: Activity[];
  critico: (a: Activity) => boolean;
  onAbrir: (id: number) => void;
}) {
  return (
    <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}` }}>
      <div className="liff-table">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: ACT_COLS,
            background: C.canvas,
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          {["ATIVIDADE", "ÁREA", "RESPONSÁVEL", "PRAZO", "STATUS"].map((h) => (
            <div key={h} style={{ padding: "12px 16px", ...eyebrow(10, C.faint) }}>
              {h}
            </div>
          ))}
        </div>
        {rows.map((r) => {
          const area = areaOf(r.area);
          return (
            <div
              key={r.id}
              className="liff-hover-row"
              onClick={() => onAbrir(r.id)}
              style={{
                display: "grid",
                gridTemplateColumns: ACT_COLS,
                background: C.cell,
                borderBottom: `1px solid ${C.line}`,
                cursor: "pointer",
                alignItems: "center",
              }}
            >
              <div style={{ padding: "14px 16px", fontSize: 14, color: C.ink }}>{r.titulo}</div>
              <div
                style={{
                  padding: "14px 16px",
                  fontSize: 13,
                  color: area.color,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={dot(area.color)} />
                {area.label}
              </div>
              <div style={{ padding: "14px 16px", fontSize: 13, color: C.body }}>{r.responsavel}</div>
              <div
                style={{ padding: "14px 16px", fontFamily: MONO, fontSize: 12, color: critico(r) ? C.error : C.dust }}
              >
                {ddmm(r.prazo)}
              </div>
              <div style={{ padding: "14px 16px", ...eyebrow(10, statusColor(r.status), "0.1em") }}>
                {statusLabel(r.status)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   Cadastros
   ========================================================= */
// A aba de oportunidades saiu: era a lista do CRM em forma de tabela, e o pipeline já é o
// lugar delas — com estágio, valor e histórico, que a tabela não mostrava.
export const CAD_TABS = [
  { key: "pessoas", label: "pessoas" },
  { key: "produtos", label: "produtos" },
  { key: "areas", label: "áreas" },
] as const;

const TITULO_NOVO: Record<string, string> = {
  pessoas: "NOVA PESSOA",
  produtos: "NOVO PRODUTO",
  areas: "NOVA VERTICAL",
};

export type LinhaCad = { key: string; a: string; b: string; c: string; abrir?: () => void };
export type CadSet = { head: string[]; rows: LinhaCad[]; ph: string };

/**
 * Fecha a sobreposição só quando o gesto COMEÇOU no fundo.
 *
 * Sem isto, selecionar texto num campo e soltar o mouse fora do painel fechava a janela no
 * meio da seleção. O motivo é que o painel é filho do fundo: quando o `mousedown` e o
 * `mouseup` caem em elementos diferentes, o navegador dispara o `click` no ancestral comum
 * dos dois — que nesse caso é o próprio fundo. O `stopPropagation` do painel nunca chega a
 * rodar, porque o alvo do clique nem passa por ele.
 *
 * Guardar de onde o gesto partiu é o que separa "cliquei fora para fechar" de "arrastei para
 * fora enquanto selecionava".
 */
export function useFecharNoFundo(onFechar: () => void) {
  const comecouNoFundo = useRef(false);
  return {
    onMouseDown: (e: MouseEvent) => {
      comecouNoFundo.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent) => {
      if (comecouNoFundo.current && e.target === e.currentTarget) onFechar();
    },
  };
}

/**
 * Campo de data. Por baixo continua sendo `input type="date"` — o seletor nativo é o melhor
 * widget disponível: é traduzido, navegável pelo teclado e, no celular, abre a roda de data
 * do próprio sistema, que nenhum calendário desenhado à mão alcança.
 *
 * O que faltava era achá-lo. O ícone do calendário é um glifo escuro que o navegador
 * desenha por conta própria: sobre o fundo escuro do sistema ele some, e só abria clicando
 * exatamente nele. Aqui o clique em qualquer ponto do campo abre o seletor, e o CSS
 * (`globals.css`) inverte o ícone no tema escuro para ele existir aos olhos.
 */
function CampoData({
  valor,
  onChange,
  desabilitado,
  estilo,
}: {
  valor: string;
  onChange: (v: string) => void;
  desabilitado?: boolean;
  estilo?: CSSProperties;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={ref}
      type="date"
      value={valor}
      disabled={desabilitado}
      onChange={(e) => onChange(e.target.value)}
      onClick={() => {
        // Clicar no ícone já abre o seletor sozinho, e aí esta chamada lança — daí o try.
        try {
          ref.current?.showPicker?.();
        } catch {
          /* já aberto, ou navegador sem suporte: o campo segue editável pelo teclado */
        }
      }}
      style={{ ...campoNativo, cursor: desabilitado ? "default" : "pointer", ...estilo }}
    />
  );
}

/** Texto que vira campo ao clicar. Salva no Enter ou ao sair; Esc desfaz. */
function TextoEditavel({
  valor,
  onSalvar,
  titulo,
  estilo,
}: {
  valor: string;
  onSalvar: (v: string) => void;
  titulo?: string;
  estilo?: CSSProperties;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);

  const confirmar = () => {
    setEditando(false);
    const limpo = texto.trim();
    if (limpo && limpo !== valor) onSalvar(limpo);
    else setTexto(valor);
  };

  if (!editando) {
    return (
      <span
        onClick={() => (setTexto(valor), setEditando(true))}
        title={titulo}
        style={{ ...estilo, cursor: "text", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {valor}
      </span>
    );
  }

  return (
    <input
      autoFocus
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") confirmar();
        if (e.key === "Escape") {
          setTexto(valor);
          setEditando(false);
        }
      }}
      style={{
        ...estilo,
        background: C.code,
        border: `1px solid ${C.accent}`,
        borderRadius: 4,
        padding: "4px 7px",
        outline: "none",
        fontFamily: "inherit",
      }}
    />
  );
}

/**
 * Bloco de texto longo que salva ao sair do campo, não a cada tecla: a alteração vira uma
 * linha de auditoria, e gravar por caractere encheria o histórico de ruído.
 *
 * `valor` reentra pelo props quando o estado recarrega — o `key` de quem monta cuida de
 * descartar o rascunho ao trocar de registro.
 */
function TextoLongoEditavel({
  valor,
  editavel,
  linhas,
  placeholder,
  onSalvar,
}: {
  valor: string;
  editavel: boolean;
  linhas: number;
  placeholder: string;
  onSalvar: (v: string) => void;
}) {
  const [texto, setTexto] = useState(valor);

  if (!editavel) {
    return (
      <div style={{ fontSize: 13, lineHeight: 1.6, color: valor ? C.body : C.ghost, whiteSpace: "pre-wrap" }}>
        {valor || "—"}
      </div>
    );
  }

  return (
    <textarea
      rows={linhas}
      value={texto}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const limpo = texto.trim();
        if (limpo !== valor) onSalvar(limpo);
      }}
      style={{ ...campoNativo, resize: "vertical", lineHeight: 1.5 }}
    />
  );
}

/** Aba "áreas": a cor de cada vertical é configuração, e muda como todo mundo vê o quadro —
 *  por isso só admin edita. O `input type=color` devolve HEX, que é o que o servidor aceita. */
function TabelaAreas({
  areas,
  contagem,
  podeEditar,
  onCor,
  onExcluir,
  onNome,
}: {
  areas: AreaCadastro[];
  contagem: (id: string) => number;
  podeEditar: boolean;
  onCor: (id: string, cor: string) => void;
  onExcluir: (id: string, label: string) => void;
  onNome: (id: string, patch: { label?: string; short?: string }) => void;
}) {
  return (
    <div style={{ minWidth: 480 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr 1fr 44px",
          background: C.canvas,
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        {["ÁREA", "COR", "ATIVIDADES", ""].map((h, i) => (
          <div key={i} style={{ padding: "12px 16px", ...eyebrow(10, C.faint) }}>
            {h}
          </div>
        ))}
      </div>
      {areas.map((a) => (
        <div
          key={a.id}
          style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 44px", borderBottom: `1px solid ${C.line}`, alignItems: "center" }}
        >
          <div style={{ padding: "9px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ ...dot(`var(--liff-app-area-${a.id})`), width: 9, height: 9, flex: "none" }} />
            {podeEditar ? (
              <>
                <TextoEditavel
                  valor={a.label}
                  onSalvar={(v) => onNome(a.id, { label: v })}
                  titulo="Clique para renomear a vertical"
                  estilo={{ fontSize: 14, color: C.ink, flex: 1, minWidth: 0 }}
                />
                <TextoEditavel
                  valor={a.short}
                  onSalvar={(v) => onNome(a.id, { short: v })}
                  titulo="Clique para alterar a sigla"
                  estilo={{ ...eyebrow(10, C.faint, "0.1em"), width: 56, textAlign: "right" }}
                />
              </>
            ) : (
              <>
                <span style={{ fontSize: 14, color: C.ink, flex: 1 }}>LIFF {a.label}</span>
                <span style={eyebrow(10, C.faint, "0.1em")}>{a.short}</span>
              </>
            )}
          </div>
          <div style={{ padding: "9px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="color"
              value={a.cor}
              disabled={!podeEditar}
              onChange={(e) => onCor(a.id, e.target.value)}
              title={podeEditar ? "Escolher a cor desta vertical" : "Só a administração altera a cor"}
              style={{
                width: 34,
                height: 26,
                padding: 0,
                border: `1px solid ${C.line}`,
                borderRadius: 4,
                background: "transparent",
                cursor: podeEditar ? "pointer" : "not-allowed",
              }}
            />
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint, textTransform: "uppercase" }}>{a.cor}</span>
          </div>
          <div style={{ padding: "13px 16px", fontFamily: MONO, fontSize: 11, color: C.faint }}>
            {contagem(a.id)} ativas
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            {podeEditar && (
              <span
                role="button"
                onClick={() => onExcluir(a.id, a.label)}
                title={`Excluir ${a.label}`}
                style={{ cursor: "pointer", fontFamily: MONO, fontSize: 14, color: C.ghost, padding: "4px 8px" }}
              >
                ×
              </span>
            )}
          </div>
        </div>
      ))}
      <div style={{ padding: "14px 16px", fontSize: 12, lineHeight: 1.6, color: C.faint }}>
        A cor pinta chip, card, barra e tabela em toda a interface. No tema claro ela é escurecida
        automaticamente para manter contraste sobre o fundo Floral White.
        {podeEditar && " Uma vertical só pode ser excluída quando não tem mais atividade nem oportunidade."}
      </div>
    </div>
  );
}

/** Cadastro de uma vertical nova. O id sai do nome (vira variável CSS), então o formulário
 *  pede só nome, sigla e cor. */
function NovaArea({ salvando, onCriar }: { salvando: boolean; onCriar: (d: { label: string; short: string; cor: string }) => void }) {
  const [label, setLabel] = useState("");
  const [short, setShort] = useState("");
  const [cor, setCor] = useState("#4B6B9B");

  return (
    <>
      <Field label="Nome da vertical" required>
        <Input placeholder="Seguros" value={label} onChange={setLabel} />
      </Field>
      <Field label="Sigla" hint="Até 8 caracteres. Aparece nos cards do quadro.">
        <Input placeholder="SEG" value={short} onChange={setShort} />
      </Field>
      <Field label="Cor">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input
            type="color"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            style={{
              width: 40,
              height: 32,
              padding: 0,
              border: `1px solid ${C.line}`,
              borderRadius: 4,
              background: "transparent",
              cursor: "pointer",
            }}
          />
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint, textTransform: "uppercase" }}>{cor}</span>
        </div>
      </Field>
      <Button
        variant="outline"
        size="sm"
        disabled={salvando || !label.trim()}
        style={{ justifyContent: "center" }}
        onClick={() => {
          onCriar({ label: label.trim(), short: short.trim() || label.trim(), cor });
          setLabel("");
          setShort("");
        }}
      >
        {salvando ? "criando…" : "cadastrar vertical"}
      </Button>
    </>
  );
}

/**
 * Pré-cadastro de pessoa. Não cria acesso: a conta nasce no primeiro login pelo Google, e o
 * que se faz aqui é deixar nome, papel e permissões prontos para quando isso acontecer.
 */
function NovaPessoa({
  salvando,
  dominio,
  onCriar,
}: {
  salvando: boolean;
  dominio: string;
  onCriar: (d: { nome: string; email: string; papel: string }) => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<string>("membro");

  return (
    <>
      <Field label="Nome completo" required>
        <Input placeholder="Larissa Prado" value={nome} onChange={setNome} />
      </Field>
      <Field label="E-mail" required hint={`Precisa ser @${dominio} — é o domínio aceito no login.`}>
        <Input placeholder={`larissa@${dominio}`} value={email} onChange={setEmail} />
      </Field>
      <Field label="Papel" hint="O papel é o teto; o acesso por área se define em Administração.">
        <Select options={[...PAPEIS]} value={papel} onChange={setPapel} />
      </Field>
      <Button
        variant="outline"
        size="sm"
        disabled={salvando || !nome.trim() || !email.trim()}
        style={{ justifyContent: "center" }}
        onClick={() => {
          onCriar({ nome: nome.trim(), email: email.trim(), papel });
          setNome("");
          setEmail("");
        }}
      >
        {salvando ? "cadastrando…" : "cadastrar pessoa"}
      </Button>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: C.faint }}>
        A pessoa entra sozinha no primeiro login pelo Google — o cadastro só a espera do outro
        lado, já com papel e permissões.
      </div>
    </>
  );
}

/** Produto é o que se vende dentro de uma vertical. Sempre nasce preso a uma área. */
function NovoProduto({
  salvando,
  areas,
  onCriar,
}: {
  salvando: boolean;
  areas: { id: string; label: string }[];
  onCriar: (d: { label: string; area: string }) => void;
}) {
  const [label, setLabel] = useState("");
  const [area, setArea] = useState("");

  if (!areas.length) {
    return (
      <div style={{ fontSize: 13, lineHeight: 1.6, color: C.faint }}>
        Cadastre uma vertical antes: todo produto pertence a uma.
      </div>
    );
  }

  return (
    <>
      <Field label="Nome do produto" required>
        <Input placeholder="Regtrack Farma" value={label} onChange={setLabel} />
      </Field>
      <Field label="Vertical" required hint="O formulário de oportunidade só oferece os produtos da área escolhida.">
        <Select options={opcoesArea(areas)} value={area} onChange={setArea} />
      </Field>
      <Button
        variant="outline"
        size="sm"
        disabled={salvando || !label.trim() || !area}
        style={{ justifyContent: "center" }}
        onClick={() => {
          onCriar({ label: label.trim(), area });
          setLabel("");
        }}
      >
        {salvando ? "cadastrando…" : "cadastrar produto"}
      </Button>
    </>
  );
}

export function Cadastros({
  tab,
  onTab,
  set,
  areas,
  contagemPorArea,
  podeEditarAreas,
  onCorArea,
  onCriarArea,
  onExcluirArea,
  onNomeArea,
  salvandoArea,
  areasEditaveis,
  dominio,
  onCriarPessoa,
  onCriarProduto,
}: {
  tab: string;
  onTab: (k: string) => void;
  set: CadSet;
  areas: AreaCadastro[];
  contagemPorArea: (id: string) => number;
  podeEditarAreas: boolean;
  onCorArea: (id: string, cor: string) => void;
  onCriarArea: (d: { label: string; short: string; cor: string }) => void;
  onExcluirArea: (id: string, label: string) => void;
  onNomeArea: (id: string, patch: { label?: string; short?: string }) => void;
  salvandoArea: boolean;
  /** Produto é cadastro de admin, mas a lista respeita quem enxerga o quê. */
  areasEditaveis: { id: string; label: string }[];
  dominio: string;
  onCriarPessoa: (d: { nome: string; email: string; papel: string }) => void;
  onCriarProduto: (d: { label: string; area: string }) => void;
}) {
  return (
    <>
      <div style={mesh({ display: "flex", gap: 1, width: "fit-content", marginBottom: 22, flexWrap: "wrap" })}>
        {CAD_TABS.map((t) => (
          <div
            key={t.key}
            onClick={() => onTab(t.key)}
            style={{
              padding: "9px 16px",
              cursor: "pointer",
              ...eyebrow(11, tab === t.key ? C.ink : C.faint, "0.1em"),
              background: tab === t.key ? C.panel2 : C.canvas,
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      <div className="liff-cad-split" style={mesh({ display: "grid", gap: 1 })}>
        <div className="liff-scroll-x" style={{ background: C.cell }}>
          {tab === "areas" ? (
            <TabelaAreas areas={areas} contagem={contagemPorArea} podeEditar={podeEditarAreas} onCor={onCorArea} onExcluir={onExcluirArea} onNome={onNomeArea} />
          ) : (
          <div style={{ minWidth: 480 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 1fr 1fr",
                background: C.canvas,
                borderBottom: `1px solid ${C.line}`,
              }}
            >
              {set.head.map((h) => (
                <div key={h} style={{ padding: "12px 16px", ...eyebrow(10, C.faint) }}>
                  {h}
                </div>
              ))}
            </div>
            {set.rows.map((r) => (
              <div
                key={r.key}
                className={r.abrir ? "liff-hover-row" : undefined}
                onClick={r.abrir}
                title={r.abrir ? "Abrir para editar" : undefined}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.6fr 1fr 1fr",
                  borderBottom: `1px solid ${C.line}`,
                  cursor: r.abrir ? "pointer" : undefined,
                }}
              >
                <div style={{ padding: "13px 16px", fontSize: 14, color: C.ink }}>{r.a}</div>
                <div style={{ padding: "13px 16px", fontSize: 13, color: C.body }}>{r.b}</div>
                <div style={{ padding: "13px 16px", fontFamily: MONO, fontSize: 11, color: C.faint }}>{r.c}</div>
              </div>
            ))}
          </div>
          )}
        </div>

        <div style={{ background: C.cell, padding: 22 }}>
          <div style={{ ...eyebrow(11, C.dust), marginBottom: 18 }}>{TITULO_NOVO[tab] ?? "NOVO REGISTRO"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Um formulário por aba, e não um genérico com Nome/Área/Observação: pessoa e
                produto não pedem os mesmos campos, e o formulário único não conseguia
                enviar nenhum dos dois. Verticais e produtos são configuração do sistema —
                só admin cadastra, como já valia para a cor da área. */}
            {!podeEditarAreas ? (
              <div style={{ fontSize: 13, lineHeight: 1.6, color: C.faint }}>
                Só a administração faz cadastros. Peça a quem administra o sistema.
              </div>
            ) : tab === "areas" ? (
              <NovaArea salvando={salvandoArea} onCriar={onCriarArea} />
            ) : tab === "pessoas" ? (
              <NovaPessoa salvando={salvandoArea} dominio={dominio} onCriar={onCriarPessoa} />
            ) : (
              <NovoProduto salvando={salvandoArea} areas={areasEditaveis} onCriar={onCriarProduto} />
            )}
            <div style={{ fontSize: 12, lineHeight: 1.6, color: C.faint }}>
              Cadastros alimentam os seletores de atividades, oportunidades e permissões. Alterações entram na
              auditoria.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* =========================================================
   Administração — matriz de permissões
   ========================================================= */
/** Acima disto a matriz vira rolagem horizontal sem fim e para de servir. */
const LIMITE_MATRIZ = 8;
const permCols = (n: number) => `1.5fr repeat(${n},1fr) 0.9fr`;
const PERM_STYLE: Record<string, { label: string; bg: string; bd: string; ink: string }> = {
  edit: {
    label: "editar",
    bg: "color-mix(in srgb, var(--liff-success) 12%, transparent)",
    bd: "color-mix(in srgb, var(--liff-success) 35%, transparent)",
    ink: C.success,
  },
  view: {
    label: "ver",
    bg: "color-mix(in srgb, var(--liff-info) 12%, transparent)",
    bd: "color-mix(in srgb, var(--liff-info) 35%, transparent)",
    ink: C.info,
  },
  none: { label: "—", bg: "transparent", bd: C.line, ink: C.ghost },
};

/** A célula de permissão, igual nos dois formatos. */
function CelulaPerm({
  nivel,
  travado,
  onClick,
  style,
}: {
  nivel: string;
  travado: boolean;
  onClick: () => void;
  style?: CSSProperties;
}) {
  const s = PERM_STYLE[nivel] ?? PERM_STYLE.none;
  return (
    <div
      onClick={() => !travado && onClick()}
      title={
        travado ? "Admin tem edição em tudo por definição do papel" : "Clique para alternar sem acesso / ver / editar"
      }
      style={{
        padding: "7px 4px",
        textAlign: "center",
        cursor: travado ? "default" : "pointer",
        ...eyebrow(10, s.ink, "0.1em"),
        border: `1px solid ${s.bd}`,
        background: s.bg,
        borderRadius: 6,
        ...style,
      }}
    >
      {s.label}
    </div>
  );
}

/** Formato longo: uma pessoa por vez, áreas em grade que quebra. Vale quando a matriz
 *  deixaria de caber — ver tudo de uma vez só ajuda enquanto cabe numa tela. */
function PermissoesPorPessoa({
  pessoas,
  areas,
  meuId,
  onCiclar,
  onAtivo,
}: {
  pessoas: Pessoa[];
  areas: { id: string; label: string; short: string; color: string }[];
  meuId: number;
  onCiclar: (userId: number, area: string) => void;
  onAtivo: (userId: number, ativo: boolean) => void;
}) {
  const [aberto, setAberto] = useState<number | null>(pessoas[0]?.id ?? null);

  return (
    <div style={{ border: `1px solid ${C.line}`, marginBottom: 28 }}>
      {pessoas.map((u) => {
        const expandido = aberto === u.id;
        const edita = u.papel === "admin" ? areas.length : Object.values(u.perms).filter((n) => n === "edit").length;
        const ve = u.papel === "admin" ? 0 : Object.values(u.perms).filter((n) => n === "view").length;
        return (
          <div key={u.id} style={{ borderBottom: `1px solid ${C.line}`, background: C.cell }}>
            <div
              className="liff-hover-row"
              onClick={() => setAberto(expandido ? null : u.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "13px 16px",
                cursor: "pointer",
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint, width: 12 }}>{expandido ? "−" : "+"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{u.nome}</div>
                <div style={eyebrow(10, C.faint, "0.1em")}>{u.papel}</div>
              </div>
              <div style={eyebrow(10, C.faint, "0.1em")}>
                {u.papel === "admin" ? "todas as áreas" : `${edita} editar · ${ve} ver`}
              </div>
              <Switch
                checked={u.ativo}
                disabled={u.id === meuId}
                title={u.id === meuId ? "Você não pode desativar a própria conta" : "Ativa ou corta o acesso"}
                onChange={(v) => onAtivo(u.id, v)}
              />
            </div>

            {expandido && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                  gap: 8,
                  padding: "4px 16px 16px",
                  background: C.canvas,
                }}
              >
                {areas.map((a) => (
                  // Cada área é uma célula fechada: sem a borda, o controle de uma coluna
                  // encosta no nome da coluna seguinte e não dá para saber a qual pertence.
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 10px",
                      background: C.cell,
                      border: `1px solid ${C.line}`,
                    }}
                  >
                    <span style={{ ...dot(a.color), flex: "none" }} />
                    <span
                      style={{
                        fontSize: 13,
                        color: C.body,
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.label}
                    </span>
                    <CelulaPerm
                      nivel={u.papel === "admin" ? "edit" : u.perms[a.id] ?? "none"}
                      travado={u.papel === "admin"}
                      onClick={() => onCiclar(u.id, a.id)}
                      style={{ minWidth: 62, flex: "none" }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Admin({
  pessoas,
  meuId,
  onCiclar,
  onAtivo,
}: {
  pessoas: Pessoa[];
  meuId: number;
  onCiclar: (userId: number, area: string) => void;
  onAtivo: (userId: number, ativo: boolean) => void;
}) {
  const areas = todasAreas();

  // Com poucas verticais a matriz é imbatível: dá para ler a política inteira de uma vez.
  // Passando do limite ela só produz rolagem horizontal, e a leitura por pessoa passa a
  // valer mais.
  if (areas.length > LIMITE_MATRIZ) {
    return (
      <>
        <PermissoesPorPessoa
          pessoas={pessoas}
          areas={areas}
          meuId={meuId}
          onCiclar={onCiclar}
          onAtivo={onAtivo}
        />
        <div className="liff-admin-cards" style={mesh({ display: "grid", gap: 1 })}>
          {ADMIN_CARDS.map((c) => (
            <div key={c.title} style={{ background: C.cell, padding: 22 }}>
              <div style={{ ...eyebrow(11, C.accent), marginBottom: 10 }}>{c.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: C.body }}>{c.body}</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}`, marginBottom: 28 }}>
        <div style={{ minWidth: 160 + areas.length * 110 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: permCols(areas.length),
              background: C.canvas,
              borderBottom: `1px solid ${C.line}`,
            }}
          >
            <div style={{ padding: "12px 16px", ...eyebrow(10, C.faint) }}>USUÁRIO</div>
            {areas.map((a) => (
              <div key={a.id} style={{ padding: "12px 10px", ...eyebrow(10, a.color, "0.1em"), textAlign: "center" }}>
                {a.short}
              </div>
            ))}
            <div style={{ padding: "12px 16px", ...eyebrow(10, C.faint), textAlign: "center" }}>ATIVO</div>
          </div>

          {pessoas.map((u) => (
            <div
              key={u.id}
              style={{
                display: "grid",
                gridTemplateColumns: permCols(areas.length),
                background: C.cell,
                borderBottom: `1px solid ${C.line}`,
                alignItems: "center",
              }}
            >
              <div style={{ padding: "13px 16px" }}>
                <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{u.nome}</div>
                <div style={eyebrow(10, C.faint, "0.1em")}>{u.papel}</div>
              </div>
              {areas.map((a) => (
                <CelulaPerm
                  key={a.id}
                  nivel={u.papel === "admin" ? "edit" : u.perms[a.id] ?? "none"}
                  travado={u.papel === "admin"}
                  onClick={() => onCiclar(u.id, a.id)}
                  style={{ margin: 8 }}
                />
              ))}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Switch
                  checked={u.ativo}
                  disabled={u.id === meuId}
                  title={u.id === meuId ? "Você não pode desativar a própria conta" : "Ativa ou corta o acesso"}
                  onChange={(v) => onAtivo(u.id, v)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="liff-admin-cards" style={mesh({ display: "grid", gap: 1 })}>
        {ADMIN_CARDS.map((c) => (
          <div key={c.title} style={{ background: C.cell, padding: 22 }}>
            <div style={{ ...eyebrow(11, C.accent), marginBottom: 10 }}>{c.title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: C.body }}>{c.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* =========================================================
   Auditoria
   ========================================================= */
const AUDIT_COLS = "0.8fr 1fr 1fr 2.6fr";

export function Auditoria({ logs }: { logs: LogEntry[] }) {
  return (
    <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}` }}>
      <div style={{ minWidth: 760 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: AUDIT_COLS,
            background: C.canvas,
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          {["QUANDO", "QUEM", "ÁREA", "O QUE MUDOU"].map((h) => (
            <div key={h} style={{ padding: "12px 16px", ...eyebrow(10, C.faint) }}>
              {h}
            </div>
          ))}
        </div>
        {logs.map((l) => {
          const a = l.area ? areaOf(l.area) : null;
          return (
            <div
              key={l.id}
              style={{
                display: "grid",
                gridTemplateColumns: AUDIT_COLS,
                background: C.cell,
                borderBottom: `1px solid ${C.line}`,
                alignItems: "center",
              }}
            >
              <div style={{ padding: "13px 16px", fontFamily: MONO, fontSize: 11, color: C.faint }}>
                {stamp(l.criadoEm)}
              </div>
              <div style={{ padding: "13px 16px", fontSize: 13, color: C.body }}>{l.autor}</div>
              <div
                style={{
                  padding: "13px 16px",
                  fontSize: 13,
                  color: a ? a.color : C.faint,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={dot(a ? a.color : C.faint)} />
                {a ? a.label : "sistema"}
              </div>
              <div style={{ padding: "13px 16px", fontSize: 13, color: C.ink, lineHeight: 1.5 }}>{l.texto}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   Drawer da atividade
   ========================================================= */
const nativeSelectStyle: CSSProperties = {
  width: "100%",
  background: C.canvas,
  border: `1px solid ${C.line}`,
  borderRadius: 6,
  color: C.ink,
  fontFamily: SANS,
  fontSize: 14,
  padding: "10px 12px",
};

/**
 * Título do card, editável no lugar. Vira campo ao clicar e salva no Enter ou ao sair;
 * Esc desfaz. Sem botão de edição para não poluir o cabeçalho do drawer, que já tem a
 * referência e a área disputando espaço.
 */
function TituloEditavel({
  titulo,
  editavel,
  onSalvar,
}: {
  titulo: string;
  editavel: boolean;
  onSalvar: (t: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(titulo);

  const estilo: CSSProperties = {
    fontSize: 21,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: C.ink,
    lineHeight: 1.25,
    marginTop: 8,
  };

  const confirmar = () => {
    setEditando(false);
    const limpo = texto.trim();
    if (limpo && limpo !== titulo) onSalvar(limpo);
    else setTexto(titulo);
  };

  if (!editando) {
    return (
      <div
        onClick={() => editavel && (setTexto(titulo), setEditando(true))}
        title={editavel ? "Clique para renomear" : undefined}
        style={{ ...estilo, cursor: editavel ? "text" : "default" }}
      >
        {titulo}
      </div>
    );
  }

  return (
    <textarea
      autoFocus
      rows={2}
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmar();
        }
        if (e.key === "Escape") {
          setTexto(titulo);
          setEditando(false);
        }
      }}
      style={{
        ...estilo,
        width: "100%",
        resize: "vertical",
        fontFamily: SANS,
        background: C.code,
        border: `1px solid ${C.accent}`,
        borderRadius: 6,
        padding: "6px 9px",
        outline: "none",
      }}
    />
  );
}

export function Drawer({
  act,
  pessoas,
  areasEditaveis,
  onFechar,
  onStatus,
  onResponsavel,
  onPrioridade,
  onArea,
  onTitulo,
  onSituacao,
  onProximo,
  onProduto,
  onProximoEm,
  onPrazo,
  produtos,
}: {
  act: Activity;
  pessoas: Pessoa[];
  /** Só as áreas onde a pessoa escreve — mover para fora delas o servidor recusaria. */
  areasEditaveis: { id: string; label: string }[];
  onFechar: () => void;
  onStatus: (k: string) => void;
  onResponsavel: (id: number) => void;
  onPrioridade: (p: string) => void;
  onArea: (id: string) => void;
  onTitulo: (t: string) => void;
  onSituacao: (v: string) => void;
  onProximo: (v: string) => void;
  onProduto: (id: string | null) => void;
  onProximoEm: (d: string | null) => void;
  onPrazo: (d: string | null) => void;
  produtos: { id: string; label: string; area: string; ativo: boolean }[];
}) {
  const a = areaOf(act.area);
  const editavel = act.podeEditar;
  // O fundo do drawer é IRMÃO do painel, não pai, então o arraste para fora já não o
  // fechava. A guarda entra do mesmo jeito: mantém as sobreposições com um comportamento
  // só, e protege caso a estrutura mude.
  const fundo = useFecharNoFundo(onFechar);
  return (
    <>
      <div {...fundo} style={{ position: "fixed", inset: 0, background: "rgba(14,16,20,0.72)", zIndex: 40 }} />
      <div className="liff-drawer">
        <div style={{ padding: "24px 26px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div>
              <div style={eyebrow(10, a.color)}>{a.label}</div>
              <TituloEditavel titulo={act.titulo} editavel={editavel} onSalvar={onTitulo} />
            </div>
            <span
              onClick={onFechar}
              role="button"
              aria-label="Fechar"
              style={{ cursor: "pointer", fontFamily: MONO, fontSize: 16, color: C.faint }}
            >
              ×
            </span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: C.ghost, marginTop: 10 }}>
            {act.ref} · vence {ddmm(act.prazo)}
          </div>
        </div>

        <div
          style={{
            padding: "24px 26px",
            borderBottom: `1px solid ${C.line}`,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div>
            <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>STATUS</div>
            <div style={mesh({ display: "flex", gap: 1 })}>
              {STATUS.map((s) => {
                const on = act.status === s.key;
                return (
                  <div
                    key={s.key}
                    onClick={() => editavel && onStatus(s.key)}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "9px 6px",
                      cursor: editavel ? "pointer" : "not-allowed",
                      ...eyebrow(10, on ? C.onState : C.faint, "0.08em"),
                      background: on ? statusColor(s.key) : C.canvas,
                    }}
                  >
                    {s.label}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>ÁREA</div>
            <select
              value={act.area}
              onChange={(e) => onArea(e.target.value)}
              disabled={!editavel}
              style={nativeSelectStyle}
            >
              {/* A área atual entra na lista mesmo se a pessoa não puder escrever nela —
                  senão o select mostraria outra coisa que não o estado real do registro. */}
              {!areasEditaveis.some((x) => x.id === act.area) && <option value={act.area}>{a.label}</option>}
              {areasEditaveis.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>PRODUTO</div>
            <select
              value={act.produtoId ?? ""}
              onChange={(e) => onProduto(e.target.value || null)}
              disabled={!editavel}
              style={nativeSelectStyle}
            >
              <option value="">—</option>
              {/* O produto atual entra mesmo se estiver arquivado: o campo tem de mostrar o
                  que o registro realmente é, não só o que ainda se pode escolher. */}
              {produtos
                .filter((p) => p.area === act.area && (p.ativo || p.id === act.produtoId))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>RESPONSÁVEL</div>
              <select
                value={act.responsavelId ?? ""}
                onChange={(e) => onResponsavel(Number(e.target.value))}
                disabled={!editavel}
                style={nativeSelectStyle}
              >
                {act.responsavelId === null && <option value="">—</option>}
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>PRAZO</div>
              <CampoData
                valor={act.prazo ?? ""}
                onChange={(v) => onPrazo(v || null)}
                desabilitado={!editavel}
                estilo={nativeSelectStyle}
              />
            </div>
            <div>
              <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>PRIORIDADE</div>
              <select
                value={act.prioridade}
                onChange={(e) => onPrioridade(e.target.value)}
                disabled={!editavel}
                style={nativeSelectStyle}
              >
                <option value="alta">alta</option>
                <option value="media">média</option>
                <option value="baixa">baixa</option>
              </select>
            </div>
          </div>

          <div>
            <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>SITUAÇÃO ATUAL</div>
            <TextoLongoEditavel
              key={`sit-${act.id}`}
              valor={act.situacao}
              editavel={editavel}
              linhas={4}
              placeholder="Onde a atividade está hoje."
              onSalvar={onSituacao}
            />
          </div>

          <div>
            <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>PRÓXIMOS PASSOS</div>
            <TextoLongoEditavel
              key={`prox-${act.id}`}
              valor={act.proximoPasso}
              editavel={editavel}
              linhas={2}
              placeholder="O que vem depois."
              onSalvar={onProximo}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <span style={eyebrow(10, C.faint, "0.1em")}>QUANDO</span>
              <CampoData
                valor={act.proximoPassoEm ?? ""}
                onChange={(v) => onProximoEm(v || null)}
                desabilitado={!editavel}
                estilo={{ ...nativeSelectStyle, width: "auto", flex: 1 }}
              />
            </div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
              Sem data, o cronograma coloca no fim desta semana.
            </div>
          </div>

          <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: editavel ? C.faint : C.warning }}>
            {editavel
              ? "Você tem permissão de edição nesta área. Toda alteração é registrada no log."
              : `Somente leitura — seu perfil não tem permissão de edição em ${a.label}.`}
          </div>
        </div>

        <div style={{ padding: "24px 26px" }}>
          <div style={{ ...eyebrow(11, C.dust), marginBottom: 18 }}>HISTÓRICO DE ALTERAÇÕES</div>
          <Historico entidade={act.ref} />
        </div>
      </div>
    </>
  );
}

/* =========================================================
   Resumo para WhatsApp
   ========================================================= */
export function WaModal({
  tabs,
  areaAtiva,
  texto,
  copiado,
  onArea,
  onCopiar,
  onFechar,
}: {
  tabs: OpcaoArea[];
  areaAtiva: string;
  texto: string;
  copiado: boolean;
  onArea: (id: string) => void;
  onCopiar: () => void;
  onFechar: () => void;
}) {
  const fundo = useFecharNoFundo(onFechar);
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
          width: 560,
          maxWidth: "100%",
          maxHeight: "82vh",
          overflow: "auto",
          background: C.panel,
          border: `1px solid ${C.line}`,
        }}
      >
        <div style={{ padding: "24px 26px", borderBottom: `1px solid ${C.line}` }}>
          <div style={eyebrow(10, C.accent)}>LIFF/ REPORT</div>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink, marginTop: 6 }}>
            Resumo de status para WhatsApp
          </div>
        </div>

        <div style={{ padding: "16px 26px", borderBottom: `1px solid ${C.line}` }}>
          <SeletorArea opcoes={tabs} valor={areaAtiva} onChange={onArea} larguraTotal />
        </div>

        <div style={{ padding: "24px 26px" }}>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              fontFamily: MONO,
              fontSize: 12.5,
              lineHeight: 1.7,
              color: C.body,
              background: C.code,
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              padding: 18,
            }}
          >
            {texto}
          </pre>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 20,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, color: copiado ? C.success : C.faint }}>
              {copiado ? "Copiado para a área de transferência." : "Texto formatado para colar no WhatsApp."}
            </span>
            <span style={{ display: "flex", gap: 10 }}>
              <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
                fechar
              </Button>
              <Button variant="solid" size="sm" onClick={onCopiar}>
                copiar texto
              </Button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Criação — atividade e oportunidade
   ========================================================= */
const campoNativo: CSSProperties = {
  width: "100%",
  background: C.code,
  border: `1px solid ${C.line}`,
  borderRadius: 6,
  color: C.ink,
  fontFamily: SANS,
  fontSize: 15,
  padding: "11px 13px",
};

function Modal({ titulo, eyebrowTexto, children, onFechar }: {
  titulo: string;
  eyebrowTexto: string;
  children: ReactNode;
  onFechar: () => void;
}) {
  const fundo = useFecharNoFundo(onFechar);
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
          width: 520,
          maxWidth: "100%",
          maxHeight: "88vh",
          overflow: "auto",
          background: C.panel,
          border: `1px solid ${C.line}`,
        }}
      >
        <div style={{ padding: "24px 26px", borderBottom: `1px solid ${C.line}` }}>
          <div style={eyebrow(10, C.accent)}>{eyebrowTexto}</div>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink, marginTop: 6 }}>
            {titulo}
          </div>
        </div>
        <div style={{ padding: "24px 26px", display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Opções do seletor de área.
 *
 * A área atual entra na lista mesmo sem permissão de escrita nela, senão o campo mostraria
 * algo diferente do que o registro realmente é.
 *
 * Sem `atual` — ou seja, na criação — a lista abre com uma opção vazia, e o botão de salvar
 * fica desabilitado até alguém escolher. Não é firula: com a primeira vertical
 * pré-selecionada, quem não reparava no campo cadastrava na área errada sem perceber.
 */
function opcoesArea(editaveis: { id: string; label: string }[], atual?: string) {
  const lista = editaveis.map((a) => ({ value: a.id, label: a.label }));
  if (atual && !editaveis.some((a) => a.id === atual)) {
    lista.push({ value: atual, label: areaOf(atual).label });
  }
  // A área injetada acima entraria fora de ordem; reordenar aqui mantém a promessa
  // alfabética que vale para o resto dos seletores.
  lista.sort((a, b) => porTexto(a.label, b.label));
  return atual ? lista : [{ value: "", label: "— escolha a vertical —" }, ...lista];
}

export type OpcaoPessoa = { id: number; nome: string };

export function NovaAtividade({
  areasEditaveis,
  pessoas,
  produtos,
  salvando,
  erro,
  onSalvar,
  onFechar,
}: {
  areasEditaveis: { id: string; label: string }[];
  pessoas: OpcaoPessoa[];
  produtos: { id: string; label: string; area: string; ativo: boolean }[];
  salvando: boolean;
  erro: string | null;
  onSalvar: (d: {
    titulo: string;
    area: string;
    status: string;
    prioridade: string;
    prazo: string | null;
    responsavelId: number | null;
    situacao: string;
    proximoPasso: string;
    produtoId: string | null;
    proximoPassoEm: string | null;
  }) => void;
  onFechar: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  // Em branco de propósito. Com a primeira área pré-selecionada, quem não olhava o campo
  // cadastrava na vertical errada sem perceber — aconteceu com 40 atividades de uma vez.
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("backlog");
  const [prioridade, setPrioridade] = useState("media");
  const [prazo, setPrazo] = useState("");
  const [responsavel, setResponsavel] = useState<string>("");
  const [situacao, setSituacao] = useState("");
  const [proximo, setProximo] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [proximoEm, setProximoEm] = useState("");

  // Produto pertence a uma vertical; trocar a área invalida a escolha anterior.
  const produtosDaArea = produtos.filter((p) => p.area === area && p.ativo);

  const enviar = () =>
    onSalvar({
      titulo,
      area,
      status,
      prioridade,
      prazo: prazo || null,
      responsavelId: responsavel ? Number(responsavel) : null,
      situacao,
      proximoPasso: proximo,
      produtoId: produtoId || null,
      proximoPassoEm: proximoEm || null,
    });

  return (
    <Modal titulo="Nova atividade" eyebrowTexto="LIFF/ ATIVIDADES" onFechar={onFechar}>
      <Field label="Título" required>
        <Input placeholder="O que precisa ser feito" value={titulo} onChange={setTitulo} />
      </Field>

      <Field label="Área" required hint="Escolha antes de salvar — não há vertical pré-selecionada.">
        <Select
          options={opcoesArea(areasEditaveis)}
          value={area}
          onChange={(v) => {
            setArea(v);
            // O produto da área anterior não existe na nova; deixá-lo no estado faria o
            // servidor recusar o salvamento com um erro que não explica a causa.
            setProdutoId("");
          }}
        />
      </Field>

      <Field
        label="Produto"
        hint={
          !area
            ? "Escolha a vertical primeiro."
            : produtosDaArea.length
              ? "O que está sendo implantado. Opcional."
              : "Nenhum produto cadastrado nesta vertical — cadastre em Cadastros → produtos."
        }
      >
        <Select
          options={[{ value: "", label: "—" }, ...produtosDaArea.map((p) => ({ value: p.id, label: p.label }))]}
          value={produtoId}
          onChange={setProdutoId}
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Status">
          <Select
            options={STATUS.map((s) => ({ value: s.key, label: s.label }))}
            value={status}
            onChange={setStatus}
          />
        </Field>
        <Field label="Prioridade">
          <Select
            options={[
              { value: "alta", label: "alta" },
              { value: "media", label: "média" },
              { value: "baixa", label: "baixa" },
            ]}
            value={prioridade}
            onChange={setPrioridade}
          />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Prazo">
          <CampoData valor={prazo} onChange={setPrazo} />
        </Field>
        <Field label="Responsável">
          <Select
            options={[{ value: "", label: "—" }, ...pessoas.map((p) => ({ value: String(p.id), label: p.nome }))]}
            value={responsavel}
            onChange={setResponsavel}
          />
        </Field>
      </div>

      <Field
        label="Situação atual"
        hint="Onde a atividade está hoje. Cada alteração guarda o texto anterior no histórico."
      >
        <textarea
          rows={4}
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          placeholder="Ambiente provisionado; aguardando o retorno do time de TI sobre o SSO."
          style={{ ...campoNativo, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>

      <Field label="Próximos passos">
        <textarea
          rows={2}
          value={proximo}
          onChange={(e) => setProximo(e.target.value)}
          placeholder="Fechar o desenho de integração e agendar a virada."
          style={{ ...campoNativo, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>

      <Field label="Quando" hint="Alimenta o cronograma. Em branco, entra no fim desta semana.">
        <CampoData valor={proximoEm} onChange={setProximoEm} />
      </Field>

      {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
          cancelar
        </Button>
        <Button variant="solid" size="sm" disabled={salvando || !titulo.trim() || !area} onClick={enviar}>
          {salvando ? "criando…" : "criar atividade"}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Serve para criar e para editar. A diferença é só o estado inicial e o rótulo do botão —
 * duplicar o formulário significaria dois lugares para manter em sincronia toda vez que a
 * oportunidade ganhar um campo.
 */
export function FormOportunidade({
  areasEditaveis,
  pessoas,
  produtos,
  salvando,
  erro,
  inicial,
  onExcluir,
  onSalvar,
  onFechar,
}: {
  areasEditaveis: { id: string; label: string }[];
  pessoas: OpcaoPessoa[];
  produtos: { id: string; label: string; area: string; ativo: boolean }[];
  salvando: boolean;
  erro: string | null;
  /** Ausente = criação. */
  inicial?: Deal;
  /** Só na edição. Ausente = sem permissão para excluir. */
  onExcluir?: () => void;
  onSalvar: (d: {
    conta: string;
    escopo: string;
    area: string;
    estagio: string;
    valorReais: number;
    proximoPasso: string;
    responsavelId: number | null;
    situacao: string;
    contato: string;
    responsavelTexto: string;
    produtoId: string | null;
    pausado: boolean;
    proximoPassoEm: string | null;
  }) => void;
  onFechar: () => void;
}) {
  const editando = !!inicial;
  const [conta, setConta] = useState(inicial?.conta ?? "");
  const [escopo, setEscopo] = useState(inicial?.escopo ?? "");
  // Na edição vem a área do registro; na criação, em branco — ver NovaAtividade.
  const [area, setArea] = useState(inicial?.area ?? "");
  const [estagio, setEstagio] = useState(inicial?.estagio ?? "lead");
  const [valor, setValor] = useState(inicial ? String(inicial.valorCentavos / 100) : "");
  const [proximo, setProximo] = useState(inicial?.proximoPasso ?? "");
  const [responsavel, setResponsavel] = useState<string>(
    inicial ? String(pessoas.find((p) => p.nome === inicial.responsavel)?.id ?? "") : ""
  );
  const [situacao, setSituacao] = useState(inicial?.situacao ?? "");
  const [contato, setContato] = useState(inicial?.contato ?? "");
  const [respTexto, setRespTexto] = useState(inicial?.responsavelTexto ?? "");
  const [produtoId, setProdutoId] = useState(inicial?.produtoId ?? "");
  const [pausado, setPausado] = useState(inicial?.pausado ?? false);
  const [proximoEm, setProximoEm] = useState(inicial?.proximoPassoEm ?? "");
  // Fechado por padrão: o formulário existe para editar, o histórico é consulta.
  const [verHistorico, setVerHistorico] = useState(false);

  // Produto pertence a uma área; trocar a área invalida a escolha anterior.
  const produtosDaArea = produtos.filter((p) => p.area === area && (p.ativo || p.id === inicial?.produtoId));

  const enviar = () =>
    onSalvar({
      conta,
      escopo,
      area,
      estagio,
      valorReais: Number(valor.replace(/\./g, "").replace(",", ".")) || 0,
      proximoPasso: proximo,
      responsavelId: responsavel ? Number(responsavel) : null,
      situacao,
      contato,
      responsavelTexto: respTexto,
      produtoId: produtoId || null,
      pausado,
      proximoPassoEm: proximoEm || null,
    });

  return (
    <Modal
      titulo={editando ? `Editar ${inicial.conta}` : "Nova oportunidade"}
      eyebrowTexto={editando ? `LIFF/ COMERCIAL · ${inicial.ref}` : "LIFF/ COMERCIAL"}
      onFechar={onFechar}
    >
      <Field label="Conta" required>
        <Input placeholder="Razão social" value={conta} onChange={setConta} />
      </Field>
      <Field label="Escopo" hint="O que está sendo vendido — aparece abaixo do nome no card.">
        <Input placeholder="law-v · 80 usuários" value={escopo} onChange={setEscopo} />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Área" required hint={editando ? undefined : "Escolha antes de salvar."}>
          <Select
            options={opcoesArea(areasEditaveis, inicial?.area)}
            value={area}
            onChange={(v) => {
              setArea(v);
              // Mesma razão do formulário de atividade: o produto pertence à vertical
              // anterior e o servidor recusaria o salvamento sem explicar a causa.
              setProdutoId("");
            }}
          />
        </Field>
        <Field label="Estágio">
          <Select
            options={STAGES.map((s) => ({ value: s.key, label: s.label }))}
            value={estagio}
            onChange={setEstagio}
          />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Valor (R$)">
          <Input placeholder="420000" value={valor} onChange={setValor} />
        </Field>
        <Field label="Responsável">
          <Select
            options={[{ value: "", label: "—" }, ...pessoas.map((p) => ({ value: String(p.id), label: p.nome }))]}
            value={responsavel}
            onChange={setResponsavel}
          />
        </Field>
      </div>

      <Field label="Produto" hint="O que está sendo vendido nesta vertical.">
        <Select
          options={[{ value: "", label: "—" }, ...produtosDaArea.map((p) => ({ value: p.id, label: p.label }))]}
          value={produtoId}
          onChange={setProdutoId}
        />
      </Field>

      <Field
        label="Situação atual"
        hint="Onde a conversa está hoje. Cada alteração guarda o texto anterior no histórico."
      >
        <textarea
          rows={4}
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          placeholder="Contato feito com Vanessa (Jurídico). Dois FUPs sem resposta."
          style={{ ...campoNativo, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>

      <Field label="Próximo passo">
        <textarea
          rows={2}
          value={proximo}
          onChange={(e) => setProximo(e.target.value)}
          placeholder="Novo FUP e, se necessário, escalar para um interlocutor acima."
          style={{ ...campoNativo, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>

      <Field label="Quando" hint="Alimenta o cronograma. Em branco, entra no fim desta semana.">
        <CampoData valor={proximoEm} onChange={setProximoEm} />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Contato / cargo">
          <Input placeholder="Marçal — CFO" value={contato} onChange={setContato} />
        </Field>
        <Field label="Responsável (texto)" hint="Para quem ainda não tem conta, ou duplas.">
          <Input placeholder="Felipe Silveira / Bianka" value={respTexto} onChange={setRespTexto} />
        </Field>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Switch checked={pausado} onChange={setPausado} label="Em pausa" />
        <span style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
          Marque quando o motivo da parada não é o estágio — &quot;não é o momento&quot;, aguardando terceiro.
        </span>
      </div>

      {editando && (
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 18 }}>
          <div
            role="button"
            onClick={() => setVerHistorico((v) => !v)}
            style={{ ...eyebrow(11, C.dust), cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }}
          >
            <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{verHistorico ? "−" : "+"}</span>
            HISTÓRICO DE ALTERAÇÕES
          </div>
          {verHistorico && (
            <div style={{ marginTop: 16 }}>
              <Historico entidade={inicial.ref} />
            </div>
          )}
        </div>
      )}

      {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 4, alignItems: "center" }}>
        {/* Excluir fica longe do salvar, e do lado oposto: é a única ação irreversível aqui. */}
        {editando && onExcluir ? (
          <span
            role="button"
            onClick={onExcluir}
            title="Excluir esta oportunidade"
            style={{ ...eyebrow(10, C.error, "0.1em"), cursor: "pointer" }}
          >
            excluir
          </span>
        ) : (
          <span />
        )}
        <span style={{ display: "flex", gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
            cancelar
          </Button>
          <Button variant="solid" size="sm" disabled={salvando || !conta.trim() || !area} onClick={enviar}>
            {salvando ? "salvando…" : editando ? "salvar alterações" : "criar oportunidade"}
          </Button>
        </span>
      </div>
    </Modal>
  );
}

/** Casca de carregamento e de erro, para o shell não piscar vazio. */
export function Aviso({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: 28, fontFamily: MONO, fontSize: 12, color: C.faint, letterSpacing: "0.08em" }}>
      {children}
    </div>
  );
}
