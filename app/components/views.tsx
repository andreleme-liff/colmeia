"use client";

// As telas do sistema. São puramente de apresentação: recebem dados já recortados e
// devolvem eventos. Quem decide o que pode ser alterado é o servidor — `podeEditar` que
// chega em cada registro é o eco daquela decisão, usado só para desenhar o estado.

import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject, useRef } from "react";
import { Button, Field, Input, Select } from "./ds";
import { C, GHOST_FIX, MONO, SANS, dot, eyebrow, mesh, statusColor, R } from "./tokens";
import { type Activity, type AreaCadastro, type ArquetipoResumo, type Deal, type LogEntry, type NovaOportunidade, type OrganizacaoResumo, type Origem, type Pessoa } from "./api";
import SeletorArea, { type OpcaoArea } from "./SeletorArea";
import Historico, { UltimasDoCampo } from "./Historico";
import { useOrdem } from "./ordenacao";
import { chaveCliente } from "@/lib/cliente";
import Permissoes from "./Permissoes";
import ViaConexao from "./ViaConexao";
import { CardOportunidade } from "./CardOportunidade";
import { CardAtividade } from "./CardAtividade";
import {
  ADMIN_CARDS, BLOCKER_TIPOS, ERP_SUGESTOES, ESTAGIO_INICIAL, MOTIVOS_PERDA, PAPEIS, STAGES, STATUS, CHAVE_SEM_RESPONSAVEL, aplicarBusca, areaOf, prepararBusca, ddmm, porTexto, stamp, statusLabel, hostDaUrl, previaDaProposta, urlDaProposta,
  PROPOSTA_VAZIA, TIPOS_AWS, brlExato, estagioTemProposta, temComposicao, totalPrimeiroAno, type ComposicaoProposta, type RegistroAws, type TipoAws,
} from "@/lib/domain";

/* =========================================================
   Visão geral
   ========================================================= */

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
  /** Quadradinho do produto, à esquerda do título. Só no comercial. */
  cor?: string;
  contexto: string;
  meta: string;
  metaCor: string;
  podeAbrir: boolean;
};
export type PainelDados = {
  /** "Boa tarde, André!" e a linha do dia (lib/saudacao.ts). */
  saudacao: { titulo: string; linha: string };
  focoComercial: LinhaFoco[];
  focoAtividades: LinhaFoco[];
  logs: LogEntry[];
};

