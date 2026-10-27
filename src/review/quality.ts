// The quality dimension: text and icon sizes at the display width, WCAG text contrast in every
// theme, and the size of the story (node count, long labels, mid-word breaks).
import { turnFix } from "../check/canvas.ts";
import { contrast, isHex, mixHex } from "../color.ts";
import { tokensFor } from "../themes.ts";
import type { Box, Scene, SceneGroup, ThemeName } from "../types.ts";
import { inBox, r1, r2 } from "./geometry.ts";
import type { Ctx } from "./types.ts";

interface TextItem {
  id: string;
  what: string;
  fg: string;
  bg: string;
  size: number;
  weight: number;
}

/** Every text run in a scene with the color it is drawn in and the worst surface under it. */
function textItems(scene: Scene): TextItem[] {
  const t = tokensFor(scene);
  const canvas =
    scene.background && scene.background !== "transparent" ? scene.background : t.background;
  const byDepth = [...scene.groups].sort((a, b) => a.depth - b.depth);
  const surfaceAt = (x: number, y: number) => {
    let col = canvas;
    for (const g of byDepth) {
      if (g.fill !== "none" && inBox(x, y, g.box)) col = g.fill;
      if (g.inner && inBox(x, y, g.inner.box)) col = g.inner.fill;
    }
    return col;
  };
  const samples = (b: Box) => [
    surfaceAt(b.x + b.w / 2, b.y + b.h / 2),
    surfaceAt(b.x + 1, b.y + 1),
    surfaceAt(b.x + b.w - 1, b.y + 1),
    surfaceAt(b.x + 1, b.y + b.h - 1),
    surfaceAt(b.x + b.w - 1, b.y + b.h - 1),
  ];
  // As svg.ts surfaceBehind: a header chip takes the nearest filled group's color.
  const behind = (g: SceneGroup): string => {
    if (g.overlay) {
      const under = scene.groups
        .filter((x) => !x.overlay && x.fill !== "none" && inBox(g.labelBox.x, g.box.y, x.box))
        .sort((a, b) => b.depth - a.depth)[0];
      if (under) return under.fill;
    }
    let cur: SceneGroup | undefined = g.overlay ? undefined : g;
    while (cur) {
      if (cur.fill !== "none") return cur.fill;
      const parent = cur.parent;
      cur = parent ? scene.groups.find((x) => x.id === parent) : undefined;
    }
    return canvas;
  };
  const out: TextItem[] = [];
  const push = (
    id: string,
    what: string,
    fg: string,
    bgs: string[],
    size: number,
    weight: number,
  ) => {
    const valid = bgs.filter(isHex);
    if (!isHex(fg) || !valid.length) return;
    const bg = valid.reduce((w, b) => (contrast(fg, b) < contrast(fg, w) ? b : w));
    out.push({ id, what, fg, bg, size, weight });
  };
  if (scene.title && scene.titleBox)
    push("title", "title", t.text, [canvas], scene.title.size, scene.title.weight);
  if (scene.subtitle && scene.subtitleBox)
    push("subtitle", "subtitle", t.muted, [canvas], scene.subtitle.size, scene.subtitle.weight);
  for (const g of scene.groups)
    if (g.label.lines.length)
      push(g.id, "group label", g.labelColor, [behind(g)], g.label.size, g.label.weight);
  for (const n of scene.nodes) {
    const shapeFill = n.color
      ? mixHex(n.color, canvas, scene.theme === "dark" ? 0.16 : 0.1)
      : t.surface;
    const under = (b: Box) =>
      n.look === "card" ? [t.surface] : n.look === "shape" ? [shapeFill] : samples(b);
    const ink = n.look === "card" ? t.text : (n.ink ?? t.text);
    const muted = n.look === "card" ? t.muted : (n.inkMuted ?? t.muted);
    if (n.label.lines.length)
      push(n.id, "label", ink, under(n.labelBox), n.label.size, n.label.weight);
    if (n.note && n.noteBox)
      push(n.id, "note", muted, under(n.noteBox), n.note.size, n.note.weight);
    if (n.badge) push(n.id, "badge", t.stepText, [t.stepFill], 10, 600);
  }
  const chipFill =
    scene.background === "transparent" ? t.background : (scene.background ?? t.background);
  for (const e of scene.edges) {
    if (e.label && e.labelBox)
      push(
        e.id,
        "edge label",
        t.edgeLabel,
        samples(e.labelBox).map((u) => mixHex(chipFill, u, 0.92)),
        e.label.size,
        e.label.weight,
      );
    if (e.step !== undefined && e.stepBox) push(e.id, "step", t.stepText, [t.stepFill], 14, 600);
  }
  for (const item of scene.legend?.items ?? [])
    push("legend", `legend ${item.line}`, t.text, [t.surface], item.label.size, item.label.weight);
  return out;
}

