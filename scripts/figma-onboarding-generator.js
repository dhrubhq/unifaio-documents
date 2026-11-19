/**
 * Unifaio Customer Onboarding: Figma generator (desktop 1280)
 * Spec: docs/02-customer-features/19-customer-onboarding.md, docs/01-architecture/design-system.md
 *
 * Visual language: shadcn/ui (zinc neutrals, green primary, 8px radius, 40px controls,
 * Lucide icons, Inter). Every frame is built with Auto Layout (hug height, fill width, wrapping text)
 * so nothing overflows or clips.
 *
 * Run: Figma > Plugins > Development > Open Console (or Scripter), paste, run.
 * Output: a NEW page "Onboarding (Web 1280)" with one frame per screen, named
 *   `ONB-S4A / default / web-1280` (screen id / state / viewport) to match the spec.
 * It also creates a "Unifaio/tokens" variable collection (shadcn semantic names) as the token contract.
 * Old pages are not touched; delete the previous broken page after reviewing.
 */

(async () => {
  // ---------------------------------------------------------------- fonts
  const WEIGHTS = ["Regular", "Medium", "Semi Bold", "Bold"];
  for (const style of WEIGHTS) await figma.loadFontAsync({ family: "Inter", style });

  // ---------------------------------------------------------------- tokens (shadcn semantic, zinc + green)
  const hex = (h) => {
    const n = parseInt(h.replace("#", ""), 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  };
  const TOK = {
    background: "#FFFFFF",
    canvas: "#FAFAFA",
    foreground: "#09090B",
    card: "#FFFFFF",
    muted: "#F4F4F5",
    mutedForeground: "#71717A",
    border: "#E4E4E7",
    input: "#E4E4E7",
    primary: "#16A34A",
    primaryForeground: "#FFFFFF",
    primarySoft: "#F0FDF4",
    primaryDark: "#052E16",
    secondary: "#F4F4F5",
    secondaryForeground: "#18181B",
    destructive: "#DC2626",
    destructiveSoft: "#FEF2F2",
    warning: "#B45309",
    warningSoft: "#FFFBEB",
    info: "#2563EB",
    infoSoft: "#EFF6FF",
  };
  const C = TOK;

  try {
    const col = figma.variables.createVariableCollection("Unifaio/tokens");
    const mode = col.modes[0].modeId;
    col.renameMode(mode, "light");
    for (const [name, value] of Object.entries(TOK)) {
      const v = figma.variables.createVariable(name, col, "COLOR");
      v.setValueForMode(mode, hex(value));
    }
  } catch (e) {
    console.log("Variables not created (non-fatal):", e.message);
  }

  // ---------------------------------------------------------------- primitives
  const paint = (c) => ({ type: "SOLID", color: hex(c) });

  function F(name, o = {}) {
    const f = figma.createFrame();
    f.name = name;
    f.fills = o.fill ? [paint(o.fill)] : [];
    f.layoutMode = o.dir === "H" ? "HORIZONTAL" : "VERTICAL";
    f.itemSpacing = o.gap || 0;
    const p = o.pad || [0, 0, 0, 0];
    f.paddingTop = p[0]; f.paddingRight = p[1]; f.paddingBottom = p[2]; f.paddingLeft = p[3];
    f.primaryAxisAlignItems = o.justify || "MIN";
    f.counterAxisAlignItems = o.align || "MIN";
    f.clipsContent = !!o.clip;
    if (o.radius != null) f.cornerRadius = o.radius;
    if (o.stroke) {
      f.strokes = [paint(o.stroke)];
      f.strokeWeight = o.strokeW || 1;
      f.strokeAlign = "INSIDE";
      if (o.strokeSides) {
        const s = o.strokeSides;
        f.strokeTopWeight = s.includes("t") ? (o.strokeW || 1) : 0;
        f.strokeRightWeight = s.includes("r") ? (o.strokeW || 1) : 0;
        f.strokeBottomWeight = s.includes("b") ? (o.strokeW || 1) : 0;
        f.strokeLeftWeight = s.includes("l") ? (o.strokeW || 1) : 0;
      }
    }
    if (o.shadow) {
      f.effects = [{
        type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.06 }, offset: { x: 0, y: 1 },
        radius: 3, spread: 0, visible: true, blendMode: "NORMAL",
      }];
    }
    // sizing: hug by default; fixed width / height when given
    f.resize(o.w || 10, o.h || 10);
    if (f.layoutMode === "VERTICAL") {
      f.counterAxisSizingMode = o.w ? "FIXED" : "AUTO";
      f.primaryAxisSizingMode = o.h ? "FIXED" : "AUTO";
    } else {
      f.primaryAxisSizingMode = o.w ? "FIXED" : "AUTO";
      f.counterAxisSizingMode = o.h ? "FIXED" : "AUTO";
    }
    if (o.opacity != null) f.opacity = o.opacity;
    return f;
  }

  // append + sizing helpers. fill = stretch horizontally, fillV = stretch vertically
  function add(parent, child, o = {}) {
    parent.appendChild(child);
    if (o.fill) {
      child.layoutSizingHorizontal = "FILL";
      if (child.type === "TEXT") child.textAutoResize = "HEIGHT";
    }
    if (o.fillV) child.layoutSizingVertical = "FILL";
    return child;
  }

  function T(parent, str, o = {}) {
    const t = figma.createText();
    t.fontName = { family: "Inter", style: o.weight || "Regular" };
    t.fontSize = o.size || 14;
    t.characters = String(str);
    t.fills = [paint(o.color || C.foreground)];
    const lh = o.lh || Math.round((o.size || 14) * 1.5);
    t.lineHeight = { unit: "PIXELS", value: lh };
    if (o.letter != null) t.letterSpacing = { unit: "PERCENT", value: o.letter };
    if (o.align) t.textAlignHorizontal = o.align;
    if (o.upper) t.textCase = "UPPER";
    parent.appendChild(t);
    if (!o.hug) {
      t.layoutSizingHorizontal = "FILL";
      t.textAutoResize = "HEIGHT";
    }
    return t;
  }

  // ---------------------------------------------------------------- Lucide icons (stroke svg)
  const ICON = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    store: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    circleCheck: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  };
  function icon(parent, name, size = 16, color = C.foreground) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;
    const n = figma.createNodeFromSvg(svg);
    n.name = `icon/${name}`;
    n.resize(size, size);
    parent.appendChild(n);
    return n;
  }

  // ---------------------------------------------------------------- shadcn components
  // Button: variant default | outline | secondary | ghost | link ; size default(40) | sm(36)
  function Button(parent, label, o = {}) {
    const v = o.variant || "default";
    const h = o.size === "sm" ? 36 : 40;
    const fg = v === "default" ? C.primaryForeground : v === "link" ? C.primary : v === "ghost" ? C.mutedForeground : C.secondaryForeground;
    const b = F(`Button/${v}`, {
      dir: "H", gap: 8, justify: "CENTER", align: "CENTER", pad: [0, v === "link" ? 0 : 16, 0, v === "link" ? 0 : 16], h,
      radius: 6,
      fill: v === "default" ? C.primary : v === "secondary" ? C.secondary : v === "outline" ? C.background : null,
      stroke: v === "outline" ? C.input : null,
      shadow: v === "default" || v === "outline",
      opacity: o.disabled ? 0.5 : 1,
    });
    if (o.icon && !o.iconRight) icon(b, o.icon, 16, fg);
    T(b, label, { size: 14, weight: "Medium", color: fg, hug: true, lh: 20 });
    if (o.icon && o.iconRight) icon(b, o.icon, 16, fg);
    add(parent, b, { fill: !!o.full });
    return b;
  }

  // Badge: default | secondary | outline | success | warning | destructive
  function Badge(parent, label, variant = "secondary") {
    const map = {
      default: [C.primary, C.primaryForeground, null],
      secondary: [C.secondary, C.secondaryForeground, null],
      outline: [null, C.foreground, C.border],
      success: [C.primarySoft, C.primary, "#BBF7D0"],
      warning: [C.warningSoft, C.warning, "#FDE68A"],
      destructive: [C.destructiveSoft, C.destructive, "#FECACA"],
    };
    const [bg, fg, st] = map[variant];
    const b = F(`Badge/${variant}`, { dir: "H", justify: "CENTER", align: "CENTER", pad: [2, 10, 2, 10], radius: 6, fill: bg, stroke: st });
    T(b, label, { size: 12, weight: "Semi Bold", color: fg, hug: true, lh: 16 });
    add(parent, b);
    return b;
  }

  function Separator(parent) {
    const s = F("Separator", { fill: C.border, w: 10, h: 1 });
    parent.appendChild(s);
    s.layoutSizingHorizontal = "FILL";
    return s;
  }

  // Field shell used by Input / Select / Textarea
  function Field(parent, label, o = {}) {
    const g = F(`Field/${label || "field"}`, { gap: 6 });
    if (label) {
      const lr = F("label-row", { dir: "H", gap: 6, align: "CENTER" });
      T(lr, label, { size: 14, weight: "Medium", hug: true, lh: 14 });
      if (o.optional) T(lr, "Optional", { size: 12, color: C.mutedForeground, hug: true, lh: 14 });
      add(g, lr, { fill: true });
    }
    const err = o.error;
    const box = F("input", {
      dir: "H", gap: 8, align: o.multiline ? "MIN" : "CENTER", h: o.multiline ? 88 : 40,
      pad: o.multiline ? [8, 12, 8, 12] : [0, 12, 0, 12], radius: 6, fill: C.background,
      stroke: err ? C.destructive : C.input, shadow: true,
    });
    if (o.prefix) {
      const pf = F("prefix", { dir: "H", gap: 6, align: "CENTER", pad: [0, 10, 0, 0], stroke: C.border, strokeSides: "r" });
      T(pf, o.prefix, { size: 14, color: C.mutedForeground, hug: true, lh: 20 });
      add(box, pf);
    }
    if (o.leadIcon) icon(box, o.leadIcon, 16, C.mutedForeground);
    T(box, o.value || o.placeholder || " ", { size: 14, color: o.value ? C.foreground : C.mutedForeground, lh: 20 });
    if (o.select) icon(box, "chevron", 16, C.mutedForeground);
    add(g, box, { fill: true });
    if (o.help || err) T(g, err || o.help, { size: 12, color: err ? C.destructive : C.mutedForeground, lh: 16 });
    add(parent, g, { fill: true });
    return g;
  }
  const Input = (p, l, o = {}) => Field(p, l, o);
  const Select = (p, l, o = {}) => Field(p, l, { ...o, select: true });
  const Textarea = (p, l, o = {}) => Field(p, l, { ...o, multiline: true });

  // two fields side by side, equal width
  function Row2(parent, a, b) {
    const r = F("row", { dir: "H", gap: 16 });
    add(parent, r, { fill: true });
    a(r);
    b(r);
    return r;
  }

  function Checkbox(parent, checked) {
    const c = F("Checkbox", { dir: "H", justify: "CENTER", align: "CENTER", w: 16, h: 16, radius: 4, fill: checked ? C.primary : C.background, stroke: checked ? C.primary : C.input });
    if (checked) icon(c, "check", 12, C.primaryForeground);
    parent.appendChild(c);
    return c;
  }

  function Switch(parent, on) {
    const s = F("Switch", { dir: "H", w: 36, h: 20, radius: 10, pad: [2, 2, 2, 2], align: "CENTER", justify: on ? "MAX" : "MIN", fill: on ? C.primary : C.input });
    s.appendChild(F("thumb", { w: 16, h: 16, radius: 8, fill: "#FFFFFF" }));
    parent.appendChild(s);
    return s;
  }

  function Progress(parent, pct, label) {
    const g = F("Progress", { gap: 8 });
    if (label) T(g, label, { size: 13, weight: "Medium", lh: 18 });
    const bar = F("track", { dir: "H", h: 8, radius: 4, fill: C.secondary });
    add(g, bar, { fill: true });
    const fill = F("indicator", { w: 10, h: 8, radius: 4, fill: C.primary });
    bar.appendChild(fill);
    fill.layoutPositioning = "ABSOLUTE";
    fill.x = 0; fill.y = 0;
    fill.resize(Math.max(8, Math.round(520 * pct)), 8);
    add(parent, g, { fill: true });
    return g;
  }

  // Alert: default | success | warning | destructive | info
  function Alert(parent, title, desc, variant = "default", ic = "alert") {
    const map = {
      default: [C.muted, C.border, C.foreground],
      success: [C.primarySoft, "#BBF7D0", C.primary],
      warning: [C.warningSoft, "#FDE68A", C.warning],
      destructive: [C.destructiveSoft, "#FECACA", C.destructive],
      info: [C.infoSoft, "#BFDBFE", C.info],
    };
    const [bg, st, fg] = map[variant];
    const a = F(`Alert/${variant}`, { dir: "H", gap: 12, pad: [12, 16, 12, 16], radius: 8, fill: bg, stroke: st });
    icon(a, ic, 16, fg);
    const col = F("text", { gap: 2 });
    T(col, title, { size: 14, weight: "Medium", color: fg, lh: 20 });
    if (desc) T(col, desc, { size: 13, color: variant === "default" ? C.mutedForeground : fg, lh: 18 });
    add(a, col, { fill: true });
    add(parent, a, { fill: true });
    return a;
  }

  // Segmented Tabs (shadcn Tabs)
  function Tabs(parent, items, activeIdx = 0) {
    const list = F("TabsList", { dir: "H", gap: 2, pad: [4, 4, 4, 4], radius: 8, fill: C.muted, h: 44, align: "CENTER" });
    add(parent, list, { fill: true });
    items.forEach((label, i) => {
      const on = i === activeIdx;
      const tr = F(`Tab/${label}`, { dir: "H", justify: "CENTER", align: "CENTER", pad: [0, 12, 0, 12], h: 36, radius: 6, fill: on ? C.background : null, shadow: on });
      T(tr, label, { size: 14, weight: "Medium", color: on ? C.foreground : C.mutedForeground, hug: true, lh: 20 });
      list.appendChild(tr);
      tr.layoutGrow = 1;
    });
    return list;
  }

  // Choice card with checkbox (S3 sales modes, import options)
  function ChoiceCard(parent, ic, title, desc, checked) {
    const c = F(`ChoiceCard/${title}`, {
      dir: "H", gap: 12, align: "CENTER", pad: [14, 16, 14, 16], radius: 8,
      fill: checked ? C.primarySoft : C.background, stroke: checked ? C.primary : C.border,
    });
    const tile = F("icon-tile", { dir: "H", justify: "CENTER", align: "CENTER", w: 36, h: 36, radius: 8, fill: checked ? C.background : C.muted });
    icon(tile, ic, 18, checked ? C.primary : C.mutedForeground);
    c.appendChild(tile);
    const col = F("text", { gap: 2 });
    T(col, title, { size: 14, weight: "Medium", lh: 20 });
    T(col, desc, { size: 13, color: C.mutedForeground, lh: 18 });
    add(c, col, { fill: true });
    Checkbox(c, checked);
    add(parent, c, { fill: true });
    return c;
  }

  // ConnectionCard (S4 hub). state: default | recommended | connected | soon
  function ConnectionCard(parent, ic, title, desc, action, state = "default", tag) {
    const rec = state === "recommended", con = state === "connected", soon = state === "soon";
    const c = F(`ConnectionCard/${title}`, {
      dir: "H", gap: 16, align: "CENTER", pad: [16, 16, 16, 16], radius: 8,
      fill: rec ? C.primarySoft : C.background, stroke: rec || con ? C.primary : C.border, opacity: soon ? 0.85 : 1,
    });
    const tile = F("icon-tile", { dir: "H", justify: "CENTER", align: "CENTER", w: 40, h: 40, radius: 8, fill: rec || con ? C.background : C.muted });
    icon(tile, ic, 20, rec || con ? C.primary : C.mutedForeground);
    c.appendChild(tile);
    const col = F("text", { gap: 4 });
    const tr = F("title-row", { dir: "H", gap: 8, align: "CENTER" });
    T(tr, title, { size: 14, weight: "Semi Bold", hug: true, lh: 20 });
    if (rec) Badge(tr, "Recommended", "default");
    if (con) Badge(tr, "Connected", "success");
    if (soon) Badge(tr, "Coming soon", "secondary");
    if (tag) Badge(tr, tag, "outline");
    add(col, tr, { fill: true });
    T(col, desc, { size: 13, color: C.mutedForeground, lh: 18 });
    add(c, col, { fill: true });
    Button(c, action, { variant: rec ? "default" : soon ? "secondary" : "outline", size: "sm" });
    add(parent, c, { fill: true });
    return c;
  }

  function CapabilityRow(parent, label, ok) {
    const r = F("CapabilityRow", { dir: "H", gap: 8, align: "CENTER" });
    icon(r, ok ? "circleCheck" : "x", 16, ok ? C.primary : C.mutedForeground);
    T(r, label, { size: 13, color: ok ? C.foreground : C.mutedForeground, lh: 18 });
    add(parent, r, { fill: true });
    return r;
  }

  function Panel(parent, title) {
    const p = F("Panel", { gap: 10, pad: [14, 16, 14, 16], radius: 8, fill: C.muted, stroke: C.border });
    if (title) T(p, title, { size: 13, weight: "Semi Bold", lh: 18 });
    add(parent, p, { fill: true });
    return p;
  }

  function Code(parent, text) {
    const c = F("CopySnippet", { dir: "H", gap: 8, align: "CENTER", pad: [8, 8, 8, 12], radius: 6, fill: C.foreground });
    T(c, text, { size: 12, weight: "Medium", color: "#E4E4E7", lh: 18 });
    const b = F("copy", { dir: "H", justify: "CENTER", align: "CENTER", w: 28, h: 28, radius: 6, fill: "#27272A" });
    icon(b, "copy", 14, "#E4E4E7");
    c.appendChild(b);
    add(parent, c, { fill: true });
    return c;
  }

  function Otp(parent, digits) {
    const row = F("OtpField", { dir: "H", gap: 8, justify: "CENTER" });
    for (let i = 0; i < 6; i++) {
      const active = i === digits.length;
      const box = F(`slot-${i + 1}`, { dir: "H", justify: "CENTER", align: "CENTER", w: 48, h: 56, radius: 8, fill: C.background, stroke: active ? C.primary : C.input, strokeW: active ? 2 : 1, shadow: true });
      T(box, digits[i] || " ", { size: 20, weight: "Semi Bold", align: "CENTER", lh: 28 });
      row.appendChild(box);
    }
    add(parent, row, { fill: true });
    return row;
  }

  // ---------------------------------------------------------------- layout: header, rail, card
  const STEPS = [
    ["S2", "Workspace", false],
    ["S3", "How you sell", true],
    ["S4", "Connect", true],
    ["S5", "Products", true],
    ["S6", "Knowledge", true],
    ["S7", "AI assistant", true],
    ["S8", "Team", true],
    ["S9", "Done", false],
  ];

  function Header(parent, signedIn) {
    const h = F("Header", { dir: "H", justify: "SPACE_BETWEEN", align: "CENTER", pad: [0, 32, 0, 32], h: 64, fill: C.background, stroke: C.border, strokeSides: "b" });
    add(parent, h, { fill: true });
    const brand = F("Brand", { dir: "H", gap: 10, align: "CENTER" });
    const logo = F("logo", { dir: "H", justify: "CENTER", align: "CENTER", w: 32, h: 32, radius: 8, fill: C.primary });
    T(logo, "u", { size: 18, weight: "Bold", color: C.primaryForeground, hug: true, lh: 22 });
    brand.appendChild(logo);
    T(brand, "Unifaio", { size: 18, weight: "Bold", hug: true, lh: 24, letter: -1 });
    h.appendChild(brand);
    const right = F("Actions", { dir: "H", gap: 12, align: "CENTER" });
    Button(right, "Help", { variant: "ghost", size: "sm", icon: "help" });
    const seg = F("LanguageToggle", { dir: "H", gap: 2, pad: [2, 2, 2, 2], radius: 6, fill: C.muted, align: "CENTER" });
    [["বাংলা", true], ["EN", false]].forEach(([l, on]) => {
      const t = F(`lang/${l}`, { dir: "H", justify: "CENTER", align: "CENTER", pad: [0, 10, 0, 10], h: 28, radius: 4, fill: on ? C.background : null, shadow: on });
      T(t, l, { size: 13, weight: "Medium", color: on ? C.foreground : C.mutedForeground, hug: true, lh: 18 });
      seg.appendChild(t);
    });
    right.appendChild(seg);
    if (signedIn) {
      const av = F("Avatar", { dir: "H", justify: "CENTER", align: "CENTER", w: 32, h: 32, radius: 16, fill: C.muted });
      T(av, "DT", { size: 12, weight: "Semi Bold", color: C.mutedForeground, hug: true, lh: 16 });
      right.appendChild(av);
    }
    h.appendChild(right);
    return h;
  }

  function Rail(parent, currentIdx) {
    const r = F("StepRail", { gap: 28, pad: [32, 24, 32, 24], w: 300, fill: C.background, stroke: C.border, strokeSides: "r" });
    parent.appendChild(r);
    r.layoutSizingVertical = "FILL";
    const head = F("rail-head", { gap: 6 });
    T(head, "Set up your workspace", { size: 16, weight: "Semi Bold", lh: 24 });
    T(head, `Step ${currentIdx + 1} of ${STEPS.length} · about ${Math.max(1, 9 - currentIdx)} min left`, { size: 13, color: C.mutedForeground, lh: 18 });
    add(r, head, { fill: true });
    const list = F("steps", { gap: 4 });
    add(r, list, { fill: true });
    STEPS.forEach(([id, label, optional], i) => {
      const done = i < currentIdx, cur = i === currentIdx;
      const row = F(`Step/${id}`, { dir: "H", gap: 12, align: "CENTER", pad: [8, 10, 8, 10], radius: 6, fill: cur ? C.muted : null });
      const dot = F("dot", { dir: "H", justify: "CENTER", align: "CENTER", w: 24, h: 24, radius: 12, fill: done ? C.primary : C.background, stroke: done || cur ? C.primary : C.input, strokeW: cur ? 2 : 1 });
      if (done) icon(dot, "check", 14, C.primaryForeground);
      else T(dot, String(i + 1), { size: 12, weight: "Semi Bold", color: cur ? C.primary : C.mutedForeground, align: "CENTER", hug: true, lh: 16 });
      row.appendChild(dot);
      const lab = T(row, label, { size: 14, weight: cur ? "Semi Bold" : "Medium", color: cur || done ? C.foreground : C.mutedForeground, lh: 20 });
      if (optional && !done && !cur) Badge(row, "Optional", "outline");
      add(list, row, { fill: true });
    });
    const help = Panel(r, null);
    T(help, "Stuck on a step?", { size: 13, weight: "Semi Bold", lh: 18 });
    T(help, "Chat with our team on WhatsApp. We reply in Bangla and English.", { size: 12, color: C.mutedForeground, lh: 18 });
    return r;
  }

  // Card with header / content / footer
  function Card(parent, o) {
    const card = F("Card", { w: o.w || 560, fill: C.card, stroke: C.border, radius: 12, shadow: true, clip: true });
    parent.appendChild(card);
    const header = F("CardHeader", { gap: 6, pad: [24, 24, 8, 24] });
    if (o.eyebrow) T(header, o.eyebrow, { size: 12, weight: "Semi Bold", color: C.primary, upper: true, letter: 4, lh: 16 });
    T(header, o.title, { size: 24, weight: "Semi Bold", letter: -2, lh: 32 });
    if (o.desc) T(header, o.desc, { size: 14, color: C.mutedForeground, lh: 20 });
    add(card, header, { fill: true });
    const content = F("CardContent", { gap: o.gap || 20, pad: [16, 24, 24, 24] });
    add(card, content, { fill: true });
    const footer = F("CardFooter", { dir: "H", justify: "SPACE_BETWEEN", align: "CENTER", pad: [16, 24, 16, 24], stroke: C.border, strokeSides: "t", fill: C.canvas });
    add(card, footer, { fill: true });
    return { card, header, content, footer };
  }

  // footer preset: [Back] .......... [Skip for now] [Primary ->]
  function FooterNav(footer, { back = true, skip = true, primary = "Continue", primaryIcon = "arrowRight" }) {
    const left = F("left", { dir: "H", gap: 8, align: "CENTER" });
    if (back) Button(left, "Back", { variant: "ghost", icon: "arrowLeft" });
    footer.appendChild(left);
    const right = F("right", { dir: "H", gap: 8, align: "CENTER" });
    if (skip) Button(right, "Skip for now", { variant: "ghost" });
    Button(right, primary, { variant: "default", icon: primaryIcon, iconRight: true });
    footer.appendChild(right);
  }

  // Screen frame
  const frames = [];
  function Screen(id, state, o) {
    const root = F(`${id} / ${state || "default"} / web-1280`, { w: 1280, fill: C.canvas });
    root.minHeight = 860;
    if (!o.split) Header(root, !!o.signedIn);
    const body = F("Body", { dir: "H" });
    add(root, body, { fill: true });
    body.minHeight = o.split ? 860 : 796;

    if (o.split) {
      const brand = F("BrandPanel", { gap: 28, pad: [48, 48, 48, 48], w: 560, fill: C.primaryDark, justify: "SPACE_BETWEEN" });
      body.appendChild(brand);
      brand.layoutSizingVertical = "FILL";
      const lr = F("brand", { dir: "H", gap: 10, align: "CENTER" });
      const logo = F("logo", { dir: "H", justify: "CENTER", align: "CENTER", w: 32, h: 32, radius: 8, fill: C.primary });
      T(logo, "u", { size: 18, weight: "Bold", color: "#FFFFFF", hug: true, lh: 22 });
      lr.appendChild(logo);
      T(lr, "Unifaio", { size: 18, weight: "Bold", color: "#FFFFFF", hug: true, lh: 24 });
      add(brand, lr, { fill: true });
      const mid = F("pitch", { gap: 20 });
      add(brand, mid, { fill: true });
      T(mid, "One workspace for every way you sell.", { size: 36, weight: "Bold", color: "#FFFFFF", letter: -2, lh: 44 });
      T(mid, "Shopify, WooCommerce, your own site, Facebook, Instagram, WhatsApp, or just a phone call. Orders, stock and customers stay in one place.", { size: 15, color: "#BBF7D0", lh: 24 });
      const pts = F("points", { gap: 12 });
      add(mid, pts, { fill: true });
      ["AI replies in Bangla and English; you approve every message", "Courier booking and COD tracking built in", "No website needed to start"].forEach((s) => {
        const r = F("pt", { dir: "H", gap: 10, align: "CENTER" });
        icon(r, "circleCheck", 18, "#4ADE80");
        T(r, s, { size: 14, color: "#FFFFFF", lh: 20 });
        add(pts, r, { fill: true });
      });
      T(brand, "Built for online sellers in Bangladesh", { size: 12, color: "#86EFAC", lh: 16 });
      const main = F("Main", { align: "CENTER", justify: "CENTER", pad: [48, 48, 48, 48], gap: 20 });
      add(body, main, { fill: true, fillV: true });
      o.build(main);
    } else {
      if (o.rail != null) Rail(body, o.rail);
      const main = F("Main", { align: "CENTER", justify: "MIN", pad: [48, 40, 48, 40], gap: 16 });
      add(body, main, { fill: true, fillV: true });
      o.build(main);
    }
    frames.push(root);
    return root;
  }

  // ---------------------------------------------------------------- page
  let page;
  try {
    page = figma.createPage();
    page.name = "Onboarding (Web 1280)";
    await figma.setCurrentPageAsync(page);
  } catch (e) {
    page = figma.currentPage;
    page.name = "Onboarding (Web 1280)";
  }

  // ================================================================= S0 Sign up
  Screen("ONB-S0", "default", {
    split: true,
    build: (main) => {
      const { content, footer } = Card(main, { w: 420, title: "Create your account", desc: "Start your free trial. No payment details needed." });
      Tabs(content, ["Phone", "Email"], 0);
      Input(content, "Mobile number", { prefix: "BD +880", placeholder: "17XX XXXXXX" });
      Input(content, "Password", { placeholder: "At least 8 characters", leadIcon: "lock" });
      Button(content, "Send verification code", { full: true, icon: "arrowRight", iconRight: true });
      footer.primaryAxisAlignItems = "CENTER";
      T(footer, "By continuing you agree to the Terms of Service and Privacy Policy.", { size: 12, color: C.mutedForeground, align: "CENTER", lh: 16 });
      T(main, "Already have an account? Log in", { size: 14, color: C.mutedForeground, align: "CENTER", lh: 20 });
    },
  });

  // ================================================================= S1 Verify
  Screen("ONB-S1", "default", {
    split: true,
    build: (main) => {
      const { content, footer } = Card(main, { w: 420, title: "Verify your number", desc: "Enter the 6-digit code we sent to +880 17XX-XXXXXX." });
      Otp(content, ["4", "8", "2"]);
      Button(content, "Verify and continue", { full: true });
      T(content, "Didn't get a code? Resend in 0:45", { size: 13, color: C.mutedForeground, align: "CENTER", lh: 18 });
      Button(footer, "Change number", { variant: "ghost", icon: "arrowLeft" });
      Button(footer, "Use email instead", { variant: "link" });
    },
  });

  // ================================================================= S2 Workspace
  Screen("ONB-S2", "default", {
    signedIn: true, rail: 0,
    build: (main) => {
      const { content, footer } = Card(main, { eyebrow: "Step 1 of 8", title: "Create your workspace", desc: "This is your business account. You can change these any time in Settings." });
      Input(content, "Business name", { placeholder: "e.g. Dhaka Threads" });
      Input(content, "Business phone", { prefix: "BD +880", placeholder: "17XX XXXXXX" });
      Row2(content, (p) => Select(p, "Language", { value: "বাংলা (Bangla)" }), (p) => Select(p, "Timezone", { value: "Asia/Dhaka (GMT+6)" }));
      Select(content, "Currency", { value: "৳ BDT, Bangladeshi Taka", help: "Your free trial starts now. No card required." });
      FooterNav(footer, { back: false, skip: false, primary: "Create workspace" });
    },
  });

  // ================================================================= S3 How you sell
  Screen("ONB-S3", "default", {
    signedIn: true, rail: 1,
    build: (main) => {
      const { content, footer } = Card(main, { w: 600, eyebrow: "Step 2 of 8", title: "How do you sell today?", desc: "Pick everything that applies. We will recommend the easiest way to start. You can change this later." });
      ChoiceCard(content, "chat", "Facebook, Instagram or WhatsApp", "Customers message me and I take orders in chat", true);
      ChoiceCard(content, "phone", "Phone calls, walk-ins or offline", "I write orders down or enter them by hand", true);
      ChoiceCard(content, "store", "I have a Shopify store", "Bring orders, products and stock into one place", false);
      ChoiceCard(content, "cart", "I have a WooCommerce store", "Connect my WordPress shop", false);
      ChoiceCard(content, "globe", "I have my own website", "My developer can connect it with our API", false);
      ChoiceCard(content, "package", "I don't have a website or store yet", "Start with the built-in catalog and order dashboard", false);
      Row2(content, (p) => Select(p, "What do you sell?", { value: "Clothing and accessories" }), (p) => Select(p, "Team size", { value: "2 to 5 people" }));
      FooterNav(footer, {});
    },
  });

  // ================================================================= S4 Connection hub
  Screen("ONB-S4", "default", {
    signedIn: true, rail: 2,
    build: (main) => {
      const { content, footer } = Card(main, { w: 640, eyebrow: "Step 3 of 8", title: "Connect where you sell", desc: "Works with or without a website. Connect one or more, or start manually.", gap: 12 });
      T(content, "Recommended for you", { size: 12, weight: "Semi Bold", color: C.mutedForeground, upper: true, letter: 4, lh: 16 });
      ConnectionCard(content, "chat", "Social and messaging", "Messenger, Instagram, WhatsApp and website chat. Turn chats into orders.", "Connect", "recommended");
      ConnectionCard(content, "package", "No website (manual)", "Built-in catalog, order dashboard and manual orders for calls and walk-ins.", "Use built-in", "recommended");
      content.appendChild(F("spacer", { h: 8 }));
      T(content, "Other ways to connect", { size: 12, weight: "Semi Bold", color: C.mutedForeground, upper: true, letter: 4, lh: 16 });
      ConnectionCard(content, "store", "Shopify store", "Orders, products and stock sync from Shopify.", "Notify me", "soon");
      ConnectionCard(content, "cart", "WooCommerce store", "Catalog, orders and stock from your WordPress shop.", "Notify me", "soon");
      ConnectionCard(content, "code", "Custom website", "Your developer sends orders with our API and webhooks.", "Notify me", "soon");
      FooterNav(footer, {});
    },
  });

  // ================================================================= S4A Shopify
  function S4A(state) {
    Screen("ONB-S4A", state, {
      signedIn: true, rail: 2,
      build: (main) => {
        const err = state === "error";
        const { content, footer } = Card(main, { w: 600, eyebrow: "Connect · Shopify", title: "Connect your Shopify store", desc: "We import your products, customers and recent orders, then keep stock in sync." });
        if (err) Alert(content, "We couldn't find that store", "Check the address and try again. It looks like my-shop.myshopify.com.", "destructive");
        Input(content, "Shopify store address", { value: err ? "my-shopp.myshopify.com" : "my-shop.myshopify.com", error: err ? "Store not found." : null, help: err ? null : "You can paste the full URL. We will clean it up." });
        const imp = F("import", { gap: 10 });
        add(content, imp, { fill: true });
        T(imp, "What to import", { size: 14, weight: "Medium", lh: 20 });
        ChoiceCard(imp, "package", "Products and variants", "Matched to your catalog by SKU", true);
        ChoiceCard(imp, "users", "Customers and orders", "Orders from the last 30 days", true);
        const pn = Panel(content, "Who manages what (change later in Settings)");
        CapabilityRow(pn, "Products stay managed in Shopify", true);
        CapabilityRow(pn, "Stock is managed here and sent to Shopify", true);
        CapabilityRow(pn, "New Shopify orders appear here", true);
        FooterNav(footer, { skip: false, primary: err ? "Try again" : "Authorize with Shopify" });
      },
    });
  }
  S4A("default");
  S4A("error");

  // ================================================================= S4B WooCommerce
  Screen("ONB-S4B", "default", {
    signedIn: true, rail: 2,
    build: (main) => {
      const { content, footer } = Card(main, { w: 600, eyebrow: "Connect · WooCommerce", title: "Connect your WooCommerce store", desc: "We use the WooCommerce REST API and webhooks. No plugin required." });
      Input(content, "Store URL", { value: "https://www.dhakathreads.com", leadIcon: "globe" });
      Row2(content, (p) => Input(p, "Consumer key", { value: "ck_••••••••••••" }), (p) => Input(p, "Consumer secret", { value: "cs_••••••••••••" }));
      const test = Panel(content, "Connection test");
      CapabilityRow(test, "Store reachable over HTTPS", true);
      CapabilityRow(test, "REST API enabled, credentials valid", true);
      CapabilityRow(test, "Webhooks registered automatically", true);
      const cap = Panel(content, "What will sync");
      CapabilityRow(cap, "Products and stock: imported, stock sent back", true);
      CapabilityRow(cap, "Orders: new orders appear here", true);
      CapabilityRow(cap, "Edit WooCommerce product content from here", false);
      Progress(content, 0.4, "Importing products · 72 of 180");
      FooterNav(footer, { skip: false, primary: "Test connection and import" });
    },
  });

  // ================================================================= S4C Custom website
  Screen("ONB-S4C", "default", {
    signedIn: true, rail: 2,
    build: (main) => {
      const { content, footer } = Card(main, { w: 640, eyebrow: "Connect · Custom website", title: "Connect your own website", desc: "You or your developer send orders with our API and receive updates by webhook." });
      const key = F("key", { gap: 8 });
      add(content, key, { fill: true });
      T(key, "Sandbox API key", { size: 14, weight: "Medium", lh: 20 });
      Code(key, "sk_test_51Hx••••••••••••••••••••");
      T(key, "Copy it now. For security you cannot see it again.", { size: 12, color: C.warning, lh: 16 });
      Input(content, "Webhook URL", { value: "https://www.dhakathreads.com/unifaio/webhook", help: "We send order and shipment updates here, signed with your secret." });
      const ex = F("example", { gap: 8 });
      add(content, ex, { fill: true });
      T(ex, "Create an order", { size: 14, weight: "Medium", lh: 20 });
      Code(ex, "POST /public/v1/orders  { customer, items: [{ sku, qty }], address }");
      Code(ex, "GET /public/v1/stock?sku=DP-OLV-M");
      Alert(content, "Waiting for your first test order", "This turns green as soon as a sandbox order arrives.", "info", "send");
      Button(content, "Send setup steps to my developer", { variant: "outline", full: true, icon: "send" });
      FooterNav(footer, { skip: false });
    },
  });

  // ================================================================= S4D Social and messaging
  Screen("ONB-S4D", "default", {
    signedIn: true, rail: 2,
    build: (main) => {
      const { content, footer } = Card(main, { w: 640, eyebrow: "Connect · Messaging", title: "Connect your messaging channels", desc: "Customer chats arrive in one inbox and can become orders.", gap: 12 });
      ConnectionCard(content, "chat", "Facebook Messenger", "Page: Dhaka Threads", "Connected", "connected");
      ConnectionCard(content, "chat", "Instagram DM", "Link your business account through a Meta Page.", "Connect", "default");
      ConnectionCard(content, "phone", "WhatsApp Business", "Official Cloud API. Template approval needed for outbound messages.", "Connect", "default");
      ConnectionCard(content, "globe", "Website live chat", "Paste one snippet on your site.", "Get code", "default");
      Alert(content, "Send a message to your Page now", "Waiting for your first message. This updates live.", "info", "bell");
      FooterNav(footer, {});
    },
  });

  // ================================================================= S4E Manual
  Screen("ONB-S4E", "default", {
    signedIn: true, rail: 2,
    build: (main) => {
      const { content, footer } = Card(main, { w: 600, eyebrow: "Connect · Built-in", title: "No website? No problem.", desc: "Use Unifaio as your sales workspace. No store or external account needed." });
      const pn = Panel(content, "Included from day one");
      CapabilityRow(pn, "Product catalog with variants and stock", true);
      CapabilityRow(pn, "Create orders from calls, walk-ins and messages", true);
      CapabilityRow(pn, "Customers, payments and courier booking", true);
      CapabilityRow(pn, "Sales and stock reports", true);
      Alert(content, "Add more later", "Messenger and WhatsApp chats, Shopify, WooCommerce or your own website can be connected any time.", "default", "arrowRight");
      FooterNav(footer, { skip: false, primary: "Start with the built-in workspace" });
    },
  });

  // ================================================================= S5 Products
  Screen("ONB-S5", "default", {
    signedIn: true, rail: 3,
    build: (main) => {
      const { content, footer } = Card(main, { w: 600, eyebrow: "Step 4 of 8", title: "Add your first products", desc: "AI and your team use these to answer questions and take orders." });
      Alert(content, "Shopify products are importing", "118 matched by SKU, 6 need attention. You can keep going while it finishes.", "success", "circleCheck");
      Tabs(content, ["Add one", "Upload CSV", "Import from store"], 0);
      Input(content, "Product name", { value: "Premium Cotton Panjabi, Olive" });
      Row2(content, (p) => Input(p, "Price", { prefix: "৳", value: "1,650" }), (p) => Input(p, "Stock", { value: "30", help: "Units on hand" }));
      Input(content, "SKU", { value: "DP-OLV-M", optional: true });
      FooterNav(footer, { primary: "Save product" });
    },
  });

  // ================================================================= S6 Knowledge
  Screen("ONB-S6", "default", {
    signedIn: true, rail: 4,
    build: (main) => {
      const { content, footer } = Card(main, { w: 600, eyebrow: "Step 5 of 8", title: "Teach the AI your policies", desc: "Short answers are enough. The AI only uses what you write here." });
      Row2(content, (p) => Input(p, "Delivery inside Dhaka", { value: "৳70 · 2 to 3 days" }), (p) => Input(p, "Delivery outside Dhaka", { value: "৳130 · 3 to 5 days" }));
      const pay = F("payments", { gap: 8 });
      add(content, pay, { fill: true });
      T(pay, "Payment methods", { size: 14, weight: "Medium", lh: 20 });
      const chips = F("chips", { dir: "H", gap: 8 });
      add(pay, chips, { fill: true });
      ["Cash on delivery", "bKash", "Nagad"].forEach((c) => Badge(chips, c, "secondary"));
      Badge(chips, "+ Add", "outline");
      Textarea(content, "Return and exchange policy", { value: "7-day exchange for defects with an unboxing video." });
      Input(content, "Business hours", { value: "Sat to Thu, 10:00 to 20:00", optional: true });
      FooterNav(footer, { primary: "Save policies" });
    },
  });

  // ================================================================= S7 AI
  Screen("ONB-S7", "default", {
    signedIn: true, rail: 5,
    build: (main) => {
      const { content, footer } = Card(main, { w: 620, eyebrow: "Step 6 of 8", title: "Turn on your AI assistant", desc: "It starts in draft mode: the AI writes replies and you approve every one." });
      const lvl = F("level", { dir: "H", gap: 12, align: "CENTER", pad: [14, 16, 14, 16], radius: 8, fill: C.primarySoft, stroke: C.primary });
      add(content, lvl, { fill: true });
      const tile = F("tile", { dir: "H", justify: "CENTER", align: "CENTER", w: 36, h: 36, radius: 8, fill: C.background });
      icon(tile, "bot", 18, C.primary);
      lvl.appendChild(tile);
      const col = F("text", { gap: 2 });
      add(lvl, col, { fill: true });
      T(col, "Level 1 · Draft only", { size: 14, weight: "Semi Bold", lh: 20 });
      T(col, "Nothing is sent without your approval. You can raise this later.", { size: 13, color: C.mutedForeground, lh: 18 });
      Badge(lvl, "Safe", "success");
      const pv = Panel(content, "Preview · nothing is sent");
      const q = F("customer", { pad: [10, 14, 10, 14], radius: 12, fill: C.background, stroke: C.border });
      add(pv, q, { fill: true });
      T(q, "ভাইয়া, এই পাঞ্জাবিটা স্টকে আছে? ডেলিভারি চার্জ কত?", { size: 13, lh: 20 });
      const a = F("ai-draft", { pad: [10, 14, 10, 14], radius: 12, fill: C.primarySoft, stroke: "#BBF7D0" });
      add(pv, a, { fill: true });
      T(a, "জি ভাইয়া, স্টকে আছে। ঢাকার ভিতরে ডেলিভারি ৳৭০, বাইরে ৳১৩০। অর্ডার করতে নাম, ঠিকানা ও ফোন নম্বর দিন।", { size: 13, lh: 20 });
      Badge(pv, "AI draft · Preview", "outline");
      const sw = F("toggles", { gap: 12 });
      add(content, sw, { fill: true });
      T(sw, "Use AI drafts on", { size: 14, weight: "Medium", lh: 20 });
      [["Facebook Messenger", true], ["Website live chat", false]].forEach(([n, on]) => {
        const r = F("row", { dir: "H", justify: "SPACE_BETWEEN", align: "CENTER" });
        add(sw, r, { fill: true });
        T(r, n, { size: 14, lh: 20 });
        Switch(r, on);
      });
      FooterNav(footer, { primary: "Turn on drafts" });
    },
  });

  // ================================================================= S8 Team
  Screen("ONB-S8", "default", {
    signedIn: true, rail: 6,
    build: (main) => {
      const { content, footer } = Card(main, { w: 600, eyebrow: "Step 7 of 8", title: "Invite your team", desc: "Give teammates access to the inbox and orders. Roles control what they can see." });
      Row2(content, (p) => Input(p, "Phone or email", { placeholder: "01XXXXXXXXX or name@email.com" }), (p) => Select(p, "Role", { value: "Sales agent" }));
      Button(content, "Send invitation", { variant: "secondary", full: true, icon: "send" });
      Separator(content);
      const inv = F("pending", { gap: 10 });
      add(content, inv, { fill: true });
      T(inv, "Pending invitations", { size: 14, weight: "Medium", lh: 20 });
      [["rahim@dhakathreads.com", "Sales agent"], ["01712-345678", "Support"]].forEach(([w, r]) => {
        const row = F("invite", { dir: "H", gap: 12, align: "CENTER", pad: [10, 14, 10, 14], radius: 8, stroke: C.border });
        add(inv, row, { fill: true });
        const av = F("av", { dir: "H", justify: "CENTER", align: "CENTER", w: 32, h: 32, radius: 16, fill: C.muted });
        icon(av, "users", 14, C.mutedForeground);
        row.appendChild(av);
        T(row, w, { size: 14, lh: 20 });
        Badge(row, r, "secondary");
        Badge(row, "Invited", "outline");
      });
      Progress(content, 0.4, "2 of 5 seats used");
      FooterNav(footer, { primary: "Continue" });
    },
  });

  // ================================================================= S9 Done
  Screen("ONB-S9", "default", {
    signedIn: true, rail: 7,
    build: (main) => {
      const { content, footer } = Card(main, { w: 600, eyebrow: "All set", title: "Your workspace is ready", desc: "Finish the rest from the setup checklist on your dashboard any time." });
      const list = F("checklist", { radius: 8, stroke: C.border, clip: true });
      add(content, list, { fill: true });
      [
        ["Workspace created", "Dhaka Threads", true],
        ["Sales channels", "Messenger connected · Manual orders on", true],
        ["First product added", "Premium Cotton Panjabi, Olive", true],
        ["AI assistant", "Draft mode on", true],
        ["Create your first order", "From a call, message or walk-in", false],
        ["Connect a courier", "Steadfast or Pathao", false],
      ].forEach(([t, d, done], i) => {
        const r = F("ChecklistItem", { dir: "H", gap: 12, align: "CENTER", pad: [12, 16, 12, 16], stroke: i ? C.border : null, strokeSides: i ? "t" : null });
        add(list, r, { fill: true });
        const dot = F("dot", { dir: "H", justify: "CENTER", align: "CENTER", w: 20, h: 20, radius: 10, fill: done ? C.primary : C.background, stroke: done ? C.primary : C.input });
        if (done) icon(dot, "check", 12, C.primaryForeground);
        r.appendChild(dot);
        const col = F("text", { gap: 0 });
        add(r, col, { fill: true });
        T(col, t, { size: 14, weight: "Medium", lh: 20 });
        T(col, d, { size: 12, color: C.mutedForeground, lh: 16 });
        if (!done) Button(r, "Start", { variant: "outline", size: "sm" });
      });
      footer.primaryAxisAlignItems = "MAX";
      footer.itemSpacing = 8;
      Button(footer, "Go to dashboard", { variant: "outline" });
      Button(footer, "Create your first order", { icon: "arrowRight", iconRight: true });
    },
  });

  // ---------------------------------------------------------------- arrange frames in a grid
  const COLS = 3, GAP = 120;
  let x = 0, y = 0, rowH = 0;
  frames.forEach((f, i) => {
    if (i && i % COLS === 0) { x = 0; y += rowH + GAP; rowH = 0; }
    page.appendChild(f);
    f.x = x; f.y = y;
    x += 1280 + GAP;
    rowH = Math.max(rowH, f.height);
  });

  figma.viewport.scrollAndZoomIntoView(frames);
  figma.notify(`Generated ${frames.length} onboarding frames`);
  console.log(`Generated ${frames.length} onboarding frames on page "${page.name}".`);
})();
