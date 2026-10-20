// The colors an icon paints with: one normal form per color, and the one-color test.

import { local, type XNode } from "./xml.ts";

export function normalizeColor(v: string): string | undefined {
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
export const NOT_PAINT = new Set(["clippath", "mask"]);

/** The colors an icon paints with, and whether that makes it one-color artwork. */
export function paintsOf(root: XNode): { colors: Set<string>; current: boolean; servers: boolean } {
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