export function measureQuality(c: Ctx, scenes: Scene[]): void {
  const m = c.metrics.quality;

  const { nodeLabelPx, others, textPx, iconPx } = legibility(c);
  const { failures, worst, themes } = contrastFailures(c, scenes);
  c.hard.contrastFailures = failures;
  const n = storySize(c);

  Object.assign(m, {
    nodeLabelPx: r2(nodeLabelPx),
    smallestTextPx: others ? r2(textPx) : "none",
    iconPx: r1(iconPx),
    contrastFailures: failures,
    contrastMin: r2(worst),
    themes: themes.join(","),
    nodes: n,
    edges: c.model.edges.length,
    groups: c.model.groups.length,
  });
}

/** Legibility at the display width. `others` counts the texts besides node labels. */
function legibility(c: Ctx): {
  nodeLabelPx: number;
  others: number;
  textPx: number;
  iconPx: number;
} {
  const { scene, add, s } = c;
  // A turn swaps width and height, so it narrows only a canvas wider than it is tall.
  const narrower =
    scene.width > scene.height ? turnFix(c.model, " so the diagram is narrower") : [];
  const nodeSizes = scene.nodes.filter((n) => n.label.lines.length).map((n) => n.label.size);
  const nodeLabelPx = (nodeSizes.length ? Math.min(...nodeSizes) : 13) * s;
  if (nodeLabelPx < 10) {
    add(
      "quality.label-size",
      nodeLabelPx < 6 ? "blocker" : nodeLabelPx < 8 ? "major" : "minor",
      [],
      {
        nodeLabelPx: r2(nodeLabelPx),
        scale: r2(s),
        canvasW: scene.width,
        width: c.width,
      },
      `node labels render at ${r2(nodeLabelPx)}px at this width (${scene.width}px canvas shown at ${r2(s)}x)`,
      [
        ...narrower,
        "split into an overview and detail diagrams",
        "move detail from labels into note and drop nodes the reader does not need",
      ],
      (10 - nodeLabelPx) * 9,
    );
  }
  const others = [
    ...scene.nodes.flatMap((n) => [n.note?.size, n.badge ? 10 : undefined]),
    ...scene.edges.flatMap((e) => [e.label?.size, e.step !== undefined ? 14 : undefined]),
    ...scene.groups.map((g) => (g.label.lines.length ? g.label.size : undefined)),
    scene.subtitle?.size,
    ...(scene.legend?.items.map((i) => i.label.size) ?? []),
  ].filter((v): v is number => typeof v === "number");
  const smallest = others.length ? Math.min(...others) : 0;
  const textPx = smallest * s;
  if (others.length && textPx < 8) {
    add(
      "quality.text-size",
      textPx < 6 ? "major" : "minor",
      [],
      { smallestTextPx: r2(textPx), fontPx: smallest, scale: r2(s) },
      `the smallest text (${smallest}px notes, edge labels or badges) renders at ${r2(textPx)}px`,
      ["shorten notes and edge labels or drop them", ...narrower],
      (8 - textPx) * 4,
    );
  }
  const icons = scene.nodes
    .filter((n) => n.look === "icon" && n.iconBox)
    .map((n) => n.iconBox?.h ?? 0);
  const iconPx = (icons.length ? Math.min(...icons) : 48) * s;
  if (icons.length && iconPx < 20)
    add(
      "quality.icon-size",
      "minor",
      [],
      { iconPx: r1(iconPx), scale: r2(s) },
      `icons render at ${r1(iconPx)}px, too small to tell apart`,
      [...narrower, "split the diagram"],
      (20 - iconPx) * 1.5,
    );
  return { nodeLabelPx, others: others.length, textPx, iconPx };
}

