"use client";

// As telas do sistema. São puramente de apresentação: recebem dados já recortados e
// devolvem eventos. Quem decide o que pode ser alterado é o servidor — `podeEditar` que
// chega em cada registro é o eco daquela decisão, usado só para desenhar o estado.

import { useState, type CSSProperties, type MouseEvent, type ReactNode, useRef } from "react";
import { Button, Field, Input, Select, Switch } from "./ds";
import { C, GHOST_FIX, MONO, SANS, dot, eyebrow, mesh, statusColor } from "./tokens";
import { type Activity, type AreaCadastro, type Deal, type LogEntry, type NovaOportunidade, type Origem, type Pessoa } from "./api";
import SeletorArea, { type OpcaoArea } from "./SeletorArea";
import Historico from "./Historico";
import ViaConexao from "./ViaConexao";
import { CardOportunidade } from "./CardOportunidade";
import { CardAtividade } from "./CardAtividade";
import {
  ADMIN_CARDS, BLOCKER_TIPOS, ERP_SUGESTOES, ESTAGIO_INICIAL, MOTIVOS_PERDA, PAPEIS, STAGES, STATUS, CHAVE_SEM_RESPONSAVEL, aplicarBusca, areaOf, prepararBusca, ddmm, porTexto, stamp, statusLabel, todasAreas,
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
          title={l.podeAbrir ? "Abrir" : "Somente leitura nesta vertical"}
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

/* =========================================================
   Comercial — pipeline por estágio
   ========================================================= */
export type ColunaDeal = { key: string; label: string; total: string; cards: Deal[] };

export function Comercial({
  colunas,
  densidade = "completo",
  produtos,
  pessoas,
  onMover,
  onSoltar,
  onAbrir,
}: {
  colunas: ColunaDeal[];
  densidade?: "completo" | "compacto";
  produtos: { id: string; label: string }[];
  pessoas: { id: number; nome: string; iniciais: string }[];
  onMover: (id: number, dir: 1 | -1) => void;
  /** Arrastar manda o estágio de destino; as setas mandam a direção. Ver o comentário abaixo. */
  onSoltar: (id: number, estagio: string) => void;
  onAbrir: (id: number) => void;
}) {
  // Coluna sob o cursor durante o arraste. Sem esta marca, um funil de seis colunas não deixa
  // claro onde o card vai cair.
  const [alvo, setAlvo] = useState<string | null>(null);

  return (
    <div className="liff-kanban">
      {colunas.map((col) => (
        <div
          key={col.key}
          className="liff-raia"
          data-alvo={alvo === col.key ? "1" : undefined}
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
            // O card v4 foi desenhado a 320px; abaixo de ~300 o nome do dono e as setas de 44px brigam.
            minWidth: densidade === "compacto" ? 272 : 300,
            flex: 1,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 4px 2px" }}>
            <span style={eyebrow(11, C.dust, "0.14em")}>{col.label}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{col.total}</span>
          </div>
          {col.cards.map((d) => (
            <CardOportunidade
              key={d.id}
              d={d}
              produtos={produtos}
              pessoas={pessoas}
              compacto={densidade === "compacto"}
              onAbrir={() => onAbrir(d.id)}
              onMover={(dir) => onMover(d.id, dir)}
              onDragStart={(e) => e.dataTransfer.setData("text/plain", String(d.id))}
              onDragEnd={() => setAlvo(null)}
            />
          ))}
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
                  title={i.podeAbrir ? "Abrir" : "Somente leitura nesta vertical"}
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
                    {i.tipo === "oportunidade" ? "Comercial" : "Operações"}
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
      <div className="liff-kanban">
        {colunas.map((col) => (
          <div
            key={col.key}
            className="liff-raia"
            data-alvo={alvo === col.key ? "1" : undefined}
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
              minWidth: 280,
              flex: 1,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 420,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 4px 2px" }}>
              <span style={eyebrow(11, C.dust, "0.14em")}>{col.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{col.cards.length}</span>
            </div>
            {col.cards.map((c) => (
              <CardAtividade
                key={c.id}
                c={c}
                produtos={produtos}
                onAbrir={() => onAbrir(c.id)}
                onMover={(status) => onSoltar(c.id, status)}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", String(c.id))}
                onDragEnd={() => setAlvo(null)}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
        Arraste os cards entre as colunas, ou use as setas — o movimento é gravado no log com autor e horário.
        Cards de verticais sem permissão de edição não se movem.
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
          {["ATIVIDADE", "VERTICAL", "RESPONSÁVEL", "PRAZO", "STATUS"].map((h) => (
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
  { key: "produtos", label: "módulos / produtos" },
  { key: "areas", label: "verticais" },
  // De onde vêm as oportunidades (Base Fius, AWS, Evento…) — o select do card comercial.
  { key: "origens", label: "origens" },
] as const;

const TITULO_NOVO: Record<string, string> = {
  pessoas: "NOVA PESSOA",
  produtos: "NOVO MÓDULO / PRODUTO",
  areas: "NOVA VERTICAL",
  origens: "NOVA ORIGEM",
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
export function CampoData({
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

// `minmax(0, …)`: sem isso a coluna cresce até caber o conteúdo (um link de planilha empurrava a
// tabela inteira); assim a largura é a do cabeçalho e o texto longo é cortado com reticências.
const COLS_AREA = "minmax(0, 1.5fr) minmax(0, 0.9fr) minmax(0, 1.2fr) minmax(0, 0.8fr) 44px";

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
  onNome: (id: string, patch: { label?: string; short?: string; planilhaUrl?: string | null }) => void;
}) {
  return (
    <div style={{ minWidth: 620 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: COLS_AREA,
          background: C.canvas,
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        {["VERTICAL", "COR", "PLANILHA", "ATIVIDADES", ""].map((h, i) => (
          <div key={i} style={{ padding: "12px 16px", ...eyebrow(10, C.faint) }}>
            {h}
          </div>
        ))}
      </div>
      {areas.map((a) => (
        <div
          key={a.id}
          style={{ display: "grid", gridTemplateColumns: COLS_AREA, borderBottom: `1px solid ${C.line}`, alignItems: "center" }}
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
          {/* Endereço da planilha do Drive de onde esta vertical sincroniza. Guardamos só o
              id canônico; colar a URL inteira, com /edit e #gid, funciona. */}
          <div style={{ padding: "9px 16px", minWidth: 0 }}>
            {podeEditar ? (
              <TextoEditavel
                valor={a.planilhaUrl ?? "—"}
                onSalvar={(v) => onNome(a.id, { planilhaUrl: v === "—" ? null : v })}
                titulo={a.planilhaUrl ? `${a.planilhaUrl}\n\nClique para trocar o endereço` : "Clique para colar o endereço da planilha do Google"}
                estilo={{
                  fontFamily: MONO, fontSize: 11, color: a.planilhaUrl ? C.info : C.ghost, display: "block",
                  width: "100%", boxSizing: "border-box",
                }}
              />
            ) : (
              <span style={{ fontFamily: MONO, fontSize: 11, color: a.planilhaUrl ? C.info : C.ghost }}>
                {a.planilhaUrl ? "configurada" : "—"}
              </span>
            )}
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
      <Field label="Papel" hint="O papel é o teto; o acesso por vertical se define depois, abrindo a linha da pessoa na lista.">
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
function NovaOrigem({ salvando, onCriar }: { salvando: boolean; onCriar: (d: { label: string }) => void }) {
  const [label, setLabel] = useState("");
  return (
    <>
      <Field label="Nome da origem" required hint="Clique numa origem da lista para arquivá-la ou reativá-la.">
        <Input placeholder="Parceiro XPTO" value={label} onChange={setLabel} />
      </Field>
      <Button
        variant="outline"
        size="sm"
        disabled={salvando || !label.trim()}
        style={{ justifyContent: "center" }}
        onClick={() => {
          onCriar({ label: label.trim() });
          setLabel("");
        }}
      >
        {salvando ? "cadastrando…" : "cadastrar origem"}
      </Button>
    </>
  );
}

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
        Cadastre uma vertical antes: todo módulo / produto pertence a uma.
      </div>
    );
  }

  return (
    <>
      <Field label="Nome do módulo / produto" required>
        <Input placeholder="Regtrack Farma" value={label} onChange={setLabel} />
      </Field>
      <Field label="Vertical" required hint="O formulário de oportunidade só oferece os módulos / produtos da vertical escolhida.">
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
        {salvando ? "cadastrando…" : "cadastrar módulo / produto"}
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
  onCriarOrigem,
  pessoas,
  meuId,
  onCiclarPermissao,
  onAtivoPessoa,
  onEditarPessoa,
}: {
  tab: string;
  onTab: (k: string) => void;
  set: CadSet;
  /** Aba Pessoas: a lista com papel, e-mail, acesso e as permissões por área (a antiga Administração). */
  pessoas: Pessoa[];
  meuId: number;
  onCiclarPermissao: (userId: number, area: string) => void;
  onAtivoPessoa: (userId: number, ativo: boolean) => void;
  onEditarPessoa: (id: number) => void;
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
  onCriarOrigem: (d: { label: string }) => void;
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
          {tab === "pessoas" ? (
            <PermissoesPorPessoa
              pessoas={pessoas}
              areas={todasAreas()}
              meuId={meuId}
              onCiclar={onCiclarPermissao}
              onAtivo={onAtivoPessoa}
              onEditar={podeEditarAreas ? onEditarPessoa : undefined}
            />
          ) : tab === "areas" ? (
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
                só admin cadastra, como já valia para a cor da vertical. */}
            {!podeEditarAreas ? (
              <div style={{ fontSize: 13, lineHeight: 1.6, color: C.faint }}>
                Só a administração faz cadastros. Peça a quem administra o sistema.
              </div>
            ) : tab === "areas" ? (
              <NovaArea salvando={salvandoArea} onCriar={onCriarArea} />
            ) : tab === "pessoas" ? (
              <NovaPessoa salvando={salvandoArea} dominio={dominio} onCriar={onCriarPessoa} />
            ) : tab === "origens" ? (
              <NovaOrigem salvando={salvandoArea} onCriar={onCriarOrigem} />
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

      {/* Referência rápida das regras de acesso, que antes morava na Administração. */}
      {tab === "pessoas" && (
        <div className="liff-admin-cards" style={mesh({ display: "grid", gap: 1, marginTop: 22 })}>
          {ADMIN_CARDS.map((c) => (
            <div key={c.title} style={{ background: C.cell, padding: 22 }}>
              <div style={{ ...eyebrow(11, C.accent), marginBottom: 10 }}>{c.title}</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: C.body }}>{c.body}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* =========================================================
   Pessoas e permissões (Cadastros → Pessoas; antes, a Administração)
   ========================================================= */
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

/** Uma pessoa por linha; as permissões por área abrem embaixo dela, em grade que quebra.
 *  Serve com qualquer número de áreas — a antiga matriz só cabia até umas oito. */
function PermissoesPorPessoa({
  pessoas,
  areas,
  meuId,
  onCiclar,
  onAtivo,
  onEditar,
}: {
  pessoas: Pessoa[];
  areas: { id: string; label: string; short: string; color: string }[];
  meuId: number;
  onCiclar: (userId: number, area: string) => void;
  onAtivo: (userId: number, ativo: boolean) => void;
  /** Abre o cadastro da pessoa (nome, e-mail, papel, exclusão). */
  onEditar?: (id: number) => void;
}) {
  const [aberto, setAberto] = useState<number | null>(null);

  return (
    <div>
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
                <div style={{ fontSize: 14, color: u.ativo ? C.ink : C.faint, fontWeight: 600 }}>
                  {u.nome}
                  {u.ativo ? "" : " (inativo)"}
                </div>
                <div style={{ fontSize: 12, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={eyebrow(10, C.faint, "0.1em")}>{u.papel}</span> · <span style={{ fontFamily: MONO, fontSize: 11 }}>{u.email}</span>
                </div>
              </div>
              <div style={{ ...eyebrow(10, C.faint, "0.1em"), whiteSpace: "nowrap" }}>
                {u.papel === "admin" ? "todas as verticais" : `${edita} editar · ${ve} ver`}
              </div>
              {onEditar && (
                // O clique no botão não pode também abrir/fechar as permissões da linha.
                <span onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" style={GHOST_FIX} onClick={() => onEditar(u.id)}>
                    editar
                  </Button>
                </span>
              )}
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

/* =========================================================
   Auditoria
   ========================================================= */
const AUDIT_COLS = "0.8fr 1fr 1fr 2.6fr";

/** Linhas da auditoria como a tela recebe: `autorId` nulo é ação do sistema. */
export type LinhaAuditoria = LogEntry & { autorId: number | null };

/**
 * Auditoria. As linhas (até 10.000) chegam prontas de quem monta a tela, que também precisa
 * delas para oferecer o filtro "Quem" — aqui, Quem é o AUTOR da alteração, a coluna QUEM.
 */
export function Auditoria({
  todas,
  limite,
  falha,
  area,
  busca,
  autores,
}: {
  todas: LinhaAuditoria[] | null;
  limite: number;
  falha: string | null;
  area: string;
  busca: string;
  /** Chaves do filtro Quem (`u:<id>` ou "sem" para o sistema); vazio = todos. */
  autores: readonly string[];
}) {
  if (falha && !todas) return <Aviso>{falha}</Aviso>;
  if (!todas) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>carregando auditoria…</div>;

  const porAutor = autores.length
    ? todas.filter((l) => autores.includes(l.autorId == null ? CHAVE_SEM_RESPONSAVEL : `u:${l.autorId}`))
    : todas;
  const naArea = area === "all" ? porAutor : porAutor.filter((l) => l.area === area);
  const logs = aplicarBusca(naArea, prepararBusca(busca), (l) => [
    l.texto, l.autor, l.entidade, l.via, l.area ? areaOf(l.area).label : "sistema",
  ]);
  return (
    <>
    <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginBottom: 12 }}>
      {logs.length.toLocaleString("pt-BR")}
      {logs.length !== todas.length ? ` de ${todas.length.toLocaleString("pt-BR")}` : ""}
      {todas.length === 1 ? " linha" : " linhas"}
      {todas.length >= limite ? ` · as ${limite.toLocaleString("pt-BR")} mais recentes` : ""}
    </div>
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
          {["QUANDO", "QUEM", "VERTICAL", "O QUE MUDOU"].map((h) => (
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
                // Com milhares de linhas, o navegador só desenha as que estão na tela.
                contentVisibility: "auto",
                containIntrinsicSize: "auto 48px",
              }}
            >
              <div style={{ padding: "13px 16px", fontFamily: MONO, fontSize: 11, color: C.faint }}>
                {stamp(l.criadoEm)}
              </div>
              <div style={{ padding: "13px 16px", fontSize: 13, color: C.body }}>
                {l.autor}
                {l.via && <ViaConexao nome={l.via} />}
              </div>
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
    </>
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
  oportunidades,
  onOportunidade,
  onExcluir,
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
  /** As oportunidades que a pessoa enxerga, para ligar a tarefa. */
  oportunidades: { id: number; ref: string; conta: string }[];
  onOportunidade: (id: number | null) => void;
  /** Só com permissão de edição na área; o servidor confere de novo. */
  onExcluir?: () => void;
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
            <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>VERTICAL</div>
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
            <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>MÓDULO / PRODUTO</div>
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

          {/* A oportunidade comercial a que esta tarefa serve — o elo entre o pipeline e o
              quadro. Qualquer oportunidade que a pessoa enxergue, de qualquer vertical: a tarefa
              de implantação em Tax costuma servir a uma venda fechada em Corporate. */}
          <div>
            <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>OPORTUNIDADE</div>
            {act.oportunidadeOculta ? (
              // Ligada a uma oportunidade de área que esta pessoa não vê: mostrar que o vínculo
              // existe, sem o nome da conta — e sem oferecer um seletor que o desfaria às cegas.
              <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.5 }}>
                Ligada a uma oportunidade de uma vertical que você não acessa.
              </div>
            ) : (
              <select
                value={act.oportunidadeId ?? ""}
                onChange={(e) => onOportunidade(e.target.value ? Number(e.target.value) : null)}
                disabled={!editavel}
                style={nativeSelectStyle}
              >
                <option value="">— nenhuma —</option>
                {oportunidades.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.ref} · {o.conta}
                  </option>
                ))}
              </select>
            )}
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
              ? "Você tem permissão de edição nesta vertical. Toda alteração é registrada no log."
              : `Somente leitura — seu perfil não tem permissão de edição em ${a.label}.`}
          </div>
          {/* Excluir fica sozinho, embaixo e em vermelho: é a única ação irreversível aqui. */}
          {editavel && onExcluir && (
            <div>
              <span
                role="button"
                tabIndex={0}
                onClick={onExcluir}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onExcluir();
                  }
                }}
                title="Excluir esta atividade"
                style={{ ...eyebrow(10, C.error, "0.1em"), cursor: "pointer" }}
              >
                excluir atividade
              </span>
            </div>
          )}
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

export function Modal({ titulo, eyebrowTexto, children, onFechar, largura = 520 }: {
  titulo: string;
  eyebrowTexto: string;
  children: ReactNode;
  onFechar: () => void;
  /** Largura máxima; o padrão serve aos formulários de uma coluna. */
  largura?: number;
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
          width: largura,
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
export function opcoesArea(editaveis: { id: string; label: string }[], atual?: string) {
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

      <Field label="Vertical" required hint="Escolha antes de salvar — não há vertical pré-selecionada.">
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
        label="Módulo / Produto"
        hint={
          !area
            ? "Escolha a vertical primeiro."
            : produtosDaArea.length
              ? "O que está sendo implantado. Opcional."
              : "Nenhum módulo / produto cadastrado nesta vertical — cadastre em Cadastros → módulos / produtos."
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
  tarefas = [],
  onAbrirTarefa,
  origens = [],
}: {
  areasEditaveis: { id: string; label: string }[];
  pessoas: OpcaoPessoa[];
  /** Produtos da área — na oportunidade, são os módulos de interesse. */
  produtos: { id: string; label: string; area: string; ativo: boolean }[];
  origens?: Origem[];
  salvando: boolean;
  erro: string | null;
  /** Ausente = criação. */
  inicial?: Deal;
  /** Só na edição. Ausente = sem permissão para excluir. */
  onExcluir?: () => void;
  onSalvar: (d: NovaOportunidade) => void;
  onFechar: () => void;
  /** Tarefas ligadas a esta oportunidade, já filtradas pelo que a pessoa enxerga. */
  tarefas?: { ref: string; titulo: string; status: string }[];
  onAbrirTarefa?: (ref: string) => void;
}) {
  const editando = !!inicial;
  const [conta, setConta] = useState(inicial?.conta ?? "");
  // Na edição vem a área do registro; na criação, em branco — ver NovaAtividade.
  const [area, setArea] = useState(inicial?.area ?? "");
  const [estagio, setEstagio] = useState<string>(inicial?.estagio ?? ESTAGIO_INICIAL);
  const [valor, setValor] = useState(inicial ? String(inicial.valorCentavos / 100) : "");
  const [proximo, setProximo] = useState(inicial?.proximoPasso ?? "");
  const [responsavel, setResponsavel] = useState<string>(
    inicial ? String(inicial.responsavelId ?? pessoas.find((p) => p.nome === inicial.responsavel)?.id ?? "") : ""
  );
  const [situacao, setSituacao] = useState(inicial?.situacao ?? "");
  const [contato, setContato] = useState(inicial?.contato ?? "");
  const [respTexto, setRespTexto] = useState(inicial?.responsavelTexto ?? "");
  const [proximoEm, setProximoEm] = useState(inicial?.proximoPassoEm ?? "");
  const [aceAws, setAceAws] = useState(inicial?.aceAws ?? false);
  const [origemId, setOrigemId] = useState(inicial?.origemId ?? "");
  const [ponte, setPonte] = useState(inicial?.ponte ?? "");
  const [contatoOp, setContatoOp] = useState(inicial?.contatoOperacional ?? "");
  const [dor, setDor] = useState(inicial?.dor ?? "");
  const [erp, setErp] = useState(inicial?.erp ?? "");
  const [ultimaInteracao, setUltimaInteracao] = useState(inicial?.ultimaInteracao ?? "");
  const [modulos, setModulos] = useState<string[]>(inicial?.modulos ?? []);
  const [blocker, setBlocker] = useState(inicial?.blocker ?? "");
  const [blockerTipo, setBlockerTipo] = useState(inicial?.blockerTipo ?? "");
  const [blockerDono, setBlockerDono] = useState(inicial?.blockerDonoId ? String(inicial.blockerDonoId) : "");
  const [motivoPerda, setMotivoPerda] = useState(inicial?.motivoPerda ?? "");
  const [motivoDetalhe, setMotivoDetalhe] = useState(inicial?.motivoPerdaDetalhe ?? "");
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  // Fechado por padrão: o formulário existe para editar, o histórico é consulta.
  const [verHistorico, setVerHistorico] = useState(false);

  // Módulos são produtos da área; trocar a área invalida a escolha anterior.
  const modulosDaArea = produtos.filter((p) => p.area === area && (p.ativo || inicial?.modulos.includes(p.id)));
  const origensVisiveis = origens.filter((o) => o.ativo || o.id === inicial?.origemId);
  // Prospecção ainda não teve reunião: valor, ACE e blocker não existem — a aba Prospecção da
  // planilha nem tem essas colunas. Ficam à vista se já estiverem preenchidos.
  const emProspeccao = estagio === "prospeccao";
  const mostraNegocio = !emProspeccao || !!valor.replace(/[0.,]/g, "") || aceAws;
  const mostraBlocker = !emProspeccao || !!blocker || !!blockerTipo || !!blockerDono;
  const alternarModulo = (id: string) =>
    setModulos((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const enviar = () =>
    onSalvar({
      conta,
      area,
      estagio,
      valorReais: Number(valor.replace(/\./g, "").replace(",", ".")) || 0,
      proximoPasso: proximo,
      responsavelId: responsavel ? Number(responsavel) : null,
      situacao,
      contato,
      responsavelTexto: respTexto,
      proximoPassoEm: proximoEm || null,
      aceAws,
      origemId: origemId || null,
      ponte,
      contatoOperacional: contatoOp,
      dor,
      erp,
      ultimaInteracao: ultimaInteracao || null,
      modulos: modulos.filter((id) => modulosDaArea.some((p) => p.id === id)),
      blocker,
      blockerTipo: blockerTipo || null,
      blockerDonoId: blockerDono ? Number(blockerDono) : null,
      motivoPerda: estagio === "lost" ? motivoPerda || null : (inicial?.motivoPerda ?? null),
      motivoPerdaDetalhe: estagio === "lost" ? motivoDetalhe : (inicial?.motivoPerdaDetalhe ?? ""),
      notas,
    });

  const opcoesPessoa = [{ value: "", label: "—" }, ...pessoas.map((p) => ({ value: String(p.id), label: p.nome }))];
  const bloco = (titulo: string) => (
    <div style={{ ...eyebrow(10, C.dust, "0.14em"), borderTop: `1px solid ${C.line}`, paddingTop: 16, marginTop: 2 }}>{titulo}</div>
  );
  const duas = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } as const;

  return (
    <Modal
      titulo={editando ? `Editar ${inicial.conta}` : "Nova oportunidade"}
      eyebrowTexto={editando ? `LIFF/ COMERCIAL · ${inicial.ref}` : "LIFF/ COMERCIAL"}
      onFechar={onFechar}
    >
      <Field label="Conta" required>
        <Input placeholder="Razão social" value={conta} onChange={setConta} />
      </Field>

      <div style={duas}>
        <Field label="Vertical" required hint={editando ? undefined : "Escolha antes de salvar."}>
          <Select
            options={opcoesArea(areasEditaveis, inicial?.area)}
            value={area}
            onChange={(v) => {
              setArea(v);
              // Os módulos pertencem à vertical anterior; o servidor recusaria sem explicar.
              setModulos([]);
            }}
          />
        </Field>
        <Field label="Estágio">
          <Select options={STAGES.map((s) => ({ value: s.key, label: s.label }))} value={estagio} onChange={setEstagio} />
        </Field>
      </div>

      <div style={duas}>
        <Field label="Dono">
          <Select options={opcoesPessoa} value={responsavel} onChange={setResponsavel} />
        </Field>
        <Field label="Dono (texto)" hint="Quem ainda não tem conta, ou duplas.">
          <Input placeholder="Felipe Silveira / Bianka" value={respTexto} onChange={setRespTexto} />
        </Field>
      </div>

      {bloco("1 · ORIGEM")}
      <div style={duas}>
        <Field label="Origem">
          <Select
            options={[{ value: "", label: "—" }, ...origensVisiveis.map((o) => ({ value: o.id, label: o.label + (o.ativo ? "" : " (inativa)") }))]}
            value={origemId}
            onChange={setOrigemId}
          />
        </Field>
        <Field label="Ponte" hint="Quem abre a porta no cliente.">
          <Input placeholder="Leo + Fabiana (FIUS)" value={ponte} onChange={setPonte} />
        </Field>
      </div>

      {bloco("2 · PESSOAS NO CLIENTE")}
      <div style={duas}>
        <Field label="Contato / sponsor" hint="Quem decide.">
          <Input placeholder="Fernando — Diretor de Tax" value={contato} onChange={setContato} />
        </Field>
        <Field label="Contato operacional" hint="Quem toca o dia a dia.">
          <Input placeholder="Cida — Gerente de Tax" value={contatoOp} onChange={setContatoOp} />
        </Field>
      </div>

      {bloco("3 · OPORTUNIDADE")}
      <Field label="Dor principal">
        <Input placeholder="Conferir a apuração" value={dor} onChange={setDor} />
      </Field>
      <Field label="Módulos / Produtos de interesse" hint={area ? undefined : "Escolha a vertical para ver os módulos / produtos."}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {modulosDaArea.length ? (
            modulosDaArea.map((p) => {
              const marcado = modulos.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() => alternarModulo(p.id)}
                  style={{
                    ...eyebrow(11, marcado ? C.ink : C.faint, "0.06em"),
                    textTransform: "none",
                    padding: "6px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    border: `1px solid ${marcado ? C.accent : C.line}`,
                    background: marcado ? "color-mix(in srgb, var(--liff-accent) 12%, transparent)" : "transparent",
                  }}
                >
                  {p.label}
                </button>
              );
            })
          ) : (
            <span style={{ fontSize: 12, color: C.faint }}>
              {area ? "Nenhum módulo / produto cadastrado nesta vertical (Cadastros → módulos / produtos)." : "—"}
            </span>
          )}
        </div>
      </Field>
      <div style={duas}>
        <Field label="ERP" hint="Escolha um ou escreva outro.">
          <input list="liff-erps" value={erp} onChange={(e) => setErp(e.target.value)} placeholder="SAP ECC" style={campoNativo} />
          <datalist id="liff-erps">
            {ERP_SUGESTOES.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </Field>
        {mostraNegocio && (
          <Field label="Valor da proposta (R$)">
            <Input placeholder="294000" value={valor} onChange={setValor} />
          </Field>
        )}
      </div>
      {mostraNegocio && (
        // `flex: none` no interruptor: sem isso o flex o encolhe e o rótulo quebra em uma
        // palavra por linha. A explicação é que fica com a folga.
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ flex: "none" }}>
            <Switch checked={aceAws} onChange={setAceAws} label="ACE" />
          </span>
          <span style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
            ACE criada no AWS Partner Central.
          </span>
        </div>
      )}

      {bloco("4 · ANDAMENTO")}
      <Field label="Situação atual" hint="Só o estado de hoje. O que já foi fica no histórico do card.">
        <textarea
          rows={3}
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          placeholder="Proposta aceita; contrato em revisão no jurídico do cliente."
          style={{ ...campoNativo, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>
      <Field label="Próximo passo">
        <textarea
          rows={2}
          value={proximo}
          onChange={(e) => setProximo(e.target.value)}
          placeholder="Recepção dos arquivos para o kickoff."
          style={{ ...campoNativo, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>
      <div style={duas}>
        <Field label="Data do próximo passo" hint="Define o status do FUP e o cronograma.">
          <CampoData valor={proximoEm} onChange={setProximoEm} />
        </Field>
        <Field label="Última interação" hint="Último contato com o cliente.">
          <CampoData valor={ultimaInteracao} onChange={setUltimaInteracao} />
        </Field>
      </div>

      {mostraBlocker && (
        <>
          {bloco("5 · BLOCKER")}
          <Field label="O que está travando" hint="Em branco quando nada trava.">
            <Input placeholder="Questionário de LGPD e segurança de TI" value={blocker} onChange={setBlocker} />
          </Field>
          <div style={duas}>
            <Field label="Tipo">
              <Select
                options={[{ value: "", label: "—" }, ...BLOCKER_TIPOS.map((b) => ({ value: b.key, label: b.label }))]}
                value={blockerTipo}
                onChange={setBlockerTipo}
              />
            </Field>
            <Field label="Quem resolve na LIFF">
              <Select options={opcoesPessoa} value={blockerDono} onChange={setBlockerDono} />
            </Field>
          </div>
        </>
      )}

      {estagio === "lost" && (
        <>
          {bloco("6 · PERDA")}
          <div style={duas}>
            <Field label="Motivo">
              <Select
                options={[{ value: "", label: "—" }, ...MOTIVOS_PERDA.map((m) => ({ value: m.key, label: m.label }))]}
                value={motivoPerda}
                onChange={setMotivoPerda}
              />
            </Field>
            <Field label="Detalhe">
              <Input placeholder="Trabalho em curso com outra consultoria" value={motivoDetalhe} onChange={setMotivoDetalhe} />
            </Field>
          </div>
        </>
      )}

      {bloco("NOTAS")}
      <Field label="Observações" hint="Fatos que valem para a oportunidade inteira — não o andamento.">
        <textarea
          rows={2}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="AWS: Wilson Mansano é o account manager."
          style={{ ...campoNativo, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>

      {/* O lado operacional desta venda: as tarefas ligadas a ela. Só as que a pessoa
          enxerga — tarefa de vertical sem acesso não aparece, como em todo o sistema. */}
      {editando && (
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 18 }}>
          <div style={{ ...eyebrow(11, C.dust), marginBottom: 12 }}>TAREFAS LIGADAS</div>
          {tarefas.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {tarefas.map((t) => (
                <div
                  key={t.ref}
                  role="button"
                  className="liff-hover-row"
                  onClick={() => onAbrirTarefa?.(t.ref)}
                  title="Abrir a tarefa"
                  style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "baseline", padding: "6px 8px", cursor: "pointer", borderRadius: 4 }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{t.ref}</span>
                  <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.4 }}>{t.titulo}</span>
                  <span style={eyebrow(10, statusColor(t.status), "0.1em")}>{statusLabel(t.status)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.5 }}>
              Nenhuma tarefa ligada. Ligue uma tarefa pelo campo Oportunidade, no card dela em Operações.
            </div>
          )}
        </div>
      )}

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