/** Título de seção com um link à direita. Repetido três vezes no painel. */
export function CabecalhoSecao({ titulo, meta, acao }: { titulo: string; meta?: string; acao?: { texto: string; onClick: () => void } }) {
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

/**
 * Foco da semana de uma seção. A primeira coluna diz POR QUE a linha está ali — atraso,
 * prazo, parada, prioridade —, que é a informação que a lista existe para dar.
 */
export function ListaFoco({
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
      <div style={{ ...eyebrow(10, C.faint, "0.12em"), marginBottom: 4 }}>CLIQUE PARA ABRIR</div>
      {linhas.length === 0 && <div style={{ fontSize: 14, color: C.faint, paddingTop: 14 }}>{vazio}</div>}
      {linhas.map((l) => (
        <div
          key={l.ref}
          className={l.podeAbrir ? "liff-hover-row liff-painel-linha" : "liff-painel-linha"}
          onClick={() => l.podeAbrir && onAbrir(l.ref)}
          title={l.podeAbrir ? "Abrir" : "Somente leitura neste produto"}
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

/* =========================================================
   Raia do kanban — a coluna, que pode ser recolhida
   ========================================================= */
/**
 * Recolhida, a coluna vira uma faixa estreita com o nome em pé e a contagem. Serve para o que
 * não se acompanha o tempo todo (Lost, Concluído) e para coluna vazia.
 *
 * Continua sendo alvo de arraste: recolher "Lost" não pode tirar a possibilidade de jogar um
 * card lá. E a contagem fica à vista, para a coluna escondida não esconder que tem coisa.
 */
function Raia({
  chave,
  label,
  qtd,
  meta,
  recolhida,
  onAlternar,
  alvo,
  setAlvo,
  onSoltarId,
  largura,
  alturaMin,
  children,
}: {
  chave: string;
  label: string;
  qtd: number;
  /** O que vai à direita do título: o total em R$ no comercial, a contagem em operações. */
  meta: string;
  recolhida: boolean;
  onAlternar?: () => void;
  alvo: string | null;
  setAlvo: (f: (a: string | null) => string | null) => void;
  onSoltarId: (id: number) => void;
  largura: number;
  alturaMin?: number;
  children: ReactNode;
}) {
  const arraste = {
    "data-alvo": alvo === chave ? "1" : undefined,
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (alvo !== chave) setAlvo(() => chave);
    },
    onDragLeave: (e: React.DragEvent) => {
      // Só limpa ao sair da coluna de verdade: entrar num filho dispara dragleave no pai.
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo((a) => (a === chave ? null : a));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setAlvo(() => null);
      const id = Number(e.dataTransfer.getData("text/plain"));
      if (Number.isInteger(id)) onSoltarId(id);
    },
  };

  if (recolhida) {
    return (
      <button
        type="button"
        className="liff-raia liff-raia--recolhida"
        {...arraste}
        onClick={onAlternar}
        aria-expanded={false}
        aria-label={`Expandir a coluna ${label} (${qtd} ${qtd === 1 ? "card" : "cards"})`}
        title={`${label} · ${meta} — clique para expandir`}
        style={{ minHeight: alturaMin }}
      >
        <span style={{ fontFamily: MONO, fontSize: 11, color: qtd ? C.ink : C.ghost }}>{qtd}</span>
        <span style={{ ...eyebrow(11, C.dust, "0.14em"), writingMode: "vertical-rl", whiteSpace: "nowrap" }}>{label}</span>
      </button>
    );
  }

  return (
    <div
      className="liff-raia"
      {...arraste}
      style={{ minWidth: largura, flex: 1, padding: 12, display: "flex", flexDirection: "column", gap: 10, minHeight: alturaMin }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "4px 4px 2px" }}>
        <span style={{ ...eyebrow(11, C.dust, "0.14em"), flex: 1 }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{meta}</span>
        {onAlternar && (
          <button
            type="button"
            className="liff-raia-recolher"
            onClick={onAlternar}
            aria-expanded
            aria-label={`Recolher a coluna ${label}`}
            title="Recolher a coluna"
          >
            ⇤
          </button>
        )}
      </div>
      {children}
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
  recolhidas,
  onRecolher,
}: {
  colunas: ColunaDeal[];
  recolhidas: string[];
  onRecolher: (chave: string) => void;
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
        <Raia
          key={col.key}
          chave={col.key}
          label={col.label}
          qtd={col.cards.length}
          meta={col.total}
          recolhida={recolhidas.includes(col.key)}
          onAlternar={() => onRecolher(col.key)}
          alvo={alvo}
          setAlvo={setAlvo}
          // Soltar na própria coluna não é alteração; sem isto viraria um PATCH à toa.
          onSoltarId={(id) => !col.cards.some((c) => c.id === id) && onSoltar(id, col.key)}
          // O card v4 foi desenhado a 320px; abaixo de ~300 o nome do dono e as setas de 44px brigam.
          largura={densidade === "compacto" ? 272 : 300}
        >
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
        </Raia>
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
 * produto não separa "o que é venda" de "o que é execução" — separa por quando acontece. O
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
                  title={i.podeAbrir ? "Abrir" : "Somente leitura neste produto"}
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
  recolhidas,
  onRecolher,
}: {
  colunas: ColunaBoard[];
  recolhidas: string[];
  onRecolher: (chave: string) => void;
  produtos: { id: string; label: string }[];
  onSoltar: (id: number, status: string) => void;
  onAbrir: (id: number) => void;
}) {
  const [alvo, setAlvo] = useState<string | null>(null);

  return (
    <>
      <div className="liff-kanban">
        {colunas.map((col) => (
          <Raia
            key={col.key}
            chave={col.key}
            label={col.label}
            qtd={col.cards.length}
            meta={String(col.cards.length)}
            recolhida={recolhidas.includes(col.key)}
            onAlternar={() => onRecolher(col.key)}
            alvo={alvo}
            setAlvo={setAlvo}
            onSoltarId={(id) => !col.cards.some((c) => c.id === id) && onSoltar(id, col.key)}
            largura={280}
            alturaMin={420}
          >
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
          </Raia>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
        Arraste os cards entre as colunas, ou use as setas — o movimento é gravado no log com autor e horário.
        Cards de produtos sem permissão de edição não se movem.
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
    <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}`, borderRadius: R }}>
      <div className="liff-table">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: ACT_COLS,
            background: C.canvas,
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          {["ATIVIDADE", "PRODUTO", "RESPONSÁVEL", "PRAZO", "STATUS"].map((h) => (
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
  { key: "areas", label: "produtos" },
  { key: "produtos", label: "módulos" },
  // De onde vêm as oportunidades (Base Fius, AWS, Evento…) — o select do card comercial.
  { key: "origens", label: "origens" },
] as const;

const TITULO_NOVO: Record<string, string> = {
  pessoas: "NOVA PESSOA",
  produtos: "NOVO MÓDULO",
  areas: "NOVO PRODUTO",
  origens: "NOVA ORIGEM",
};

export type LinhaCad = {
  key: string; a: string; b: string; c: string; abrir?: () => void;
  /** Só na aba de módulos: o produto dono, a situação e o uso, para agrupar e contar. */
  grupo?: string; arquivado?: boolean; qtd?: number;
};
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
        borderRadius: R,
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

// `minmax(0, …)`: sem isso a coluna cresce até caber o conteúdo; assim a largura é a do cabeçalho e o texto longo é cortado com reticências.
const COLS_AREA = "minmax(0, 1.5fr) minmax(0, 0.9fr) minmax(0, 0.8fr) 44px";

/** Aba "áreas": a cor de cada produto é configuração, e muda como todo mundo vê o quadro —
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
  const ord = useOrdem();
  return (
    <div style={{ minWidth: 520 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: COLS_AREA,
          background: C.canvas,
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        {(
          [["produto", "PRODUTO"], [null, "COR"], ["atividades", "ATIVIDADES"], [null, ""]] as const
        ).map(([chave, h], i) => ord.th(chave, h, { padding: "12px 16px", ...eyebrow(10, C.faint) }, i))}
      </div>
      {ord.aplicar(areas, { produto: (a) => a.label, atividades: (a) => contagem(a.id) }).map((a) => (
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
                  titulo="Clique para renomear o produto"
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
              title={podeEditar ? "Escolher a cor deste produto" : "Só a administração altera a cor"}
              style={{
                width: 34,
                height: 26,
                padding: 0,
                border: `1px solid ${C.line}`,
                borderRadius: R,
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
        {podeEditar && " Um produto só pode ser excluído quando não tem mais atividade nem oportunidade."}
      </div>
    </div>
  );
}

/** Cadastro de um produto novo. O id sai do nome (vira variável CSS), então o formulário
 *  pede só nome, sigla e cor. */
function NovaArea({ salvando, onCriar }: { salvando: boolean; onCriar: (d: { label: string; short: string; cor: string }) => void }) {
  const [label, setLabel] = useState("");
  const [short, setShort] = useState("");
  const [cor, setCor] = useState("#4B6B9B");

  return (
    <>
      <Field label="Nome do produto" required>
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
              borderRadius: R,
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
        {salvando ? "criando…" : "cadastrar produto"}
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
      <Field label="Papel" hint="Leitura só vê. Membro e gestor editam os cards de todos os produtos; só o gestor vê a receita. Admin também administra.">
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
        lado, já com o papel escolhido.
      </div>
    </>
  );
}

/** Módulo é o que se vende dentro de um produto. Sempre nasce preso a uma área. */
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
  area,
  setArea,
  focoRef,
}: {
  salvando: boolean;
  areas: { id: string; label: string }[];
  onCriar: (d: { label: string; area: string }) => void;
  /** O produto vem de fora: o "+ módulo" de cada grupo da lista já deixa ele escolhido. */
  area: string;
  setArea: (v: string) => void;
  focoRef: RefObject<HTMLDivElement | null>;
}) {
  const [label, setLabel] = useState("");

  if (!areas.length) {
    return (
      <div style={{ fontSize: 13, lineHeight: 1.6, color: C.faint }}>
        Cadastre um produto antes: todo módulo pertence a um.
      </div>
    );
  }

  return (
    <>
      <div ref={focoRef}>
        <Field label="Nome do módulo" required>
          <Input placeholder="Regtrack Farma" value={label} onChange={setLabel} />
        </Field>
      </div>
      <Field label="Produto" required hint="O formulário de oportunidade só oferece os módulos do produto escolhido.">
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
        {salvando ? "cadastrando…" : "cadastrar módulo"}
      </Button>
    </>
  );
}

/** Aba "módulos": um bloco por produto, com a cor dele. A lista corrida obrigava a ler a
 *  coluna "produto" linha a linha para saber o que pertence a quê. */
function TabelaModulos({
  linhas,
  areas,
  onNovo,
}: {
  linhas: LinhaCad[];
  areas: { id: string; label: string }[];
  /** Ausente para quem não cadastra. */
  onNovo?: (area: string) => void;
}) {
  const [verArquivados, setVerArquivados] = useState(false);
  const arquivados = linhas.filter((l) => l.arquivado).length;
  // Produto que a pessoa não enxerga mais, mas que ainda tem módulo, não some da tela.
  const orfaos = [...new Set(linhas.map((l) => l.grupo ?? ""))].filter((g) => !areas.some((a) => a.id === g));
  const grupos = [...areas, ...orfaos.map((id) => ({ id, label: areaOf(id).label }))];

  return (
    <div style={{ minWidth: 480 }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "12px 16px", background: C.canvas, borderBottom: `1px solid ${C.line}`,
        }}
      >
        <span style={eyebrow(10, C.faint)}>
          {linhas.length - arquivados} {linhas.length - arquivados === 1 ? "MÓDULO ATIVO" : "MÓDULOS ATIVOS"} · {areas.length}{" "}
          {areas.length === 1 ? "PRODUTO" : "PRODUTOS"}
        </span>
        {arquivados > 0 && (
          <span
            onClick={() => setVerArquivados((v) => !v)}
            style={{ ...eyebrow(10, C.dust, "0.1em"), cursor: "pointer" }}
          >
            {verArquivados ? "ocultar" : "mostrar"} {arquivados} {arquivados === 1 ? "arquivado" : "arquivados"}
          </span>
        )}
      </div>
      {grupos.map((g) => {
        const cor = `var(--liff-app-area-${g.id}, var(--liff-text-faint))`;
        const todos = linhas.filter((l) => l.grupo === g.id);
        const visiveis = todos.filter((l) => verArquivados || !l.arquivado);
        const ativos = todos.filter((l) => !l.arquivado).length;
        return (
          <div key={g.id} style={{ borderBottom: `1px solid ${C.line}` }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "11px 16px 11px 13px",
                borderLeft: `3px solid ${cor}`,
                background: `color-mix(in srgb, ${cor} 9%, transparent)`,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>LIFF {g.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint, flex: 1 }}>
                {ativos === 0 ? "nenhum módulo" : ativos === 1 ? "1 módulo" : `${ativos} módulos`}
              </span>
              {onNovo && (
                <span
                  onClick={() => onNovo(g.id)}
                  title={`Cadastrar um módulo em LIFF ${g.label}`}
                  style={{ ...eyebrow(10, C.dust, "0.1em"), cursor: "pointer" }}
                >
                  + módulo
                </span>
              )}
            </div>
            {visiveis.map((r) => (
              <div
                key={r.key}
                className={r.abrir ? "liff-hover-row" : undefined}
                onClick={r.abrir}
                title={r.abrir ? "Abrir para editar" : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "11px 16px 11px 13px",
                  borderLeft: `3px solid color-mix(in srgb, ${cor} 35%, transparent)`,
                  borderTop: `1px solid ${C.line}`,
                  cursor: r.abrir ? "pointer" : undefined,
                  opacity: r.arquivado ? 0.55 : 1,
                }}
              >
                <span style={{ ...dot(cor), width: 7, height: 7, flex: "none" }} />
                <span style={{ fontSize: 14, color: C.ink, flex: 1, minWidth: 0 }}>{r.a}</span>
                {r.arquivado && <span style={eyebrow(9, C.faint, "0.1em")}>arquivado</span>}
                <span style={{ fontFamily: MONO, fontSize: 11, color: r.qtd ? C.body : C.ghost, width: 96, textAlign: "right" }}>
                  {r.c}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
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
  onPapelPessoas,
  onAtivoPessoa,
  onEditarPessoa,
}: {
  tab: string;
  onTab: (k: string) => void;
  set: CadSet;
  /** Aba Pessoas: a lista com papel, e-mail, acesso e as permissões por área (a antiga Administração). */
  pessoas: Pessoa[];
  meuId: number;
  onPapelPessoas: (usuarios: number[], papel: string) => void;
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
  const [areaNovoModulo, setAreaNovoModulo] = useState("");
  const focoNovoModulo = useRef<HTMLDivElement | null>(null);
  const ordCad = useOrdem();
  return (
    <>
      <div style={mesh({ display: "flex", gap: 1, width: "fit-content", marginBottom: 22, flexWrap: "wrap" })}>
        {CAD_TABS.map((t) => (
          <div
            key={t.key}
            onClick={() => onTab(t.key)}
            style={{
              // 32 + a borda da malha = 34, a altura dos botões.
              height: 32,
              display: "flex",
              alignItems: "center",
              padding: "0 16px",
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
            <Permissoes
              pessoas={pessoas}
              meuId={meuId}
              onPapel={onPapelPessoas}
              onAtivo={onAtivoPessoa}
              onEditar={podeEditarAreas ? onEditarPessoa : undefined}
            />
          ) : tab === "areas" ? (
            <TabelaAreas areas={areas} contagem={contagemPorArea} podeEditar={podeEditarAreas} onCor={onCorArea} onExcluir={onExcluirArea} onNome={onNomeArea} />
          ) : tab === "produtos" ? (
            <TabelaModulos
              linhas={set.rows}
              areas={areas}
              onNovo={
                podeEditarAreas
                  ? (id) => {
                      setAreaNovoModulo(id);
                      focoNovoModulo.current?.scrollIntoView({ block: "center", behavior: "smooth" });
                      focoNovoModulo.current?.querySelector("input")?.focus({ preventScroll: true });
                    }
                  : undefined
              }
            />
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
              {set.head.map((h, k) => ordCad.th(["a", "b", "c"][k] ?? null, h, { padding: "12px 16px", ...eyebrow(10, C.faint) }, h))}
            </div>
            {ordCad.aplicar(set.rows, { a: (r) => r.a, b: (r) => r.b, c: (r) => r.c }).map((r) => (
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
                enviar nenhum dos dois. Produtos e módulos são configuração do sistema —
                só admin cadastra, como já valia para a cor do produto. */}
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
              <NovoProduto salvando={salvandoArea} areas={areasEditaveis} onCriar={onCriarProduto} area={areaNovoModulo} setArea={setAreaNovoModulo} focoRef={focoNovoModulo} />
            )}
            <div style={{ fontSize: 12, lineHeight: 1.6, color: C.faint }}>
              Cadastros alimentam os seletores de atividades, oportunidades e responsáveis. Alterações entram no
              changelog.
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
  const ord = useOrdem();
  if (falha && !todas) return <Aviso>{falha}</Aviso>;
  if (!todas) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>carregando changelog…</div>;

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
    <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}`, borderRadius: R }}>
      <div style={{ minWidth: 760 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: AUDIT_COLS,
            background: C.canvas,
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          {(
            [["quando", "QUANDO"], ["quem", "QUEM"], ["produto", "PRODUTO"], ["texto", "O QUE MUDOU"]] as const
          ).map(([chave, h]) => ord.th(chave, h, { padding: "12px 16px", ...eyebrow(10, C.faint) }))}
        </div>
        {ord
          .aplicar(logs, {
            quando: (l) => l.criadoEm,
            quem: (l) => l.autor,
            produto: (l) => (l.area ? areaOf(l.area).label : null),
            texto: (l) => l.texto,
          })
          .map((l) => {
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
  borderRadius: R,
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
        borderRadius: R,
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

          {/* Com a cortina larga, produto e módulo lado a lado. */}
          <div className="cortina-duas" style={{ gap: "0 14px" }}>
          <div>
            <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>PRODUTO</div>
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
            <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>MÓDULO</div>
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

          </div>

          {/* A oportunidade comercial a que esta tarefa serve — o elo entre o pipeline e o
              quadro. Qualquer oportunidade que a pessoa enxergue, de qualquer produto: a tarefa
              de implantação em Tax costuma servir a uma venda fechada em Corporate. */}
          <div>
            <div style={{ ...eyebrow(10, C.faint), marginBottom: 9 }}>OPORTUNIDADE</div>
            {act.oportunidadeOculta ? (
              // Ligada a uma oportunidade de área que esta pessoa não vê: mostrar que o vínculo
              // existe, sem o nome da conta — e sem oferecer um seletor que o desfaria às cegas.
              <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.5 }}>
                Ligada a uma oportunidade de um produto que você não acessa.
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
              Sem data, fica em “Sem data” no cronograma.
            </div>
          </div>

          <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: editavel ? C.faint : C.warning }}>
            {editavel
              ? "Você tem permissão de edição neste produto. Toda alteração é registrada no log."
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
  etapas,
  onEtapa,
  texto,
  copiado,
  onArea,
  onCopiar,
  onFechar,
}: {
  tabs: OpcaoArea[];
  areaAtiva: string;
  /** Etapas do funil que entram no resumo. */
  etapas: string[];
  onEtapa: (chave: string) => void;
  texto: string;
  copiado: boolean;
  onArea: (id: string) => void;
  onCopiar: () => void;
  onFechar: () => void;
}) {
  return (
    <Modal titulo="Resumo de status" eyebrowTexto="LIFF/ REPORT" onFechar={onFechar} largura={640}>
        <div>
          <SeletorArea opcoes={tabs} valor={areaAtiva} onChange={onArea} larguraTotal />
        </div>

        {/* Quais etapas do funil o resumo reporta. Fica guardado: da próxima vez abre igual. */}
        <div>
          <div style={{ ...eyebrow(10, C.faint, "0.14em"), marginBottom: 8 }}>ETAPAS NO RESUMO</div>
          <div role="group" aria-label="Etapas do funil no resumo" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {STAGES.map((e) => {
              const on = etapas.includes(e.key);
              return (
                <button
                  key={e.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onEtapa(e.key)}
                  style={{
                    ...eyebrow(11, on ? C.ink : C.faint, "0.06em"),
                    textTransform: "none",
                    padding: "6px 10px",
                    borderRadius: R,
                    cursor: "pointer",
                    border: `1px solid ${on ? C.accent : C.line}`,
                    background: on ? "color-mix(in srgb, var(--liff-accent) 12%, transparent)" : "transparent",
                  }}
                >
                  {e.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
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
              borderRadius: R,
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
    </Modal>
  );
}

/* =========================================================
   Criação — atividade e oportunidade
   ========================================================= */
const campoNativo: CSSProperties = {
  width: "100%",
  background: C.code,
  border: `1px solid ${C.line}`,
  borderRadius: R,
  color: C.ink,
  fontFamily: SANS,
  fontSize: 15,
  padding: "11px 13px",
};

/**
 * Cortina: o painel que entra pela direita, ocupando a altura toda. É como os cards de
 * Operações sempre abriram, e agora vale para todo cadastro e edição do sistema (antes eram
 * janelas no centro da tela, estreitas e com rolagem curta).
 *
 * O cabeçalho fica fixo no topo com o botão de fechar; o conteúdo rola. Fecha com Esc, com o
 * ×, ou clicando no fundo escurecido.
 */
export function Modal({ titulo, eyebrowTexto, children, onFechar, largura = 640 }: {
  titulo: string;
  eyebrowTexto: string;
  children: ReactNode;
  onFechar: () => void;
  /** Largura da cortina; no celular ela ocupa a tela toda. */
  largura?: number;
}) {
  const fundo = useFecharNoFundo(onFechar);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);
  return (
    <>
      <div {...fundo} className="cortina-fundo" />
      <div className="cortina" role="dialog" aria-modal="true" aria-label={titulo} style={{ width: largura }}>
        <div className="cortina__topo">
          <div style={{ minWidth: 0 }}>
            <div style={eyebrow(10, C.accent)}>{eyebrowTexto}</div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink, marginTop: 6 }}>{titulo}</div>
          </div>
          <button type="button" className="cortina__fechar" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="cortina__corpo">{children}</div>
      </div>
    </>
  );
}

/**
 * Opções do seletor de área.
 *
 * A área atual entra na lista mesmo sem permissão de escrita nela, senão o campo mostraria
 * algo diferente do que o registro realmente é.
 *
 * Sem `atual` — ou seja, na criação — a lista abre com uma opção vazia, e o botão de salvar
 * fica desabilitado até alguém escolher. Não é firula: com a primeiro produto
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
  return atual ? lista : [{ value: "", label: "— escolha o produto —" }, ...lista];
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
  // cadastrava no produto errado sem perceber — aconteceu com 40 atividades de uma vez.
  const [area, setArea] = useState("");
  const [status, setStatus] = useState("backlog");
  const [prioridade, setPrioridade] = useState("media");
  const [prazo, setPrazo] = useState("");
  const [responsavel, setResponsavel] = useState<string>("");
  const [situacao, setSituacao] = useState("");
  const [proximo, setProximo] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [proximoEm, setProximoEm] = useState("");

  // Módulo pertence a um produto; trocar a área invalida a escolha anterior.
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

      <Field label="Produto" required hint="Escolha antes de salvar — não há produto pré-selecionado.">
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
        label="Módulo"
        hint={
          !area
            ? "Escolha o produto primeiro."
            : produtosDaArea.length
              ? "O que está sendo implantado. Opcional."
              : "Nenhum módulo cadastrado neste produto — cadastre em Cadastros → módulos."
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

      <Field label="Quando" hint="Alimenta o cronograma. Em branco, fica em “Sem data”.">
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
/**
 * Link da proposta comercial: o campo, o atalho para abrir e, quando o endereço é do Google
 * (Docs, Slides, Sheets ou arquivo do Drive), a própria proposta dentro do card.
 * A prévia é servida pelo Google, com a sessão de quem está olhando: quem não tem acesso ao
 * arquivo vê o pedido de acesso do Google, não a proposta.
 */
function CampoProposta({
  valor, onChange, aberta, onAlternar,
}: { valor: string; onChange: (v: string) => void; aberta: boolean; onAlternar: () => void }) {
  const url = urlDaProposta(valor);
  const previa = url ? previaDaProposta(url) : null;
  const link = { ...eyebrow(11, C.accent, "0.08em"), textDecoration: "none", cursor: "pointer", background: "none", border: 0, padding: 0 } as const;
  return (
    <Field
      label="Proposta (link)"
      hint={url === null ? "Endereço inválido: cole o link completo, começando por https://." : "Cole o endereço de onde a proposta está: Drive, Docs, Slides, PDF."}
    >
      <Input placeholder="https://docs.google.com/presentation/d/…" value={valor} onChange={onChange} />
      {url && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 8 }}>
          <a href={url} target="_blank" rel="noopener noreferrer" style={link}>
            ABRIR EM NOVA ABA ↗
          </a>
          {previa ? (
            <button type="button" onClick={onAlternar} aria-expanded={aberta} style={link}>
              {aberta ? "ESCONDER PRÉVIA" : "VER AQUI"}
            </button>
          ) : null}
          <span style={{ fontSize: 12, color: C.faint }}>{previa ? previa.tipo : hostDaUrl(url)}</span>
        </div>
      )}
      {url && previa && aberta && (
        <div style={{ marginTop: 10 }}>
          <iframe
            className="proposta-previa"
            src={previa.embed}
            title="Pré-visualização da proposta"
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            allowFullScreen
          />
          <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5, marginTop: 6 }}>
            Só aparece para quem tem acesso ao arquivo no Google. Sem acesso, o Google pede login ou permissão.
          </div>
        </div>
      )}
    </Field>
  );
}

/**
 * Os registros de um tipo (ACE ou funding) do card: uma linha por registro, com a identificação
 * e o link do cadastro na AWS, e o botão de acrescentar. A lista é uma só para os dois tipos,
 * para a ordem de cadastro se manter.
 */
function RegistrosAws({ tipo, lista, onChange }: { tipo: TipoAws; lista: RegistroAws[]; onChange: (l: RegistroAws[]) => void }) {
  const ace = tipo === "ace";
  const mexe = (i: number, campo: "descricao" | "url", v: string) => onChange(lista.map((r, j) => (j === i ? { ...r, [campo]: v } : r)));
  const doTipo = lista.map((r, i) => ({ r, i })).filter((x) => x.r.tipo === tipo);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={eyebrow(10, C.faint, "0.12em")}>
          {ace ? "ACE" : "FUNDING SOLICITADO"}
          {doTipo.length > 0 && <span style={{ color: C.dust }}> · {doTipo.length}</span>}
        </span>
        <button type="button" className="rec-link" onClick={() => onChange([...lista, { tipo, descricao: "", url: "" }])}>
          + {ace ? "ACE" : "funding"}
        </button>
      </div>
      {doTipo.length === 0 && (
        <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
          {ace ? "Nenhuma ACE aberta para esta oportunidade." : "Nenhum funding solicitado para esta oportunidade."}
        </div>
      )}
      {doTipo.map(({ r, i }) => {
        const url = urlDaProposta(r.url);
        return (
          <div key={i} className="cop-aws">
            <input
              value={r.descricao}
              onChange={(e) => mexe(i, "descricao", e.target.value)}
              placeholder={ace ? "ID ou nome da ACE" : "Programa e valor"}
              aria-label={ace ? "Identificação da ACE" : "Identificação do funding"}
              style={campoNativo}
            />
            <input
              value={r.url}
              onChange={(e) => mexe(i, "url", e.target.value)}
              placeholder="Link do cadastro na AWS (https://…)"
              aria-label="Link do cadastro na AWS"
              inputMode="url"
              style={{ ...campoNativo, ...(url === null ? { borderColor: C.error } : {}) }}
            />
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="cop-aws__acao" title="Abrir o cadastro na AWS em nova aba">↗</a>
            ) : (
              <span className="cop-aws__acao" aria-hidden style={{ opacity: 0.3 }}>↗</span>
            )}
            <button type="button" className="cop-aws__acao" onClick={() => onChange(lista.filter((_, j) => j !== i))} title="Remover este registro" aria-label="Remover este registro">
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Centavos → texto do campo, no formato brasileiro ("1.500,5"); zero fica vazio. */
function reaisParaCampo(centavos: number): string {
  if (!centavos) return "";
  // Centavos só aparecem quando existem: "9.000", mas "8.500,50".
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: centavos % 100 ? 2 : 0, maximumFractionDigits: 2 });
}
/** Texto do campo → reais. Ponto é milhar e vírgula é decimal, como se escreve no Brasil. */
function campoParaReais(v: string): number {
  const n = Number(v.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
/** Lista fechada de parcelamentos; um valor fora dela (vindo do MCP) entra como opção extra. */
function opcoesParcelas(atual: number) {
  const lista = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 36, 48, 60];
  if (!lista.includes(atual)) lista.push(atual);
  return lista.sort((a, b) => a - b).map((n) => ({ value: String(n), label: n === 1 ? "à vista (1x)" : `${n}x` }));
}
/** De onde vem o total: "12 × R$ 5.000 + implantação R$ 30.000 + customização R$ 12.000 (12 de 24 parcelas)". */
function resumoDaComposicao(c: ComposicaoProposta): string {
  const partes: string[] = [];
  if (c.assinaturaCentavos) partes.push(`12 × ${brlExato(c.assinaturaCentavos)}`);
  const parcelado = (nome: string, total: number, x: number) => {
    if (!total) return;
    // Parcelamento acima de 12 vezes: só as 12 primeiras caem no primeiro ano.
    partes.push(x > 12 ? `${nome} ${brlExato(Math.round((total * 12) / x))} (12 de ${x} parcelas)` : `${nome} ${brlExato(total)}`);
  };
  parcelado("implantação", c.implantacaoCentavos, c.implantacaoParcelas);
  parcelado("customização", c.customizacaoCentavos, c.customizacaoParcelas);
  return partes.join(" + ");
}

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
  organizacoes = [],
  arquetipos = [],
}: {
  areasEditaveis: { id: string; label: string }[];
  pessoas: OpcaoPessoa[];
  /** Produtos da área — na oportunidade, são os módulos de interesse. */
  produtos: { id: string; label: string; area: string; ativo: boolean }[];
  origens?: Origem[];
  /** Cadastro de organizações que a pessoa enxerga. */
  organizacoes?: OrganizacaoResumo[];
  /** Arquétipos de funding; o card oferece os do produto escolhido. */
  arquetipos?: ArquetipoResumo[];
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
  // Casa pelo nome normalizado: "GLOBE QUIMICA S.A" acha "Globe Química".
  const chaveDigitada = chaveCliente(conta);
  const orgEscolhida = chaveDigitada ? organizacoes.find((o) => o.chaves.includes(chaveDigitada)) : undefined;
  // Na edição vem a área do registro; na criação, em branco — ver NovaAtividade.
  const [area, setArea] = useState(inicial?.area ?? "");
  const [estagio, setEstagio] = useState<string>(inicial?.estagio ?? ESTAGIO_INICIAL);
  const [valor, setValor] = useState(inicial ? reaisParaCampo(inicial.valorCentavos) : "");
  // Composição da proposta: valores como texto (aceitam "1.500,00"), parcelas como número.
  const p0 = inicial?.proposta ?? PROPOSTA_VAZIA;
  const [propAss, setPropAss] = useState(reaisParaCampo(p0.assinaturaCentavos));
  const [propImp, setPropImp] = useState(reaisParaCampo(p0.implantacaoCentavos));
  const [propImpX, setPropImpX] = useState(p0.implantacaoParcelas);
  const [propCus, setPropCus] = useState(reaisParaCampo(p0.customizacaoCentavos));
  const [propCusX, setPropCusX] = useState(p0.customizacaoParcelas);
  const [arquetipoId, setArquetipoId] = useState(inicial?.arquetipoId ? String(inicial.arquetipoId) : "");
  const [aws, setAws] = useState<RegistroAws[]>(inicial?.aws ?? []);
  const [proximo, setProximo] = useState(inicial?.proximoPasso ?? "");
  const [responsavel, setResponsavel] = useState<string>(
    inicial ? String(inicial.responsavelId ?? pessoas.find((p) => p.nome === inicial.responsavel)?.id ?? "") : ""
  );
  const [situacao, setSituacao] = useState(inicial?.situacao ?? "");
  const [contato, setContato] = useState(inicial?.contato ?? "");
  const [respTexto, setRespTexto] = useState(inicial?.responsavelTexto ?? "");
  const [proximoEm, setProximoEm] = useState(inicial?.proximoPassoEm ?? "");
  const [origemId, setOrigemId] = useState(inicial?.origemId ?? "");
  const [ponte, setPonte] = useState(inicial?.ponte ?? "");
  const [contatoOp, setContatoOp] = useState(inicial?.contatoOperacional ?? "");
  const [dor, setDor] = useState(inicial?.dor ?? "");
  const [erp, setErp] = useState(inicial?.erp ?? "");
  const [propostaUrl, setPropostaUrl] = useState(inicial?.propostaUrl ?? "");
  const [verProposta, setVerProposta] = useState(false);
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
  const mostraBlocker = !emProspeccao || !!blocker || !!blockerTipo || !!blockerDono;
  const composicao: ComposicaoProposta = {
    assinaturaCentavos: Math.round(campoParaReais(propAss) * 100),
    implantacaoCentavos: Math.round(campoParaReais(propImp) * 100),
    implantacaoParcelas: propImpX,
    customizacaoCentavos: Math.round(campoParaReais(propCus) * 100),
    customizacaoParcelas: propCusX,
  };
  // Os três valores aparecem a partir do estágio Proposta — ou se já foram preenchidos (um
  // card que voltou para On hold ou foi perdido depois da proposta não esconde o que tinha).
  const comProposta = estagioTemProposta(estagio) || temComposicao(inicial?.proposta ?? PROPOSTA_VAZIA);
  const mostraNegocio = !emProspeccao || !!valor.replace(/[0.,]/g, "") || aws.length > 0 || comProposta;
  // Arquétipos do produto do card: os da pasta ligada a um módulo dele, mais os de pasta sem
  // módulo (valem para qualquer produto). Inativo só aparece se já era o do card.
  const arquetiposDoProduto = arquetipos.filter(
    (a) => (!a.area || a.area === area) && (a.ativo || a.id === inicial?.arquetipoId)
  );
  const alternarModulo = (id: string) =>
    setModulos((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const enviar = () =>
    onSalvar({
      conta: orgEscolhida?.nome ?? conta,
      clienteId: orgEscolhida?.id ?? null,
      area,
      estagio,
      valorReais: campoParaReais(valor),
      propAssinaturaReais: composicao.assinaturaCentavos / 100,
      propImplantacaoReais: composicao.implantacaoCentavos / 100,
      propImplantacaoParcelas: composicao.implantacaoParcelas,
      propCustomizacaoReais: composicao.customizacaoCentavos / 100,
      propCustomizacaoParcelas: composicao.customizacaoParcelas,
      arquetipoId: arquetiposDoProduto.some((a) => String(a.id) === arquetipoId) ? Number(arquetipoId) : null,
      // Linha sem identificação nem link também vale: é "há uma ACE (ou um pedido), sem link ainda".
      aws,
      proximoPasso: proximo,
      responsavelId: responsavel ? Number(responsavel) : null,
      situacao,
      contato,
      responsavelTexto: respTexto,
      proximoPassoEm: proximoEm || null,
      origemId: origemId || null,
      ponte,
      contatoOperacional: contatoOp,
      dor,
      erp,
      propostaUrl,
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
  // `primeiro`: o bloco que abre uma coluna não leva o fio de cima — não há o que separar.
  // Os blocos são numerados na ordem em que aparecem: alguns somem conforme o estágio
  // (valor, AWS, blocker, perda), e um número fixo deixaria buracos na sequência.
  let ordem = 0;
  const bloco = (titulo: string, primeiro = false) => (
    <div className={primeiro ? "cortina-bloco-topo" : undefined} style={{ ...eyebrow(10, C.dust, "0.14em"), ...(primeiro ? {} : { borderTop: `1px solid ${C.line}`, paddingTop: 16, marginTop: 2 }) }}>
      {++ordem} · {titulo}
    </div>
  );
  const duas = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } as const;

  return (
    <Modal
      titulo={editando ? `Editar ${inicial.conta}` : "Nova oportunidade"}
      eyebrowTexto={editando ? `LIFF/ COMERCIAL · ${inicial.ref}` : "LIFF/ COMERCIAL"}
      onFechar={onFechar}
      largura={1120}
    >
      {/* Ordem de leitura e de preenchimento:
            topo     — o que identifica o card (organização, produto, estágio);
            esquerda — o cadastro, preenchido uma vez: quem cuida e de onde veio, as pessoas no
                       cliente, o que se vende, as notas;
            direita  — o que muda toda semana: andamento, valor e proposta, blocker, perda;
            rodapé   — só consulta: linha do tempo, tarefas e histórico.
          No celular vira uma coluna só, nessa mesma ordem. */}
      <div className="cortina-topo">
      <Field
    label="Organização"
    required
    hint={
      orgEscolhida
        ? `Do cadastro: ${orgEscolhida.nome} (${orgEscolhida.ref}).${orgEscolhida.nome !== conta.trim() ? " O card vai mostrar esse nome." : ""}`
        : conta.trim()
          ? "Não está no cadastro: será criada uma organização nova ao salvar."
          : "Escolha uma organização do cadastro ou digite o nome de uma nova."
    }
  >
    <input
      list="liff-organizacoes"
      value={conta}
      onChange={(e) => setConta(e.target.value)}
      placeholder="Nome da organização"
      autoComplete="off"
      style={campoNativo}
    />
    <datalist id="liff-organizacoes">
      {organizacoes.map((o) => (
        <option key={o.id} value={o.nome} />
      ))}
    </datalist>
  </Field>

        <Field label="Produto" required hint={editando ? undefined : "Escolha antes de salvar."}>
          <Select
            options={opcoesArea(areasEditaveis, inicial?.area)}
            value={area}
            onChange={(v) => {
              setArea(v);
              // Os módulos pertencem ao produto anterior; o servidor recusaria sem explicar.
              setModulos([]);
            }}
          />
        </Field>
        <Field label="Estágio" hint={comProposta && !estagioTemProposta(inicial?.estagio ?? ESTAGIO_INICIAL) ? "A partir daqui o card detalha a proposta." : undefined}>
          <Select options={STAGES.map((s) => ({ value: s.key, label: s.label }))} value={estagio} onChange={setEstagio} />
        </Field>
      </div>

      <div className="cortina-duas">
      <div className="cortina-col">
      {bloco("DONO E ORIGEM", true)}
      <div style={duas}>
        <Field label="Dono">
          <Select options={opcoesPessoa} value={responsavel} onChange={setResponsavel} />
        </Field>
        <Field label="Dono (texto)" hint="Quem ainda não tem conta, ou duplas.">
          <Input placeholder="Felipe Silveira / Bianka" value={respTexto} onChange={setRespTexto} />
        </Field>
      </div>
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

      {bloco("PESSOAS NO CLIENTE")}
      <div style={duas}>
        <Field label="Contato / sponsor" hint="Quem decide.">
          <Input placeholder="Fernando — Diretor de Tax" value={contato} onChange={setContato} />
        </Field>
        <Field label="Contato operacional" hint="Quem toca o dia a dia.">
          <Input placeholder="Cida — Gerente de Tax" value={contatoOp} onChange={setContatoOp} />
        </Field>
      </div>

      {bloco("O QUE SE VENDE")}
      <Field label="Dor principal">
        <Input placeholder="Conferir a apuração" value={dor} onChange={setDor} />
      </Field>
      <Field label="Módulos de interesse" hint={area ? undefined : "Escolha o produto para ver os módulos."}>
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
                    borderRadius: R,
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
              {area ? "Nenhum módulo cadastrado neste produto (Cadastros → módulos)." : "—"}
            </span>
          )}
        </div>
      </Field>
      <Field label="ERP" hint="Escolha um ou escreva outro.">
        <input list="liff-erps" value={erp} onChange={(e) => setErp(e.target.value)} placeholder="SAP ECC" style={campoNativo} />
        <datalist id="liff-erps">
          {ERP_SUGESTOES.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
      </Field>


      {mostraNegocio && (
        <>
          {bloco("VALOR E PROPOSTA")}
          {/* A partir de Proposta o valor se abre nos três tipos da receita. Antes disso é só
              uma estimativa, num número. */}
          {comProposta && (
            <div className="cop-proposta">
              <div>
                <div style={eyebrow(10, C.dust, "0.14em")}>ASSINATURA</div>
                <Field label="Por mês (R$)">
                  <Input placeholder="0,00" value={propAss} onChange={setPropAss} size="sm" />
                </Field>
                <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>Mensal, sem parcelas.</div>
              </div>
              <div>
                <div style={eyebrow(10, C.dust, "0.14em")}>IMPLANTAÇÃO</div>
                <Field label="Total (R$)">
                  <Input placeholder="0,00" value={propImp} onChange={setPropImp} size="sm" />
                </Field>
                <Field label="Dividido em">
                  <Select options={opcoesParcelas(propImpX)} value={String(propImpX)} onChange={(v) => setPropImpX(Number(v))} />
                </Field>
              </div>
              <div>
                <div style={eyebrow(10, C.dust, "0.14em")}>CUSTOMIZAÇÃO</div>
                <Field label="Total (R$)">
                  <Input placeholder="0,00" value={propCus} onChange={setPropCus} size="sm" />
                </Field>
                <Field label="Dividido em">
                  <Select options={opcoesParcelas(propCusX)} value={String(propCusX)} onChange={(v) => setPropCusX(Number(v))} />
                </Field>
              </div>
            </div>
          )}
          {comProposta && temComposicao(composicao) ? (
            <div className="cop-total">
              <div>
                <div style={eyebrow(10, C.dust, "0.14em")}>VALOR TOTAL · 12 MESES</div>
                <span>{resumoDaComposicao(composicao)}</span>
              </div>
              <strong>{brlExato(totalPrimeiroAno(composicao))}</strong>
            </div>
          ) : (
            <Field
              label="Valor total · 12 meses (R$)"
              hint={
                comProposta
                  ? "Preencha assinatura, implantação ou customização acima e o total passa a ser calculado."
                  : "Estimativa do primeiro ano: assinatura, implantação e customização somadas."
              }
            >
              <Input placeholder="294.000" value={valor} onChange={setValor} />
            </Field>
          )}
          <CampoProposta valor={propostaUrl} onChange={setPropostaUrl} aberta={verProposta} onAlternar={() => setVerProposta((v) => !v)} />
        </>
      )}

      {bloco("NOTAS")}
      <Field label="Observações" hint="Fatos que valem para a oportunidade inteira — não o andamento.">
        <textarea
          rows={3}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="AWS: Wilson Mansano é o account manager."
          style={{ ...campoNativo, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>
      </div>

      <div className="cortina-col">
      {bloco("ANDAMENTO", true)}
      <Field label="Situação atual">
        <textarea
          rows={3}
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          placeholder="Proposta aceita; contrato em revisão no jurídico do cliente."
          style={{ ...campoNativo, resize: "vertical", lineHeight: 1.5 }}
        />
      </Field>
      {/* As três situações anteriores à que está no campo: dá o fio da conversa sem abrir o
          histórico inteiro. */}
      {editando && (
        <div>
          <div style={{ ...eyebrow(10, C.faint, "0.12em"), marginBottom: 8 }}>SITUAÇÕES ANTERIORES</div>
          <UltimasDoCampo entidade={inicial.ref} campo="situacao" atual={inicial.situacao} limite={3} vazio="Ainda não há situação anterior a esta." />
        </div>
      )}
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
          {bloco("BLOCKER")}
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



      {mostraNegocio && (
        <>
          {bloco("AWS")}
          <Field
            label="Arquétipo"
            hint={
              !area
                ? "Escolha o produto para ver os arquétipos."
                : arquetiposDoProduto.length
                  ? "Opcional. É a base para abrir a ACE e pedir funding."
                  : "Ainda não há arquétipo cadastrado para este produto."
            }
          >
            <Select
              options={[
                { value: "", label: "—" },
                ...arquetiposDoProduto.map((a) => ({ value: String(a.id), label: a.nome + (a.ativo ? "" : " (inativo)") })),
              ]}
              value={arquetiposDoProduto.some((a) => String(a.id) === arquetipoId) ? arquetipoId : ""}
              onChange={setArquetipoId}
            />
          </Field>
          {/* Uma oportunidade pode ter várias ACEs e vários pedidos de funding. Cada linha guarda
              a identificação e o link do cadastro no Partner Central. */}
          {TIPOS_AWS.map((t) => (
            <RegistrosAws
              key={t.key}
              tipo={t.key}
              lista={aws}
              onChange={setAws}
            />
          ))}
        </>
      )}

      {estagio === "lost" && (
        <>
          {bloco("PERDA")}
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

      {/* O lado operacional desta venda: as tarefas ligadas a ela. Só as que a pessoa
          enxerga — tarefa de produto sem acesso não aparece, como em todo o sistema. */}
      {editando && (
        <>
          {bloco("TAREFAS LIGADAS")}
          <div>
          {tarefas.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {tarefas.map((t) => (
                <div
                  key={t.ref}
                  role="button"
                  className="liff-hover-row"
                  onClick={() => onAbrirTarefa?.(t.ref)}
                  title="Abrir a tarefa"
                  style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "baseline", padding: "6px 8px", cursor: "pointer", borderRadius: R }}
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
        </>
      )}
      </div>
      </div>

      {/* Rodapé de consulta: o histórico completo, sob demanda. */}
      {editando && (
        <div id="liff-historico-completo" style={{ borderTop: `1px solid ${C.line}`, paddingTop: 18, marginTop: 4 }}>
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
