// In-page measurement helpers. Colors are resolved by painting to a 1x1 canvas (handles oklch/color-mix/alpha) -> sRGB 8-bit.
type RGBA = [number, number, number, number];
const cv = document.createElement("canvas"); cv.width = cv.height = 1; const cx = cv.getContext("2d", { willReadFrequently: true })!;
export function parse(c: string): RGBA { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0]!, d[1]!, d[2]!, d[3]! / 255]; }
// canvas premultiplies/rounds alpha; for translucent colors, paint over opaque black and white to recover straight color+alpha.
function parseExact(c: string): RGBA {
  cx.fillStyle = "#000"; cx.fillRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const k = cx.getImageData(0, 0, 1, 1).data;
  cx.fillStyle = "#fff"; cx.fillRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const w = cx.getImageData(0, 0, 1, 1).data;
  const a = 1 - (w[0]! - k[0]!) / 255; if (a <= 0.003) return [0, 0, 0, 0];
  return [Math.round(k[0]! / a), Math.round(k[1]! / a), Math.round(k[2]! / a), a].map((v, i) => (i < 3 ? Math.min(255, v as number) : v)) as RGBA;
}
const over = (top: RGBA, bottom: [number, number, number]): [number, number, number] => [0, 1, 2].map(i => top[i]! * top[3] + bottom[i]! * (1 - top[3])) as any;
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [0, 1, 2].map(i => a[i]! * t + b[i]! * (1 - t)) as any;
const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (c: number[]) => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
export const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hex = (c: number[]) => "#" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
/** Backdrop pixel color behind `el`'s own box (all ancestors composited, incl. their opacity). */
export function backdrop(el: Element | null): [number, number, number] {
  const chain: Element[] = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
  let b: [number, number, number] = [255, 255, 255];
  for (const e of chain) { const s = getComputedStyle(e); const bg = parseExact(s.backgroundColor); const op = parseFloat(s.opacity); const layered = over(bg, b); b = mix(layered, b, op); }
  return b;
}
/** Effective fg/bg of an element's text: bg incl. own bg; both faded by the element's own opacity (disabled:opacity-50) over parent backdrop. */
export function colorsOf(el: Element) {
  const s = getComputedStyle(el); const parentB = backdrop(el.parentElement); const op = parseFloat(s.opacity);
  const ownBg = parseExact(s.backgroundColor); const bgLayer = over(ownBg, parentB);
  const fg = parseExact(s.color); const textOnBg = over(fg, bgLayer);
  return { fg: mix(textOnBg, parentB, op), bg: mix(bgLayer, parentB, op), parentBackdrop: parentB, opacity: op };
}
export function contrastOf(el: Element) { const c = colorsOf(el); return { fg: hex(c.fg), bg: hex(c.bg), ratio: +ratio(c.fg, c.bg).toFixed(2) }; }
export function nameOf(el: Element): string {
  const e = el as HTMLElement; const lb = e.getAttribute("aria-labelledby");
  if (lb) return lb.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() ?? "").join(" ").trim();
  const al = e.getAttribute("aria-label"); if (al) return al;
  if (e instanceof HTMLInputElement || e instanceof HTMLSelectElement || e instanceof HTMLTextAreaElement) {
    const lab = e.labels?.[0]; if (lab) { const clone = lab.cloneNode(true) as HTMLElement; clone.querySelectorAll("input,select,textarea,span[id$=help],span[id$=error]").forEach(n => n.remove()); return (clone.textContent ?? "").replace(/\s+/g, " ").trim(); }
  }
  return (e.textContent ?? "").replace(/\s+/g, " ").trim();
}
export function describe(el: Element | null): string { if (!el) return "null"; const e = el as HTMLElement; const n = nameOf(e); return `${e.tagName.toLowerCase()}${e.getAttribute("role") ? `[role=${e.getAttribute("role")}]` : ""}${e.id ? "#" + e.id.slice(-18) : ""} "${n.slice(0, 70)}"`; }
const visible = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest("[hidden]") && (e as any).checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true }); };
/** Full audit of the currently rendered DOM. Returns counts + only failures (bounded). */
export function audit(opts: { min?: number } = {}) {
  const fails: any[] = []; const root = document.querySelector("main")!; const vw = document.documentElement.clientWidth;
  // text contrast (ratio >= 4.5 normal; >= 3 large)
  let textN = 0, worstText = { ratio: 99, el: "" };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement!; if (!n.textContent!.trim() || seen.has(el) || !visible(el) || el.closest("script,style,option")) continue; seen.add(el);
    const c = colorsOf(el); const r = ratio(c.fg, c.bg); const s = getComputedStyle(el); const size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold); const need = large ? 3 : 4.5; textN++;
    if (r < worstText.ratio) worstText = { ratio: +r.toFixed(2), el: describe(el) };
    const dis = !!el.closest(":disabled");
    if (r < need) fails.push({ kind: dis ? "text-contrast(disabled-exempt)" : "text-contrast", el: describe(el), fg: hex(c.fg), bg: hex(c.bg), ratio: +r.toFixed(2), need });
  }
  // entered/selected text inside native fields (not text nodes): value or selected option text, and placeholder-less empty fields included
  for (const el of all<HTMLInputElement>("input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea,select", root)) {
    if (!visible(el)) continue; const c = colorsOf(el); const r = ratio(c.fg, c.bg); textN++;
    if (r < worstText.ratio) worstText = { ratio: +r.toFixed(2), el: describe(el) };
    if (r < 4.5) fails.push({ kind: el.disabled ? "field-text-contrast(disabled-exempt)" : "field-text-contrast", el: describe(el), fg: hex(c.fg), bg: hex(c.bg), ratio: +r.toFixed(2), need: 4.5 });
  }
  // control boundary (>=3 vs parent backdrop), target size (>=44), overflow
  const ctrls = all("button,select,textarea,input:not([type=checkbox]):not([type=radio]),summary,a[href]");
  let boundN = 0, targetN = 0;
  for (const el of ctrls) {
    if (!visible(el)) continue; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); targetN++;
    const inline = el.tagName === "A" && s.display === "inline" ;
    if (!inline && (r.height < 43.5 || (el.tagName !== "INPUT" && r.width < 43.5))) fails.push({ kind: "target-size", el: describe(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
    if (["button", "select", "textarea", "input"].includes(el.tagName.toLowerCase())) {
      const bw = parseFloat(s.borderTopWidth); if (bw > 0) { boundN++; const bc = parseExact(s.borderTopColor); const pb = backdrop(el.parentElement); const edge = over(bc, pb); const rr = ratio(edge, pb); const own = colorsOf(el); const rOwn = ratio(edge, own.bg);
        // boundary must reach 3:1 against the adjacent backdrop; (the control fill also counts if it alone reaches 3:1, reported separately)
        if (rr < 3) fails.push({ kind: "boundary-contrast", el: describe(el), border: hex(edge), parent: hex(pb), ratio: +rr.toFixed(2), vsFill: +rOwn.toFixed(2), fillVsParent: +ratio(own.bg, pb).toFixed(2) }); }
      else fails.push({ kind: "no-border", el: describe(el) });
    }
  }
  for (const lab of all("label")) { if (!visible(lab) || !lab.querySelector("input[type=checkbox],input[type=radio]")) continue; const r = lab.getBoundingClientRect(); targetN++; if (r.height < 43.5) fails.push({ kind: "target-size(checkbox label)", el: describe(lab), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }); }
  const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (docOverflow > 0) fails.push({ kind: "page-horizontal-overflow", px: docOverflow, vw });
  let clipN = 0;
  for (const el of all("*", root)) { if (!visible(el)) continue; const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (r.right > vw + 0.5 && !el.closest("[data-allow-scroll]") && !el.closest(".overflow-auto")) { clipN++; if (fails.filter(f => f.kind === "beyond-viewport").length < 6) fails.push({ kind: "beyond-viewport", el: describe(el), right: +r.right.toFixed(1), vw }); }
    if (el.scrollWidth > el.clientWidth + 1 && ["hidden", "clip"].includes(s.overflowX) ) fails.push({ kind: "clipped-overflow", el: describe(el), sw: el.scrollWidth, cw: el.clientWidth }); }
  return { vw, viewportH: innerHeight, texts: textN, worstText, controls: targetN, bordered: boundN, beyondViewport: clipN, failCount: fails.length, fails: fails.slice(0, 40) };
}
const all = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

export function focusInfo() {
  const el = document.activeElement as HTMLElement | null; if (!el || el === document.body) return { el: "body" };
  const s = getComputedStyle(el); const r = el.getBoundingClientRect(); const oc = parseExact(s.outlineColor);
  const pb = backdrop(el.parentElement); const own = colorsOf(el);
  const outline = over(oc, pb); const cx2 = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
  const top = document.elementFromPoint(cx2, cy);
  return { el: describe(el), focusVisible: el.matches(":focus-visible"), outline: `${s.outlineStyle} ${s.outlineWidth} offset ${s.outlineOffset} ${hex(outline)}`, outlineW: parseFloat(s.outlineWidth), outlineVsPage: +ratio(outline, pb).toFixed(2), outlineVsControl: +ratio(outline, own.bg).toFixed(2), pageBg: hex(pb), controlBg: hex(own.bg), inViewport: r.top >= 0 && r.bottom <= innerHeight, coveredBy: top && el.contains(top) ? null : describe(top), box: `${Math.round(r.width)}x${Math.round(r.height)}`, tabindex: el.getAttribute("tabindex"), disabled: (el as any).disabled ?? null, ariaDisabled: el.getAttribute("aria-disabled"), invalid: el.getAttribute("aria-invalid"), describedby: (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).map(id => (document.getElementById(id)?.textContent ?? "").slice(0, 60)).join(" | ") };
}
