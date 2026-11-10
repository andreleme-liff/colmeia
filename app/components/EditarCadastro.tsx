"use client";

// Edição e exclusão de produto e de pessoa, a partir da tela de Cadastros. Só administração.
//
// A exclusão mostra ANTES o que está ligado ao registro e pede a decisão: migrar para outro,
// excluir junto ou só desvincular. Nada disso é desfazível pela interface — a confirmação
// final repete o que vai acontecer, com números.

import { useEffect, useState } from "react";
import { C, MONO, eyebrow } from "./tokens";
import { Button, Field, Input, Select } from "./ds";
import { Modal, opcoesArea } from "./views";
import { api, type DestinoExclusao, type Pessoa } from "./api";
import { PAPEIS } from "@/lib/domain";

type Ligado = { ref: string; texto: string };
type Usos = { grupos: { titulo: string; itens: Ligado[] }[]; destinos: { value: string; label: string }[]; extra?: string };
type Acao = "migrar" | "excluir" | "desvincular";

function SecaoExclusao({
  nome,
  carregar,
  rotulos,
  onExcluir,
}: {
  nome: string;
  carregar: () => Promise<Usos>;
  rotulos: { migrar: string; excluir: string; desvincular: string; botao: string };
  onExcluir: (destino?: DestinoExclusao) => Promise<void>;
}) {
  const [usos, setUsos] = useState<Usos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [acao, setAcao] = useState<Acao>("migrar");
  const [para, setPara] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    let vivo = true;
    carregar()
      .then((u) => vivo && setUsos(u))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : "Falha ao carregar."));
    return () => {
      vivo = false;
    };
  }, [carregar]);

  if (erro) return <div style={{ fontSize: 13, color: C.error }}>{erro}</div>;
  if (!usos) return <div style={{ fontSize: 13, color: C.faint }}>verificando o que está ligado…</div>;

  const total = usos.grupos.reduce((s, g) => s + g.itens.length, 0);
  const semDestino = acao === "migrar" && !usos.destinos.length;

  const confirmar = () => {
    const destino: DestinoExclusao | undefined = !total
      ? undefined
      : acao === "migrar"
        ? { acao, para }
        : { acao };
    const alvo = usos.destinos.find((d) => d.value === para)?.label;
    const efeito = !total
      ? "Nada está ligado a este cadastro."
      : acao === "migrar"
        ? `${total} registro(s) passam para ${alvo}.`
        : acao === "excluir"
          ? `${total} registro(s) ligados também serão EXCLUÍDOS.`
          : `${total} registro(s) ficam sem este vínculo.`;
    if (!window.confirm(`Excluir ${nome}?\n\n${efeito}\n\nNão dá para desfazer pela interface.`)) return;
    setExcluindo(true);
    onExcluir(destino)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha ao excluir."))
      .finally(() => setExcluindo(false));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {total === 0 ? (
        <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.6 }}>Nada está ligado a este cadastro.</div>
      ) : (
        <>
          {usos.grupos.filter((g) => g.itens.length).map((g) => (
            <div key={g.titulo}>
              <div style={{ ...eyebrow(10, C.dust), marginBottom: 6 }}>
                {g.titulo} · {g.itens.length}
              </div>
              <div style={{ fontSize: 12, color: C.body, lineHeight: 1.6, maxHeight: 110, overflow: "auto" }}>
                {g.itens.map((i) => (
                  <div key={g.titulo + i.ref}>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{i.ref}</span> {i.texto}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: C.ink }}>
            {(["migrar", "excluir", "desvincular"] as const).map((a) => (
              <label key={a} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", lineHeight: 1.45 }}>
                <input type="radio" name="acao" checked={acao === a} onChange={() => setAcao(a)} style={{ marginTop: 3, accentColor: "var(--liff-paprika)" }} />
                <span>{rotulos[a]}</span>
              </label>
            ))}
          </div>
          {acao === "migrar" &&
            (usos.destinos.length ? (
              <Select options={[{ value: "", label: "— escolha o destino —" }, ...usos.destinos]} value={para} onChange={setPara} />
            ) : (
              <div style={{ fontSize: 12, color: C.warning }}>Não há outro cadastro compatível para receber os registros.</div>
            ))}
          {acao === "excluir" && (
            <div style={{ fontSize: 12, color: C.error, lineHeight: 1.5 }}>
              As atividades e oportunidades listadas acima serão excluídas. O histórico delas fica na auditoria.
            </div>
          )}
        </>
      )}
      {usos.extra && <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>{usos.extra}</div>}
      <Button
        variant="outline"
        size="sm"
        disabled={excluindo || semDestino || (total > 0 && acao === "migrar" && !para)}
        style={{ justifyContent: "center", color: C.error, borderColor: C.error }}
        onClick={confirmar}
      >
        {excluindo ? "excluindo…" : rotulos.botao}
      </Button>
    </div>
  );
}

function Divisor({ titulo }: { titulo: string }) {
  return <div style={{ ...eyebrow(10, C.dust), borderTop: `1px solid ${C.line}`, paddingTop: 16, marginTop: 4 }}>{titulo}</div>;
}

export function EditarProduto({
  produto,
  areas,
  onFechar,
  onMudou,
}: {
  produto: { id: string; label: string; area: string; ativo: boolean };
  areas: { id: string; label: string }[];
  onFechar: () => void;
  onMudou: () => Promise<void>;
}) {
  const [label, setLabel] = useState(produto.label);
  const [area, setArea] = useState(produto.area);
  const [ativo, setAtivo] = useState(produto.ativo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const mudou = label.trim() !== produto.label || area !== produto.area || ativo !== produto.ativo;

  const [carregar] = useState(() => async (): Promise<Usos> => {
    const u = await api.usosDoProduto(produto.id);
    return {
      grupos: [
        { titulo: "ATIVIDADES", itens: u.atividades.map((a) => ({ ref: a.ref, texto: a.titulo })) },
        {
          titulo: "OPORTUNIDADES (MÓDULO)",
          itens: u.oportunidades.map((o) => ({ ref: o.ref, texto: o.conta + (o.modulos > 1 ? ` (+${o.modulos - 1} módulo)` : "") })),
        },
      ],
      destinos: u.destinos.map((d) => ({ value: d.id, label: d.label })),
    };
  });

  return (
    <Modal titulo={produto.label} eyebrowTexto="LIFF/ CADASTROS · PRODUTO" onFechar={onFechar}>
      <Field label="Nome do produto" required>
        <Input value={label} onChange={setLabel} />
      </Field>
      <Field label="Vertical" required hint="Mudar a vertical não mexe nos registros que já usam o produto.">
        <Select options={opcoesArea(areas, area)} value={area} onChange={setArea} />
      </Field>
      <label style={{ display: "flex", gap: 8, fontSize: 13, color: C.ink, cursor: "pointer" }}>
        <input type="checkbox" checked={!ativo} onChange={(e) => setAtivo(!e.target.checked)} style={{ accentColor: "var(--liff-paprika)" }} />
        Arquivado (some dos seletores, continua nos registros)
      </label>
      {erro && <div style={{ fontSize: 13, color: C.error }}>{erro}</div>}
      <Button
        size="sm"
        disabled={salvando || !mudou || !label.trim()}
        style={{ justifyContent: "center" }}
        onClick={() => {
          setSalvando(true);
          setErro(null);
          api
            .alterarProduto(produto.id, { label: label.trim(), area, ativo })
            .then(onMudou)
            .then(onFechar)
            .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha ao salvar."))
            .finally(() => setSalvando(false));
        }}
      >
        {salvando ? "salvando…" : "salvar"}
      </Button>

      <Divisor titulo="EXCLUIR PRODUTO" />
      <SecaoExclusao
        nome={`o produto ${produto.label}`}
        carregar={carregar}
        rotulos={{
          migrar: "Migrar os registros para outro produto da mesma vertical",
          excluir: "Excluir junto as atividades e oportunidades ligadas",
          desvincular: "Só desvincular: os registros ficam, sem este produto",
          botao: "excluir produto",
        }}
        onExcluir={async (destino) => {
          await api.excluirProduto(produto.id, destino);
          await onMudou();
          onFechar();
        }}
      />
    </Modal>
  );
}

export function EditarPessoa({
  pessoa,
  meuId,
  dominio,
  onFechar,
  onMudou,
}: {
  pessoa: Pessoa;
  meuId: number;
  dominio: string;
  onFechar: () => void;
  onMudou: () => Promise<void>;
}) {
  const [nome, setNome] = useState(pessoa.nome);
  const [email, setEmail] = useState(pessoa.email);
  const [papel, setPapel] = useState(pessoa.papel);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const souEu = pessoa.id === meuId;
  const mudou = nome.trim() !== pessoa.nome || email.trim().toLowerCase() !== pessoa.email.toLowerCase() || papel !== pessoa.papel;

  const [carregar] = useState(() => async (): Promise<Usos> => {
    const u = await api.usosDaPessoa(pessoa.id);
    return {
      grupos: [
        { titulo: "ATIVIDADES (RESPONSÁVEL)", itens: u.atividades.map((a) => ({ ref: a.ref, texto: a.titulo })) },
        { titulo: "OPORTUNIDADES (DONO)", itens: u.oportunidades.map((o) => ({ ref: o.ref, texto: o.conta })) },
        { titulo: "BLOCKERS QUE RESOLVE", itens: u.blockers.map((o) => ({ ref: o.ref, texto: o.conta })) },
      ],
      destinos: u.destinos.map((d) => ({ value: String(d.id), label: d.nome })),
      extra:
        "A pessoa perde o acesso na hora: sessões, permissões por área" +
        (u.conexoes ? ` e ${u.conexoes} conexão(ões) do Claude` : " e conexões do Claude") +
        ". O nome continua no histórico do que ela fez.",
    };
  });

  return (
    <Modal titulo={pessoa.nome} eyebrowTexto="LIFF/ CADASTROS · PESSOA" onFechar={onFechar}>
      <Field label="Nome completo" required>
        <Input value={nome} onChange={setNome} />
      </Field>
      <Field label="E-mail" required hint={`Precisa ser @${dominio} — é o e-mail do login pelo Google.`}>
        <Input value={email} onChange={setEmail} />
      </Field>
      <Field label="Papel" hint={souEu && pessoa.papel === "admin" ? "Você não pode mudar o próprio papel de admin." : "O acesso por área se define na lista de pessoas, abrindo a linha."}>
        <Select options={[...PAPEIS]} value={papel} onChange={setPapel} disabled={souEu && pessoa.papel === "admin"} />
      </Field>
      {erro && <div style={{ fontSize: 13, color: C.error }}>{erro}</div>}
      <Button
        size="sm"
        disabled={salvando || !mudou || !nome.trim() || !email.trim()}
        style={{ justifyContent: "center" }}
        onClick={() => {
          setSalvando(true);
          setErro(null);
          api
            .alterarPessoa(pessoa.id, { nome: nome.trim(), email: email.trim(), papel })
            .then(onMudou)
            .then(onFechar)
            .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Falha ao salvar."))
            .finally(() => setSalvando(false));
        }}
      >
        {salvando ? "salvando…" : "salvar"}
      </Button>

      <Divisor titulo="EXCLUIR PESSOA" />
      {souEu ? (
        <div style={{ fontSize: 13, color: C.faint }}>Você não pode excluir a própria conta.</div>
      ) : (
        <SecaoExclusao
          nome={pessoa.nome}
          carregar={carregar}
          rotulos={{
            migrar: "Passar atividades, oportunidades e blockers para outra pessoa",
            excluir: "Excluir junto as atividades e oportunidades dela",
            desvincular: "Só desvincular: os registros ficam sem responsável (na oportunidade, o nome fica em texto)",
            botao: "excluir pessoa",
          }}
          onExcluir={async (destino) => {
            await api.excluirPessoa(pessoa.id, destino);
            await onMudou();
            onFechar();
          }}
        />
      )}
    </Modal>
  );
}
