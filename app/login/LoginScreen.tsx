"use client";

// Tela de acesso: a pessoa digita o e-mail cadastrado e entra. Sem senha, por enquanto —
// ver o aviso em app/api/auth/email/route.ts.

import { useState } from "react";
import { LiffSig, Button, Input } from "../components/ds";
import { C, MONO, eyebrow, markTone, useTheme, R } from "../components/tokens";
import ThemeToggle from "../components/ThemeToggle";

export default function LoginScreen({ erro: erroInicial, voltar }: { erro?: string; voltar: string }) {
  const [theme, trocarTema] = useTheme();
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState(erroInicial);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (entrando) return;
    setEntrando(true);
    setErro(undefined);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        // Navegação inteira, não do router: a página seguinte lê a sessão no servidor.
        window.location.assign(voltar);
        return;
      }
      const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
      setErro(corpo?.error ?? "Não foi possível entrar. Tente de novo.");
    } catch {
      setErro("Sem conexão com o servidor. Tente de novo.");
    }
    setEntrando(false);
  }

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
            Entrar
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: C.faint, margin: "0 0 28px" }}>
            Digite o e-mail cadastrado pela administração.
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

          <form onSubmit={entrar} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ ...eyebrow(10, C.faint, "0.14em") }} htmlFor="login-email">E-MAIL</label>
            <Input id="login-email" type="email" name="email" autoComplete="email" autoFocus size="lg" placeholder="voce@empresa.com" value={email} onChange={setEmail} disabled={entrando} />
            <Button type="submit" variant="solid" size="lg" disabled={entrando || !email.trim()} style={{ width: "100%", justifyContent: "center" }}>
              {entrando ? "entrando…" : "entrar"}
            </Button>
          </form>

          <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.12em", color: C.ghost }}>
              LOGIN POR E-MAIL
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
