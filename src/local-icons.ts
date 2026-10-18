// Icons from the user's own SVG files (`icons:` in the spec, used as local:<name>): read,
// sanitized and registered so renderIcon draws them like any pack icon. The same reader backs
// `orrery icons new`, `check` and `adopt`, which hold a drawing to the rules in
// references/icons.md (IC01..IC10).

import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { type LocalArt, registerLocalIcon } from "./icons.ts";
import { allDark } from "./libraries.ts";
import type { Model } from "./types.ts";

/** A file that cannot be used as an icon; the message names the file, the problem and the fix. */
export class LocalIconError extends Error {
  file: string;
  problem: string;
  fix: string;
  constructor(file: string, problem: string, fix: string) {
    super(`${file} ${problem}; fix: ${fix}`);
    this.file = file;
    this.problem = problem;
    this.fix = fix;
  }
}

/** The path as the user typed it when it is under the working folder. */
export function shownPath(path: string): string {
  const rel = relative(process.cwd(), path);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.replaceAll("\\", "/") : path;
}

// Icons are a few KB; anything this large is a whole illustration or an embedded bitmap.
const MAX_BYTES = 512 * 1024;

function readIcon(path: string): string {
  const shown = shownPath(path);
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    throw new LocalIconError(shown, "cannot be read", "check the path in icons:");
  }
  if (size > MAX_BYTES)
    throw new LocalIconError(
      shown,
      `is ${Math.round(size / 1024)} KB, too large for an icon`,
      "simplify it to a few shapes (IC06), or rebuild it with `orrery icons new`",
    );
  return readFileSync(path, "utf8");
}

/** Reads and registers every icon the model declares. */
export async function loadLocalIcons(model: Model): Promise<void> {
  for (const icon of model.icons ?? []) {
    const art = localArt(readIcon(icon.path), shownPath(icon.path));
    registerLocalIcon(icon.name, art, icon.path);
  }
}

// ---------------------------------------------------------------- XML

interface XNode {
  name: string;
  attrs: Map<string, string>;
  children: XNode[];
  /** Character data of a "#text" node. */
  text?: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

type Bad = (problem: string, fix: string) => LocalIconError;

function decode(s: string, bad: Bad): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e.startsWith("#")) {
      const cp = /^#x/i.test(e) ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      if (!(cp > 0 && cp <= 0x10ffff))
        throw bad(`has an invalid character reference ${m}`, "delete it");
      return String.fromCodePoint(cp);
    }
    const v = ENTITIES[e];
    if (v === undefined)
      throw bad(`uses the undefined entity ${m}`, "write the character itself, or delete it");
    return v;
  });
}

const TAG = /<([A-Za-z_][\w:.-]*)/y;
const ATTR = /\s*(?:([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')|(\/?>))/y;

/** A small XML reader: elements, attributes and text. DOCTYPE entity declarations are refused. */
function parseXml(text: string, bad: Bad): XNode {
  const doc: XNode = { name: "#document", attrs: new Map(), children: [] };
  const stack: XNode[] = [doc];
  const top = () => stack[stack.length - 1] ?? doc;
  const pushText = (raw: string) => {
    if (top() === doc || !raw.trim()) return;
    top().children.push({ name: "#text", attrs: new Map(), children: [], text: decode(raw, bad) });
  };
  const malformed = "re-export it from the editor as plain SVG";
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) {
      pushText(text.slice(i));
      break;
    }
    if (lt > i) pushText(text.slice(i, lt));
    const skipTo = (end: string, what: string) => {
      const at = text.indexOf(end, lt);
      if (at < 0) throw bad(`has ${what} that never ends`, malformed);
      return at + end.length;
    };
    if (text.startsWith("<!--", lt)) i = skipTo("-->", "a comment");
    else if (text.startsWith("<?", lt)) i = skipTo("?>", "a processing instruction");
    else if (text.startsWith("<![CDATA[", lt)) {
      const end = skipTo("]]>", "a CDATA section");
      top().children.push({
        name: "#text",
        attrs: new Map(),
        children: [],
        text: text.slice(lt + 9, end - 3),
      });
      i = end;
    } else if (/^<!doctype/i.test(text.slice(lt, lt + 9))) {
      const close = text.indexOf(">", lt);
      const bracket = text.indexOf("[", lt);
      if (close < 0) throw bad("has a DOCTYPE that never ends", malformed);
      if (bracket >= 0 && bracket < close)
        throw bad(
          "declares its own entities in a DOCTYPE",
          "delete the DOCTYPE; an icon needs none",
        );
      i = close + 1;
    } else if (text[lt + 1] === "/") {
      const close = text.indexOf(">", lt);
      if (close < 0) throw bad("is not well-formed XML (a closing tag never ends)", malformed);
      const name = text.slice(lt + 2, close).trim();
      const open = stack.pop();
      if (!open || open === doc || open.name !== name)
        throw bad(
          `is not well-formed XML: </${name}> closes <${open && open !== doc ? open.name : "nothing"}>`,
          malformed,
        );
      i = close + 1;
    } else {
      TAG.lastIndex = lt;
      const name = TAG.exec(text)?.[1];
      if (!name)
        throw bad(
          `is not well-formed XML near ${JSON.stringify(text.slice(lt, lt + 24))}`,
          malformed,
        );
      const node: XNode = { name, attrs: new Map(), children: [] };
      let j = TAG.lastIndex;
      let selfClosing = false;
      for (;;) {
        ATTR.lastIndex = j;
        const a = ATTR.exec(text);
        if (!a) throw bad(`has a malformed <${node.name}> tag`, malformed);
        j = ATTR.lastIndex;
        if (a[4]) {
          selfClosing = a[4] === "/>";
          break;
        }
        node.attrs.set(a[1] ?? "", decode(a[2] ?? a[3] ?? "", bad));
      }
      top().children.push(node);
      if (!selfClosing) stack.push(node);
      i = j;
    }
  }
  if (stack.length > 1)
    throw bad(`is not well-formed XML: <${top().name}> is never closed`, malformed);
  const root = doc.children.find((c) => c.name !== "#text");
  if (!root || local(root.name) !== "svg")
    throw bad("is not an SVG file (its root element is not <svg>)", "save the drawing as .svg");
  return root;
}

/** Lowercase element name without a namespace prefix. */
const local = (name: string) => (name.split(":").pop() ?? name).toLowerCase();

const escAttr = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const escText = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function serialize(n: XNode): string {
  if (n.name === "#text") return escText(n.text ?? "");
  const attrs = [...n.attrs].map(([k, v]) => ` ${k}="${escAttr(v)}"`).join("");
  const inner = n.children.map(serialize).join("");
  return inner ? `<${n.name}${attrs}>${inner}</${n.name}>` : `<${n.name}${attrs}/>`;
}

// ---------------------------------------------------------------- sanitizing

/** Elements that would run code, load something, restyle the diagram or not hold still. */
const UNSAFE: Record<string, [string, string]> = {
  script: ["contains a <script> element", "delete it; an icon is static artwork"],
  foreignobject: [
    "contains a <foreignObject> (HTML inside the SVG)",
    "delete it and draw the content as shapes",
  ],
  style: [
    "contains a <style> element, whose rules would restyle the whole diagram",
    "run `orrery icons adopt <file> --name <name>`, which moves the rules onto the shapes",
  ],
  image: [
    "embeds an image",
    "redraw it as vector shapes (IC09); a bitmap cannot take the theme's color",
  ],
  feimage: ["embeds an image in a filter", "delete the filter; draw the effect as shapes"],
  a: ["contains a link (<a>)", "delete the link; give the node url: in the spec instead"],
  iframe: ["embeds a frame", "delete it"],
  embed: ["embeds external content", "delete it"],
  object: ["embeds external content", "delete it"],
  audio: ["embeds audio", "delete it"],
  video: ["embeds video", "delete it"],
  canvas: ["contains a canvas", "delete it"],
  animate: ["is animated (<animate>)", "delete the animation; the diagram animates on its own"],
  animatemotion: ["is animated", "delete the animation; the diagram animates on its own"],
  animatetransform: ["is animated", "delete the animation; the diagram animates on its own"],
  set: ["is animated (<set>)", "delete the animation; the diagram animates on its own"],
  discard: ["is animated (<discard>)", "delete it"],
};

const FILTERS =
  "feblend fecolormatrix fecomponenttransfer fecomposite feconvolvematrix fediffuselighting fedisplacementmap fedistantlight fedropshadow feflood fefunca fefuncb fefuncg fefuncr fegaussianblur femerge femergenode femorphology feoffset fepointlight fespecularlighting fespotlight fetile feturbulence";
const ALLOWED = new Set([
  ..."svg g defs symbol use path rect circle ellipse line polyline polygon clippath mask lineargradient radialgradient stop pattern marker text tspan textpath filter".split(
    " ",
  ),
  ...FILTERS.split(" "),
]);
/** Editor and document data that draws nothing. */
const DROP = new Set(["metadata", "title", "desc", "sodipodi:namedview"]);

/** Properties a style="" declaration may carry; each becomes a presentation attribute. */
const PRESENTATION = new Set(
  "fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity color display visibility clip-path clip-rule mask filter stop-color stop-opacity flood-color flood-opacity lighting-color font-family font-size font-weight font-style text-anchor dominant-baseline letter-spacing paint-order vector-effect shape-rendering marker-start marker-mid marker-end".split(
    " ",
  ),
);
/** Root attributes that paint the whole icon; they move onto a wrapping group. */
const ROOT_PAINT = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "clip-rule",
  "opacity",
  "color",
];

