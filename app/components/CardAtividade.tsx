"use client";

// Card da atividade no quadro operacional — o mesmo desenho do card do comercial
// (`CardOportunidade`), sem o que só existe na venda (valor, módulos, bloqueio).
//
// De cima para baixo: identificação (título, oportunidade ligada, e os chips: produto, prioridade e
// prazo da atividade) → andamento (situação, próximo passo com a data dele) → rodapé (responsável e
// as setas). A área é o contorno superior, na cor dela; o nome fica no aria-label e no title.

import type { CSSProperties, DragEvent } from "react";
import type { Activity } from "./api";
import { Chevron, Etiqueta } from "./CardOportunidade";
import { STATUS, areaOf, hojeISO, prazoRelativo } from "@/lib/domain";

// Prioridade é mais uma etiqueta da linha de chips, com o tom do quanto pesa.
const PRIORIDADE: Record<string, { texto: string; tom: "erro" | "warning" | "neutro" }> = {
  alta: { texto: "Alta", tom: "erro" },
  media: { texto: "Média", tom: "warning" },
  baixa: { texto: "Baixa", tom: "neutro" },
};

export function CardAtividade({
  c,
  produtos,
  hoje = hojeISO(),
  onAbrir,
  onMover,
  onDragStart,
  onDragEnd,
}: {
  c: Activity;
  produtos: { id: string; label: string }[];
  /** Injetável para a página de estados; na tela é sempre hoje em São Paulo. */
  hoje?: string;
  onAbrir: () => void;
  onMover: (status: string) => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const area = areaOf(c.area);
  const editavel = c.podeEditar;
  const aberta = c.status !== "concluido";

  const produto = c.produtoId ? produtos.find((p) => p.id === c.produtoId)?.label ?? c.produtoId : null;
  const prazo = prazoRelativo(c.prazo, hoje, aberta);
  const prazoPasso = aberta ? prazoRelativo(c.proximoPassoEm, hoje, true) : null;
  const datado = !!c.proximoPassoEm;
  const prio = PRIORIDADE[c.prioridade] ?? null;

  const i = STATUS.findIndex((s) => s.key === c.status);
  const seta = (dir: -1 | 1) => {
    const destino = STATUS[i + dir];
    const rotulo = destino ? `Mover para ${destino.label}` : "Já está na ponta do quadro";
    const desabilitado = !destino || !editavel;
    return (
      <button
        key={dir}
        type="button"
        className="cop-seta"
        disabled={desabilitado}
        aria-label={rotulo}
        title={!editavel ? "Sem permissão de edição neste produto" : rotulo}
        draggable={false}
        // O card inteiro é clicável e arrastável: o botão não pode abrir o card nem iniciar o arraste.
        onClick={(e) => {
          e.stopPropagation();
          if (!desabilitado) onMover(destino.key);
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
      className="cop cop--ativo"
      style={corArea}
      aria-label={`Atividade ${c.titulo} · produto ${area.label}`}
      draggable={editavel}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onAbrir}
      title={`${area.label} · ${editavel ? "Arraste para mover de status, ou clique para abrir" : "Somente leitura neste produto"}`}
    >
      {/* ---------- 1 · identificação ---------- */}
      <div className="cop-bloco">
        <div className="cop-titulo">
          {/* O título é o alvo do teclado: abrir o card sem mouse. */}
          <h3 className="cop-cliente cop-cliente--atividade">
            <button
              type="button"
              className="cop-cliente__botao"
              onClick={(e) => {
                e.stopPropagation();
                onAbrir();
              }}
            >
              {c.titulo}
            </button>
          </h3>
        </div>

        {/* A oportunidade a que a tarefa serve: é o que liga o quadro ao pipeline. */}
        {c.oportunidadeRef && (
          <p className="cop-vinculo" title="Oportunidade comercial ligada">
            ↳ {c.oportunidadeRef} · {c.oportunidadeConta}
          </p>
        )}

        {(produto || prazo || prio) && (
          <div className="cop-tags">
            {produto && <span className="cop-pill">{produto}</span>}
            {prio && <Etiqueta tom={prio.tom} semPonto title="Prioridade">{prio.texto}</Etiqueta>}
            {prazo && <Etiqueta tom={prazo.tom} semPonto title="Prazo da atividade">{prazo.texto}</Etiqueta>}
          </div>
        )}
      </div>

      {/* ---------- 2 · andamento ---------- */}
      {(c.situacao || c.proximoPasso || datado) && (
        <div className="cop-bloco cop-bloco--fio">
          {c.situacao && (
            <div>
              <p className="cop-rotulo">SITUAÇÃO</p>
              <p className="cop-texto cop-texto--3l" title={c.situacao}>
                {c.situacao}
              </p>
            </div>
          )}
          {(c.proximoPasso || datado) && (
            <div>
              <div className="cop-rotulo-linha">
                <p className="cop-rotulo">PRÓXIMO PASSO</p>
                {prazoPasso && (
                  <span className={`cop-prazo cop-tag--${prazoPasso.tom}`} title={`Data do próximo passo: ${prazoPasso.texto}`}>
                    {prazoPasso.texto}
                  </span>
                )}
              </div>
              {c.proximoPasso && <p className="cop-texto cop-texto--forte">{c.proximoPasso}</p>}
            </div>
          )}
        </div>
      )}

      {/* ---------- 3 · rodapé ---------- */}
      <div className="cop-rodape">
        <div className="cop-dono">
          <span className="cop-dono__nome">{c.responsavel || "Sem responsável"}</span>
        </div>
        <div className="cop-setas">
          {seta(-1)}
          {seta(1)}
        </div>
      </div>
    </article>
  );
}
