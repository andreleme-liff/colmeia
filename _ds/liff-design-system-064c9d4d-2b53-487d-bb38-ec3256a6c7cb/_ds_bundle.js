/* @ds-bundle: {"format":4,"namespace":"LIFFDesignSystem_064c9d","components":[{"name":"LiffMark","sourcePath":"components/brand/LiffMark.jsx"},{"name":"LiffSignature","sourcePath":"components/brand/LiffSignature.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Callout","sourcePath":"components/core/Callout.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"CodeBlock","sourcePath":"components/core/CodeBlock.jsx"},{"name":"Eyebrow","sourcePath":"components/core/Eyebrow.jsx"},{"name":"SpecTable","sourcePath":"components/core/SpecTable.jsx"},{"name":"Swatch","sourcePath":"components/core/Swatch.jsx"},{"name":"DataGrid","sourcePath":"components/data/DataGrid.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"}],"sourceHashes":{"components/brand/LiffMark.jsx":"ac9ebc24ba2e","components/brand/LiffSignature.jsx":"dffebbfd3404","components/core/Badge.jsx":"9ab9ce2f695e","components/core/Button.jsx":"68963d665b02","components/core/Callout.jsx":"adbcf475d2d6","components/core/Card.jsx":"7ec6c306196a","components/core/CodeBlock.jsx":"1fbe5f2df0bc","components/core/Eyebrow.jsx":"a222821cd138","components/core/SpecTable.jsx":"416f5fdb96ad","components/core/Swatch.jsx":"ddfbc2d6168a","components/data/DataGrid.jsx":"330a85016bbf","components/forms/Checkbox.jsx":"1a7a0cee238b","components/forms/Field.jsx":"f6e57cf0ed33","components/forms/Input.jsx":"a96d648b5b27","components/forms/Select.jsx":"9c99e0e84950","components/forms/Switch.jsx":"679629bd9d65","ui_kits/app/AppShell.jsx":"087c749ec102","ui_kits/app/NormDetail.jsx":"b066ef82999e","ui_kits/web/Sidebar.jsx":"ea76e7f56c70","ui_kits/web/VerticalExplorer.jsx":"7b29bc2ef745"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.LIFFDesignSystem_064c9d = window.LIFFDesignSystem_064c9d || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/LiffMark.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * LiffMark — the monochrome LIFF wordmark (viewBox 0 0 1000 360).
 * Scaled by `height`; width auto-derives from the ratio. Never redraw the mark.
 * Color follows `tone` (floral on dark, obsidiana on light) or `currentColor`.
 */
