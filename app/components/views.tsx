"use client";

// As telas do sistema. São puramente de apresentação: recebem dados já recortados e
// devolvem eventos. Quem decide o que pode ser alterado é o servidor — `podeEditar` que
// chega em cada registro é o eco daquela decisão, usado só para desenhar o estado.

import type { CSSProperties, ReactNode } from "react";
import { Button, Field, Input, Select, Switch } from "./ds";
import { C, GHOST_FIX, MONO, SANS, dot, eyebrow, mesh, prioColor, statusColor } from "./tokens";
import type { Activity, Deal, LogEntry, Pessoa } from "./api";
import { AREAS, ADMIN_CARDS, STATUS, areaOf, brl, ddmm, stamp, statusLabel } from "@/lib/domain";

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

export function Cadastros({
  tab,
  onTab,
  set,
  areaOptions,
  semEdicao,
}: {
  tab: string;
  onTab: (k: string) => void;
  set: CadSet;
  areaOptions: string[];
  semEdicao: boolean;
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
        </div>

        <div style={{ background: C.cell, padding: 22 }}>
          <div style={{ ...eyebrow(11, C.dust), marginBottom: 18 }}>NOVO REGISTRO</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
const PERM_COLS = "1.5fr repeat(6,1fr) 0.9fr";
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
  return (
    <>
      <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}`, marginBottom: 28 }}>
        <div style={{ minWidth: 820 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: PERM_COLS,
              background: C.canvas,
              borderBottom: `1px solid ${C.line}`,
            }}
          >
            <div style={{ padding: "12px 16px", ...eyebrow(10, C.faint) }}>USUÁRIO</div>
            {AREAS.map((a) => (
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
                gridTemplateColumns: PERM_COLS,
                background: C.cell,
                borderBottom: `1px solid ${C.line}`,
                alignItems: "center",
              }}
            >
              <div style={{ padding: "13px 16px" }}>
                <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{u.nome}</div>
                <div style={eyebrow(10, C.faint, "0.1em")}>{u.papel}</div>
              </div>
              {AREAS.map((a) => {
                const nivel = u.papel === "admin" ? "edit" : u.perms[a.id] ?? "none";
                const s = PERM_STYLE[nivel] ?? PERM_STYLE.none;
                const travado = u.papel === "admin";
                return (
                  <div
                    key={a.id}
                    onClick={() => !travado && onCiclar(u.id, a.id)}
                    title={
                      travado
                        ? "Admin tem edição em tudo por definição do papel"
                        : "Clique para alternar sem acesso / ver / editar"
                    }
                    style={{
                      margin: 8,
                      padding: "7px 4px",
                      textAlign: "center",
                      cursor: travado ? "default" : "pointer",
                      ...eyebrow(10, s.ink, "0.1em"),
                      border: `1px solid ${s.bd}`,
                      background: s.bg,
                      borderRadius: 6,
                    }}
                  >
                    {s.label}
                  </div>
                );
              })}
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
  tabs: { id: string; label: string }[];
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

        <div style={mesh({ display: "flex", gap: 1, flexWrap: "wrap", borderTop: 0, borderLeft: 0, borderRight: 0 })}>
          {tabs.map((t) => (
            <div
              key={t.id}
              onClick={() => onArea(t.id)}
              style={{
                padding: "11px 14px",
                cursor: "pointer",
                flex: 1,
                textAlign: "center",
                ...eyebrow(11, areaAtiva === t.id ? C.ink : C.faint, "0.1em"),
                background: areaAtiva === t.id ? C.panel2 : C.canvas,
              }}
            >
              {t.label}
            </div>
          ))}
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

/** Casca de carregamento e de erro, para o shell não piscar vazio. */
export function Aviso({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: 28, fontFamily: MONO, fontSize: 12, color: C.faint, letterSpacing: "0.08em" }}>
      {children}
    </div>
  );
}
