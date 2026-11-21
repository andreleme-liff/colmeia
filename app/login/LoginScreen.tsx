"use client";

// Tela de acesso. No protótipo estático era uma lista de perfis para escolher; agora é o
// SSO Google de verdade, restrito ao domínio — a lista some porque quem você é passa a ser
// definido pelo Google, não por um clique.

import { LiffSig, Button } from "../components/ds";
import { C, MONO, eyebrow, markTone, useTheme, R } from "../components/tokens";
import ThemeToggle from "../components/ThemeToggle";

export default function LoginScreen({ erro }: { erro?: string }) {
  const [theme, trocarTema] = useTheme();

  return (
    <div className="liff-login">
      <div className="liff-login__pitch">
        <LiffSig name="colméia" size={34} tone={markTone(theme)} />
        <div>
          <div style={{ ...eyebrow(12, C.accent), marginBottom: 24 }}>GESTÃO ORGANIZACIONAL</div>
          <h1
            style={{
              fontSize: 52,
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              fontWeight: 800,
              color: C.ink,
              margin: "0 0 20px",
              maxWidth: "15ch",
              textWrap: "pretty",
            }}
          >
            Toda a operação em um único sistema.
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.62, color: C.body, margin: 0, maxWidth: "46ch" }}>
            Atividade comercial, execução operacional, cadastros e administração — organizados por produto, com permissão
            por usuário e log de alterações em tudo.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["CRM", "KANBAN", "AUDITORIA", "PERMISSÕES"].map((t, i) => (
            <span key={t} style={{ display: "contents" }}>
              {i > 0 && <span style={{ color: C.ghost }}>/</span>}
              <span style={eyebrow(11, C.faint, "0.14em")}>{t}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="liff-login__panel">
        <div style={{ width: "100%", maxWidth: 420, background: C.panel, border: `1px solid ${C.line}`, borderRadius: R, padding: 36 }}>
          <div style={{ ...eyebrow(11, C.faint), marginBottom: 8 }}>ACESSO</div>
          <h2 style={{ fontSize: 26, letterSpacing: "-0.02em", fontWeight: 800, color: C.ink, margin: "0 0 6px" }}>
            Entrar com Google
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: C.faint, margin: "0 0 28px" }}>
            Acesso só para contas Google cadastradas pela administração.
          </p>

          {erro && (
            <div
              style={{
                border: `1px solid ${C.error}`, borderRadius: R,
                background: "color-mix(in srgb, var(--liff-error) 10%, transparent)",
                color: C.error,
                fontFamily: MONO,
                fontSize: 12,
                lineHeight: 1.6,
                padding: "12px 14px",
                marginBottom: 20,
              }}
            >
              {erro}
            </div>
          )}

          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- não é página: é o
            route handler que inicia o OAuth, e precisa de navegação do navegador, não do
            router. O catch-all `[[...rota]]` faz a regra achar que todo caminho é página. */}
        <a href="/api/auth/google/start" style={{ display: "block" }}>
            <Button variant="solid" size="lg" style={{ width: "100%", justifyContent: "center" }}>
              entrar com google
            </Button>
          </a>

          <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", color: C.ghost }}>
              LOGIN COM GOOGLE
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", color: C.faint }}>
              / acesso por convite
            </span>
          </div>

          <div style={{ marginTop: 22, borderTop: `1px solid ${C.line}`, paddingTop: 18 }}>
            <div style={{ ...eyebrow(10, C.faint, "0.14em"), marginBottom: 9 }}>FUNDO</div>
            <ThemeToggle theme={theme} onChange={trocarTema} />
          </div>
        </div>
      </div>
    </div>
  );
}
