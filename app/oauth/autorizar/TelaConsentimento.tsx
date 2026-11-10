"use client";

// A tela que a pessoa vê quando o Claude (ou outro cliente autorizado) pede para se
// conectar. Três perguntas precisam estar respondidas antes do botão:
//  · QUEM pede — o nome do cliente e o host que publica o documento dele;
//  · PARA ONDE o código volta — a especificação exige mostrar, e loopback ganha aviso,
//    porque qualquer programa local consegue abrir uma porta e se dizer o cliente;
//  · O QUE a conexão vai poder — ler é a base; gravar é opção explícita, desmarcada.

import { LiffMark, Button } from "../../components/ds";
import { C, MONO, eyebrow, markTone, useTheme } from "../../components/tokens";

type Acao = (form: FormData) => Promise<void>;

type Props =
  | { modo: "erro"; mensagem: string }
  | {
      modo: "pedido";
      query: string;
      cliente: string;
      clienteHost: string;
      retorno: string;
      loopback: boolean;
      pessoa: string;
      email: string;
      areasLeitura: string[];
      areasEscrita: string[];
      escritaDisponivel: boolean;
      escritaNegada: boolean;
      autorizar: Acao;
      recusar: Acao;
    };

const caixa = { border: `1px solid ${C.line}`, background: C.panel2, padding: "12px 14px" } as const;
const rotulo = (cor: string = C.faint) => ({ ...eyebrow(10, cor, "0.14em"), marginBottom: 6 });

function lista(areas: string[]): string {
  if (!areas.length) return "nenhuma vertical";
  return areas.length > 1 ? `${areas.slice(0, -1).join(", ")} e ${areas[areas.length - 1]}` : areas[0];
}

export default function TelaConsentimento(props: Props) {
  const [theme] = useTheme();

  return (
    <div className="liff-login">
      <div className="liff-login__pitch">
        <LiffMark height={34} tone={markTone(theme)} />
        <div>
          <div style={{ ...eyebrow(12, C.accent), marginBottom: 24 }}>LIFF/ TASKS · CONEXÃO</div>
          <h1
            style={{
              fontSize: 46, lineHeight: 1.04, letterSpacing: "-0.035em", fontWeight: 800,
              color: C.ink, margin: "0 0 20px", maxWidth: "16ch", textWrap: "pretty",
            }}
          >
            {props.modo === "pedido" ? `${props.cliente} quer acessar o LIFF tasks em seu nome.` : "Não foi possível conectar."}
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.62, color: C.body, margin: 0, maxWidth: "46ch" }}>
            A conexão age como você: enxerga só as verticais que você enxerga e grava só onde você pode editar. Tudo o que
            ela fizer fica no histórico, marcado com o nome do aplicativo.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["OAUTH 2.1", "PKCE", "AUDITORIA", "REVOGÁVEL"].map((t, i) => (
            <span key={t} style={{ display: "contents" }}>
              {i > 0 && <span style={{ color: C.ghost }}>/</span>}
              <span style={eyebrow(11, C.faint, "0.14em")}>{t}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="liff-login__panel">
        <div style={{ width: "100%", maxWidth: 460, background: C.panel, border: `1px solid ${C.line}`, padding: 32 }}>
          {props.modo === "erro" ? (
            <>
              <div style={{ ...eyebrow(11, C.faint), marginBottom: 8 }}>CONEXÃO RECUSADA</div>
              <div
                style={{
                  border: `1px solid ${C.error}`, background: "color-mix(in srgb, var(--liff-error) 10%, transparent)",
                  color: C.error, fontFamily: MONO, fontSize: 12, lineHeight: 1.6, padding: "12px 14px",
                }}
              >
                {props.mensagem}
              </div>
            </>
          ) : (
            <form>
              <input type="hidden" name="q" value={props.query} />

              <div style={{ ...eyebrow(11, C.faint), marginBottom: 8 }}>AUTORIZAR CONEXÃO</div>
              <h2 style={{ fontSize: 26, letterSpacing: "-0.02em", fontWeight: 800, color: C.ink, margin: "0 0 4px" }}>
                {props.cliente}
              </h2>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, marginBottom: 22 }}>
                publicado por {props.clienteHost}
              </div>

              <div style={{ display: "grid", gap: 10, marginBottom: 22 }}>
                <div style={caixa}>
                  <div style={rotulo()}>Entrando como</div>
                  <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{props.pessoa}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>{props.email}</div>
                </div>
                <div style={{ ...caixa, ...(props.loopback ? { borderColor: C.warning } : {}) }}>
                  <div style={rotulo(props.loopback ? C.warning : C.faint)}>O acesso volta para</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: C.ink }}>{props.retorno}</div>
                  {props.loopback && (
                    <p style={{ fontSize: 13, lineHeight: 1.55, color: C.body, margin: "8px 0 0" }}>
                      É um programa rodando no seu computador, normalmente o Claude Code. Só autorize se foi você quem
                      acabou de pedir esta conexão.
                    </p>
                  )}
                </div>
              </div>

              <div style={rotulo()}>A conexão poderá</div>
              <div style={{ display: "grid", gap: 8, marginBottom: 22 }}>
                <div style={{ ...caixa, display: "flex", gap: 12 }}>
                  <span aria-hidden style={{ fontFamily: MONO, color: C.success, fontSize: 13, lineHeight: 1.5 }}>■</span>
                  <div style={{ fontSize: 14, lineHeight: 1.55, color: C.body }}>
                    <strong style={{ color: C.ink }}>Ler</strong> atividades, oportunidades, cadastros e histórico em{" "}
                    {lista(props.areasLeitura)}.
                  </div>
                </div>

                {props.escritaDisponivel && (
                  <label style={{ ...caixa, display: "flex", gap: 12, cursor: "pointer" }}>
                    <input type="checkbox" name="escrita" value="1" style={{ marginTop: 3, accentColor: "var(--liff-paprika)" }} />
                    <div style={{ fontSize: 14, lineHeight: 1.55, color: C.body }}>
                      <strong style={{ color: C.ink }}>Gravar</strong>: criar e editar atividades e oportunidades em{" "}
                      {lista(props.areasEscrita)}. Nada é excluído.
                    </div>
                  </label>
                )}

                {props.escritaNegada && (
                  <div style={{ ...caixa, fontSize: 13, lineHeight: 1.55, color: C.faint }}>
                    O aplicativo pediu para gravar, mas seu acesso é só de leitura. A conexão vai poder apenas ler.
                  </div>
                )}
              </div>

              <p style={{ fontSize: 12, lineHeight: 1.6, color: C.faint, margin: "0 0 20px" }}>
                Cada leitura e cada gravação fica registrada. Você revoga a conexão quando quiser em Conexões, no menu do LIFF tasks.
              </p>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Button type="submit" formAction={props.autorizar} variant="solid" size="lg" style={{ flex: "1 1 auto", justifyContent: "center" }}>
                  autorizar
                </Button>
                <Button
                  type="submit"
                  formAction={props.recusar}
                  variant="outline"
                  accent="var(--liff-text-faint)"
                  size="lg"
                  style={{ flex: "0 0 auto", justifyContent: "center" }}
                >
                  recusar
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
