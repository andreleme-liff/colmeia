"use client";

// Card da oportunidade no kanban comercial (v4) — completo e compacto.
//
// De cima para baixo: identificação (cliente + valor, módulos; a área é o contorno superior) → andamento
// (situação com a data dela, próximo passo, bloqueio) → rodapé (responsável e as setas, pequenas).
// Estilo em `globals.css` (`.cop-*`): o tema escuro, o foco de teclado e o hover moram lá.
//
// Cor de área identifica, nunca indica estado: vai no contorno superior do card (o nome da área fica
// no aria-label e no title), e estado (prazo, bloqueio) usa só as cores semânticas.

import type { CSSProperties, DragEvent, ReactNode } from "react";
import type { Deal } from "./api";
import {
  areaOf, blockerTipoLabel, brl, diaMes, etiquetaPrazo, hojeISO, hostDaUrl, motivoPerdaLabel, prazoDoPasso,
  stageLabel, vizinhosNoFunil, type TomPrazo,
} from "@/lib/domain";

type Produto = { id: string; label: string };
type Pessoa = { id: number; nome: string; iniciais: string };

/** Valor curto do card: "R$ 120k", "R$ 1,6M"; zero vira "—". */
function valorCurto(centavos: number): string {
  if (!centavos) return "—";
  return brl(centavos);
}

export function Etiqueta({
  tom,
  children,
  title,
  icone,
  semPonto,
}: {
  tom: TomPrazo | "info";
  children: string;
  title?: string;
  icone?: ReactNode;
  /** Sem a bolinha: quando a cor da etiqueta já basta para dizer o estado. */
  semPonto?: boolean;
}) {
  return (
    <span className={`cop-tag cop-tag--${tom}`} title={title}>
      {icone ?? (semPonto ? null : <span aria-hidden className="cop-tag__dot" />)}
      {children}
    </span>
  );
}

