"use client";

// Componentes do design system LIFF.
//
// O kit publica `_ds_bundle.js`, um IIFE que pendura os componentes em
// `window.LIFFDesignSystem_064c9d` e depende de um React global — o que não existe num build
// de módulos. Os seis componentes usados por este app estão transcritos aqui 1:1 a partir
// daquele bundle: mesmas props, mesmos valores, mesmos tokens. O bundle original segue no
// repositório, em `_ds/`, como referência para conferir divergências.
//
// Os tokens CSS continuam sendo consumidos direto do kit, sem cópia (ver globals.css).

import { useState, type CSSProperties, type ReactNode } from "react";

const MONO = 'var(--liff-font-mono, "JetBrains Mono", monospace)';
const SANS = 'var(--liff-font-body, "Rethink Sans", sans-serif)';
const R = "var(--liff-radius-sm)";

/* ---------------------------------------------------------------
   LiffMark — wordmark monocromático (viewBox 0 0 1000 360).
   Escala por `height`; a largura deriva da proporção. Nunca redesenhar.
   --------------------------------------------------------------- */
export function LiffMark({
  height = 40,
  tone = "light",
  color,
  title = "LIFF",
  style,
}: {
  height?: number | string;
  tone?: "light" | "dark" | "current";
  color?: string;
  title?: string;
  style?: CSSProperties;
}) {
  const resolved =
    color ||
    (tone === "light"
      ? "var(--liff-floral, #FFFCF2)"
      : tone === "dark"
        ? "var(--liff-obsidiana, #0E1014)"
        : "currentColor");
  const h = typeof height === "number" ? `${height}px` : height;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1000 360"
      role="img"
      aria-label={title}
      style={{ height: h, width: "auto", display: "block", fill: resolved, ...style }}
    >
      <title>{title}</title>
      <path d="M639.0,0.0 380.0,0.0 380.0,359.0 479.0,359.0 480.0,219.0 609.0,219.0 609.0,140.0 480.0,140.0 479.0,80.0 639.0,79.0Z" />
      <path d="M949.0,0.0 660.0,0.0 660.0,359.0 759.0,359.0 759.0,220.0 840.0,219.0 879.0,141.0 760.0,140.0 759.0,80.0 910.0,79.0Z" />
      <path d="M0.0,0.0 0.0,359.0 229.0,359.0 229.0,280.0 99.0,279.0 99.0,0.0Z" />
      <path d="M250.0,0.0 250.0,359.0 349.0,359.0 349.0,0.0Z" />
      <path d="M999.0,0.0 979.0,0.0 800.0,359.0 820.0,359.0Z" />
    </svg>
  );
}

/* ---------------------------------------------------------------
   LiffSig — assinatura de produto, como no Manual de Marca (seção "assinatura"):
   o LIFF/ monocromático seguido do nome do produto em Rethink Sans 400, minúsculas, 1.16em,
   tracking -0.05em, alinhado pela linha de base. `size` é a altura do LIFF/ e controla tudo.
   A cor entra só no nome. Este sistema ("go") não é produto do portfólio e não tem cor
   própria no manual: usa a Spicy Paprika, que é a cor de assinatura da marca-mãe.
   --------------------------------------------------------------- */
