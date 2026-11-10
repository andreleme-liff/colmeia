"use client";

// Card da oportunidade no kanban comercial (v4) — completo e compacto.
//
// De cima para baixo: identificação (área, cliente + valor, módulos, ACE e prazo) → andamento
// (situação com a data dela, próximo passo, bloqueio) → rodapé (responsável e as setas, pequenas).
// Estilo em `globals.css` (`.cop-*`): o tema escuro, o foco de teclado e o hover moram lá.
//
// Cor de área identifica, nunca indica estado: o nome da área vem sempre junto do quadrado, e
// estado (prazo, ACE, bloqueio) usa só as cores semânticas.

import type { CSSProperties, DragEvent } from "react";
import type { Deal } from "./api";
import {
  areaOf, blockerTipoLabel, brl, diaMes, etiquetaPrazo, hojeISO, motivoPerdaLabel,
  rotuloModulos, stageLabel, vizinhosNoFunil, type TomPrazo,
} from "@/lib/domain";

type Produto = { id: string; label: string };
type Pessoa = { id: number; nome: string; iniciais: string };

/** Valor curto do card: "R$ 120k", "R$ 1,6M"; zero vira "—". */
function valorCurto(centavos: number): string {
  if (!centavos) return "—";
  return brl(centavos);
}

function Etiqueta({ tom, children, title }: { tom: TomPrazo | "info"; children: string; title?: string }) {
  return (
    <span className={`cop-tag cop-tag--${tom}`} title={title}>
      <span aria-hidden className="cop-tag__dot" />
      {children}
    </span>
  );
}