/** WCAG 2.2 text contrast in every theme (1.4.3: 4.5:1, large text 3:1). */
function contrastFailures(
  c: Ctx,
  scenes: Scene[],
): { failures: number; worst: number; themes: ThemeName[] } {
  const { add } = c;
  let failures = 0;
  let worst = 21;
  const themes: ThemeName[] = [];
  for (const sc of scenes) {
    themes.push(sc.theme);
    for (const it of textItems(sc)) {
      const ratio = contrast(it.fg, it.bg);
      worst = Math.min(worst, ratio);
      const large = it.size >= 24 || (it.size >= 18.66 && it.weight >= 600);
      const need = large ? 3 : 4.5;
      if (ratio + 1e-6 >= need) continue;
      failures++;
      add(
        "quality.contrast",
        ratio < 2 ? "blocker" : "major",
        it.id === "title" || it.id === "subtitle" || it.id === "legend" ? [] : [it.id],
        { theme: sc.theme, what: it.what, fg: it.fg, bg: it.bg, ratio: r2(ratio), needed: need },
        `the ${it.what} of "${it.id}" is ${r2(ratio)}:1 against ${it.bg} in the ${sc.theme} theme (needs ${need}:1)`,
        ["drop the custom color: or fill:", "pick a darker or lighter color: for that element"],
        10,
      );
    }
  }
  return { failures, worst, themes };
}

/** Size of the story: node count, long labels and mid-word breaks. Returns the node count. */
function storySize(c: Ctx): number {
  const { scene, add } = c;
  const n = c.model.nodes.length;
  if (n > 25)
    add(
      "quality.node-count",
      n > 40 ? "major" : "minor",
      [],
      { nodes: n },
      `${n} nodes in one diagram (6 to 25 read well)`,
      ["split into an overview and detail diagrams", "collapse repeated nodes and use badge: x3"],
      (n - 25) * 2,
    );
  for (const node of scene.nodes) {
    if (node.label.lines.length > 3)
      add(
        "quality.long-label",
        "minor",
        [node.id],
        { lines: node.label.lines.length },
        `the label of "${node.id}" wraps to ${node.label.lines.length} lines`,
        ["shorten the label and move detail into note"],
        3,
      );
    const text = c.model.nodes.find((x) => x.id === node.id)?.label ?? "";
    const broken = midWordBreak(text, node.label.lines);
    if (broken)
      add(
        "quality.mid-word-break",
        "minor",
        [node.id],
        { at: broken },
        `the label of "${node.id}" breaks mid-word at "${broken}"`,
        ["use shorter words or a shorter label", "put a line break (\\n) where it should wrap"],
        3,
      );
  }
  return n;
}

/** The two letters around a hard break inside a word, or undefined. CamelCase and hyphen breaks are fine. */
function midWordBreak(text: string, lines: string[]): string | undefined {
  const flat = text.replace(/\s+/g, " ").trim();
  let pos = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i] ?? "";
    if (!flat.startsWith(line, pos)) return undefined;
    pos += line.length;
    if (flat[pos] === " ") {
      pos++;
      continue;
    }
    const prev = flat[pos - 1] ?? "";
    const next = flat[pos] ?? "";
    if (prev === "-" || (/[a-z0-9]/.test(prev) && /[A-Z]/.test(next))) continue;
    return `${prev}|${next}`;
  }
  return undefined;
}
