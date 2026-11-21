"use client";

// Componentes de interface da Colméia: botão, campos, seletor, interruptor e a assinatura
// do produto. Os tokens CSS (cores, tipografia, espaçamento) vêm de `_ds/design-system/tokens`,
// importados em globals.css.

import { useState, type CSSProperties, type ReactNode } from "react";

const MONO = 'var(--col-font-mono, "Roboto Mono", monospace)';
const SANS = 'var(--col-font-body, "Rethink Sans", sans-serif)';
const R = "var(--col-radius-sm)";

/* ---------------------------------------------------------------
   Assinatura — o nome do produto como marca: Rethink Sans 800, minúsculas, tracking
   -0.05em. `size` controla a altura; a cor entra pelo `nameColor`.
   --------------------------------------------------------------- */
export function Assinatura({
  name,
  size = 24,
  tone = "light",
  nameColor = "var(--col-paprika, #EB5E28)",
  style,
}: {
  name: string;
  size?: number;
  tone?: "light" | "dark" | "current";
  nameColor?: string;
  style?: CSSProperties;
}) {
  const cor = tone === "light" ? "var(--col-floral, #FFFCF2)" : tone === "dark" ? "var(--col-obsidiana, #0E1014)" : "currentColor";
  return (
    <span
      role="img"
      aria-label={name}
      style={{ display: "inline-flex", alignItems: "baseline", fontSize: size, lineHeight: 1, color: cor, fontFamily: SANS, whiteSpace: "nowrap", ...style }}
    >
      <span aria-hidden="true" style={{ fontSize: "1.16em", fontWeight: 800, letterSpacing: "-0.05em", marginLeft: 0, color: nameColor }}>
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
  accent = "var(--col-paprika)",
  disabled = false,
  style,
  onClick,
  title,
  type = "button",
  formAction,
}: {
  children: ReactNode;
  variant?: "solid" | "outline" | "ghost";
  /** `sm` e `md` têm 34px, a altura dos seletores e da busca. `xs` é o botão de dentro de
   *  linha de tabela, que não pode engordar a linha. `lg` é o das telas de entrada. */
  size?: "xs" | "sm" | "md" | "lg";
  accent?: string;
  disabled?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
  title?: string;
  /** `submit` para enviar um formulário — ex.: a tela de consentimento, que é uma Server Action. */
  type?: "button" | "submit";
  formAction?: (form: FormData) => void | Promise<void>;
}) {
  const pads = { xs: "7px 12px", sm: "0 14px", md: "0 16px", lg: "13px 22px" };
  const fonts = { xs: "11px", sm: "11px", md: "12px", lg: "13px" };
  const altura: CSSProperties = size === "sm" || size === "md" ? { height: 34, boxSizing: "border-box" } : {};
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: MONO,
    fontSize: fonts[size],
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: pads[size],
    ...altura,
    borderRadius: R,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    border: "1px solid transparent",
    transition: "background .15s, color .15s, border-color .15s, opacity .15s",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
  const variants: Record<string, CSSProperties> = {
    solid: { background: accent, color: "var(--col-app-on-accent, var(--col-obsidiana))", borderColor: accent },
    outline: { background: "transparent", color: accent, borderColor: accent },
    ghost: { background: "transparent", color: "var(--col-floral)", borderColor: "var(--col-charcoal)" },
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
            color: "var(--col-dust)",
          }}
        >
          {label}
          {required && <span style={{ color: "var(--col-paprika)", marginLeft: 4 }}>*</span>}
        </label>
      )}
      {children}
      {hint && <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--col-text-faint, #837E74)" }}>{hint}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------
   Input — campo de uma linha. Borda vira `accent` no foco.
   --------------------------------------------------------------- */
export function Input({
  accent = "var(--col-paprika)",
  invalid = false,
  size = "md",
  style,
  placeholder,
  value,
  onChange,
  disabled,
  id,
  type = "text",
  name,
  autoComplete,
  autoFocus,
}: {
  accent?: string;
  invalid?: boolean;
  size?: "sm" | "md" | "lg";
  style?: CSSProperties;
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  id?: string;
  type?: "text" | "email";
  name?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const pads = { sm: "8px 10px", md: "11px 13px", lg: "14px 16px" };
  const border = invalid ? "var(--col-error)" : focus ? accent : "var(--col-charcoal)";
  return (
    <input
      id={id}
      type={type}
      name={name}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        width: "100%",
        background: "var(--col-code-bg, #0B0D10)",
        border: `1px solid ${border}`,
        borderRadius: R,
        color: "var(--col-floral)",
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
  accent = "var(--col-paprika)",
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
  const border = focus ? accent : "var(--col-charcoal)";
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
          background: "var(--col-code-bg, #0B0D10)",
          border: `1px solid ${border}`,
          borderRadius: R,
          color: "var(--col-floral)",
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
          color: "var(--col-dust)",
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
  accent = "var(--col-paprika)",
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
          background: checked ? accent : "var(--col-charcoal)",
          border: "1px solid " + (checked ? accent : "var(--col-charcoal)"),
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
            background: "var(--col-floral)",
            transition: "left .15s",
          }}
        />
      </span>
      {label && <span style={{ fontSize: 15, color: "var(--col-body-ink)" }}>{label}</span>}
    </label>
  );
}
