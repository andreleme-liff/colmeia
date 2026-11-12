"use client";

// Cronograma em agenda: a semana em colunas, de segunda a sexta, com o que já venceu fixo à
// esquerda e o que não tem dia marcado fixo à direita.
//
// Cada card tem UMA data (a do próximo passo), sem início nem fim: por isso não é um Gantt,
// que teria de inventar duração. E não é calendário mensal, onde a célula não comporta os
// cards e o que está sem data não teria lugar.
//
// Arrastar um card para outro dia grava a nova data do próximo passo; soltar em "Sem data"
// limpa a data. "Atrasado" não recebe card: ninguém agenda algo para o passado.

import { useMemo, useState } from "react";
import { C, MONO, eyebrow } from "./tokens";
import { daISO, ddmm, diaISO, inicioDaSemana } from "@/lib/domain";

export type ItemAgenda = {
  ref: string;
  id: number;
  tipo: "oportunidade" | "atividade";
  titulo: string;
  /** Texto do próximo passo, já resumido. Vazio = ninguém escreveu. */
  passo: string;
  /** Responsável e, na oportunidade, o estágio. */
  meta: string;
  areaLabel: string;
  cor: string;
  /** Data do próximo passo (yyyy-mm-dd) ou null quando não há dia marcado. */
  quando: string | null;
  podeEditar: boolean;
};

const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const SEMANAS_NA_FAIXA = 6;
const LIMITE_FIXAS = 8;

function somar(iso: string, dias: number): string {
  const d = daISO(iso);
  d.setDate(d.getDate() + dias);
  return diaISO(d);
}

