"use client";

// Organizações (ex-Clientes): a visão centrada na organização. Para todos, com o recorte por
// produto feito no servidor; receita, faturas, cobrança, mescla e exclusão só aparecem para a
// administração. A organização é o dado mestre: existe sem oportunidade, e a oportunidade é que
// aponta para ela (o nome do card vem daqui).
//
// De cima para baixo:
//  1. números — quantos clientes, quantos em negociação (organizações distintas, sem prospecção), com contrato (receita
//     CONTRATADA; previsão não é contrato). Lidos em ordem, são o funil por organização:
//     só em prospecção → em negociação → com contrato. O CNPJ que falta aparece na coluna da lista;
//  2. possíveis duplicados — o que a deduplicação automática não juntou, com a mescla a um clique;
//  3. a lista — um cliente por linha, com os produtos, o pipeline aberto e a última interação;
//  4. a ficha — cadastro, cobrança e contatos à esquerda; oportunidades e propostas, contratos,
//     faturas e a linha do tempo à direita.
//
// O cliente não guarda cópia de nada disso: oportunidades vêm do estado da tela, contratos e
// faturas das rotas de receita e faturamento, e a linha do tempo do changelog.

import { useEffect, useState } from "react";
import { Button, Field, Input, Select } from "./ds";
import { C, GHOST_FIX, MONO, dot, eyebrow, R } from "./tokens";
import { api, type Deal } from "./api";
import { Modal } from "./views";
import { useOrdem } from "./ordenacao";
import { areaOf, brl, brlExato, estagioEmAberto, estagioNoPipeline, porTexto, stageLabel } from "@/lib/domain";
import { FORMAS_COBRANCA, ROTULO_SITUACAO, situacaoEfetiva, type Contrato } from "@/lib/forecast";
import type { Fatura } from "@/lib/faturamento";
import {
  PAPEIS_CONTATO, chaveCliente, cnpjFormatado, possiveisDuplicados, type Contato, type PapelContato,
} from "@/lib/cliente";
import type { ClienteLido, EventoCliente } from "@/lib/clientes-db";

/** Em negociação é o pipeline: a regra é uma só, em lib/domain.ts. */
const emNegociacao = estagioNoPipeline;

/**
 * Peso do estágio para escolher a oportunidade que representa a organização na lista: primeiro
 * a mais adiantada em negociação, depois prospecção, ganho, on hold e lost.
 */
const ORDEM_ESTAGIO = ["contrato", "validacao", "proposta", "qualificado", "primeira_reuniao", "prospeccao", "ganho", "on_hold", "lost"];
const pesoEstagio = (estagio: string) => {
  const i = ORDEM_ESTAGIO.indexOf(estagio);
  return i < 0 ? ORDEM_ESTAGIO.length : i;
};

/**
 * A coluna Oportunidades da lista: o estágio da oportunidade mais adiantada e, se houver mais,
 * quantas são as outras. Em negociação sai em tinta forte; prospecção e ganho, normal; on hold
 * e lost, apagado. O detalhe de todas fica na dica.
 */
function Oportunidades({ deals }: { deals: Deal[] }) {
  if (!deals.length) return <span style={{ color: C.ghost }}>—</span>;
  const ordenadas = [...deals].sort((a, b) => pesoEstagio(a.estagio) - pesoEstagio(b.estagio));
  const principal = ordenadas[0].estagio;
  const cor = emNegociacao(principal) ? C.ink : principal === "prospeccao" || principal === "ganho" ? C.body : C.faint;
  return (
    <span title={ordenadas.map((d) => `${d.ref} · ${areaOf(d.area).label} · ${stageLabel(d.estagio)}`).join("\n")}>
      <span style={{ color: cor, fontWeight: emNegociacao(principal) ? 600 : 400 }}>{stageLabel(principal)}</span>
      {deals.length > 1 && <span style={{ color: C.faint }}> +{deals.length - 1}</span>}
    </span>
  );
}

type Filtro = "todos" | "prospeccao" | "abertas" | "contrato";
const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "todos" },
  { key: "prospeccao", label: "só em prospecção" },
  { key: "abertas", label: "em negociação" },
  { key: "contrato", label: "com contrato" },
];