function LiffMark({
  height = 40,
  tone = "light",
  color,
  title = "LIFF",
  style,
  ...rest
}) {
  const resolved = color || (tone === "light" ? "var(--liff-floral, #FFFCF2)" : tone === "dark" ? "var(--liff-obsidiana, #0E1014)" : "currentColor");
  const h = typeof height === "number" ? `${height}px` : height;
  return /*#__PURE__*/React.createElement("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 1000 360",
    role: "img",
    "aria-label": title,
    style: {
      height: h,
      width: "auto",
      display: "block",
      fill: resolved,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("title", null, title), /*#__PURE__*/React.createElement("path", {
    d: "M639.0,0.0 380.0,0.0 380.0,359.0 479.0,359.0 480.0,219.0 609.0,219.0 609.0,140.0 480.0,140.0 479.0,80.0 639.0,79.0Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M949.0,0.0 660.0,0.0 660.0,359.0 759.0,359.0 759.0,220.0 840.0,219.0 879.0,141.0 760.0,140.0 759.0,80.0 910.0,79.0Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M0.0,0.0 0.0,359.0 229.0,359.0 229.0,280.0 99.0,279.0 99.0,0.0Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M250.0,0.0 250.0,359.0 349.0,359.0 349.0,0.0Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M999.0,0.0 979.0,0.0 800.0,359.0 820.0,359.0Z"
  }));
}
Object.assign(__ds_scope, { LiffMark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/LiffMark.jsx", error: String((e && e.message) || e) }); }

// components/brand/LiffSignature.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * LiffSignature — LIFF wordmark + a product/vertical name.
 * Rule: the mark stays monochrome; only the name carries the product color.
 * One `size` controls the whole lockup. Name is lowercase, Rethink Sans 400.
 */
function LiffSignature({
  name = "labs",
  color = "var(--liff-labs)",
  size = 34,
  onLight = false,
  style,
  ...rest
}) {
  const markColor = onLight ? "var(--liff-obsidiana, #0E1014)" : "var(--liff-floral, #FFFCF2)";
  const s = typeof size === "number" ? `${size}px` : size;
  return /*#__PURE__*/React.createElement("span", _extends({
    "aria-label": `LIFF ${name}`,
    style: {
      display: "inline-flex",
      alignItems: "baseline",
      justifyContent: "flex-start",
      gap: 0,
      margin: 0,
      padding: 0,
      background: "transparent",
      fontFamily: '"Rethink Sans", Arial, sans-serif',
      fontSize: s,
      fontWeight: 400,
      lineHeight: 1,
      letterSpacing: "normal",
      whiteSpace: "nowrap",
      color: markColor,
      WebkitFontSmoothing: "antialiased",
      textRendering: "geometricPrecision",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 1000 360",
    "aria-hidden": "true",
    focusable: "false",
    style: {
      height: "1em",
      width: "auto",
      display: "block",
      flex: "0 0 auto",
      fill: "currentColor",
      overflow: "visible"
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M639.0,0.0 380.0,0.0 380.0,359.0 479.0,359.0 480.0,219.0 609.0,219.0 609.0,140.0 480.0,140.0 479.0,80.0 639.0,79.0Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M949.0,0.0 660.0,0.0 660.0,359.0 759.0,359.0 759.0,220.0 840.0,219.0 879.0,141.0 760.0,140.0 759.0,80.0 910.0,79.0Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M0.0,0.0 0.0,359.0 229.0,359.0 229.0,280.0 99.0,279.0 99.0,0.0Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M250.0,0.0 250.0,359.0 349.0,359.0 349.0,0.0Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M999.0,0.0 979.0,0.0 800.0,359.0 820.0,359.0Z"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      margin: 0,
      padding: 0,
      fontFamily: '"Rethink Sans", Arial, sans-serif',
      fontSize: "1.16em",
      fontWeight: 400,
      lineHeight: 1,
      letterSpacing: "-0.05em",
      whiteSpace: "nowrap",
      color
    }
  }, name));
}
Object.assign(__ds_scope, { LiffSignature });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/LiffSignature.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — mono uppercase pill with a tinted background + border.
 * Tints from `accent` (defaults to Labs teal, as on the kit site).
 */
function Badge({
  children,
  accent = "var(--liff-labs)",
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      fontFamily: 'var(--liff-font-mono, "JetBrains Mono", monospace)',
      fontSize: 12,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      padding: "6px 9px",
      borderRadius: "var(--liff-radius-pill, 999px)",
      color: accent,
      background: `color-mix(in srgb, ${accent} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${accent} 35%, transparent)`,
      lineHeight: 1,
      whiteSpace: "nowrap",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — LIFF action control. Flat, mono label, small radius.
 * `variant`: solid (Paprika action) · outline · ghost.
 * `accent` overrides the action color (e.g. a vertical/product token).
 */
function Button({
  children,
  variant = "solid",
  size = "md",
  accent = "var(--liff-paprika)",
  disabled = false,
  style,
  ...rest
}) {
  const pads = {
    sm: "7px 12px",
    md: "10px 16px",
    lg: "13px 22px"
  };
  const fonts = {
    sm: "11px",
    md: "12px",
    lg: "13px"
  };
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontFamily: 'var(--liff-font-mono, "JetBrains Mono", monospace)',
    fontSize: fonts[size],
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: pads[size],
    borderRadius: "var(--liff-radius-sm, 6px)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    border: "1px solid transparent",
    transition: "background .15s, color .15s, border-color .15s, opacity .15s",
    lineHeight: 1,
    whiteSpace: "nowrap"
  };
  const variants = {
    solid: {
      background: accent,
      color: "var(--liff-obsidiana)",
      borderColor: accent
    },
    outline: {
      background: "transparent",
      color: accent,
      borderColor: accent
    },
    ghost: {
      background: "transparent",
      color: "var(--liff-floral)",
      borderColor: "var(--liff-charcoal)"
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    disabled: disabled,
    style: {
      ...base,
      ...variants[variant],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Callout.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Callout — bordered panel with a left accent rule. `tone` sets the rule:
 * note (Paprika), dont (Error), info/success/warning map to semantic tokens.
 */
const TONES = {
  note: "var(--liff-paprika)",
  dont: "var(--liff-error)",
  info: "var(--liff-info)",
  success: "var(--liff-success)",
  warning: "var(--liff-warning)"
};
function Callout({
  children,
  tone = "note",
  title,
  style,
  ...rest
}) {
  const rule = TONES[tone] || TONES.note;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      border: "1px solid var(--liff-charcoal)",
      borderLeft: `var(--liff-accent-rule, 3px) solid ${rule}`,
      background: "var(--liff-panel)",
      padding: "22px 24px",
      color: "var(--liff-floral)",
      ...style
    }
  }, rest), title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--liff-font-mono, "JetBrains Mono", monospace)',
      fontSize: 11,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: rule,
      marginBottom: 8
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      lineHeight: 1.55,
      color: "var(--liff-body-ink)"
    }
  }, children));
}
Object.assign(__ds_scope, { Callout });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Callout.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — flat surface panel. LIFF cards are square-cornered with a 1px
 * charcoal border, no drop shadow. `tone`: cell (default) or panel (lighter).
 */
function Card({
  children,
  tone = "cell",
  padding = 24,
  style,
  ...rest
}) {
  const bg = tone === "panel" ? "var(--liff-panel)" : "var(--liff-cell)";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: bg,
      border: "1px solid var(--liff-charcoal)",
      padding: typeof padding === "number" ? `${padding}px` : padding,
      color: "var(--liff-body-ink)",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/CodeBlock.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * CodeBlock — monospaced technical block (paths, tokens, snippets) on the
 * near-black code surface with a charcoal border and 8px radius.
 */
function CodeBlock({
  children,
  label = "snippet",
  accent = "var(--liff-labs)",
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      margin: "18px 0",
      ...style
    }
  }, rest), label && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "inline-flex",
      fontFamily: 'var(--liff-font-mono, "JetBrains Mono", monospace)',
      fontSize: 12,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: accent,
      background: `color-mix(in srgb, ${accent} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${accent} 35%, transparent)`,
      borderRadius: "var(--liff-radius-pill, 999px)",
      padding: "6px 9px",
      marginBottom: 10
    }
  }, label), /*#__PURE__*/React.createElement("pre", {
    style: {
      background: "var(--liff-code-bg)",
      border: "1px solid var(--liff-charcoal)",
      borderRadius: "var(--liff-radius-md, 8px)",
      padding: 20,
      overflow: "auto",
      color: "#E8E0D2",
      font: '12px/1.55 var(--liff-font-mono, "JetBrains Mono", monospace)',
      margin: 0,
      whiteSpace: "pre"
    }
  }, /*#__PURE__*/React.createElement("code", null, children)));
}
Object.assign(__ds_scope, { CodeBlock });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/CodeBlock.jsx", error: String((e && e.message) || e) }); }