export function LiffSig({
  name,
  size = 24,
  tone = "light",
  nameColor = "var(--liff-paprika, #EB5E28)",
  style,
}: {
  name: string;
  size?: number;
  tone?: "light" | "dark" | "current";
  nameColor?: string;
  style?: CSSProperties;
}) {
  const cor = tone === "light" ? "var(--liff-floral, #FFFCF2)" : tone === "dark" ? "var(--liff-obsidiana, #0E1014)" : "currentColor";
  return (
    <span
      role="img"
      aria-label={`LIFF ${name}`}
      style={{ display: "inline-flex", alignItems: "baseline", fontSize: size, lineHeight: 1, color: cor, fontFamily: SANS, whiteSpace: "nowrap", ...style }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 360" aria-hidden="true" style={{ height: "1em", width: "auto", flex: "none", fill: "currentColor" }}>
        <path d="M639.0,0.0 380.0,0.0 380.0,359.0 479.0,359.0 480.0,219.0 609.0,219.0 609.0,140.0 480.0,140.0 479.0,80.0 639.0,79.0Z" />
        <path d="M949.0,0.0 660.0,0.0 660.0,359.0 759.0,359.0 759.0,220.0 840.0,219.0 879.0,141.0 760.0,140.0 759.0,80.0 910.0,79.0Z" />
        <path d="M0.0,0.0 0.0,359.0 229.0,359.0 229.0,280.0 99.0,279.0 99.0,0.0Z" />
        <path d="M250.0,0.0 250.0,359.0 349.0,359.0 349.0,0.0Z" />
        <path d="M999.0,0.0 979.0,0.0 800.0,359.0 820.0,359.0Z" />
      </svg>
      <span aria-hidden="true" style={{ fontSize: "1.16em", fontWeight: 400, letterSpacing: "-0.05em", marginLeft: 0, color: nameColor }}>
        {name}
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------
   Button — controle de ação. Chapado, rótulo mono, raio pequeno.
   --------------------------------------------------------------- */
export function Button({
  children,
  variant = "solid",
  size = "md",
  accent = "var(--liff-paprika)",
  disabled = false,
  style,
  onClick,
  title,
  type = "button",
  formAction,
}: {
  children: ReactNode;
  variant?: "solid" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  accent?: string;
  disabled?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
  title?: string;
  /** `submit` para enviar um formulário — ex.: a tela de consentimento, que é uma Server Action. */
  type?: "button" | "submit";
  formAction?: (form: FormData) => void | Promise<void>;
}) {
  const pads = { sm: "7px 12px", md: "10px 16px", lg: "13px 22px" };
  const fonts = { sm: "11px", md: "12px", lg: "13px" };
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: MONO,
    fontSize: fonts[size],
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: pads[size],
    borderRadius: R,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    border: "1px solid transparent",
    transition: "background .15s, color .15s, border-color .15s, opacity .15s",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
  const variants: Record<string, CSSProperties> = {
    solid: { background: accent, color: "var(--liff-app-on-accent, var(--liff-obsidiana))", borderColor: accent },
    outline: { background: "transparent", color: accent, borderColor: accent },
    ghost: { background: "transparent", color: "var(--liff-floral)", borderColor: "var(--liff-charcoal)" },
  };
  return (
    <button
      type={type}
      formAction={formAction}
      disabled={disabled}
      onClick={onClick}
      title={title}
      style={{ ...base, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------
   Field — rótulo mono em caixa alta + dica, envolvendo um controle.
   --------------------------------------------------------------- */
export function Field({
  label,
  hint,
  htmlFor,
  required,
  children,
  style,
}: {
  label?: string;
  hint?: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
      {label && (
        <label
          htmlFor={htmlFor}
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--liff-dust)",
          }}
        >
          {label}
          {required && <span style={{ color: "var(--liff-paprika)", marginLeft: 4 }}>*</span>}
        </label>
      )}
      {children}
      {hint && <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--liff-text-faint, #837E74)" }}>{hint}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------
   Input — campo de uma linha. Borda vira `accent` no foco.
   --------------------------------------------------------------- */
export function Input({
  accent = "var(--liff-paprika)",
  invalid = false,
  size = "md",
  style,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  accent?: string;
  invalid?: boolean;
  size?: "sm" | "md" | "lg";
  style?: CSSProperties;
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const pads = { sm: "8px 10px", md: "11px 13px", lg: "14px 16px" };
  const border = invalid ? "var(--liff-error)" : focus ? accent : "var(--liff-charcoal)";
  return (
    <input
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        width: "100%",
        background: "var(--liff-code-bg, #0B0D10)",
        border: `1px solid ${border}`,
        borderRadius: R,
        color: "var(--liff-floral)",
        fontFamily: SANS,
        fontSize: 15,
        padding: pads[size],
        outline: "none",
        transition: "border-color .15s",
        ...style,
      }}
    />
  );
}

/* ---------------------------------------------------------------
   Select — dropdown nativo com a mesma casca do Input e caret mono.
   --------------------------------------------------------------- */
export function Select({
  options = [],
  accent = "var(--liff-paprika)",
  size = "md",
  style,
  value,
  onChange,
  disabled,
}: {
  options?: (string | { value: string; label: string })[];
  accent?: string;
  size?: "sm" | "md" | "lg";
  style?: CSSProperties;
  value?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const pads = { sm: "8px 30px 8px 10px", md: "11px 34px 11px 13px", lg: "14px 38px 14px 16px" };
  const border = focus ? accent : "var(--liff-charcoal)";
  return (
    <div style={{ position: "relative", ...style }}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%",
          appearance: "none",
          WebkitAppearance: "none",
          background: "var(--liff-code-bg, #0B0D10)",
          border: `1px solid ${border}`,
          borderRadius: R,
          color: "var(--liff-floral)",
          fontFamily: SANS,
          fontSize: 15,
          padding: pads[size],
          outline: "none",
          cursor: "pointer",
          transition: "border-color .15s",
        }}
      >
        {options.map((o, i) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return (
            <option key={i} value={v}>
              {l}
            </option>
          );
        })}
      </select>
      <span
        style={{
          position: "absolute",
          right: 13,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: "var(--liff-dust)",
          fontFamily: MONO,
          fontSize: 11,
        }}
      >
        ▾
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------
   Switch — pílula controlada; a trilha preenche com `accent` quando ligada.
   --------------------------------------------------------------- */
export function Switch({
  checked = false,
  onChange,
  label,
  accent = "var(--liff-paprika)",
  disabled,
  style,
  title,
}: {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
  accent?: string;
  disabled?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <label
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <span
        onClick={() => !disabled && onChange?.(!checked)}
        style={{
          width: 38,
          height: 22,
          flex: "none",
          borderRadius: 999,
          background: checked ? accent : "var(--liff-charcoal)",
          border: "1px solid " + (checked ? accent : "var(--liff-charcoal)"),
          position: "relative",
          transition: "background .15s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: "var(--liff-floral)",
            transition: "left .15s",
          }}
        />
      </span>
      {label && <span style={{ fontSize: 15, color: "var(--liff-body-ink)" }}>{label}</span>}
    </label>
  );
}
