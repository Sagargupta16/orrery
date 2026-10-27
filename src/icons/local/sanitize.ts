// The sanitizer: refuses what is unsafe, drops what draws nothing, and reads the viewBox.

import type { Bad } from "./errors.ts";
import { local, type XNode } from "./xml.ts";

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
  "fill fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity color display visibility clip-path clip-rule mask mask-type filter stop-color stop-opacity flood-color flood-opacity lighting-color color-interpolation color-interpolation-filters mix-blend-mode isolation transform-origin transform-box font-family font-size font-weight font-style text-anchor dominant-baseline letter-spacing paint-order vector-effect shape-rendering marker-start marker-mid marker-end".split(
    " ",
  ),
);

/**
 * CSS reads u\72l( as url( and image-set('a.png' 1x) (or image(), cross-fade(), element()) as
 * an image to load, so a value with a backslash escape or one of those functions may point
 * outside the file. An icon needs neither.
 */
const hidesUrl = (value: string) =>
  value.includes("\\") || /\b(?:image-set|image|cross-fade|element)\s*\(/i.test(value);

/** url(#id) as CSS reads it, quoted or not, with spaces: url(#g), url('#g'), url( " #g " ). */
export const LOCAL_URL = /url\(\s*(["']?)\s*#([^)"'\s]+)\s*\1\s*\)/gi;

/** Nesting deeper than this is no icon, and would overflow the stack of every walk over it. */
const MAX_DEPTH = 64;
/** Elements once every <use> is expanded; past this it is copies of copies, not artwork. */
const MAX_ELEMENTS = 20000;

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

/**
 * True when a url(...) in the value points anywhere but an id in this file. The value inside the
 * parentheses is read whole, so url(#g), url('#g') and url( #g ) are all the file's own ids; an
 * unclosed url( counts as outside.
 */
function externalUrl(value: string): boolean {
  if (/url\((?![^)]*\))/i.test(value)) return true;
  return [...value.matchAll(/url\(([^)]*)\)/gi)].some(
    (m) => !/^(["']?)\s*#[^"'\s]+\s*\1$/.test((m[1] ?? "").trim()),
  );
}

/**
 * Refuses anything unsafe and removes what draws nothing: metadata, comments, editor namespaces,
 * classes, inline styles (which become attributes). With `adopt`, simple <style> rules are moved
 * onto the shapes instead of refused.
 */
export function sanitize(root: XNode, bad: Bad, adopt = false): XNode {
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
  const hidden = (key: string, el: string) =>
    bad(
      `points outside the file in ${key} on <${el}>`,
      "an icon may only reference its own ids, url(#id); write the value without a backslash escape, image-set(), image(), cross-fade() or element()",
    );
  const visit = (n: XNode, depth: number): XNode | undefined => {
    if (n.name === "#text") return n;
    if (n.name === "#style") return undefined;
    if (depth > MAX_DEPTH)
      throw bad(
        `nests elements more than ${MAX_DEPTH} deep`,
        "flatten the groups in the editor; an icon is a few shapes",
      );
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
      if (externalUrl(value))
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
      if (hidesUrl(value)) throw hidden(rawKey, n.name);
      attrs.set(rawKey, value);
    }
    // Stylesheet rules beat presentation attributes, inline styles beat both (CSS cascade).
    for (const [k, v] of styled) {
      if (!PRESENTATION.has(k)) continue;
      if (hidesUrl(v) || externalUrl(v) || /javascript:/i.test(v.replace(/\s/g, "")))
        throw hidden(k, n.name);
      attrs.set(k, v);
    }
    const children = n.children.map((c) => visit(c, depth + 1)).filter((c): c is XNode => !!c);
    const keepText = tag === "text" || tag === "tspan" || tag === "textpath";
    return {
      name: n.name,
      attrs,
      children: keepText ? children : children.filter((c) => c.name !== "#text"),
    };
  };
  const clean = visit(root, 0);
  if (!clean) throw bad("draws nothing", "draw two to six shapes on a 24 grid (IC06)");
  checkUses(clean, bad);
  return clean;
}

/**
 * Refuses a <use> inside what it copies (a copy that never ends) and an icon whose copies of
 * copies expand past MAX_ELEMENTS, before anything (a browser, `icons check`) expands them.
 */
function checkUses(root: XNode, bad: Bad): void {
  const byId = new Map<string, XNode>();
  const index = (n: XNode) => {
    const id = n.attrs.get("id");
    if (id) byId.set(id, n);
    n.children.forEach(index);
  };
  index(root);
  const counted = new Map<XNode, number>();
  const open = new Set<XNode>();
  const count = (n: XNode): number => {
    const known = counted.get(n);
    if (known !== undefined) return known;
    if (open.has(n))
      throw bad(
        "has a <use> inside the element it copies, a copy that never ends",
        "point the <use> at an element outside it, or delete it",
      );
    open.add(n);
    let total = 1;
    for (const c of n.children) if (c.name !== "#text") total += count(c);
    const ref =
      local(n.name) === "use" ? byId.get((n.attrs.get("href") ?? "").slice(1)) : undefined;
    if (ref) total += count(ref);
    open.delete(n);
    if (total > MAX_ELEMENTS)
      throw bad(
        `draws more than ${MAX_ELEMENTS} elements once its <use> copies are expanded`,
        "draw the shapes once instead of copying copies; an icon is a few shapes (IC06)",
      );
    counted.set(n, total);
    return total;
  };
  try {
    count(root);
  } catch (e) {
    // A chain of thousands of <use> hops outruns the stack before the count does.
    if (e instanceof RangeError)
      throw bad("chains <use> copies too deep", "draw the shapes once instead of copying copies");
    throw e;
  }
}

/** The viewBox, or 0 0 width height. */
export function viewBoxOf(root: XNode, bad: Bad): [number, number, number, number] {
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