export default function Agenda({
  itens,
  onAbrir,
  onReagendar,
}: {
  itens: ItemAgenda[];
  onAbrir: (ref: string, tipo: "oportunidade" | "atividade") => void;
  onReagendar: (item: ItemAgenda, quando: string | null) => void;
}) {
  const hoje = diaISO(new Date());
  const segAtual = diaISO(inicioDaSemana(new Date()));
  const [semana, setSemana] = useState(segAtual);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [abertas, setAbertas] = useState<{ atrasado: boolean; semdata: boolean }>({ atrasado: false, semdata: false });

  const { atrasados, semData, porDia, depois } = useMemo(() => {
    const porDia = new Map<string, ItemAgenda[]>();
    const atrasados: ItemAgenda[] = [];
    const semData: ItemAgenda[] = [];
    const fimDaFaixa = somar(segAtual, SEMANAS_NA_FAIXA * 7);
    let depois = 0;
    for (const i of itens) {
      if (!i.quando) semData.push(i);
      else if (i.quando < hoje) atrasados.push(i);
      else {
        const lista = porDia.get(i.quando) ?? [];
        lista.push(i);
        porDia.set(i.quando, lista);
        if (i.quando >= fimDaFaixa) depois++;
      }
    }
    atrasados.sort((a, b) => (a.quando ?? "").localeCompare(b.quando ?? ""));
    return { atrasados, semData, porDia, depois };
  }, [itens, hoje, segAtual]);

  // Faixa de carga: seis semanas a partir da atual, uma barra por dia útil. O fim de semana
  // entra na conta da semana, mas não ganha barra.
  const faixa = useMemo(() => {
    const semanas = Array.from({ length: SEMANAS_NA_FAIXA }, (_, s) => {
      const seg = somar(segAtual, s * 7);
      const dias = Array.from({ length: 5 }, (_, d) => {
        const iso = somar(seg, d);
        return { iso, n: porDia.get(iso)?.length ?? 0 };
      });
      const fds = (porDia.get(somar(seg, 5))?.length ?? 0) + (porDia.get(somar(seg, 6))?.length ?? 0);
      return { seg, dias, total: dias.reduce((t, d) => t + d.n, 0) + fds };
    });
    const max = Math.max(1, ...semanas.flatMap((s) => s.dias.map((d) => d.n)));
    return { semanas, max };
  }, [porDia, segAtual]);

  // Sábado e domingo só viram coluna quando há algo marcado neles.
  const temFds = (porDia.get(somar(semana, 5))?.length ?? 0) + (porDia.get(somar(semana, 6))?.length ?? 0) > 0;
  const colunas = Array.from({ length: temFds ? 7 : 5 }, (_, d) => somar(semana, d));

  const soltar = (e: React.DragEvent, quando: string | null) => {
    e.preventDefault();
    setAlvo(null);
    const item = itens.find((i) => i.ref === e.dataTransfer.getData("text/plain"));
    if (!item || !item.podeEditar || item.quando === quando) return;
    onReagendar(item, quando);
  };
  const zona = (chave: string, quando: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (alvo !== chave) setAlvo(chave);
    },
    onDragLeave: () => setAlvo((a) => (a === chave ? null : a)),
    onDrop: (e: React.DragEvent) => soltar(e, quando),
  });

  const card = (i: ItemAgenda, mostrarData = false) => (
    <div
      key={i.ref}
      className="liff-agenda-card"
      draggable={i.podeEditar}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", i.ref);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => setAlvo(null)}
      onClick={() => i.podeEditar && onAbrir(i.ref, i.tipo)}
      title={`${i.ref} · ${i.areaLabel}${i.podeEditar ? "" : " · somente leitura"}`}
      style={{
        borderLeft: `3px solid ${i.cor}`,
        cursor: i.podeEditar ? "grab" : "default",
      }}
    >
      <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {i.titulo}
      </div>
      <div className="liff-agenda-passo" style={{ color: i.passo ? C.body : C.ghost, fontStyle: i.passo ? "normal" : "italic" }}>
        {i.passo || "sem próximo passo escrito"}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.faint, marginTop: 4, display: "flex", gap: 6, minWidth: 0 }}>
        {mostrarData && i.quando && <span style={{ color: C.error, flex: "none" }}>{ddmm(i.quando)}</span>}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.meta}</span>
      </div>
    </div>
  );

  const fixa = (chave: "atrasado" | "semdata", lista: ItemAgenda[]) => {
    const aberta = abertas[chave];
    const visiveis = aberta ? lista : lista.slice(0, LIMITE_FIXAS);
    return (
      <>
        {visiveis.map((i) => card(i, chave === "atrasado"))}
        {lista.length > LIMITE_FIXAS && (
          <button type="button" className="liff-agenda-mais" onClick={() => setAbertas({ ...abertas, [chave]: !aberta })}>
            {aberta ? "mostrar menos" : `mais ${lista.length - LIMITE_FIXAS}`}
          </button>
        )}
      </>
    );
  };

  const cabecalho = (texto: string, n: number, cor: string = C.dust) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
      <span style={eyebrow(10, cor, "0.12em")}>{texto}</span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>{n || ""}</span>
    </div>
  );

  const fimDaSemanaVista = somar(semana, 4);

  return (
    <div>
      {/* Navegação da semana */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <button
          type="button"
          className="liff-agenda-nav"
          aria-label="Semana anterior"
          disabled={semana <= segAtual}
          onClick={() => setSemana(somar(semana, -7))}
        >
          ‹
        </button>
        <button type="button" className="liff-agenda-nav" aria-label="Próxima semana" onClick={() => setSemana(somar(semana, 7))}>
          ›
        </button>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginLeft: 6 }}>
          {ddmm(semana)} a {ddmm(fimDaSemanaVista)}
        </span>
        {semana === segAtual ? (
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>esta semana</span>
        ) : (
          <button type="button" className="liff-agenda-mais" style={{ width: "auto" }} onClick={() => setSemana(segAtual)}>
            voltar para esta semana
          </button>
        )}
      </div>

      {/* Faixa de carga: onde a agenda está cheia, e atalho para a semana */}
      <div className="liff-agenda-faixa">
        {faixa.semanas.map((s) => {
          const ativa = s.seg === semana;
          return (
            <button
              key={s.seg}
              type="button"
              aria-pressed={ativa}
              onClick={() => setSemana(s.seg)}
              title={`Semana de ${ddmm(s.seg)}: ${s.total} ${s.total === 1 ? "item" : "itens"}`}
            >
              <span className="liff-agenda-barras">
                {s.dias.map((d) => (
                  <span
                    key={d.iso}
                    style={{
                      height: d.n ? `${Math.max(12, Math.round((d.n / faixa.max) * 100))}%` : 2,
                      background: ativa ? C.accent : d.iso === hoje ? C.dust : C.line,
                    }}
                  />
                ))}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: ativa ? C.ink : C.faint, display: "flex", justifyContent: "space-between" }}>
                <span>{ddmm(s.seg)}</span>
                <span>{s.total || ""}</span>
              </span>
            </button>
          );
        })}
      </div>
      {depois > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginTop: 6 }}>
          mais {depois} {depois === 1 ? "item" : "itens"} depois de {ddmm(somar(segAtual, SEMANAS_NA_FAIXA * 7 - 3))}
        </div>
      )}

      {/* A semana */}
      <div className="liff-scroll-x" style={{ marginTop: 22 }}>
        <div
          className="liff-agenda-grade"
          style={{ gridTemplateColumns: `minmax(150px, 1.15fr) repeat(5, minmax(112px, 1fr))${temFds ? " repeat(2, minmax(88px, 0.6fr))" : ""} minmax(150px, 1.15fr)` }}
        >
          <div className="liff-agenda-col liff-agenda-col--atraso">
            {cabecalho("Atrasado", atrasados.length, atrasados.length ? C.error : C.dust)}
            {atrasados.length ? fixa("atrasado", atrasados) : <div className="liff-agenda-vazio">Nada atrasado.</div>}
          </div>

          {colunas.map((iso, d) => {
            const lista = porDia.get(iso) ?? [];
            const passado = iso < hoje;
            return (
              <div
                key={iso}
                className={"liff-agenda-col" + (alvo === iso ? " liff-agenda-col--alvo" : "") + (iso === hoje ? " liff-agenda-col--hoje" : "")}
                {...(passado ? {} : zona(iso, iso))}
                style={passado ? { opacity: 0.45 } : undefined}
              >
                {cabecalho(`${DIAS[d]} ${iso.slice(8, 10)}${iso === hoje ? " · hoje" : ""}`, lista.length, iso === hoje ? C.ink : C.dust)}
                {lista.map((i) => card(i))}
              </div>
            );
          })}

          <div className={"liff-agenda-col liff-agenda-col--fixa" + (alvo === "semdata" ? " liff-agenda-col--alvo" : "")} {...zona("semdata", null)}>
            {cabecalho("Sem data", semData.length)}
            {semData.length ? fixa("semdata", semData) : <div className="liff-agenda-vazio">Tudo com dia marcado.</div>}
          </div>
        </div>
      </div>

      <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginTop: 14, lineHeight: 1.6 }}>
        Arraste um card para outro dia para mudar a data do próximo passo; em “Sem data”, a data é removida. A mudança
        entra no histórico do card.
      </div>
    </div>
  );
}
