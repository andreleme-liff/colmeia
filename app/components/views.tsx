"use client";

// As telas do sistema. São puramente de apresentação: recebem dados já recortados e
// devolvem eventos. Quem decide o que pode ser alterado é o servidor — `podeEditar` que
// chega em cada registro é o eco daquela decisão, usado só para desenhar o estado.

import { useState, type CSSProperties, type ReactNode } from "react";
import { Button, Field, Input, Select, Switch } from "./ds";
import { C, GHOST_FIX, MONO, SANS, dot, eyebrow, mesh, prioColor, statusColor } from "./tokens";
import type { Activity, AreaCadastro, Deal, LogEntry, Pessoa } from "./api";
import SeletorArea, { type OpcaoArea } from "./SeletorArea";
import { ADMIN_CARDS, STAGES, STATUS, areaOf, brl, ddmm, stamp, statusLabel, todasAreas } from "@/lib/domain";

/* =========================================================
   Visão geral
   ========================================================= */
export type Kpi = { label: string; value: string | number; hint: string; color: string };
export type CargaArea = { label: string; color: string; meta: string; pct: string };

export function Overview({ kpis, carga, logs }: { kpis: Kpi[]; carga: CargaArea[]; logs: LogEntry[] }) {
  return (
    <>
      <div className="liff-kpis" style={mesh({ display: "grid", gap: 1, marginBottom: 28 })}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: C.cell, padding: "22px 20px" }}>
            <div style={eyebrow(10, C.faint)}>{k.label}</div>
            <div
              style={{
                fontSize: 38,
                fontWeight: 800,
                letterSpacing: "-0.035em",
                color: k.color,
                lineHeight: 1.1,
                marginTop: 8,
              }}
            >
              {k.value}
            </div>
            <div style={{ fontSize: 13, color: C.faint }}>{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="liff-overview-split" style={mesh({ display: "grid", gap: 1 })}>
        <section style={{ background: C.cell, padding: 24 }}>
          <div style={{ ...eyebrow(11, C.dust), marginBottom: 20 }}>CARGA POR ÁREA</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {carga.map((a) => (
              <div key={a.label}>
                <div
                  style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.body, marginBottom: 7 }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ ...dot(a.color), width: 8, height: 8 }} />
                    {a.label}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.faint }}>{a.meta}</span>
                </div>
                <div style={{ height: 6, background: C.canvas, border: `1px solid ${C.line}` }}>
                  <div style={{ height: "100%", width: a.pct, background: a.color }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: C.cell, padding: 24 }}>
          <div style={{ ...eyebrow(11, C.dust), marginBottom: 20 }}>ÚLTIMAS ALTERAÇÕES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {logs.length === 0 && <div style={{ fontSize: 13, color: C.faint }}>Nada registrado ainda.</div>}
            {logs.map((l) => (
              <div key={l.id} style={{ display: "flex", gap: 12 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.ghost, whiteSpace: "nowrap", paddingTop: 2 }}>
                  {stamp(l.criadoEm)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.body, lineHeight: 1.5 }}>{l.texto}</div>
                  <div style={{ ...eyebrow(10, C.faint, "0.1em"), marginTop: 3 }}>
                    {l.autor} · {l.area ? areaOf(l.area).label : "sistema"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

/* =========================================================
   Comercial — pipeline por estágio
   ========================================================= */
export type ColunaDeal = { key: string; label: string; total: string; cards: Deal[] };

export function Comercial({ colunas, onMover }: { colunas: ColunaDeal[]; onMover: (id: number, dir: 1 | -1) => void }) {
  return (
    <div style={mesh({ display: "flex", gap: 1, overflowX: "auto" })}>
      {colunas.map((col) => (
        <div
          key={col.key}
          style={{
            background: C.cell,
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
                style={{ background: C.panel, border: `1px solid ${C.line}`, borderTop: `2px solid ${cor}`, padding: 14 }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{d.conta}</div>
                <div style={{ fontSize: 12, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>{d.escopo}</div>
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
                  <span style={{ display: "flex", gap: 6 }}>
                    {([-1, 1] as const).map((dir) => (
                      <span
                        key={dir}
                        onClick={() => d.podeEditar && onMover(d.id, dir)}
                        title={d.podeEditar ? "Mover estágio" : "Sem permissão de edição nesta área"}
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
   Operações — kanban com arrastar e soltar
   ========================================================= */
export type ColunaBoard = { key: string; label: string; cards: Activity[] };

export function Operacoes({
  colunas,
  onSoltar,
  onAbrir,
}: {
  colunas: ColunaBoard[];
  onSoltar: (id: number, status: string) => void;
  onAbrir: (id: number) => void;
}) {
  return (
    <>
      <div style={mesh({ display: "flex", gap: 1, overflowX: "auto", alignItems: "stretch" })}>
        {colunas.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = Number(e.dataTransfer.getData("text/plain"));
              if (Number.isInteger(id)) onSoltar(id, col.key);
            }}
            style={{
              background: C.cell,
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
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
        Arraste os cards entre as colunas — o movimento é gravado no log com autor e horário. Cards de áreas sem
        permissão de edição não se movem.
      </div>
    </>
  );
}

/* =========================================================
   Atividades — tabela plana
   ========================================================= */
const ACT_COLS = "2.4fr 1fr 1fr 1fr 0.8fr 0.9fr";

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
          {["ATIVIDADE", "ÁREA", "TIPO", "RESPONSÁVEL", "PRAZO", "STATUS"].map((h) => (
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
              <div style={{ padding: "14px 16px", ...eyebrow(11, C.dust, "0.08em") }}>{r.tipo}</div>
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
export const CAD_TABS = [
  { key: "contas", label: "contas" },
  { key: "pessoas", label: "pessoas" },
  { key: "areas", label: "áreas" },
  { key: "tipos", label: "tipos de atividade" },
] as const;

export type CadSet = { head: string[]; rows: { key: string; a: string; b: string; c: string }[]; ph: string };

/** Aba "áreas": a cor de cada vertical é configuração, e muda como todo mundo vê o quadro —
 *  por isso só admin edita. O `input type=color` devolve HEX, que é o que o servidor aceita. */
function TabelaAreas({
  areas,
  contagem,
  podeEditar,
  onCor,
  onExcluir,
}: {
  areas: AreaCadastro[];
  contagem: (id: string) => number;
  podeEditar: boolean;
  onCor: (id: string, cor: string) => void;
  onExcluir: (id: string, label: string) => void;
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
          <div style={{ padding: "13px 16px", fontSize: 14, color: C.ink, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ ...dot(`var(--liff-app-area-${a.id})`), width: 9, height: 9 }} />
            LIFF {a.label}
            <span style={eyebrow(10, C.faint, "0.1em")}>{a.short}</span>
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

export function Cadastros({
  tab,
  onTab,
  set,
  areaOptions,
  semEdicao,
  areas,
  contagemPorArea,
  podeEditarAreas,
  onCorArea,
  onCriarArea,
  onExcluirArea,
  salvandoArea,
}: {
  tab: string;
  onTab: (k: string) => void;
  set: CadSet;
  areaOptions: string[];
  semEdicao: boolean;
  areas: AreaCadastro[];
  contagemPorArea: (id: string) => number;
  podeEditarAreas: boolean;
  onCorArea: (id: string, cor: string) => void;
  onCriarArea: (d: { label: string; short: string; cor: string }) => void;
  onExcluirArea: (id: string, label: string) => void;
  salvandoArea: boolean;
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
            <TabelaAreas areas={areas} contagem={contagemPorArea} podeEditar={podeEditarAreas} onCor={onCorArea} onExcluir={onExcluirArea} />
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
                style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", borderBottom: `1px solid ${C.line}` }}
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
          <div style={{ ...eyebrow(11, C.dust), marginBottom: 18 }}>
            {tab === "areas" ? "NOVA VERTICAL" : "NOVO REGISTRO"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {tab === "areas" ? (
              podeEditarAreas ? (
                <NovaArea salvando={salvandoArea} onCriar={onCriarArea} />
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.6, color: C.faint }}>
                  Só a administração cadastra verticais.
                </div>
              )
            ) : (
              <>
            <Field label="Nome">
              <Input placeholder={set.ph} />
            </Field>
            <Field label="Área">
              <Select options={areaOptions} />
            </Field>
            <Field label="Observação">
              <Input placeholder="opcional" />
            </Field>
            <Button variant="outline" size="sm" disabled={semEdicao} style={{ justifyContent: "center" }}>
              cadastrar
            </Button>
              </>
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

export function Drawer({
  act,
  pessoas,
  logs,
  onFechar,
  onStatus,
  onResponsavel,
  onPrioridade,
}: {
  act: Activity;
  pessoas: Pessoa[];
  logs: LogEntry[];
  onFechar: () => void;
  onStatus: (k: string) => void;
  onResponsavel: (id: number) => void;
  onPrioridade: (p: string) => void;
}) {
  const a = areaOf(act.area);
  const editavel = act.podeEditar;
  return (
    <>
      <div onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(14,16,20,0.72)", zIndex: 40 }} />
      <div className="liff-drawer">
        <div style={{ padding: "24px 26px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div>
              <div style={eyebrow(10, a.color)}>
                {a.label} / {act.tipo}
              </div>
              <div
                style={{
                  fontSize: 21,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: C.ink,
                  lineHeight: 1.25,
                  marginTop: 8,
                }}
              >
                {act.titulo}
              </div>
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

          <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: editavel ? C.faint : C.warning }}>
            {editavel
              ? "Você tem permissão de edição nesta área. Toda alteração é registrada no log."
              : `Somente leitura — seu perfil não tem permissão de edição em ${a.label}.`}
          </div>
        </div>

        <div style={{ padding: "24px 26px" }}>
          <div style={{ ...eyebrow(11, C.dust), marginBottom: 18 }}>LOG DE ALTERAÇÕES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {logs.length === 0 && (
              <div style={{ fontSize: 13, color: C.faint }}>Nenhuma alteração registrada nesta atividade.</div>
            )}
            {logs.map((l) => (
              <div key={l.id} style={{ borderLeft: `1px solid ${C.line}`, paddingLeft: 14 }}>
                <div style={{ fontSize: 13, color: C.body, lineHeight: 1.5 }}>{l.texto}</div>
                <div style={{ ...eyebrow(10, C.faint, "0.1em"), marginTop: 4 }}>
                  {l.autor} · {stamp(l.criadoEm)}
                </div>
              </div>
            ))}
          </div>
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

export type OpcaoPessoa = { id: number; nome: string };

export function NovaAtividade({
  areasEditaveis,
  pessoas,
  salvando,
  erro,
  onSalvar,
  onFechar,
}: {
  areasEditaveis: { id: string; label: string }[];
  pessoas: OpcaoPessoa[];
  salvando: boolean;
  erro: string | null;
  onSalvar: (d: {
    titulo: string;
    area: string;
    tipo: string;
    status: string;
    prioridade: string;
    prazo: string | null;
    responsavelId: number | null;
  }) => void;
  onFechar: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [area, setArea] = useState(areasEditaveis[0]?.id ?? "");
  const [tipo, setTipo] = useState("Operacional");
  const [status, setStatus] = useState("backlog");
  const [prioridade, setPrioridade] = useState("media");
  const [prazo, setPrazo] = useState("");
  const [responsavel, setResponsavel] = useState<string>("");

  const enviar = () =>
    onSalvar({
      titulo,
      area,
      tipo,
      status,
      prioridade,
      prazo: prazo || null,
      responsavelId: responsavel ? Number(responsavel) : null,
    });

  return (
    <Modal titulo="Nova atividade" eyebrowTexto="LIFF/ ATIVIDADES" onFechar={onFechar}>
      <Field label="Título" required>
        <Input placeholder="O que precisa ser feito" value={titulo} onChange={setTitulo} />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Área" required>
          <Select
            options={areasEditaveis.map((a) => ({ value: a.id, label: a.label }))}
            value={area}
            onChange={setArea}
          />
        </Field>
        <Field label="Tipo">
          <Select options={["Operacional", "Comercial", "Produto", "Institucional"]} value={tipo} onChange={setTipo} />
        </Field>
      </div>

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
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={campoNativo} />
        </Field>
        <Field label="Responsável">
          <Select
            options={[{ value: "", label: "—" }, ...pessoas.map((p) => ({ value: String(p.id), label: p.nome }))]}
            value={responsavel}
            onChange={setResponsavel}
          />
        </Field>
      </div>

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

export function NovaOportunidade({
  areasEditaveis,
  pessoas,
  salvando,
  erro,
  onSalvar,
  onFechar,
}: {
  areasEditaveis: { id: string; label: string }[];
  pessoas: OpcaoPessoa[];
  salvando: boolean;
  erro: string | null;
  onSalvar: (d: {
    conta: string;
    escopo: string;
    area: string;
    estagio: string;
    valorReais: number;
    proximoPasso: string;
    responsavelId: number | null;
  }) => void;
  onFechar: () => void;
}) {
  const [conta, setConta] = useState("");
  const [escopo, setEscopo] = useState("");
  const [area, setArea] = useState(areasEditaveis[0]?.id ?? "");
  const [estagio, setEstagio] = useState("lead");
  const [valor, setValor] = useState("");
  const [proximo, setProximo] = useState("");
  const [responsavel, setResponsavel] = useState<string>("");

  const enviar = () =>
    onSalvar({
      conta,
      escopo,
      area,
      estagio,
      valorReais: Number(valor.replace(/\./g, "").replace(",", ".")) || 0,
      proximoPasso: proximo,
      responsavelId: responsavel ? Number(responsavel) : null,
    });

  return (
    <Modal titulo="Nova oportunidade" eyebrowTexto="LIFF/ COMERCIAL" onFechar={onFechar}>
      <Field label="Conta" required>
        <Input placeholder="Razão social" value={conta} onChange={setConta} />
      </Field>
      <Field label="Escopo" hint="O que está sendo vendido — aparece abaixo do nome no card.">
        <Input placeholder="law-v · 80 usuários" value={escopo} onChange={setEscopo} />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Área" required>
          <Select
            options={areasEditaveis.map((a) => ({ value: a.id, label: a.label }))}
            value={area}
            onChange={setArea}
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

      <Field label="Próximo passo">
        <Input placeholder="Enviar proposta" value={proximo} onChange={setProximo} />
      </Field>

      {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
        <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
          cancelar
        </Button>
        <Button variant="solid" size="sm" disabled={salvando || !conta.trim() || !area} onClick={enviar}>
          {salvando ? "criando…" : "criar oportunidade"}
        </Button>
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
