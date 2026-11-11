"use client";

// Todos os estados do critério de aceite, lado a lado, nas duas densidades. Data fixa
// (10/11/2026) para os rótulos de prazo não mudarem de um dia para o outro.

import { CardOportunidade } from "@/app/components/CardOportunidade";
import type { Deal } from "@/app/components/api";

const HOJE = "2026-11-10";
const PRODUTOS = [
  { id: "apuracao", label: "Apuração assistida" },
  { id: "precificacao", label: "Precificação" },
  { id: "genius", label: "Genius" },
  { id: "starter", label: "LIFF Tax Starter" },
  { id: "inbox", label: "Tax Inbox" },
  { id: "lei", label: "Lei do Bem" },
];
const PESSOAS = [{ id: 1, nome: "Bruno Santo", iniciais: "BS" }];

const base: Deal = {
  id: 1, ref: "C-0001", conta: "São Salvador Alimentos", area: "tax", estagio: "contrato", valorCentavos: 12000000,
  responsavel: "Bruno Santo", responsavelId: 1, responsavelTexto: "", proximoPasso: "Avançar com o contrato",
  situacao: "Validação técnica realizada e valores da proposta aceitos", situacaoEm: "2026-10-19", contato: "",
  proximoPassoEm: "2026-10-23", aceAws: true, atualizadoEm: "", podeEditar: true, origemId: null, ponte: "",
  contatoOperacional: "", dor: "", erp: "", clienteId: null, propostaUrl: "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOp/edit", ultimaInteracao: null, blocker: "Responder questionário de LGPD e segurança de TI",
  blockerTipo: "seguranca", blockerDonoId: null, blockerDono: null, motivoPerda: null, motivoPerdaDetalhe: "", notas: "",
  modulos: ["apuracao", "precificacao", "genius"],
} as Deal;

const ESTADOS: { titulo: string; d: Deal }[] = [
  { titulo: "Vencido + bloqueio · 3 módulos", d: base },
  { titulo: "Em dia + bloqueio", d: { ...base, id: 2, proximoPassoEm: "2026-11-24" } },
  { titulo: "Prazo próximo, sem bloqueio", d: { ...base, id: 3, proximoPassoEm: "2026-11-14", blocker: "", blockerTipo: null } },
  { titulo: "Sem ACE · 1 módulo", d: { ...base, id: 4, aceAws: false, modulos: ["lei"], blocker: "", blockerTipo: null, proximoPassoEm: "2026-11-24" } },
  { titulo: "5+ módulos · cliente longo", d: { ...base, id: 5, conta: "Companhia Brasileira de Distribuição e Logística Integrada S.A.", modulos: PRODUTOS.map((p) => p.id) } },
  { titulo: "Prospecção · sem valor, sem data, dono em texto", d: { ...base, id: 6, estagio: "prospeccao", valorCentavos: 0, modulos: [], proximoPassoEm: null, aceAws: false, blocker: "", blockerTipo: null, responsavelId: null, responsavelTexto: "Jose Finocchio", situacaoEm: null, situacao: "Contato frio, sem resposta." } },
  { titulo: "Ganho (última etapa)", d: { ...base, id: 7, estagio: "ganho", blocker: "", blockerTipo: null } },
  { titulo: "Lost", d: { ...base, id: 8, estagio: "lost", motivoPerda: "concorrente", motivoPerdaDetalhe: "Fechou com outro fornecedor" } },
  { titulo: "Somente leitura", d: { ...base, id: 9, podeEditar: false } },
];

export default function EstadosDoCard() {
  return (
    <main style={{ padding: 32, background: "var(--liff-app-raia)", minHeight: "100vh", fontFamily: "var(--liff-font-body)" }}>
      {(["completo", "compacto"] as const).map((dens) => (
        <section key={dens} style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: "var(--liff-font-mono)", fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--liff-text-body)" }}>
            {dens}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 320px))", gap: 24, alignItems: "start" }}>
            {ESTADOS.map((e) => (
              <div key={e.titulo + dens} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: 0, fontFamily: "var(--liff-font-mono)", fontSize: 11, color: "var(--liff-text-muted)" }}>{e.titulo}</p>
                <CardOportunidade
                  d={e.d}
                  produtos={PRODUTOS}
                  pessoas={PESSOAS}
                  compacto={dens === "compacto"}
                  hoje={HOJE}
                  onAbrir={() => {}}
                  onMover={() => {}}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