// components/core/Eyebrow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Eyebrow — the mono, uppercase, tracked kicker that opens LIFF sections.
 * Renders the "LIFF/ label" system syntax, with the slash in Paprika.
 */
function Eyebrow({
  children,
  prefix = "LIFF",
  color = "var(--liff-dust)",
  slashColor = "var(--liff-paprika)",
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      fontFamily: 'var(--liff-font-mono, "JetBrains Mono", monospace)',
      fontSize: "var(--liff-fs-eyebrow, 12px)",
      letterSpacing: "var(--liff-ls-eyebrow, 0.16em)",
      textTransform: "uppercase",
      color,
      ...style
    }
  }, rest), prefix, /*#__PURE__*/React.createElement("b", {
    style: {
      color: slashColor,
      fontWeight: 700
    }
  }, "/"), " ", children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/core/SpecTable.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * SpecTable — the LIFF specification table: mono uppercase headers on a panel
 * fill, charcoal row rules, Floral White key cells via <b>. Square-cornered.
 */
function SpecTable({
  columns = [],
  rows = [],
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("table", _extends({
    style: {
      width: "100%",
      borderCollapse: "collapse",
      border: "1px solid var(--liff-charcoal)",
      fontSize: 14,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map((c, i) => /*#__PURE__*/React.createElement("th", {
    key: i,
    style: {
      background: "var(--liff-panel)",
      color: "var(--liff-dust)",
      textAlign: "left",
      font: '11px var(--liff-font-mono, "JetBrains Mono", monospace)',
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      padding: "13px 14px",
      borderBottom: "1px solid var(--liff-charcoal)"
    }
  }, c)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, ri) => /*#__PURE__*/React.createElement("tr", {
    key: ri
  }, r.map((cell, ci) => /*#__PURE__*/React.createElement("td", {
    key: ci,
    style: {
      padding: 14,
      borderBottom: "1px solid var(--liff-charcoal)",
      verticalAlign: "top",
      color: "var(--liff-body-ink)"
    }
  }, cell))))));
}
Object.assign(__ds_scope, { SpecTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SpecTable.jsx", error: String((e && e.message) || e) }); }

// components/core/Swatch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Swatch — a color chip with name, HEX and optional role, matching the
 * palette blocks in the brand manual. Fills its grid cell; text sits bottom-left.
 */
function Swatch({
  color,
  name,
  hex,
  role,
  textColor,
  style,
  ...rest
}) {
  const ink = textColor || "var(--liff-floral)";
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: color,
      color: ink,
      minHeight: 152,
      padding: 16,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      ...style
    }
  }, rest), name && /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 15,
      fontWeight: 700
    }
  }, name), hex && /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: 'var(--liff-font-mono, "JetBrains Mono", monospace)',
      fontSize: 12,
      margin: "3px 0 8px"
    }
  }, hex), role && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      lineHeight: 1.35,
      opacity: 0.86
    }
  }, role));
}
Object.assign(__ds_scope, { Swatch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Swatch.jsx", error: String((e && e.message) || e) }); }

// components/data/DataGrid.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * DataGrid — application data table: mono uppercase headers, 1px charcoal row
 * rules, hover + selectable rows, per-column align and cell renderers.
 * `columns`: [{ key, header, width, align, render }]. `rows`: array of objects.
 */
function DataGrid({
  columns = [],
  rows = [],
  rowKey,
  selectedKey,
  onRowClick,
  accent = "var(--liff-paprika)",
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(null);
  const keyOf = (row, i) => rowKey ? row[rowKey] : i;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      border: "1px solid var(--liff-charcoal)",
      overflow: "hidden",
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      background: "var(--liff-panel)",
      color: "var(--liff-dust)",
      textAlign: c.align || "left",
      font: '11px var(--liff-font-mono, "JetBrains Mono", monospace)',
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      padding: "12px 14px",
      borderBottom: "1px solid var(--liff-charcoal)",
      width: c.width
    }
  }, c.header)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((row, i) => {
    const k = keyOf(row, i);
    const selected = selectedKey != null && k === selectedKey;
    const hovered = hover === k;
    return /*#__PURE__*/React.createElement("tr", {
      key: k,
      onMouseEnter: () => setHover(k),
      onMouseLeave: () => setHover(null),
      onClick: () => onRowClick && onRowClick(row, i),
      style: {
        cursor: onRowClick ? "pointer" : "default",
        background: selected ? `color-mix(in srgb, ${accent} 16%, transparent)` : hovered ? "var(--liff-cell)" : "transparent",
        boxShadow: selected ? `inset 3px 0 0 ${accent}` : "none",
        transition: "background .12s"
      }
    }, columns.map(c => /*#__PURE__*/React.createElement("td", {
      key: c.key,
      style: {
        padding: "12px 14px",
        borderBottom: "1px solid var(--liff-hairline, rgba(255,255,255,.08))",
        textAlign: c.align || "left",
        color: "var(--liff-body-ink)",
        verticalAlign: "middle"
      }
    }, c.render ? c.render(row[c.key], row) : row[c.key])));
  }))));
}
Object.assign(__ds_scope, { DataGrid });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataGrid.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Checkbox — square 18px control with a mono check; fills `accent` when checked.
 * Controlled via `checked`/`onChange`. Optional inline `label`.
 */
