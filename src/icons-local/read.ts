// The reader: loads the spec's icon files and converts each to the catalog form renderIcon draws.

import { readFileSync, statSync } from "node:fs";
import { type LocalArt, registerLocalIcon } from "../icons.ts";
import { allDark } from "../libraries.ts";
import type { Model } from "../types.ts";
import { badFor, LocalIconError, shownPath } from "./errors.ts";
import { NOT_PAINT, normalizeColor, paintsOf } from "./paint.ts";
import { sanitize, viewBoxOf } from "./sanitize.ts";
import { escAttr, local, parseXml, serialize, type XNode } from "./xml.ts";

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

/**
 * The catalog form of an icon file: ids made instance-unique with the `sdwid` token renderIcon
 * swaps, root paint on a wrapping group, and single-color artwork turned into a {{c}} template so
 * the classic `color:` and the stage skin's mono painting work.
 */
export function localArt(text: string, file: string): LocalArt {
  const bad = badFor(file);
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