const declarations = (style: string): [string, string][] =>
  style
    .split(";")
    .map((d) => {
      const at = d.indexOf(":");
      return [d.slice(0, at).trim().toLowerCase(), d.slice(at + 1).trim()] as [string, string];
    })
    .filter(([k, v]) => k && v && !k.startsWith("-"));

/** Simple class, tag and id rules of a <style> element (adopt only), in source order. */
function cssRules(css: string): { sel: string[]; decls: [string, string][] }[] {
  const rules: { sel: string[]; decls: [string, string][] }[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of clean.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const sel = (m[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^(?:[a-zA-Z][\w-]*)?(?:[.#][\w-]+)?$/.test(s) && s);
    if (sel.length) rules.push({ sel, decls: declarations(m[2] ?? "") });
  }
  return rules;
}

function matches(n: XNode, sel: string): boolean {
  const m = /^([a-zA-Z][\w-]*)?(?:([.#])([\w-]+))?$/.exec(sel);
  if (!m) return false;
  if (m[1] && local(n.name) !== m[1].toLowerCase()) return false;
  if (m[2] === "." && !(n.attrs.get("class") ?? "").split(/\s+/).includes(m[3] ?? "")) return false;
  if (m[2] === "#" && n.attrs.get("id") !== m[3]) return false;
  return true;
}

const EXTERNAL_URL = /url\(\s*["']?\s*(?!#)/i;

/**
 * Refuses anything unsafe and removes what draws nothing: metadata, comments, editor namespaces,
 * classes, inline styles (which become attributes). With `adopt`, simple <style> rules are moved
 * onto the shapes instead of refused.
 */
function sanitize(root: XNode, bad: Bad, adopt = false): XNode {
  const rules: ReturnType<typeof cssRules> = [];
  if (adopt) {
    const collect = (n: XNode) => {
      for (const c of n.children) {
        if (local(c.name) === "style") {
          rules.push(...cssRules(c.children.map((t) => t.text ?? "").join("")));
          c.name = "#style";
        } else collect(c);
      }
    };
    collect(root);
  }
  const visit = (n: XNode): XNode | undefined => {
    if (n.name === "#text") return n;
    if (n.name === "#style") return undefined;
    const tag = local(n.name);
    const unsafe = UNSAFE[tag];
    if (unsafe) throw bad(unsafe[0], unsafe[1]);
    if (DROP.has(n.name.toLowerCase()) || DROP.has(tag) || n.name.includes(":")) return undefined;
    if (!ALLOWED.has(tag))
      throw bad(
        `contains an unsupported <${n.name}> element`,
        "delete it, or run `orrery icons adopt`, which rebuilds the file from its shapes",
      );
    const attrs = new Map<string, string>();
    const styled: [string, string][] = [];
    for (const rule of rules) if (rule.sel.some((s) => matches(n, s))) styled.push(...rule.decls);
    for (const [rawKey, value] of n.attrs) {
      const key = rawKey.toLowerCase();
      if (key.startsWith("on"))
        throw bad(
          `has an event handler (${rawKey}) on <${n.name}>`,
          `delete the ${rawKey} attribute`,
        );
      if (/javascript:/i.test(value.replace(/\s/g, "")))
        throw bad(`has a javascript: link on <${n.name}>`, `delete the ${rawKey} attribute`);
      if (EXTERNAL_URL.test(value))
        throw bad(
          `points outside the file with url(...) in ${rawKey} on <${n.name}>`,
          "an icon may only reference its own ids, url(#id); inline what it loads",
        );
      if (key === "href" || key === "xlink:href") {
        if (!value.trim().startsWith("#"))
          throw bad(
            `links outside the file (${rawKey}="${value.slice(0, 40)}") on <${n.name}>`,
            'an icon may only reference its own ids (href="#id"); inline the artwork it loads',
          );
        attrs.set("href", value.trim());
        continue;
      }
      if (key === "style") {
        styled.push(...declarations(value));
        continue;
      }
      if (
        key === "xmlns" ||
        key.includes(":") ||
        key === "class" ||
        key.startsWith("data-") ||
        key === "version" ||
        key === "baseprofile" ||
        key === "enable-background"
      )
        continue;
      attrs.set(rawKey, value);
    }
    // Stylesheet rules beat presentation attributes, inline styles beat both (CSS cascade).
    for (const [k, v] of styled) if (PRESENTATION.has(k)) attrs.set(k, v);
    const children = n.children.map(visit).filter((c): c is XNode => !!c);
    const keepText = tag === "text" || tag === "tspan" || tag === "textpath";
    return {
      name: n.name,
      attrs,
      children: keepText ? children : children.filter((c) => c.name !== "#text"),
    };
  };
  const clean = visit(root);
  if (!clean) throw bad("draws nothing", "draw two to six shapes on a 24 grid (IC06)");
  return clean;
}

/** The viewBox, or 0 0 width height. */
function viewBoxOf(root: XNode, bad: Bad): [number, number, number, number] {
  const vb = root.attrs.get("viewBox");
  const nums = (vb ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (vb !== undefined) {
    const [x = 0, y = 0, w = 0, h = 0] = nums;
    if (nums.length !== 4 || !nums.every(Number.isFinite) || !(w > 0 && h > 0))
      throw bad(`has an invalid viewBox "${vb}"`, 'write viewBox="0 0 24 24"');
    return [x, y, w, h];
  }
  const size = (k: string) => {
    const raw = root.attrs.get(k)?.trim() ?? "";
    return /^[\d.]+(px)?$/.test(raw) ? Number.parseFloat(raw) : Number.NaN;
  };
  const w = size("width");
  const h = size("height");
  if (w > 0 && h > 0) return [0, 0, w, h];
  throw bad("has no viewBox (and no width and height in px)", 'add viewBox="0 0 24 24" to <svg>');
}

// ---------------------------------------------------------------- converting

function normalizeColor(v: string): string | undefined {
  const c = v.trim().toLowerCase();
  if (!c || c === "none" || c === "transparent" || c === "inherit") return undefined;
  if (c === "currentcolor") return "currentColor";
  if (c === "black") return "#000000";
  if (c === "white") return "#ffffff";
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return c;
}

const PAINT = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "text",
  "tspan",
]);
/** Subtrees whose colors are geometry (clip paths) or luminance (masks), never paint. */
const NOT_PAINT = new Set(["clippath", "mask"]);

/** The colors an icon paints with, and whether that makes it one-color artwork. */
function paintsOf(root: XNode): { colors: Set<string>; current: boolean; servers: boolean } {
  const colors = new Set<string>();
  let current = false;
  let servers = false;
  const walk = (n: XNode, fill: string | undefined) => {
    const tag = local(n.name);
    if (n.name === "#text" || NOT_PAINT.has(tag)) return;
    const own = n.attrs.get("fill") ?? fill;
    for (const key of ["fill", "stroke", "stop-color", "flood-color"]) {
      const v = n.attrs.get(key);
      if (v === undefined) continue;
      if (/^\s*url\(/i.test(v)) servers = true;
      else {
        const c = normalizeColor(v);
        if (c === "currentColor") current = true;
        else if (c) colors.add(c);
      }
    }
    // A shape with no fill anywhere above it fills black.
    if (PAINT.has(tag) && own === undefined) colors.add("#000000");
    for (const c of n.children) walk(c, own);
  };
  walk(root, root.attrs.get("fill"));
  return { colors, current, servers };
}

/**
 * The catalog form of an icon file: ids made instance-unique with the `sdwid` token renderIcon
 * swaps, root paint on a wrapping group, and single-color artwork turned into a {{c}} template so
 * the classic `color:` and the stage skin's mono painting work.
 */
export function localArt(text: string, file: string): LocalArt {
  const bad: Bad = (problem, fix) => new LocalIconError(file, problem, fix);
  const root = sanitize(parseXml(text, bad), bad);
  const [x, y, w, h] = viewBoxOf(root, bad);
  // Ids: every id and every reference to it gets the token renderIcon replaces per instance.
  const ids = new Set<string>();
  const collect = (n: XNode) => {
    const id = n.attrs.get("id");
    if (id) ids.add(id);
    n.children.forEach(collect);
  };
  collect(root);
  const { colors, current, servers } = paintsOf(root);
  const mono = !servers && colors.size <= 1 && (colors.size > 0 || current);
  let inks = false;
  const rewrite = (n: XNode, paint: boolean) => {
    const tag = local(n.name);
    const inPaint = paint && !NOT_PAINT.has(tag);
    for (const [k, v] of n.attrs) {
      let value = v;
      if (k === "id" && ids.has(v)) value = `sdwid_${v}`;
      else if (k === "href" && ids.has(v.slice(1))) value = `#sdwid_${v.slice(1)}`;
      else
        value = value.replace(/url\(\s*(["']?)#([^)"'\s]+)\1\s*\)/g, (m, _q, ref: string) =>
          ids.has(ref) ? `url(#sdwid_${ref})` : m,
        );
      if (
        inPaint &&
        (k === "fill" || k === "stroke" || k === "stop-color" || k === "flood-color")
      ) {
        const c = normalizeColor(value);
        if (mono && c && (k === "fill" || k === "stroke")) value = "{{c}}";
        else if (!mono && c === "currentColor") {
          value = "{{c}}";
          inks = true;
        }
      }
      if (mono && k === "color") {
        n.attrs.delete(k);
        continue;
      }
      n.attrs.set(k, value);
    }
    for (const c of n.children) rewrite(c, inPaint);
  };
  rewrite(root, true);
  let body = root.children.map(serialize).join("");
  const paint = ROOT_PAINT.flatMap((k) => {
    const v = root.attrs.get(k);
    return v === undefined ? [] : [`${k}="${escAttr(v)}"`];
  });
  // Unpainted shapes fill black; in a one-color icon they take the icon's color instead.
  if (mono && !root.attrs.has("fill")) paint.unshift('fill="{{c}}"');
  if (paint.length) body = `<g ${paint.join(" ")}>${body}</g>`;
  if (!body.replace(/<\/?g\b[^>]*>/g, "").trim())
    throw bad("draws nothing", "draw two to six shapes on a 24 grid (IC06)");
  const art: LocalArt = { v: `${x} ${y} ${w} ${h}`, b: body };
  if (mono) art.m = 1;
  else if (inks) art.c = 1;
  else if (allDark(body)) art.k = 1;
  return art;
}

// ---------------------------------------------------------------- geometry

type Pt = [number, number];
/** A line when `c` is missing, else a cubic Bezier. */
interface Seg {
  c?: [Pt, Pt];
  to: Pt;
}
interface Sub {
  from: Pt;
  segs: Seg[];
  closed: boolean;
  /** Commands as written (an arc counts once), for the traced-artwork rule. */
  cmds: number;
}
type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

const mul = (p: Mat, q: Mat): Mat => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
];
const apply = (m: Mat, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** How much a matrix scales a stroke width (uniform part). */
const scaleOf = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const numbers = (s: string | undefined) => (s?.match(NUMBER) ?? []).map(Number);

function parseTransform(s: string | undefined): Mat {
  let m = IDENTITY;
  for (const [, fn, args] of (s ?? "").matchAll(
    /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g,
  )) {
    const a = numbers(args);
    const [a0 = 0, a1, a2 = 0, a3 = 0, a4 = 0, a5 = 0] = a;
    let t: Mat = IDENTITY;
    if (fn === "matrix") t = [a0, a1 ?? 0, a2, a3, a4, a5];
    else if (fn === "translate") t = [1, 0, 0, 1, a0, a1 ?? 0];
    else if (fn === "scale") t = [a0, 0, 0, a1 ?? a0, 0, 0];
    else if (fn === "rotate") {
      const r = (a0 * Math.PI) / 180;
      const [cos, sin] = [Math.cos(r), Math.sin(r)];
      const cx = a1 ?? 0;
      const cy = a2;
      t = mul(mul([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (fn === "skewX") t = [1, 0, Math.tan((a0 * Math.PI) / 180), 1, 0, 0];
    else if (fn === "skewY") t = [1, Math.tan((a0 * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, t);
  }
  return m;
}

/** An SVG arc as cubic Beziers (SVG 1.1 implementation notes, F.6.5 and F.6.6). */
function arcSegs(
  p0: Pt,
  rxIn: number,
  ryIn: number,
  deg: number,
  large: number,
  sweep: number,
  p1: Pt,
): Seg[] {
  if (p0[0] === p1[0] && p0[1] === p1[1]) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (!rx || !ry) return [{ to: p1 }];
  const phi = (deg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1) / ry;
  const cyp = (-coef * ry * x1) / rx;
  const cx = cos * cxp - sin * cyp + (p0[0] + p1[0]) / 2;
  const cy = sin * cxp + cos * cyp + (p0[1] + p1[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): Pt => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ];
  const tangent = (t: number): Pt => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  ];
  const segs: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * step;
    const b = a + step;
    const [pa, pb, ta, tb] = [at(a), i === n - 1 ? p1 : at(b), tangent(a), tangent(b)];
    segs.push({
      c: [
        [pa[0] + k * ta[0], pa[1] + k * ta[1]],
        [pb[0] - k * tb[0], pb[1] - k * tb[1]],
      ],
      to: pb,
    });
  }
  return segs;
}

/** Path data as absolute lines and cubics; arcs and quadratics become cubics. */
function pathSubs(d: string, bad: Bad): Sub[] {
  const subs: Sub[] = [];
  let i = 0;
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d[i] ?? "")) i++;
  };
  const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
  const num = (): number => {
    skip();
    NUM.lastIndex = i;
    const m = NUM.exec(d);
    if (!m) throw bad(`has broken path data near "${d.slice(i, i + 16)}"`, "re-export the path");
    i = NUM.lastIndex;
    return Number(m[0]);
  };
  const flag = (): number => {
    skip();
    const ch = d[i];
    if (ch !== "0" && ch !== "1")
      throw bad(`has a broken arc flag near "${d.slice(i, i + 16)}"`, "re-export the path");
    i++;
    return Number(ch);
  };
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let sub: Sub | undefined;
  let prev = "";
  let lastCtrl: Pt | undefined;
  let lastQuad: Pt | undefined;
  const open = () => {
    if (!sub) {
      sub = { from: cur, segs: [], closed: false, cmds: 0 };
      subs.push(sub);
    }
    return sub;
  };
  let cmd = "";
  for (;;) {
    skip();
    if (i >= d.length) break;
    const ch = d[i] ?? "";
    if (/[A-Za-z]/.test(ch)) {
      cmd = ch;
      i++;
    } else if (!cmd) throw bad("has path data that does not start with M", "re-export the path");
    else if (cmd === "M") cmd = "L";
    else if (cmd === "m") cmd = "l";
    else if (cmd === "Z" || cmd === "z")
      throw bad("has numbers after Z in path data", "re-export the path");
    const rel = cmd === cmd.toLowerCase();
    const up = cmd.toUpperCase();
    const pt = (): Pt => {
      const x = num();
      const y = num();
      return rel ? [cur[0] + x, cur[1] + y] : [x, y];
    };
    let ctrl: Pt | undefined;
    let quad: Pt | undefined;
    if (up === "M") {
      cur = pt();
      start = cur;
      sub = { from: cur, segs: [], closed: false, cmds: 0 };
      subs.push(sub);
    } else if (up === "Z") {
      const s = open();
      s.closed = true;
      s.cmds += 1;
      if (cur[0] !== start[0] || cur[1] !== start[1]) s.segs.push({ to: start });
      cur = start;
      sub = undefined;
    } else {
      const s = open();
      s.cmds += 1;
      if (up === "L") {
        cur = pt();
        s.segs.push({ to: cur });
      } else if (up === "H") {
        const x = num();
        cur = [rel ? cur[0] + x : x, cur[1]];
        s.segs.push({ to: cur });
      } else if (up === "V") {
        const y = num();
        cur = [cur[0], rel ? cur[1] + y : y];
        s.segs.push({ to: cur });
      } else if (up === "C" || up === "S") {
        const smooth = up === "S";
        const c1: Pt = smooth
          ? lastCtrl && /[CcSs]/.test(prev)
            ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]]
            : cur
          : pt();
        const c2 = pt();
        const to = pt();
        s.segs.push({ c: [c1, c2], to });
        ctrl = c2;
        cur = to;
      } else if (up === "Q" || up === "T") {
        const q: Pt =
          up === "T"
            ? lastQuad && /[QqTt]/.test(prev)
              ? [2 * cur[0] - lastQuad[0], 2 * cur[1] - lastQuad[1]]
              : cur
            : pt();
        const to = pt();
        s.segs.push({
          c: [
            [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])],
            [to[0] + (2 / 3) * (q[0] - to[0]), to[1] + (2 / 3) * (q[1] - to[1])],
          ],
          to,
        });
        quad = q;
        cur = to;
      } else if (up === "A") {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = flag();
        const sweep = flag();
        const to = pt();
        s.segs.push(...arcSegs(cur, rx, ry, rot, large, sweep, to));
        cur = to;
      } else throw bad(`has an unknown path command "${cmd}"`, "re-export the path");
    }
    lastCtrl = ctrl;
    lastQuad = quad;
    prev = cmd;
  }
  return subs;
}

const K = 0.5522847498;

function ellipseSub(cx: number, cy: number, rx: number, ry: number): Sub {
  const [kx, ky] = [K * rx, K * ry];
  return {
    from: [cx + rx, cy],
    segs: [
      {
        c: [
          [cx + rx, cy + ky],
          [cx + kx, cy + ry],
        ],
        to: [cx, cy + ry],
      },
      {
        c: [
          [cx - kx, cy + ry],
          [cx - rx, cy + ky],
        ],
        to: [cx - rx, cy],
      },
      {
        c: [
          [cx - rx, cy - ky],
          [cx - kx, cy - ry],
        ],
        to: [cx, cy - ry],
      },
      {
        c: [
          [cx + kx, cy - ry],
          [cx + rx, cy - ky],
        ],
        to: [cx + rx, cy],
      },
    ],
    closed: true,
    cmds: 1,
  };
}

/** A shape element's outline in its own coordinates; undefined for non-shapes. */
function shapeSubs(n: XNode, bad: Bad): Sub[] | undefined {
  const tag = local(n.name);
  const v = (k: string) => numbers(n.attrs.get(k))[0] ?? 0;
  if (tag === "path") return pathSubs(n.attrs.get("d") ?? "", bad);
  if (tag === "circle") {
    const r = v("r");
    return r > 0 ? [ellipseSub(v("cx"), v("cy"), r, r)] : [];
  }
  if (tag === "ellipse") {
    const [rx, ry] = [v("rx"), v("ry")];
    return rx > 0 && ry > 0 ? [ellipseSub(v("cx"), v("cy"), rx, ry)] : [];
  }
  if (tag === "line")
    return [
      { from: [v("x1"), v("y1")], segs: [{ to: [v("x2"), v("y2")] }], closed: false, cmds: 1 },
    ];
  if (tag === "polyline" || tag === "polygon") {
    const p = numbers(n.attrs.get("points"));
    const pts: Pt[] = [];
    for (let j = 0; j + 1 < p.length; j += 2) pts.push([p[j] ?? 0, p[j + 1] ?? 0]);
    const [first, ...rest] = pts;
    if (!first) return [];
    const segs: Seg[] = rest.map((to) => ({ to }));
    if (tag === "polygon") segs.push({ to: first });
    return [{ from: first, segs, closed: tag === "polygon", cmds: pts.length }];
  }
  if (tag === "rect") {
    const [x, y, w, h] = [v("x"), v("y"), v("width"), v("height")];
    if (!(w > 0 && h > 0)) return [];
    const rxRaw = n.attrs.has("rx") ? v("rx") : undefined;
    const ryRaw = n.attrs.has("ry") ? v("ry") : undefined;
    const rx = Math.min(w / 2, Math.max(0, rxRaw ?? ryRaw ?? 0));
    const ry = Math.min(h / 2, Math.max(0, ryRaw ?? rxRaw ?? 0));
    if (!rx || !ry)
      return [
        {
          from: [x, y],
          segs: [{ to: [x + w, y] }, { to: [x + w, y + h] }, { to: [x, y + h] }, { to: [x, y] }],
          closed: true,
          cmds: 1,
        },
      ];
    const [kx, ky] = [K * rx, K * ry];
    return [
      {
        from: [x + rx, y],
        segs: [
          { to: [x + w - rx, y] },
          {
            c: [
              [x + w - rx + kx, y],
              [x + w, y + ry - ky],
            ],
            to: [x + w, y + ry],
          },
          { to: [x + w, y + h - ry] },
          {
            c: [
              [x + w, y + h - ry + ky],
              [x + w - rx + kx, y + h],
            ],
            to: [x + w - rx, y + h],
          },
          { to: [x + rx, y + h] },
          {
            c: [
              [x + rx - kx, y + h],
              [x, y + h - ry + ky],
            ],
            to: [x, y + h - ry],
          },
          { to: [x, y + ry] },
          {
            c: [
              [x, y + ry - ky],
              [x + rx - kx, y],
            ],
            to: [x + rx, y],
          },
        ],
        closed: true,
        cmds: 1,
      },
    ];
  }
  return undefined;
}

const transformSub = (s: Sub, m: Mat): Sub => ({
  from: apply(m, s.from),
  segs: s.segs.map((g) => ({
    ...(g.c ? { c: [apply(m, g.c[0]), apply(m, g.c[1])] as [Pt, Pt] } : {}),
    to: apply(m, g.to),
  })),
  closed: s.closed,
  cmds: s.cmds,
});

type Box = [number, number, number, number];

/** Extremes of one axis of a cubic: roots of its derivative in (0, 1). */
function cubicExtremes(a: number, b: number, c: number, d: number): number[] {
  const [p, q, r] = [b - a, c - b, d - c];
  const qa = p - 2 * q + r;
  const qb = 2 * (q - p);
  const ts: number[] = [];
  if (Math.abs(qa) < 1e-12) {
    if (Math.abs(qb) > 1e-12) ts.push(-p / qb);
  } else {
    const disc = qb * qb - 4 * qa * p;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      ts.push((-qb + s) / (2 * qa), (-qb - s) / (2 * qa));
    }
  }
  return ts
    .filter((t) => t > 0 && t < 1)
    .map((t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d);
}

function subBox(s: Sub): Box {
  const box: Box = [s.from[0], s.from[1], s.from[0], s.from[1]];
  const add = (x: number, y: number) => {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  };
  let p = s.from;
  for (const g of s.segs) {
    add(...g.to);
    if (g.c) {
      for (const x of cubicExtremes(p[0], g.c[0][0], g.c[1][0], g.to[0])) add(x, p[1]);
      for (const y of cubicExtremes(p[1], g.c[0][1], g.c[1][1], g.to[1])) add(p[0], y);
    }
    p = g.to;
  }
  return box;
}

const union = (a: Box | undefined, b: Box): Box =>
  a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b;
const grow = (b: Box, by: number): Box => [b[0] - by, b[1] - by, b[2] + by, b[3] + by];

interface Style {
  fill?: string;
  stroke?: string;
  width: number;
  cap: string;
  join: string;
  miter?: string;
  rule?: string;
  opacity: number;
  fillOpacity?: string;
  strokeOpacity?: string;
  hidden: boolean;
}

/** One drawn shape, in viewBox units, with the paint it inherits. */
interface Part {
  tag: string;
  subs: Sub[];
  /** undefined: no fill set anywhere above it, so it fills black. */
  fill?: string;
  stroke?: string;
  width: number;
  cap: string;
  join: string;
  miter?: string;
  rule?: string;
  opacity: number;
  fillOpacity?: string;
  strokeOpacity?: string;
  filled: boolean;
  stroked: boolean;
  /** Uses a clip path, mask or filter (adopt cannot keep those). */
  effects: string[];
}

interface Drawing {
  viewBox: Box;
  parts: Part[];
  texts: number;
}

const SKIP = new Set([
  "defs",
  "clippath",
  "mask",
  "marker",
  "pattern",
  "symbol",
  "lineargradient",
  "radialgradient",
  "filter",
]);

function drawingOf(root: XNode, bad: Bad): Drawing {
  const viewBox = viewBoxOf(root, bad);
  const byId = new Map<string, XNode>();
  const index = (n: XNode) => {
    const id = n.attrs.get("id");
    if (id) byId.set(id, n);
    n.children.forEach(index);
  };
  index(root);
  const parts: Part[] = [];
  let texts = 0;
  const walk = (n: XNode, ctm: Mat, inherited: Style, depth: number) => {
    const tag = local(n.name);
    if (n.name === "#text" || SKIP.has(tag) || n.attrs.get("display") === "none" || depth > 12)
      return;
    const m = mul(ctm, parseTransform(n.attrs.get("transform")));
    const a = (k: string) => {
      const v = n.attrs.get(k);
      return v === undefined || v === "inherit" ? undefined : v.trim();
    };
    const s: Style = {
      ...inherited,
      fill: a("fill") ?? inherited.fill,
      stroke: a("stroke") ?? inherited.stroke,
      width:
        a("stroke-width") !== undefined ? (numbers(a("stroke-width"))[0] ?? 1) : inherited.width,
      cap: a("stroke-linecap") ?? inherited.cap,
      join: a("stroke-linejoin") ?? inherited.join,
      miter: a("stroke-miterlimit") ?? inherited.miter,
      rule: a("fill-rule") ?? inherited.rule,
      fillOpacity: a("fill-opacity") ?? inherited.fillOpacity,
      strokeOpacity: a("stroke-opacity") ?? inherited.strokeOpacity,
      opacity: inherited.opacity * (numbers(a("opacity"))[0] ?? 1),
      hidden: a("visibility") ? a("visibility") === "hidden" : inherited.hidden,
    };
    const effects = ["clip-path", "mask", "filter"].filter((k) => a(k) && a(k) !== "none");
    if (tag === "use") {
      const ref = byId.get((n.attrs.get("href") ?? "").slice(1));
      if (!ref) return;
      const placed = mul(m, [1, 0, 0, 1, numbers(a("x"))[0] ?? 0, numbers(a("y"))[0] ?? 0]);
      if (local(ref.name) === "symbol") for (const c of ref.children) walk(c, placed, s, depth + 1);
      else walk(ref, placed, s, depth + 1);
      return;
    }
    if (tag === "text" || tag === "textpath") {
      texts += 1;
      return;
    }
    const subs = shapeSubs(n, bad);
    if (subs) {
      const filled = tag !== "line" && normalizeColor(s.fill ?? "#000000") !== undefined;
      const stroked =
        s.stroke !== undefined && normalizeColor(s.stroke) !== undefined && s.width > 0;
      if (!s.hidden && s.opacity > 0 && (filled || stroked))
        parts.push({
          tag,
          subs: subs.map((sub) => transformSub(sub, m)),
          fill: s.fill,
          stroke: s.stroke,
          width: s.width * scaleOf(m),
          cap: s.cap,
          join: s.join,
          miter: s.miter,
          rule: s.rule,
          opacity: s.opacity,
          fillOpacity: s.fillOpacity,
          strokeOpacity: s.strokeOpacity,
          filled,
          stroked,
          effects,
        });
      return;
    }
    const before = parts.length;
    for (const c of n.children) walk(c, m, s, depth);
    if (effects.length) for (const p of parts.slice(before)) p.effects.push(...effects);
  };
  // The root's own transform is not part of the viewBox space (and editors never set one).
  const start: Style = { width: 1, cap: "butt", join: "miter", opacity: 1, hidden: false };
  for (const c of root.children) walk(c, IDENTITY, { ...start, ...rootStyle(root, start) }, 0);
  return { viewBox, parts, texts };
}

function rootStyle(root: XNode, base: Style): Partial<Style> {
  const a = (k: string) => root.attrs.get(k)?.trim();
  return {
    fill: a("fill"),
    stroke: a("stroke"),
    width: a("stroke-width") !== undefined ? (numbers(a("stroke-width"))[0] ?? 1) : base.width,
    cap: a("stroke-linecap") ?? base.cap,
    join: a("stroke-linejoin") ?? base.join,
    miter: a("stroke-miterlimit"),
    rule: a("fill-rule"),
    fillOpacity: a("fill-opacity"),
    strokeOpacity: a("stroke-opacity"),
    opacity: numbers(a("opacity"))[0] ?? 1,
  };
}

/** The painted bounds of a part: geometry, plus half the stroke. */
const partBox = (p: Part): Box | undefined => {
  let box: Box | undefined;
  for (const s of p.subs) if (s.segs.length) box = union(box, subBox(s));
  return box && p.stroked ? grow(box, p.width / 2) : box;
};

// ---------------------------------------------------------------- rules

export interface IconRule {
  id: string;
  title: string;
  fix: string;
}

/** The drawing rules (references/icons.md has the full text); every check failure cites one. */
export const ICON_RULES: IconRule[] = [
  {
    id: "IC01",
    title: "24 grid with a 2 px safe area",
    fix: 'draw on viewBox="0 0 24 24" and keep every edge, stroke included, between 2 and 22 (`orrery icons adopt` refits a drawing)',
  },
  {
    id: "IC02",
    title: "one stroke weight",
    fix: "give every stroke the same stroke-width, 1.5 (1.25 to 2 passes), set once on the root",
  },
  {
    id: "IC03",
    title: "round caps and joins",
    fix: 'set stroke-linecap="round" and stroke-linejoin="round" on the root',
  },
  {
    id: "IC04",
    title: "currentColor only",
    fix: 'paint with currentColor and none only, and set fill="none" (line art) or fill="currentColor" on the root so nothing falls back to black',
  },
  {
    id: "IC05",
    title: "no text or letters; identity by geometry",
    fix: "show what the thing is with its shape (a fold, a cut, a handle), never letters; delete the <text>",
  },
  {
    id: "IC06",
    title: "two to six parts, silhouette first",
    fix: "draw one silhouette that reads alone, then one to five details; merge or drop the rest",
  },
  {
    id: "IC07",
    title: "optical size matches Tabler",
    fix: "scale the drawing so its larger side, stroke included, spans 16 to 20 of the 24 units, centered on 12,12",
  },
  {
    id: "IC08",
    title: "no detail under 1 px at 24",
    fix: "make every stroke and every filled part at least 1 unit; details smaller vanish at 24 px",
  },
  {
    id: "IC09",
    title: "adopt by rebuilding, never tracing",
    fix: "rebuild it from two to six simple paths; traced outlines carry hundreds of nodes and blur when small",
  },
  {
    id: "IC10",
    title: "check passes and the sheet was looked at",
    fix: "fix every rule above, then open the contact sheet and look at all four tiles before handing over",
  },
];

export interface RuleResult extends IconRule {
  ok: boolean;
  /** What failed, measured. */
  problems: string[];
  /** Context for a passing rule ("no strokes: filled artwork"). */
  note?: string;
}

/** Traced artwork runs to hundreds of commands; Tabler's busiest outline icon (3.49) has 56. */
export const MAX_COMMANDS = 80;
const TOL = 0.05;

const r2 = (x: number) => Math.round(x * 100) / 100;
const range = (a: number, b: number) => (r2(a) === r2(b) ? `${r2(a)}` : `${r2(a)} to ${r2(b)}`);

export interface IconCheck {
  results: RuleResult[];
  /** Painted bounds on the 24 grid: x0, y0, x1, y1. */
  box: [number, number, number, number];
  parts: number;
  commands: number;
  /** Distinct stroke widths on the 24 grid. */
  widths: number[];
}

/** Measures a drawing against IC01..IC10. Throws LocalIconError when the file is unusable. */
export function checkIcon(text: string, file: string): IconCheck {
  const bad: Bad = (problem, fix) => new LocalIconError(file, problem, fix);
  // The loader's own checks first: an icon that cannot load cannot pass.
  localArt(text, file);
  const root = sanitize(parseXml(text, bad), bad);
  const d = drawingOf(root, bad);
  const [vx, vy, vw, vh] = d.viewBox;
  // Rules are written for the 24 grid; other grids are measured as if scaled to it.
  const unit = 24 / Math.max(vw, vh);
  const to24 = (b: Box): Box => [
    (b[0] - vx) * unit,
    (b[1] - vy) * unit,
    (b[2] - vx) * unit,
    (b[3] - vy) * unit,
  ];
  const out: Record<string, { problems: string[]; note?: string }> = {};
  for (const r of ICON_RULES) out[r.id] = { problems: [] };
  const fail = (id: string, problem: string) => out[id]?.problems.push(problem);
  const note = (id: string, text: string) => {
    const o = out[id];
    if (o) o.note = text;
  };

  let painted: Box | undefined;
  for (const p of d.parts) {
    const b = partBox(p);
    if (b) painted = union(painted, to24(b));
  }
  if (!painted) throw bad("draws nothing visible", "draw two to six shapes on a 24 grid (IC06)");

  // IC01
  if (vx !== 0 || vy !== 0 || vw !== 24 || vh !== 24)
    fail("IC01", `viewBox is "${d.viewBox.join(" ")}", not "0 0 24 24"`);
  if (
    painted[0] < 2 - TOL ||
    painted[1] < 2 - TOL ||
    painted[2] > 22 + TOL ||
    painted[3] > 22 + TOL
  )
    fail(
      "IC01",
      `the drawing reaches x ${range(painted[0], painted[2])}, y ${range(painted[1], painted[3])}; the safe area is 2 to 22`,
    );

  // IC02
  const stroked = d.parts.filter((p) => p.stroked);
  const widths = [...new Set(stroked.map((p) => r2(p.width * unit)))].sort((a, b) => a - b);
  if (widths.length > 1) fail("IC02", `${widths.length} stroke widths: ${widths.join(", ")}`);
  else if (widths[0] !== undefined && (widths[0] < 1.25 - TOL || widths[0] > 2 + TOL))
    fail("IC02", `stroke-width is ${widths[0]} on the 24 grid`);
  if (!stroked.length) note("IC02", "no strokes: filled artwork");

  // IC03
  const caps = stroked.filter((p) => p.cap !== "round");
  const joins = stroked.filter((p) => p.join !== "round");
  if (caps.length) fail("IC03", `${caps.length} stroke(s) end ${caps[0]?.cap} instead of round`);
  if (joins.length)
    fail("IC03", `${joins.length} stroke(s) join ${joins[0]?.join} instead of round`);
  if (!stroked.length) note("IC03", "no strokes");

  // IC04
  const unset = d.parts.filter((p) => p.filled && p.fill === undefined).length;
  if (unset) fail("IC04", `${unset} shape(s) set no fill, so they draw black`);
  const other = new Set<string>();
  for (const p of d.parts) {
    if (p.filled && p.fill !== undefined && normalizeColor(p.fill) !== "currentColor")
      other.add(p.fill);
    if (p.stroked && normalizeColor(p.stroke ?? "") !== "currentColor") other.add(p.stroke ?? "");
  }
  if (other.size) fail("IC04", `paints with ${[...other].slice(0, 4).join(", ")}`);

  // IC05
  if (d.texts) fail("IC05", `${d.texts} text element(s)`);

  // IC06: holes and details both count; a lone moveto draws nothing.
  const parts = d.parts.reduce((n, p) => n + p.subs.filter((s) => s.segs.length).length, 0);
  if (parts < 2 || parts > 6) fail("IC06", `${parts} part(s)`);

  // IC07
  const side = Math.max(painted[2] - painted[0], painted[3] - painted[1]);
  const cx = (painted[0] + painted[2]) / 2;
  const cy = (painted[1] + painted[3]) / 2;
  if (side < 16 - TOL || side > 20 + TOL) fail("IC07", `the larger side spans ${r2(side)} units`);
  if (Math.hypot(cx - 12, cy - 12) > 1.5)
    fail(
      "IC07",
      `the drawing is centered at ${r2(cx)},${r2(cy)}, ${r2(Math.hypot(cx - 12, cy - 12))} units off 12,12`,
    );

  // IC08
  const thin = stroked.filter((p) => p.width * unit < 1 - TOL);
  if (thin.length) fail("IC08", `${thin.length} stroke(s) thinner than 1 unit`);
  let tiny = 0;
  for (const p of d.parts)
    for (const s of p.subs) {
      if (!s.segs.length) continue;
      const b = to24(subBox(s));
      const extent = Math.max(b[2] - b[0], b[3] - b[1]);
      // A dot (a zero-length stroke with round caps) is a deliberate detail.
      if (p.stroked ? extent > TOL && extent < 1 - TOL : extent < 1 - TOL) tiny += 1;
    }
  if (tiny) fail("IC08", `${tiny} detail(s) smaller than 1 unit`);

  // IC09
  const commands = d.parts.reduce((n, p) => n + p.subs.reduce((m, s) => m + s.cmds, 0), 0);
  if (commands > MAX_COMMANDS)
    fail(
      "IC09",
      `${commands} drawing commands; traced outlines run to hundreds, a drawn icon stays under ${MAX_COMMANDS}`,
    );

  const results = ICON_RULES.map((r) => {
    const o = out[r.id] ?? { problems: [] };
    return {
      ...r,
      ok: !o.problems.length,
      problems: o.problems,
      ...(o.note ? { note: o.note } : {}),
    };
  });
  // IC10 passes only with all the others.
  const last = results[results.length - 1];
  if (last && results.slice(0, -1).some((r) => !r.ok)) {
    last.ok = false;
    last.problems.push("the rules above do not all pass yet");
  }
  return { results, box: painted.map(r2) as Box, parts, commands, widths };
}

// ---------------------------------------------------------------- new and adopt

/** A starter on the 24 grid that passes check; its parts are placeholders to draw over. */
export function starterIcon(name: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ${name}: a 24 grid. Keep every edge, stroke included, between 2 and 22. -->
  <!-- Replace these placeholder parts with two to six of your own, silhouette first. -->
  <rect x="4" y="4" width="16" height="16" rx="3"/>
  <path d="M8 12h8"/>
  <path d="M12 8v8"/>
</svg>
`;
}

const fmt = (x: number) => {
  const v = Math.round(x * 100) / 100;
  return Object.is(v, -0) ? "0" : String(v);
};

function pathData(subs: Sub[], m: Mat): string {
  const out: string[] = [];
  for (const raw of subs) {
    if (!raw.segs.length) continue;
    const s = transformSub(raw, m);
    out.push(`M${fmt(s.from[0])} ${fmt(s.from[1])}`);
    let p = s.from;
    s.segs.forEach((g, i) => {
      const last = i === s.segs.length - 1;
      if (g.c) out.push(`C${[...g.c[0], ...g.c[1], ...g.to].map(fmt).join(" ")}`);
      else if (
        last &&
        s.closed &&
        fmt(g.to[0]) === fmt(s.from[0]) &&
        fmt(g.to[1]) === fmt(s.from[1])
      ) {
        // Z draws the closing line.
      } else if (fmt(g.to[0]) === fmt(p[0]) && fmt(g.to[1]) === fmt(p[1]) && s.segs.length > 1) {
        // Gone after rounding; a lone zero-length segment stays, it is a round-capped dot.
      } else if (fmt(g.to[1]) === fmt(p[1])) out.push(`H${fmt(g.to[0])}`);
      else if (fmt(g.to[0]) === fmt(p[0])) out.push(`V${fmt(g.to[1])}`);
      else out.push(`L${fmt(g.to[0])} ${fmt(g.to[1])}`);
      p = g.to;
    });
    if (s.closed) out.push("Z");
  }
  return out.join("");
}

export interface Adopted {
  svg: string;
  notes: string[];
}

/**
 * Someone's SVG as a clean local icon: metadata, comments, editor attributes and styles gone,
 * every shape a path on the 24 grid, the drawing fitted into the 2 px safe area, one-color art
 * painted with currentColor. It does not redraw anything: check says what still needs rebuilding.
 */
export function adoptIcon(text: string, file: string): Adopted {
  const bad: Bad = (problem, fix) => new LocalIconError(file, problem, fix);
  const root = sanitize(parseXml(text, bad), bad, true);
  const d = drawingOf(root, bad);
  const notes: string[] = [];
  if (d.texts)
    throw bad(
      `has ${d.texts} text element(s), which cannot be adopted`,
      "draw the identity as geometry (IC05), delete the <text> and run adopt again",
    );
  for (const p of d.parts) {
    for (const v of [p.filled ? p.fill : undefined, p.stroked ? p.stroke : undefined])
      if (v && /^\s*url\(/i.test(v))
        throw bad(
          "paints with a gradient or pattern",
          "repaint it in one flat color (IC04), then adopt it",
        );
    if (p.effects.some((e) => e !== "clip-path"))
      throw bad(
        `uses ${p.effects.join(" and ")}`,
        "flatten the effect in the editor or rebuild the shape (IC09)",
      );
  }
  if (d.parts.some((p) => p.effects.includes("clip-path")))
    notes.push("dropped clip paths (editors frame drawings with one); look at the sheet");
  let box: Box | undefined;
  for (const p of d.parts) {
    const b = partBox(p);
    if (b) box = union(box, b);
  }
  if (!box) throw bad("draws nothing visible", "draw two to six shapes on a 24 grid (IC06)");
  const side = Math.max(box[2] - box[0], box[3] - box[1]);
  if (!(side > 0)) throw bad("draws nothing visible", "draw two to six shapes on a 24 grid (IC06)");
  // The painted bounds fill the 20 unit live area, centered.
  const k = 20 / side;
  const fit: Mat = [k, 0, 0, k, 12 - (k * (box[0] + box[2])) / 2, 12 - (k * (box[1] + box[3])) / 2];
  if (Math.abs(k - 1) > 0.005)
    notes.push(`scaled by ${fmt(k)} so the drawing fills the 2 to 22 safe area`);
  const colors = new Set<string>();
  for (const p of d.parts) {
    if (p.filled) colors.add(normalizeColor(p.fill ?? "#000000") ?? "");
    if (p.stroked) colors.add(normalizeColor(p.stroke ?? "") ?? "");
  }
  colors.delete("currentColor");
  const mono = colors.size <= 1;
  if (mono) notes.push("one color: painted with currentColor");
  else notes.push(`${colors.size} colors kept; IC04 asks for one, so rebuild it in currentColor`);
  const paint = (v: string | undefined) =>
    mono ? "currentColor" : (normalizeColor(v ?? "#000000") ?? "none");
  const rows = d.parts.map((p) => {
    const a: Record<string, string> = {
      fill: p.filled ? paint(p.fill) : "none",
      stroke: p.stroked ? paint(p.stroke) : "none",
    };
    if (p.stroked) {
      a["stroke-width"] = fmt(p.width * k);
      a["stroke-linecap"] = p.cap;
      a["stroke-linejoin"] = p.join;
      if (p.miter && p.join === "miter") a["stroke-miterlimit"] = p.miter;
      if (p.strokeOpacity) a["stroke-opacity"] = p.strokeOpacity;
    }
    if (p.filled && p.rule === "evenodd") a["fill-rule"] = "evenodd";
    if (p.filled && p.fillOpacity) a["fill-opacity"] = p.fillOpacity;
    if (p.opacity < 1) a.opacity = fmt(p.opacity);
    return { d: pathData(p.subs, fit), a };
  });
  // Attributes every path shares move to the root; stroke details count as shared when only
  // stroked paths carry them.
  const shared: Record<string, string> = {};
  const keys = new Set(rows.flatMap((r) => Object.keys(r.a)));
  for (const key of keys) {
    const strokeOnly = key.startsWith("stroke-");
    const carriers = rows.filter((r) => !strokeOnly || r.a.stroke !== "none");
    const values = new Set(carriers.map((r) => r.a[key]));
    if (carriers.length && values.size === 1 && !values.has(undefined))
      shared[key] = [...values][0] ?? "";
  }
  // stroke="none" is the default; neither the root nor a path needs to say it.
  if (shared.stroke === "none") delete shared.stroke;
  const attrs = (a: Record<string, string>) =>
    Object.entries(a)
      .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
      .join("");
  const rootAttrs = attrs(shared);
  const body = rows
    .filter((r) => r.d)
    .map((r) => {
      const own = Object.fromEntries(
        Object.entries(r.a).filter(
          ([k, v]) =>
            shared[k] !== v &&
            !(k === "stroke" && v === "none" && shared.stroke === undefined) &&
            !(k.startsWith("stroke-") && r.a.stroke === "none"),
        ),
      );
      return `  <path d="${r.d}"${attrs(own)}/>`;
    })
    .join("\n");
  notes.unshift(`${d.parts.length} shape(s) rebuilt as paths on the 24 grid`);
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${rootAttrs}>\n${body}\n</svg>\n`,
    notes,
  };
}