function Checkbox({
  checked = false,
  onChange,
  label,
  accent = "var(--liff-paprika)",
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 18,
      height: 18,
      flex: "none",
      border: `1px solid ${checked ? accent : "var(--liff-charcoal)"}`,
      background: checked ? accent : "transparent",
      borderRadius: "var(--liff-radius-xs, 3px)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      color: "var(--liff-obsidiana)",
      fontFamily: 'var(--liff-font-mono, monospace)',
      fontSize: 12,
      transition: "background .12s, border-color .12s"
    }
  }, checked ? "✕" : ""), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: "var(--liff-body-ink)"
    }
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Field — label + hint wrapper for form controls. Label is mono uppercase,
 * matching LIFF's technical-label treatment.
 */
function Field({
  label,
  hint,
  htmlFor,
  required,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      ...style
    }
  }, rest), label && /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      fontFamily: 'var(--liff-font-mono, "JetBrains Mono", monospace)',
      fontSize: 11,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "var(--liff-dust)"
    }
  }, label, required && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--liff-paprika)",
      marginLeft: 4
    }
  }, "*")), children, hint && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      lineHeight: 1.45,
      color: "var(--liff-text-faint, #837E74)"
    }
  }, hint));
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — single-line text field on the dark canvas. Flat, 1px charcoal
 * border, 6px radius; border turns `accent` on focus. `invalid` uses Error.
 */