export function Chevron({ dir }: { dir: -1 | 1 }) {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir < 0 ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

function Documento() {
  return (
    <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

/** Ícone de estado do card compacto: a cor vem do tom, o texto fica na dica e no leitor de tela. */
function IconeEstado({ tom, rotulo, children }: { tom: TomPrazo | "info"; rotulo: string; children: ReactNode }) {
  return (
    <span className={`cop-icone cop-tag--${tom}`} role="img" aria-label={rotulo} title={rotulo}>
      {children}
    </span>
  );
}

// Ícones do compacto: PINTADOS com a cor do estado, e o sinal por cima na cor de contraste
// (`--cop-glifo`). Preenchido lê melhor que contorno num ícone de 17px.
const BASE = { width: 17, height: 17, viewBox: "0 0 24 24" } as const;
const GLIFO = { fill: "none", stroke: "var(--cop-glifo, #fff)", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Prazo: calendário com ✓ (em dia), ! (vence em até 7 dias), × (vencido); sem data, o mesmo calendário em cinza com ?. */
function Calendario({ tom, semData }: { tom: TomPrazo; semData: boolean }) {
  return (
    // Sem data: cinza mais claro que o texto apagado, que preenchido ficaria quase preto.
    <svg aria-hidden {...BASE} style={semData ? { color: "color-mix(in srgb, var(--col-text-faint) 55%, transparent)" } : undefined}>
      <path d="M8 2.5v4M16 2.5v4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="2.5" y="4.5" width="19" height="17" rx="3" fill="currentColor" />
      {tom === "sucesso" && <path d="M8 13.5l2.8 2.8L16 11" {...GLIFO} />}
      {tom === "warning" && <path d="M12 9.5v4.5M12 17.5v.01" {...GLIFO} />}
      {tom === "erro" && <path d="M9 10.5l6 6M15 10.5l-6 6" {...GLIFO} />}
      {semData ? (
        <path d="M9.7 11.4a2.4 2.4 0 1 1 3.6 2.1c-.8.5-1.3 1-1.3 1.8M12 18.4v.01" {...GLIFO} strokeWidth={2.1} />
      ) : (
        tom === "neutro" && <path d="M8 13.5h8" {...GLIFO} />
      )}
    </svg>
  );
}

/** Bloqueio: o mesmo triângulo com exclamação do card completo, pintado. */
function AlertaCheio() {
  return (
    <svg aria-hidden {...BASE}>
      <path d="M10.3 3.9 1.8 18.2A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" fill="currentColor" />
      <path d="M12 9.5v4M12 17v.01" {...GLIFO} />
    </svg>
  );
}

function Alerta() {
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="cop-tag__icone">
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

  // No completo o prazo fica ao lado do rótulo PRÓXIMO PASSO; no compacto vira um ícone no rodapé,
  // com o texto inteiro ("Venceu 23/10 · há 18 dias") na dica e no rótulo acessível.
  const prazo = lost || !compacto ? null : etiquetaPrazo(d.estagio, d.proximoPassoEm, hoje);
  const prazoPasso = lost || compacto ? null : prazoDoPasso(d.estagio, d.proximoPassoEm, hoje);
  const datado = !!d.proximoPassoEm;
  const temBloqueio = !lost && !!(d.blocker || d.blockerTipo);
  const tipoBloqueio = blockerTipoLabel(d.blockerTipo);
  // Bloqueio é uma etiqueta só, nos dois modos: o tipo à vista, a descrição e quem resolve no title.
  const dicaBloqueio = [d.blocker, d.blockerDono ? `Resolve: ${d.blockerDono}` : ""].filter(Boolean).join(" · ") || undefined;
  const etiquetaBloqueio = temBloqueio ? (
    <Etiqueta tom="warning" title={dicaBloqueio} icone={<Alerta />}>
      {tipoBloqueio || "Bloqueio"}
    </Etiqueta>
  ) : null;

  const temIcones = compacto && !!(prazo || temBloqueio);

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
        title={!editavel ? "Sem permissão de edição neste produto" : rotulo}
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
      aria-label={`Oportunidade ${d.conta} · produto ${area.label}`}
      draggable={editavel}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => editavel && onAbrir()}
      title={`${area.label} · ${editavel ? "Arraste para mover de estágio, ou clique para editar" : "Somente leitura neste produto"}`}
    >
      {/* ---------- 1 · identificação ---------- */}
      <div className="cop-bloco">
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

        {(modulos.length > 0 || temIcones) && (
          <div className="cop-linha-modulos">
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
            {/* Compacto: prazo e bloqueio só como ícone, na linha dos módulos. A forma muda
                junto com a cor (calendário com ✓, ! ou ×), para não depender de enxergar a cor. */}
            {temIcones && (
              <span className="cop-icones">
                {prazo && (
                  <IconeEstado tom={prazo.tom} rotulo={prazo.tom === "neutro" && !d.proximoPassoEm ? "Sem prazo no próximo passo" : prazo.texto}>
                    <Calendario tom={prazo.tom} semData={!d.proximoPassoEm} />
                  </IconeEstado>
                )}
                {temBloqueio && (
                  <IconeEstado tom="warning" rotulo={["Bloqueio", tipoBloqueio, dicaBloqueio].filter(Boolean).join(" · ")}>
                    <AlertaCheio />
                  </IconeEstado>
                )}
              </span>
            )}
          </div>
        )}

      </div>

      {/* ---------- 2 · andamento (só no completo) ---------- */}
      {!compacto && (d.situacao || d.proximoPasso || datado || temBloqueio || lost) && (
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
              {(d.proximoPasso || datado) && (
                <div>
                  <div className="cop-rotulo-linha">
                    <p className="cop-rotulo">PRÓXIMO PASSO</p>
                    {prazoPasso && (
                      <span className={`cop-prazo cop-tag--${prazoPasso.tom}`} title={`Prazo do próximo passo: ${prazoPasso.texto}`}>
                        {prazoPasso.texto}
                      </span>
                    )}
                  </div>
                  {d.proximoPasso && <p className="cop-texto cop-texto--forte">{d.proximoPasso}</p>}
                </div>
              )}
              {temBloqueio && (
                <div className="cop-tags">
                  {etiquetaBloqueio}
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
          {d.propostaUrl && (
            // Abre em outra aba sem abrir o card nem iniciar o arraste. Vale também para quem só lê.
            <a
              className="cop-seta cop-proposta"
              href={d.propostaUrl}
              target="_blank"
              rel="noopener noreferrer"
              draggable={false}
              aria-label={`Abrir a proposta de ${d.conta} em nova aba`}
              title={`Abrir a proposta · ${hostDaUrl(d.propostaUrl)}`}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Documento />
            </a>
          )}
          {seta(-1)}
          {seta(1)}
        </div>
      </div>
    </article>
  );
}
