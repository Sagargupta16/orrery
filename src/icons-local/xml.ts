// A small XML reader and writer for icon files: elements, attributes and text.

import type { Bad } from "./errors.ts";

export interface XNode {
  name: string;
  attrs: Map<string, string>;
  children: XNode[];
  /** Character data of a "#text" node. */
  text?: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

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
const MALFORMED = "re-export it from the editor as plain SVG";

/** The opening tag at `lt`: its element, whether it closes itself, and where the tag ends. */
function openTag(
  text: string,
  lt: number,
  bad: Bad,
): { node: XNode; selfClosing: boolean; end: number } {
  TAG.lastIndex = lt;
  const name = TAG.exec(text)?.[1];
  if (!name)
    throw bad(`is not well-formed XML near ${JSON.stringify(text.slice(lt, lt + 24))}`, MALFORMED);
  const node: XNode = { name, attrs: new Map(), children: [] };
  let j = TAG.lastIndex;
  for (;;) {
    ATTR.lastIndex = j;
    const a = ATTR.exec(text);
    if (!a) throw bad(`has a malformed <${node.name}> tag`, MALFORMED);
    j = ATTR.lastIndex;
    if (a[4]) return { node, selfClosing: a[4] === "/>", end: j };
    node.attrs.set(a[1] ?? "", decode(a[2] ?? a[3] ?? "", bad));
  }
}

/** A small XML reader: elements, attributes and text. DOCTYPE entity declarations are refused. */
export function parseXml(text: string, bad: Bad): XNode {
  const doc: XNode = { name: "#document", attrs: new Map(), children: [] };
  const stack: XNode[] = [doc];
  const top = () => stack[stack.length - 1] ?? doc;
  const pushText = (raw: string) => {
    if (top() === doc || !raw.trim()) return;
    top().children.push({ name: "#text", attrs: new Map(), children: [], text: decode(raw, bad) });
  };
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
      if (at < 0) throw bad(`has ${what} that never ends`, MALFORMED);
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
      if (close < 0) throw bad("has a DOCTYPE that never ends", MALFORMED);
      if (bracket >= 0 && bracket < close)
        throw bad(
          "declares its own entities in a DOCTYPE",
          "delete the DOCTYPE; an icon needs none",
        );
      i = close + 1;
    } else if (text[lt + 1] === "/") {
      const close = text.indexOf(">", lt);
      if (close < 0) throw bad("is not well-formed XML (a closing tag never ends)", MALFORMED);
      const name = text.slice(lt + 2, close).trim();
      const open = stack.pop();
      if (!open || open === doc || open.name !== name)
        throw bad(
          `is not well-formed XML: </${name}> closes <${open && open !== doc ? open.name : "nothing"}>`,
          MALFORMED,
        );
      i = close + 1;
    } else {
      const { node, selfClosing, end } = openTag(text, lt, bad);
      top().children.push(node);
      if (!selfClosing) stack.push(node);
      i = end;
    }
  }
  if (stack.length > 1)
    throw bad(`is not well-formed XML: <${top().name}> is never closed`, MALFORMED);
  const root = doc.children.find((c) => c.name !== "#text");
  if (!root || local(root.name) !== "svg")
    throw bad("is not an SVG file (its root element is not <svg>)", "save the drawing as .svg");
  return root;
}

/** Lowercase element name without a namespace prefix. */
export const local = (name: string) => (name.split(":").pop() ?? name).toLowerCase();

export const escAttr = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const escText = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function serialize(n: XNode): string {
  if (n.name === "#text") return escText(n.text ?? "");
  const attrs = [...n.attrs].map(([k, v]) => ` ${k}="${escAttr(v)}"`).join("");
  const inner = n.children.map(serialize).join("");
  return inner ? `<${n.name}${attrs}>${inner}</${n.name}>` : `<${n.name}${attrs}/>`;
}