function Input({
  accent = "var(--liff-paprika)",
  invalid = false,
  size = "md",
  style,
  onFocus,
  onBlur,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const pads = {
    sm: "8px 10px",
    md: "11px 13px",
    lg: "14px 16px"
  };
  const border = invalid ? "var(--liff-error)" : focus ? accent : "var(--liff-charcoal)";
  return /*#__PURE__*/React.createElement("input", _extends({
    onFocus: e => {
      setFocus(true);
      onFocus && onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      onBlur && onBlur(e);
    },
    style: {
      width: "100%",
      background: "var(--liff-code-bg, #0B0D10)",
      border: `1px solid ${border}`,
      borderRadius: "var(--liff-radius-sm, 6px)",
      color: "var(--liff-floral)",
      fontFamily: 'var(--liff-font-body, "Rethink Sans", sans-serif)',
      fontSize: 15,
      padding: pads[size],
      outline: "none",
      transition: "border-color .15s",
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Select — native dropdown styled to match Input, with a mono caret.
 * `options` is an array of strings or {value,label}.
 */
function Select({
  options = [],
  accent = "var(--liff-paprika)",
  size = "md",
  style,
  onFocus,
  onBlur,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const pads = {
    sm: "8px 30px 8px 10px",
    md: "11px 34px 11px 13px",
    lg: "14px 38px 14px 16px"
  };
  const border = focus ? accent : "var(--liff-charcoal)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      ...style
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    onFocus: e => {
      setFocus(true);
      onFocus && onFocus(e);
    },
    onBlur: e => {
      setFocus(false);
      onBlur && onBlur(e);
    },
    style: {
      width: "100%",
      appearance: "none",
      WebkitAppearance: "none",
      background: "var(--liff-code-bg, #0B0D10)",
      border: `1px solid ${border}`,
      borderRadius: "var(--liff-radius-sm, 6px)",
      color: "var(--liff-floral)",
      fontFamily: 'var(--liff-font-body, "Rethink Sans", sans-serif)',
      fontSize: 15,
      padding: pads[size],
      outline: "none",
      cursor: "pointer",
      transition: "border-color .15s"
    }
  }, rest), options.map((o, i) => {
    const value = typeof o === "string" ? o : o.value;
    const label = typeof o === "string" ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: i,
      value: value
    }, label);
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: 13,
      top: "50%",
      transform: "translateY(-50%)",
      pointerEvents: "none",
      color: "var(--liff-dust)",
      fontFamily: 'var(--liff-font-mono, monospace)',
      fontSize: 11
    }
  }, "\u25BE"));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Switch — pill toggle; track fills `accent` when on. Controlled.
 */
function Switch({
  checked = false,
  onChange,
  label,
  accent = "var(--liff-paprika)",
  disabled,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 38,
      height: 22,
      flex: "none",
      borderRadius: 999,
      background: checked ? accent : "var(--liff-charcoal)",
      border: "1px solid " + (checked ? accent : "var(--liff-charcoal)"),
      position: "relative",
      transition: "background .15s"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 2,
      left: checked ? 18 : 2,
      width: 16,
      height: 16,
      borderRadius: 999,
      background: "var(--liff-floral)",
      transition: "left .15s"
    }
  })), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      color: "var(--liff-body-ink)"
    }
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/AppShell.jsx
try { (() => {
// LIFF Regtrack — application chrome: icon rail + product signature + topbar.
// Recreates the product-app shell (distinct from the marketing site sidebar).
const {
  LiffSignature
} = window.LIFFDesignSystem_064c9d;
const RAIL = [{
  id: "monitor",
  glyph: "◎",
  label: "Monitor"
}, {
  id: "norms",
  glyph: "▤",
  label: "Normas"
}, {
  id: "impact",
  glyph: "◈",
  label: "Impacto"
}, {
  id: "agents",
  glyph: "⬡",
  label: "Agentes"
}, {
  id: "reports",
  glyph: "▥",
  label: "Relatórios"
}];
function AppShell({
  active = "norms",
  onNavigate = () => {},
  accent,
  children,
  topbar
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      height: "100vh",
      background: "var(--liff-obsidiana)",
      color: "var(--liff-body-ink)",
      fontFamily: "var(--liff-font-body)"
    }
  }, /*#__PURE__*/React.createElement("nav", {
    style: {
      width: 72,
      flex: "none",
      borderRight: "1px solid var(--liff-charcoal)",
      background: "var(--liff-code-bg)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "18px 0",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      color: accent,
      fontFamily: "var(--liff-font-mono)",
      fontWeight: 700,
      fontSize: 22,
      lineHeight: 1,
      marginBottom: 22
    }
  }, "L/"), RAIL.map(it => {
    const on = it.id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      title: it.label,
      onClick: () => onNavigate(it.id),
      style: {
        width: 44,
        height: 44,
        border: "none",
        cursor: "pointer",
        borderRadius: "var(--liff-radius-sm)",
        background: on ? "color-mix(in srgb, " + accent + " 18%, transparent)" : "transparent",
        color: on ? accent : "var(--liff-dust)",
        fontSize: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background .12s,color .12s"
      }
    }, it.glyph);
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "auto",
      width: 34,
      height: 34,
      borderRadius: 999,
      background: "var(--liff-charcoal)",
      color: "var(--liff-floral)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "var(--liff-font-mono)",
      fontSize: 12
    }
  }, "AC")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      height: 60,
      flex: "none",
      borderBottom: "1px solid var(--liff-charcoal)",
      display: "flex",
      alignItems: "center",
      gap: 20,
      padding: "0 22px",
      background: "var(--liff-panel)"
    }
  }, /*#__PURE__*/React.createElement(LiffSignature, {
    name: "regtrack",
    color: accent,
    size: 22
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 22,
      background: "var(--liff-charcoal)"
    }
  }), topbar), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      display: "flex"
    }
  }, children)));
}
window.AppShell = AppShell;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/AppShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/NormDetail.jsx
try { (() => {
// LIFF Regtrack — detail pane for a selected norm (the "detail" of master-detail).
const {
  Badge,
  Button,
  Callout,
  SpecTable,
  Switch
} = window.LIFFDesignSystem_064c9d;
function Meta({
  k,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "10px var(--liff-font-mono)",
      letterSpacing: ".14em",
      textTransform: "uppercase",
      color: "var(--liff-dust)"
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14.5,
      color: "var(--liff-floral)"
    }
  }, children));
}
function NormDetail({
  norm,
  accent,
  monitor,
  onMonitor
}) {
  if (!norm) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--liff-muted)",
        fontFamily: "var(--liff-font-mono)",
        fontSize: 13
      }
    }, "selecione uma norma");
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      overflow: "auto",
      padding: "28px 32px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 16,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    accent: norm.tone
  }, norm.status), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "11px var(--liff-font-mono)",
      letterSpacing: ".1em",
      color: "var(--liff-dust)",
      marginTop: 3
    }
  }, norm.ref)), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: "10px 0 4px",
      fontSize: 27,
      lineHeight: 1.1,
      letterSpacing: "-.02em",
      color: "var(--liff-floral)",
      fontWeight: 800
    }
  }, norm.norma), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "0 0 24px",
      fontSize: 15.5,
      lineHeight: 1.5,
      color: "var(--liff-body-ink)",
      maxWidth: "64ch"
    }
  }, norm.ementa), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: 1,
      background: "var(--liff-charcoal)",
      border: "1px solid var(--liff-charcoal)",
      marginBottom: 26
    }
  }, [["Órgão", norm.orgao], ["Esfera", norm.esfera], ["Publicação", norm.data], ["Vigência", norm.vigencia]].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      background: "var(--liff-panel)",
      padding: "16px 18px"
    }
  }, /*#__PURE__*/React.createElement(Meta, {
    k: k
  }, v)))), /*#__PURE__*/React.createElement(Callout, {
    title: "Impacto avaliado pelo agente",
    tone: "info"
  }, norm.impacto), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: "26px 0 12px",
      font: "11px var(--liff-font-mono)",
      letterSpacing: ".16em",
      textTransform: "uppercase",
      color: accent
    }
  }, "obriga\xE7\xF5es derivadas"), /*#__PURE__*/React.createElement(SpecTable, {
    columns: ["Obrigação", "Área", "Prazo"],
    rows: norm.obrigacoes
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 14,
      marginTop: 26,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    accent: accent
  }, "abrir dossi\xEA"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    accent: accent
  }, "exportar DRE impact"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: "auto"
    }
  }, /*#__PURE__*/React.createElement(Switch, {
    checked: monitor,
    onChange: onMonitor,
    label: "monitorar",
    accent: accent
  }))));
}
window.NormDetail = NormDetail;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/NormDetail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/Sidebar.jsx
try { (() => {
// LIFF Web — sidebar navigation, recreated from the manual/signature sites.
const {
  LiffMark
} = window.LIFFDesignSystem_064c9d;
function Sidebar({
  items,
  active,
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      width: 294,
      flex: "none",
      position: "sticky",
      top: 0,
      alignSelf: "flex-start",
      height: "100vh",
      borderRight: "1px solid var(--liff-charcoal)",
      background: "var(--liff-obsidiana)",
      padding: "34px 28px",
      overflow: "auto",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 150,
      color: "var(--liff-floral)"
    }
  }, /*#__PURE__*/React.createElement(LiffMark, {
    height: 40,
    tone: "light"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "11px var(--liff-font-mono)",
      letterSpacing: ".2em",
      textTransform: "uppercase",
      color: "var(--liff-dust)",
      marginTop: 18
    }
  }, "infraestrutura jur\xEDdica \xB7 1.0"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 34,
      display: "flex",
      flexDirection: "column"
    }
  }, items.map(it => {
    const on = it.id === active;
    return /*#__PURE__*/React.createElement("a", {
      key: it.id,
      href: "#" + it.id,
      onClick: e => {
        e.preventDefault();
        onNavigate(it.id);
      },
      style: {
        display: "block",
        font: "12px var(--liff-font-mono)",
        color: on ? "var(--liff-floral)" : "var(--liff-dust)",
        textDecoration: "none",
        padding: "7px 0 7px 12px",
        borderLeft: "2px solid " + (on ? "var(--liff-paprika)" : "transparent"),
        cursor: "pointer"
      }
    }, "/ ", it.label);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "auto",
      paddingTop: 24,
      borderTop: "1px solid var(--liff-charcoal)",
      font: "10px var(--liff-font-mono)",
      lineHeight: 1.5,
      color: "var(--liff-muted)"
    }
  }, "LIFF \xB7 Legal Intelligence", /*#__PURE__*/React.createElement("br", null), "for the Future"));
}
window.Sidebar = Sidebar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/VerticalExplorer.jsx
try { (() => {
// Interactive vertical explorer — pick a vertical, the product signature +
// palette + product cascade retheme live. Data straight from the brand manual.
const S = window.LIFFDesignSystem_064c9d;
const VERTICALS = {
  "law firms": {
    token: "var(--liff-law-firms)",
    core: "#344E7A",
    desc: "operação jurídica · ERP · prazos · documentos",
    tones: [["Core", "#344E7A"], ["Dark", "#17233D"], ["Mid", "#4B6B9B"], ["Light", "#E5EBF4"], ["Accent", "#8C6D3F"]],
    products: [["LIFF law-v", "#344E7A", "core"], ["LIFF Docflows", "#8C6D3F", "accent → core"], ["LIFF Deadlines", "#4B6B9B", "mid"], ["LIFF Casework", "#17233D", "dark"]],
    sig: "law firms"
  },
  corporate: {
    token: "var(--liff-corporate)",
    core: "#6B4E8A",
    desc: "governança · compliance · regulatório · contratos",
    tones: [["Core", "#6B4E8A"], ["Dark", "#2C1F3A"], ["Mid", "#8B6FA8"], ["Light", "#EEE5F7"], ["Accent", "#00A3B5"]],
    products: [["LIFF Ethicsline", "#6B4E8A", "core"], ["LIFF Compliance", "#8B6FA8", "mid"], ["LIFF Regtrack", "#00A3B5", "accent → core"], ["LIFF Risk Radar", "#2C1F3A", "dark"]],
    sig: "corporate"
  },
  tax: {
    token: "var(--liff-tax)",
    core: "#A6532F",
    desc: "tributário · custo · preço · margem · DRE",
    tones: [["Core", "#A6532F"], ["Dark", "#4A2418"], ["Mid", "#C4774C"], ["Light", "#F1D4C5"], ["Accent", "#EB5E28"]],
    products: [["LIFF Tax", "#A6532F", "core"], ["LIFF Margin", "#C4774C", "mid"], ["LIFF Scenario", "#D08A58", "derived"], ["LIFF Report", "#EB5E28", "accent → core"]],
    sig: "tax"
  },
  labs: {
    token: "var(--liff-labs)",
    core: "#00A3B5",
    desc: "IA aplicada · agentes · prototipagem · capacitação",
    tones: [["Core", "#00A3B5"], ["Dark", "#074B55"], ["Mid", "#5E7CE2"], ["Light", "#D6F4F6"], ["Accent", "#7657FF"]],
    products: [["LIFF Agents", "#00A3B5", "core"], ["LIFF Studio", "#5E7CE2", "mid"], ["LIFF Academy", "#7657FF", "accent → core"], ["LIFF Methods", "#074B55", "dark"]],
    sig: "labs"
  },
  "public sector": {
    token: "var(--liff-public-sector)",
    core: "#4F6F52",
    desc: "governo · transparência · controle",
    tones: [["Core", "#4F6F52"], ["Dark", "#243527"], ["Mid", "#809A6A"], ["Light", "#E4EDE3"], ["Accent", "#2E6F95"]],
    products: [["LIFF Govflows", "#4F6F52", "core"], ["LIFF Procurement", "#809A6A", "mid"], ["LIFF Oversight", "#B7A05A", "accent"], ["LIFF Forensics", "#2E6F95", "specialty"]],
    sig: "public sector"
  },
  social: {
    token: "var(--liff-social)",
    core: "#B85C70",
    desc: "impacto social · acesso à justiça · pro bono",
    tones: [["Core", "#B85C70"], ["Dark", "#4A202B"], ["Mid", "#D38A9A"], ["Light", "#F5DCE3"], ["Accent", "#C4875D"]],
    products: [["LIFF Access", "#B85C70", "core"], ["LIFF ProBono", "#D38A9A", "mid"], ["LIFF Communities", "#C4875D", "accent → core"], ["LIFF Clinics", "#8B6F4F", "specialty"]],
    sig: "social"
  }
};
function VerticalExplorer() {
  const keys = Object.keys(VERTICALS);
  const [sel, setSel] = React.useState("corporate");
  const v = VERTICALS[sel];
  const {
    LiffSignature,
    SpecTable
  } = S;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 22
    }
  }, keys.map(k => {
    const on = k === sel;
    return /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => setSel(k),
      style: {
        font: "12px var(--liff-font-mono)",
        letterSpacing: ".08em",
        textTransform: "uppercase",
        padding: "8px 12px",
        borderRadius: 6,
        cursor: "pointer",
        border: "1px solid " + (on ? VERTICALS[k].core : "var(--liff-charcoal)"),
        background: on ? VERTICALS[k].core : "transparent",
        color: on ? "#FFFCF2" : "var(--liff-dust)"
      }
    }, k);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 1,
      background: "var(--liff-charcoal)",
      border: "1px solid var(--liff-charcoal)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--liff-obsidiana)",
      padding: 28,
      display: "flex",
      flexDirection: "column",
      gap: 18,
      minHeight: 150,
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(LiffSignature, {
    name: v.sig,
    color: v.token,
    size: 40
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      color: "var(--liff-dust)",
      fontSize: 15,
      maxWidth: "34ch"
    }
  }, v.desc)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5,1fr)",
      background: "var(--liff-charcoal)",
      gap: 1
    }
  }, v.tones.map(([label, hex]) => /*#__PURE__*/React.createElement("div", {
    key: label,
    style: {
      background: hex,
      color: /^#[EF]/i.test(hex) ? "#0E1014" : "#FFFCF2",
      padding: 12,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      minHeight: 74
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: 12
    }
  }, label), /*#__PURE__*/React.createElement("code", {
    style: {
      font: "10px var(--liff-font-mono)",
      opacity: .9
    }
  }, hex))))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 1
    }
  }, /*#__PURE__*/React.createElement(SpecTable, {
    columns: ["Produto", "Cor", "Papel cromático"],
    rows: v.products.map(([name, hex, role]) => [/*#__PURE__*/React.createElement("b", null, name), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("i", {
      style: {
        display: "inline-block",
        width: 11,
        height: 11,
        borderRadius: 3,
        background: hex,
        marginRight: 8,
        verticalAlign: "-1px"
      }
    }), /*#__PURE__*/React.createElement("code", null, hex)), /*#__PURE__*/React.createElement("em", {
      style: {
        font: "10px var(--liff-font-mono)",
        fontStyle: "normal",
        textTransform: "uppercase",
        letterSpacing: ".08em",
        color: "#B8B0A3"
      }
    }, role)])
  })));
}
window.VerticalExplorer = VerticalExplorer;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/VerticalExplorer.jsx", error: String((e && e.message) || e) }); }

__ds_ns.LiffMark = __ds_scope.LiffMark;

__ds_ns.LiffSignature = __ds_scope.LiffSignature;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Callout = __ds_scope.Callout;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CodeBlock = __ds_scope.CodeBlock;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.SpecTable = __ds_scope.SpecTable;

__ds_ns.Swatch = __ds_scope.Swatch;

__ds_ns.DataGrid = __ds_scope.DataGrid;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

})();