/** O que a tela sabe de um cliente, somando as três fontes. */
type Visao = {
  c: ClienteLido;
  deals: Deal[];
  /**
   * Oportunidades em negociação: da 1ª Reunião ao Contrato. Prospecção fica de fora (ainda não
   * houve conversa), assim como Lost e On hold (não há conversa agora) e Ganho (já fechou).
   * Com um produto escolhido no cabeçalho, só as daquele produto.
   */
  abertas: Deal[];
  pipeline: number;
  /** Tudo o que está cadastrado em Receita para o cliente: contratado ou só previsto. */
  receitas: Contrato[];
  /** Só a receita CONTRATADA (situação contratada, ou prevista com o card em Ganho). Só isto é contrato. */
  contratos: Contrato[];
  faturas: Fatura[];
  areas: string[];
  ultima: string | null;
};

const dataBR = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

export default function Clientes({
  deals,
  area,
  busca,
  gatilho,
  isAdmin,
  podeVerReceita,
  podeFinanceiro,
  podeCriar,
  onAbrirDeal,
}: {
  deals: Deal[];
  area: string;
  busca: string;
  gatilho: number | undefined;
  /** Admin vê também receita, faturas e cobrança, e pode cadastrar, mesclar e excluir. */
  isAdmin: boolean;
  /** Gestor, financeiro e admin: sem isso a ficha não busca nem mostra receita. */
  podeVerReceita: boolean;
  /** Financeiro e admin: a ficha busca e mostra também as faturas. */
  podeFinanceiro: boolean;
  /** Cadastra organização quem edita algum produto (ou é admin). */
  podeCriar: boolean;
  onAbrirDeal: (ref: string) => void;
}) {
  const [dados, setDados] = useState<{ clientes: ClienteLido[]; contratos: Contrato[]; faturas: Fatura[] } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberto, setAberto] = useState<number | "novo" | null>(null);
  const [verDuplicados, setVerDuplicados] = useState(false);
  const [mesclando, setMesclando] = useState(false);
  const ord = useOrdem();

  useEffect(() => {
    let vivo = true;
    // Faturamento é rota do financeiro e da administração, e receita exclui membro e leitura: os demais nem perguntam.
    const vazio = <T,>(v: T) => Promise.resolve(v);
    Promise.all([api.clientes(), podeVerReceita ? api.receitas() : vazio({ contratos: [] as Contrato[] }), podeFinanceiro ? api.faturas() : vazio({ faturas: [] })]).then(
      ([c, r, f]) => vivo && (setDados({ clientes: c.clientes, contratos: r.contratos, faturas: f.faturas }), setFalha(null)),
      (e: unknown) => vivo && setFalha(e instanceof Error ? e.message : "Não foi possível carregar as organizações.")
    );
    return () => {
      vivo = false;
    };
  }, [gatilho, versao, podeFinanceiro, podeVerReceita]);

  if (falha && !dados) return <div style={{ fontSize: 14, color: C.error }}>{falha}</div>;
  if (!dados) return <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>carregando organizações…</div>;

  const recarregar = () => setVersao((v) => v + 1);
  const dealPorId = new Map(deals.map((d) => [d.id, d]));

  // Dezenas a poucas centenas de clientes: monta tudo a cada render, sem memo.
  const visoes: Visao[] = dados.clientes.map((c) => {
    const ds = deals.filter((d) => d.clienteId === c.id);
    const ks = dados.contratos.filter((k) => k.clienteId === c.id);
    const idsContrato = new Set(ks.map((k) => k.id));
    // Fatura avulsa (sem contrato) entra pelo nome, com a mesma chave que junta as oportunidades.
    const fs = dados.faturas.filter((f) =>
      f.contratoId != null ? idsContrato.has(f.contratoId) : c.chaves.includes(chaveCliente(f.conta))
    );
    const abertas = ds.filter((d) => emNegociacao(d.estagio) && (area === "all" || d.area === area));
    const interacoes = ds.map((d) => d.ultimaInteracao).filter((x): x is string => !!x).sort();
    return {
      c,
      deals: ds,
      abertas,
      pipeline: abertas.reduce((t, d) => t + d.valorCentavos, 0),
      receitas: ks,
      contratos: ks.filter((k) => situacaoEfetiva(k, k.dealId != null ? dealPorId.get(k.dealId) : null) === "contratada"),
      faturas: fs,
      areas: [...new Set([...ds.map((d) => d.area), ...ks.map((k) => k.area)])].sort(),
      ultima: interacoes.at(-1) ?? null,
    };
  });

  const termo = chaveCliente(busca);
  const casaBusca = (v: Visao) => {
    if (!busca.trim()) return true;
    const digitos = busca.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    const palheiro = chaveCliente(
      [v.c.nome, v.c.razaoSocial, v.c.segmento, v.c.ref, ...v.c.outrosNomes, ...v.c.contatos.flatMap((k) => [k.nome, k.email, k.cargo])].join(" ")
    );
    return (!!termo && palheiro.includes(termo)) || (digitos.length >= 3 && v.c.cnpj.includes(digitos));
  };
  const fechou = (v: Visao) => v.contratos.length;
  const semCnpj = (v: Visao) => v.contratos.length > 0 && !v.c.cnpj;
  // Só em prospecção: tem oportunidade em Prospecção (no produto do cabeçalho, se houver um) e
  // nada mais adiante: nenhuma em negociação, nenhum contrato. É quem ainda não conversou conosco.
  const soProspeccao = (v: Visao) =>
    v.abertas.length === 0 &&
    fechou(v) === 0 &&
    v.deals.some((d) => d.estagio === "prospeccao" && (area === "all" || d.area === area));
  const naArea = visoes.filter((v) => area === "all" || v.areas.includes(area));
  const lista = naArea
    .filter(casaBusca)
    .filter((v) =>
      filtro === "abertas" ? v.abertas.length > 0 : filtro === "contrato" ? fechou(v) > 0 : filtro === "prospeccao" ? soProspeccao(v) : true
    )
    .sort((a, b) => porTexto(a.c.nome, b.c.nome));

  const ordenada = ord.aplicar(lista, {
    nome: (v) => v.c.nome,
    produtos: (v) => v.areas.map((a) => areaOf(a).label).join(", "),
    // Pelo estágio da oportunidade mais adiantada; no empate, quem tem mais oportunidades.
    oportunidades: (v) => (v.deals.length ? (ORDEM_ESTAGIO.length - Math.min(...v.deals.map((d) => pesoEstagio(d.estagio)))) * 1000 + v.deals.length : null),
    pipeline: (v) => v.pipeline || null,
    contratos: (v) => fechou(v) || null,
    ultima: (v) => v.ultima,
    cnpj: (v) => v.c.cnpj,
  });

  const duplicados = possiveisDuplicados(dados.clientes);
  const visaoDe = (id: number) => visoes.find((v) => v.c.id === id);
  const visaoAberta = typeof aberto === "number" ? visaoDe(aberto) : undefined;

  const mesclar = async (some: ClienteLido, fica: ClienteLido) => {
    const n = visaoDe(some.id);
    const leva = [n?.deals.length ? `${n.deals.length} oportunidade(s)` : "", n?.receitas.length ? `${n.receitas.length} receita(s)` : ""]
      .filter(Boolean)
      .join(" e ");
    if (
      !window.confirm(
        `Mesclar "${some.nome}" em "${fica.nome}"?\n\n${leva ? `${leva} passam para ${fica.nome}. ` : ""}O cadastro ${some.ref} deixa de existir. Não dá para desfazer.`
      )
    )
      return;
    setMesclando(true);
    try {
      await api.mesclarCliente(some.id, fica.id);
      if (aberto === some.id) setAberto(fica.id);
      recarregar();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Não foi possível mesclar.");
    } finally {
      setMesclando(false);
    }
  };

  const cols = "minmax(220px, 1.8fr) 1.1fr 0.9fr 0.9fr 0.6fr 0.8fr 150px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="rec-numeros">
        <Numero rotulo="ORGANIZAÇÕES" valor={String(naArea.length)} detalhe={area === "all" ? "No cadastro" : `Com oportunidade ou receita em ${areaOf(area).label}`} />
        <Numero
          rotulo="SÓ EM PROSPECÇÃO"
          valor={String(naArea.filter(soProspeccao).length)}
          titulo="Organizações distintas que só têm oportunidade em Prospecção: nenhuma em negociação e nenhum contrato."
          detalhe="Ainda sem conversa: nada em negociação nem contrato"
        />
        <Numero
          rotulo="EM NEGOCIAÇÃO"
          valor={String(naArea.filter((v) => v.abertas.length).length)}
          titulo="Organizações distintas com ao menos uma oportunidade da 1ª Reunião ao Contrato. Cada organização conta uma vez, mesmo com oportunidades em vários produtos. Prospecção, On hold, Lost e Ganho não entram."
          detalhe={`Organizações distintas, da 1ª Reunião ao Contrato · ${brl(naArea.reduce((t, v) => t + v.pipeline, 0))}`}
        />
        <Numero
          rotulo="COM CONTRATO"
          valor={String(naArea.filter((v) => fechou(v)).length)}
          detalhe="Receita contratada: venda ganha"
        />
      </div>

      {isAdmin && duplicados.length > 0 && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: R, background: C.canvas, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={eyebrow(10, C.warning, "0.14em")}>
              {duplicados.length} {duplicados.length === 1 ? "POSSÍVEL DUPLICADO" : "POSSÍVEIS DUPLICADOS"}
            </span>
            <span style={{ fontSize: 12.5, color: C.faint }}>Nomes parecidos ou mesmo CNPJ. Mescle só se for a mesma empresa.</span>
            <button type="button" className="rec-link" style={{ marginLeft: "auto" }} onClick={() => setVerDuplicados((v) => !v)} aria-expanded={verDuplicados}>
              {verDuplicados ? "esconder" : "revisar"}
            </button>
          </div>
          {verDuplicados && (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {duplicados.map(([a, b]) => (
                <div key={`${a.id}-${b.id}`} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13, color: C.body }}>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ color: C.ink }}>{a.nome}</strong> <span style={{ color: C.faint }}>({a.ref})</span> e{" "}
                    <strong style={{ color: C.ink }}>{b.nome}</strong> <span style={{ color: C.faint }}>({b.ref})</span>
                  </span>
                  <span style={{ display: "flex", gap: 14, marginLeft: "auto" }}>
                    <button type="button" className="rec-link" disabled={mesclando} onClick={() => void mesclar(b, a)}>
                      manter {a.nome}
                    </button>
                    <button type="button" className="rec-link" disabled={mesclando} onClick={() => void mesclar(a, b)}>
                      manter {b.nome}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div role="group" aria-label="Filtro de organizações" className="liff-densidade">
          {FILTROS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filtro === f.key} onClick={() => setFiltro(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>
          {lista.length} de {naArea.length}
        </span>
        {podeCriar && (
          <span style={{ marginLeft: "auto" }}>
            <Button variant="solid" size="sm" onClick={() => setAberto("novo")}>
              + organização
            </Button>
          </span>
        )}
      </div>

      {lista.length === 0 ? (
        <div style={{ fontSize: 13.5, color: C.faint, lineHeight: 1.6 }}>
          {dados.clientes.length === 0
            ? "Nenhuma organização ainda. Elas nascem sozinhas quando uma oportunidade é criada, ou pelo botão + organização."
            : "Nenhuma organização com esse recorte. Ajuste a busca, o produto ou o filtro."}
        </div>
      ) : (
        <div className="liff-scroll-x" style={{ border: `1px solid ${C.line}`, borderRadius: R }}>
          <div style={{ minWidth: 1040 }}>
            <div style={{ display: "grid", gridTemplateColumns: cols, background: C.canvas, borderBottom: `1px solid ${C.line}` }}>
              {(
                [
                  ["nome", "ORGANIZAÇÃO"], ["produtos", "PRODUTOS"], ["oportunidades", "OPORTUNIDADES"], ["pipeline", "EM NEGOCIAÇÃO (R$)"],
                  ["contratos", "CONTRATOS"], ["ultima", "ÚLT. INTERAÇÃO"], ["cnpj", "CNPJ"],
                ] as const
              ).map(([chave, h]) => ord.th(chave, h, { padding: "12px 14px", ...eyebrow(10, C.faint), textAlign: chave === "pipeline" ? "right" : "left" }))}
            </div>
            {ordenada.map((v) => (
              <div
                key={v.c.id}
                className="liff-hover-row"
                role="button"
                tabIndex={0}
                onClick={() => setAberto(v.c.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setAberto(v.c.id))}
                title="Abrir a ficha da organização"
                style={{ display: "grid", gridTemplateColumns: cols, background: C.cell, borderBottom: `1px solid ${C.line}`, cursor: "pointer", alignItems: "center" }}
              >
                <div style={{ padding: "12px 14px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: C.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.c.nome}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.c.ref}
                    {v.c.contatos.length ? ` · ${v.c.contatos.length} contato${v.c.contatos.length > 1 ? "s" : ""}` : ""}
                    {v.c.segmento ? ` · ${v.c.segmento}` : ""}
                  </div>
                </div>
                <div style={{ padding: "12px 14px", display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
                  {v.areas.length ? v.areas.map((a) => <Produto key={a} area={a} />) : <span style={{ color: C.ghost }}>—</span>}
                </div>
                <div style={{ padding: "12px 14px", fontSize: 13, whiteSpace: "nowrap" }}>
                  <Oportunidades deals={v.deals} />
                </div>
                <div style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 12, textAlign: "right", color: v.pipeline ? C.ink : C.ghost }} title={brlExato(v.pipeline)}>
                  {v.pipeline ? brl(v.pipeline) : "—"}
                </div>
                <div style={{ padding: "12px 14px", fontSize: 13, color: fechou(v) ? C.body : C.ghost }}>{fechou(v) || "—"}</div>
                <div style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 12, color: v.ultima ? C.body : C.ghost }}>{dataBR(v.ultima)}</div>
                <div style={{ padding: "12px 14px", fontFamily: MONO, fontSize: 11, whiteSpace: "nowrap", color: v.c.cnpj ? C.body : semCnpj(v) ? C.warning : C.ghost }}>
                  {v.c.cnpj ? cnpjFormatado(v.c.cnpj) : semCnpj(v) ? "FALTA" : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aberto != null && (aberto === "novo" || visaoAberta) && (
        <Ficha
          // Troca de cliente (depois de uma mescla, por exemplo) recomeça o formulário.
          key={String(aberto)}
          visao={aberto === "novo" ? null : visaoAberta!}
          isAdmin={isAdmin}
          podeVerReceita={podeVerReceita}
          podeFinanceiro={podeFinanceiro}
          outros={dados.clientes.filter((c) => c.id !== aberto)}
          deals={deals}
          onFechar={() => setAberto(null)}
          onSalvo={(id) => {
            recarregar();
            if (id != null) setAberto(id);
          }}
          onExcluido={() => {
            setAberto(null);
            recarregar();
          }}
          onMesclar={(some, fica) => void mesclar(some, fica)}
          onAbrirDeal={onAbrirDeal}
        />
      )}
    </div>
  );
}

function Numero({ rotulo, valor, detalhe, alerta, titulo }: { rotulo: string; valor: string; detalhe: string; alerta?: boolean; titulo?: string }) {
  return (
    <div className="rec-numero" title={titulo}>
      <div style={eyebrow(10, C.faint, "0.12em")}>{rotulo}</div>
      <div className="rec-numero__valor" style={alerta ? { color: C.warning } : undefined}>
        {valor}
      </div>
      <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.45 }}>{detalhe}</div>
    </div>
  );
}

/** Produto com o ponto da cor dele e o nome: a cor identifica, o texto diz qual é. */
function Produto({ area }: { area: string }) {
  const a = areaOf(area);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.body, whiteSpace: "nowrap" }}>
      <span style={{ ...dot(a.color), borderRadius: 2 }} />
      {a.label}
    </span>
  );
}

/* ============================== ficha ============================== */

const CONTATO_VAZIO: Contato = { nome: "", cargo: "", email: "", telefone: "", papel: "outro", notas: "" };

function Ficha({
  visao,
  isAdmin,
  podeVerReceita,
  podeFinanceiro,
  outros,
  deals,
  onFechar,
  onSalvo,
  onExcluido,
  onMesclar,
  onAbrirDeal,
}: {
  /** `null` = cliente novo. */
  visao: Visao | null;
  isAdmin: boolean;
  podeVerReceita: boolean;
  podeFinanceiro: boolean;
  outros: ClienteLido[];
  deals: Deal[];
  onFechar: () => void;
  onSalvo: (id: number | null) => void;
  onExcluido: () => void;
  onMesclar: (some: ClienteLido, fica: ClienteLido) => void;
  onAbrirDeal: (ref: string) => void;
}) {
  const c = visao?.c;
  const [nome, setNome] = useState(c?.nome ?? "");
  const [razaoSocial, setRazaoSocial] = useState(c?.razaoSocial ?? "");
  const [cnpj, setCnpj] = useState(c ? cnpjFormatado(c.cnpj) : "");
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState(c?.inscricaoMunicipal ?? "");
  const [segmento, setSegmento] = useState(c?.segmento ?? "");
  const [site, setSite] = useState(c?.site ?? "");
  const [endereco, setEndereco] = useState(c?.endereco ?? "");
  const [emailCobranca, setEmailCobranca] = useState(c?.emailCobranca ?? "");
  const [diaVencimento, setDiaVencimento] = useState(c?.diaVencimento ? String(c.diaVencimento) : "");
  const [formaCobranca, setFormaCobranca] = useState(c?.formaCobranca ?? "");
  const [notas, setNotas] = useState(c?.notas ?? "");
  const [contatos, setContatos] = useState<Contato[]>(c?.contatos ?? []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvoEm, setSalvoEm] = useState<number | null>(null);
  const [mesclarEm, setMesclarEm] = useState("");
  const [eventos, setEventos] = useState<EventoCliente[] | null>(null);
  const [verTudo, setVerTudo] = useState(false);

  const id = c?.id;
  const podeEditar = !c || c.podeEditar !== false;
  useEffect(() => {
    if (id == null) return;
    let vivo = true;
    api.historicoCliente(id).then(
      (r) => vivo && setEventos(r.eventos),
      () => vivo && setEventos([])
    );
    return () => {
      vivo = false;
    };
  }, [id, salvoEm]);

  const mexeContato = (i: number, campo: keyof Contato, valor: string) =>
    setContatos((cs) => cs.map((k, j) => (j === i ? { ...k, [campo]: valor } : k)));

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    const corpo = {
      nome, razaoSocial, cnpj, inscricaoMunicipal, segmento, site, endereco, emailCobranca,
      diaVencimento: diaVencimento || null,
      formaCobranca: formaCobranca || null,
      notas,
      contatos,
    };
    try {
      if (c) {
        await api.alterarCliente(c.id, corpo);
        setSalvoEm(Date.now());
        onSalvo(null);
      } else {
        const r = await api.criarCliente(corpo);
        onSalvo(r.id);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!c || !window.confirm(`Excluir a organização ${c.nome}? Não dá para desfazer.`)) return;
    setSalvando(true);
    try {
      await api.excluirCliente(c.id);
      onExcluido();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir.");
      setSalvando(false);
    }
  };

  const bloco = (titulo: string, primeiro = false) => (
    <div style={{ ...eyebrow(10, C.dust, "0.14em"), ...(primeiro ? {} : { borderTop: `1px solid ${C.line}`, paddingTop: 16, marginTop: 2 }) }}>{titulo}</div>
  );
  const duas = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } as const;
  const dealPorId = new Map(deals.map((d) => [d.id, d]));
  const aReceber = visao?.faturas.filter((f) => f.status === "emitida").reduce((t, f) => t + f.valorCentavos, 0) ?? 0;
  const recebido = visao?.faturas.filter((f) => f.status === "paga").reduce((t, f) => t + (f.valorPagoCentavos ?? f.valorCentavos), 0) ?? 0;
  const vazio = !!visao && visao.deals.length === 0 && visao.receitas.length === 0;

  const formulario = (
    <div className="cortina-col">
      {bloco("CADASTRO", true)}
      <Field label="Nome" required hint="Como a empresa é chamada no dia a dia. É por este nome que as oportunidades encontram a organização.">
        <Input value={nome} onChange={setNome} placeholder="Globe Química" />
      </Field>
      <Field label="Razão social">
        <Input value={razaoSocial} onChange={setRazaoSocial} placeholder="Globe Química S.A." />
      </Field>
      <div style={duas}>
        <Field label="CNPJ">
          <Input value={cnpj} onChange={setCnpj} placeholder="00.000.000/0000-00" />
        </Field>
        <Field label="Inscrição municipal">
          <Input value={inscricaoMunicipal} onChange={setInscricaoMunicipal} />
        </Field>
      </div>
      <div style={duas}>
        <Field label="Segmento">
          <Input value={segmento} onChange={setSegmento} placeholder="Indústria química" />
        </Field>
        <Field label="Site">
          <Input value={site} onChange={setSite} placeholder="globequimica.com.br" />
        </Field>
      </div>
      <Field label="Endereço" hint="O que vai na nota fiscal.">
        <Input value={endereco} onChange={setEndereco} placeholder="Rua, número, cidade, UF, CEP" />
      </Field>

      {isAdmin && (
        <>
      {bloco("COBRANÇA")}
      <Field label="E-mail do financeiro">
        <Input value={emailCobranca} onChange={setEmailCobranca} placeholder="financeiro@cliente.com.br" />
      </Field>
      <div style={duas}>
        <Field label="Vence no dia" hint="1 a 28. Em branco: ainda não combinado.">
          <Input value={diaVencimento} onChange={(v) => setDiaVencimento(v.replace(/\D/g, "").slice(0, 2))} />
        </Field>
        <Field label="Forma de cobrança">
          <Select
            value={formaCobranca}
            onChange={setFormaCobranca}
            options={[{ value: "", label: "—" }, ...FORMAS_COBRANCA.map((f) => ({ value: f.key, label: f.label }))]}
          />
        </Field>
      </div>
        </>
      )}

      {bloco(`CONTATOS${contatos.length ? ` · ${contatos.length}` : ""}`)}
      {contatos.length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>Nenhuma pessoa cadastrada nesta organização.</div>}
      {contatos.map((k, i) => (
        <div key={i} style={{ display: "grid", gap: 8, padding: 12, border: `1px solid ${C.line}`, borderRadius: R }}>
          <div style={duas}>
            <Input value={k.nome} onChange={(v) => mexeContato(i, "nome", v)} placeholder="Nome" size="sm" />
            <Input value={k.cargo} onChange={(v) => mexeContato(i, "cargo", v)} placeholder="Cargo" size="sm" />
          </div>
          <div style={duas}>
            <Input value={k.email} onChange={(v) => mexeContato(i, "email", v)} placeholder="E-mail" size="sm" />
            <Input value={k.telefone} onChange={(v) => mexeContato(i, "telefone", v)} placeholder="Telefone" size="sm" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center" }}>
            <Select
              value={k.papel}
              onChange={(v) => mexeContato(i, "papel", v as PapelContato)}
              options={PAPEIS_CONTATO.map((p) => ({ value: p.key, label: p.label }))}
            />
            <button
              type="button"
              className="rec-link"
              style={{ color: C.error }}
              onClick={() => setContatos((cs) => cs.filter((_, j) => j !== i))}
              aria-label={`Remover o contato ${k.nome || i + 1}`}
            >
              remover
            </button>
          </div>
        </div>
      ))}
      <div>
        <button type="button" className="rec-link" onClick={() => setContatos((cs) => [...cs, { ...CONTATO_VAZIO }])}>
          + contato
        </button>
      </div>

      {bloco("NOTAS")}
      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        rows={3}
        className="rec-notas"
        placeholder="O que vale para a organização inteira: grupo econômico, quem indica, particularidades de compra…"
      />

      {c && c.outrosNomes.length > 0 && (
        <div style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}>
          Também responde por: {c.outrosNomes.join(" · ")}. Oportunidade criada com um desses nomes cai nesta organização.
        </div>
      )}

      {erro && <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: C.error }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
        {salvoEm && !erro && <span style={{ fontFamily: MONO, fontSize: 11, color: C.success, marginRight: "auto" }}>salvo</span>}
        <Button variant="ghost" size="sm" onClick={onFechar} style={GHOST_FIX}>
          fechar
        </Button>
        {podeEditar ? (
          <Button variant="solid" size="sm" disabled={salvando || !nome.trim()} onClick={() => void salvar()}>
            {salvando ? "salvando…" : c ? "salvar alterações" : "cadastrar organização"}
          </Button>
        ) : (
          <span style={{ fontSize: 12.5, color: C.faint }}>Somente leitura: você não edita nenhum produto desta organização.</span>
        )}
      </div>

      {c && isAdmin && (
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 16, display: "grid", gap: 12 }}>
          <div style={eyebrow(10, C.dust, "0.14em")}>É A MESMA QUE OUTRA ORGANIZAÇÃO?</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
            <Select
              value={mesclarEm}
              onChange={setMesclarEm}
              options={[{ value: "", label: "Escolha o cadastro que fica" }, ...outros.map((o) => ({ value: String(o.id), label: `${o.nome} (${o.ref})` }))]}
            />
            <Button
              variant="ghost"
              size="sm"
              style={GHOST_FIX}
              disabled={!mesclarEm || salvando}
              onClick={() => {
                const fica = outros.find((o) => String(o.id) === mesclarEm);
                if (fica) onMesclar(c, fica);
              }}
            >
              mesclar neste
            </Button>
          </div>
          <div style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}>
            Oportunidades, receitas e contatos de {c.nome} passam para o cadastro escolhido, e este deixa de existir.
          </div>
          {vazio && (
            <div>
              <button type="button" className="rec-link" style={{ color: C.error }} onClick={() => void excluir()} disabled={salvando}>
                excluir organização
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!visao || !c) {
    return (
      <Modal titulo="Nova organização" eyebrowTexto="LIFF/ ORGANIZAÇÕES" onFechar={onFechar} largura={640}>
        {formulario}
      </Modal>
    );
  }

  const ordenadas = [...visao.deals].sort(
    (a, b) => Number(estagioEmAberto(b.estagio)) - Number(estagioEmAberto(a.estagio)) || b.valorCentavos - a.valorCentavos
  );
  const eventosVisiveis = verTudo ? (eventos ?? []) : (eventos ?? []).slice(0, 12);

  return (
    <Modal titulo={c.nome} eyebrowTexto={`LIFF/ ORGANIZAÇÕES · ${c.ref}`} onFechar={onFechar} largura={1180}>
      <div className="cortina-duas">
        {formulario}

        <div className="cortina-col">
          {bloco(`OPORTUNIDADES E PROPOSTAS · ${visao.deals.length}`, true)}
          {ordenadas.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}>
              Nenhuma oportunidade ainda. Ao criar uma no Comercial, escolha esta organização no campo Organização.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 2 }}>
              {ordenadas.map((d) => (
                <div
                  key={d.id}
                  className="liff-hover-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => onAbrirDeal(d.ref)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onAbrirDeal(d.ref))}
                  title="Abrir a oportunidade no Comercial"
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 12px", padding: "8px 8px", borderRadius: R, cursor: "pointer", opacity: estagioEmAberto(d.estagio) || d.estagio === "ganho" ? 1 : 0.7 }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{d.ref}</span>
                    <Produto area={d.area} />
                    <span style={eyebrow(10, d.estagio === "ganho" ? C.success : d.estagio === "lost" ? C.faint : C.body, "0.1em")}>{stageLabel(d.estagio)}</span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: d.valorCentavos ? C.ink : C.ghost, textAlign: "right" }}>
                    {d.valorCentavos ? brlExato(d.valorCentavos) : "sem valor"}
                  </span>
                  <span style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.45, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.conta !== c.nome ? `${d.conta} · ` : ""}
                    {d.proximoPasso || d.situacao || "Sem situação registrada"}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    {d.propostaUrl ? (
                      <a
                        href={d.propostaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rec-link"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        proposta ↗
                      </a>
                    ) : (
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.ghost }}>SEM LINK</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {podeVerReceita && bloco(`RECEITA · ${visao.receitas.length}`)}
          {!podeVerReceita ? null : visao.receitas.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.faint }}>Nenhuma receita cadastrada, nem contratada nem prevista.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {visao.receitas.map((k) => {
                const efetiva = situacaoEfetiva(k, k.dealId != null ? dealPorId.get(k.dealId) : null);
                const [ano, mes] = k.inicioFaturamento.split("-");
                return (
                  <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: C.body }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{k.ref}</span>
                    <Produto area={k.area} />
                    <span style={eyebrow(10, efetiva === "contratada" ? C.success : C.dust, "0.1em")}>{ROTULO_SITUACAO[efetiva]}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.faint, marginLeft: "auto" }}>fatura desde {`${mes}/${ano}`}</span>
                  </div>
                );
              })}
            </div>
          )}

          {podeFinanceiro && (
            <>
          {bloco(`FATURAS · ${visao.faturas.length}`)}
          {visao.faturas.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.faint }}>Nenhuma fatura emitida.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, color: C.body }}>
                <span>
                  A receber <strong style={{ color: C.ink, fontFamily: MONO, fontWeight: 600 }}>{brlExato(aReceber)}</strong>
                </span>
                <span>
                  Recebido <strong style={{ color: C.ink, fontFamily: MONO, fontWeight: 600 }}>{brlExato(recebido)}</strong>
                </span>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {[...visao.faturas]
                  .sort((a, b) => (b.emitidaEm ?? "").localeCompare(a.emitidaEm ?? ""))
                  .slice(0, 8)
                  .map((f) => (
                    <div key={f.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 10, alignItems: "baseline", fontSize: 12.5, color: C.body }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{f.ref}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.competencia}
                        {f.nfNumero ? ` · NF ${f.nfNumero}` : ""}
                        {f.vencimento && f.status === "emitida" ? ` · vence ${dataBR(f.vencimento)}` : ""}
                      </span>
                      <span style={eyebrow(10, f.status === "paga" ? C.success : f.status === "cancelada" ? C.faint : C.warning, "0.1em")}>{f.status}</span>
                      <span style={{ fontFamily: MONO, fontSize: 12, color: C.ink }}>{brlExato(f.valorCentavos)}</span>
                    </div>
                  ))}
              </div>
              {visao.faturas.length > 8 && <div style={{ fontSize: 12, color: C.faint }}>As 8 mais recentes. O resto está em Faturamento.</div>}
            </>
          )}
            </>
          )}

          {bloco("LINHA DO TEMPO")}
          {eventos === null ? (
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>carregando…</div>
          ) : eventos.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.faint }}>Nada registrado ainda.</div>
          ) : (
            <>
              <div style={{ display: "grid", gap: 12 }}>
                {eventosVisiveis.map((e) => (
                  <div key={e.id} style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 12, alignItems: "baseline" }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{dataBR(e.criadoEm)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.45 }}>{e.texto}</span>
                      {(e.campo === "situacao" || e.campo === "proximo_passo") && e.para && e.para !== "—" && (
                        <span style={{ display: "block", fontSize: 12.5, color: C.body, lineHeight: 1.5, marginTop: 2 }}>{e.para}</span>
                      )}
                      <span style={{ display: "block", fontFamily: MONO, fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                        {e.entidade} · {e.autor}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              {eventos.length > 12 && (
                <div>
                  <button type="button" className="rec-link" onClick={() => setVerTudo((v) => !v)}>
                    {verTudo ? "mostrar menos" : `ver os ${eventos.length} registros`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