function Chevron({ dir }: { dir: -1 | 1 }) {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir < 0 ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

function Alerta() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="cop-bloqueio__icone">
      <path d="M10.3 3.9 1.8 18.2A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function CardOportunidade({
  d,
  produtos,
  pessoas,
  compacto,
  hoje = hojeISO(),
  onAbrir,
  onMover,
  onDragStart,
  onDragEnd,
}: {
  d: Deal;
  produtos: Produto[];
  pessoas: Pessoa[];
  compacto: boolean;
  /** Injetável para a página de estados; na tela é sempre hoje em São Paulo. */
  hoje?: string;
  onAbrir: () => void;
  onMover: (dir: 1 | -1) => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const area = areaOf(d.area);
  const editavel = d.podeEditar;
  const lost = d.estagio === "lost";

  const modulos = d.modulos.map((id) => produtos.find((p) => p.id === id)?.label ?? id);
  const maxModulos = compacto ? 2 : 3;
  const visiveis = modulos.slice(0, maxModulos);
  const resto = modulos.slice(maxModulos);

  const prazo = lost ? null : etiquetaPrazo(d.estagio, d.proximoPassoEm, hoje, compacto);
  const temBloqueio = !lost && !!(d.blocker || d.blockerTipo);
  const tipoBloqueio = blockerTipoLabel(d.blockerTipo);

  const pessoa = d.responsavelId ? pessoas.find((p) => p.id === d.responsavelId) : undefined;
  const nomeDono = pessoa?.nome ?? (d.responsavelTexto || "");

  const { anterior, proxima } = vizinhosNoFunil(d.estagio);
  const seta = (dir: -1 | 1) => {
    const destino = dir < 0 ? anterior : proxima;
    const rotulo = destino ? `Mover para ${stageLabel(destino)}` : dir < 0 ? "Já está na primeira etapa" : "Já está na última etapa";
    const desabilitado = !destino || !editavel;
    return (
      <button
        key={dir}
        type="button"
        className="cop-seta"
        disabled={desabilitado}
        aria-label={rotulo}
        title={!editavel ? "Sem permissão de edição nesta área" : rotulo}
        draggable={false}
        // O card inteiro é clicável e arrastável: o botão não pode abrir o card nem iniciar o arraste.
        onClick={(e) => {
          e.stopPropagation();
          if (!desabilitado) onMover(dir);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Chevron dir={dir} />
      </button>
    );
  };

  const corArea = { "--cop-area": area.color } as CSSProperties;

  return (
    <article
      className={`cop${compacto ? " cop--compacto" : ""}${editavel ? " cop--ativo" : ""}`}
      style={corArea}
      aria-label={`Oportunidade ${d.conta}`}
      draggable={editavel}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => editavel && onAbrir()}
      title={editavel ? "Arraste para mover de estágio, ou clique para editar" : "Somente leitura nesta área"}
    >
      {/* ---------- 1 · identificação ---------- */}
      <div className="cop-bloco">
        <p className="cop-area">
          <span aria-hidden className="cop-area__quadrado" />
          {area.label}
          {modulos.length > 0 && <span className="cop-area__extra">· {rotuloModulos(modulos.length)}</span>}
        </p>

        <div className="cop-titulo">
          {/* O nome é o alvo do teclado: abrir o card sem mouse. */}
          {editavel ? (
            <h3 className="cop-cliente">
              <button
                type="button"
                className="cop-cliente__botao"
                onClick={(e) => {
                  e.stopPropagation();
                  onAbrir();
                }}
              >
                {d.conta}
              </button>
            </h3>
          ) : (
            <h3 className="cop-cliente">{d.conta}</h3>
          )}
          <p className="cop-valor">{valorCurto(d.valorCentavos)}</p>
        </div>

        {modulos.length > 0 && (
          <div className="cop-modulos" aria-label="Módulos da proposta">
            {visiveis.map((m) => (
              <span key={m} className="cop-pill">
                {m}
              </span>
            ))}
            {resto.length > 0 && (
              <span className="cop-pill cop-pill--mais" title={resto.join(", ")}>
                +{resto.length}
              </span>
            )}
          </div>
        )}

        {compacto && d.proximoPasso && !lost && (
          <p className="cop-proximo-curto">
            <span className="cop-rotulo">PRÓXIMO →</span> {d.proximoPasso}
          </p>
        )}

        <div className="cop-tags">
          {d.aceAws ? <Etiqueta tom="info">{compacto ? "ACE" : "AWS ACE · aberta"}</Etiqueta> : <Etiqueta tom="neutro">Sem ACE</Etiqueta>}
          {prazo && <Etiqueta tom={prazo.tom}>{prazo.texto}</Etiqueta>}
          {compacto && temBloqueio && (
            <Etiqueta tom="warning" title={d.blocker || undefined}>
              {tipoBloqueio || "Bloqueio"}
            </Etiqueta>
          )}
        </div>
      </div>

      {/* ---------- 2 · andamento (só no completo) ---------- */}
      {!compacto && (d.situacao || d.proximoPasso || temBloqueio || lost) && (
        <div className="cop-bloco cop-bloco--fio">
          {lost ? (
            <div>
              <p className="cop-rotulo">MOTIVO DA PERDA</p>
              <p className="cop-texto">
                {motivoPerdaLabel(d.motivoPerda) || "Não informado"}
                {d.motivoPerdaDetalhe ? ` · ${d.motivoPerdaDetalhe}` : ""}
              </p>
            </div>
          ) : (
            <>
              {d.situacao && (
                <div>
                  <p className="cop-rotulo">SITUAÇÃO{d.situacaoEm ? ` · ${diaMes(d.situacaoEm)}` : ""}</p>
                  <p className="cop-texto cop-texto--3l" title={d.situacao}>
                    {d.situacao}
                  </p>
                </div>
              )}
              {d.proximoPasso && (
                <div>
                  <p className="cop-rotulo">PRÓXIMO PASSO</p>
                  <p className="cop-texto cop-texto--forte">{d.proximoPasso}</p>
                </div>
              )}
              {temBloqueio && (
                <div className="cop-bloqueio" title={d.blockerDono ? `Resolve: ${d.blockerDono}` : undefined}>
                  <Alerta />
                  <div>
                    <p className="cop-rotulo cop-bloqueio__rotulo">BLOQUEIO{tipoBloqueio ? ` · ${tipoBloqueio.toUpperCase()}` : ""}</p>
                    {d.blocker && <p className="cop-texto cop-bloqueio__texto">{d.blocker}</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ---------- 3 · rodapé ---------- */}
      <div className="cop-rodape">
        <div className="cop-dono">
          <span className="cop-dono__nome">{nomeDono || "Sem responsável"}</span>
        </div>
        <div className="cop-setas">
          {seta(-1)}
          {seta(1)}
        </div>
      </div>
    </article>
  );
}
