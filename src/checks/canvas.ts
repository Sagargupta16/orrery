// How big things are and whether they fit: long labels, picture shape and size, the canvas edge.
import type { Box } from "../types.ts";
import type { CheckContext } from "./context.ts";
import { badgeRect, boxOf, EPS, hull, pathBox, tenth } from "./geometry.ts";

/** DG204: long labels wrap to many lines. */
export function longLabels({ scene, warn }: CheckContext): void {
  for (const n of scene.nodes) {
    if (n.label.lines.length > 3) {
      warn("DG204", `node "${n.id}" label wraps to ${n.label.lines.length} lines`, {
        subject: { node: n.id },
        evidence: { lines: n.label.lines },
        fixes: ["shorten the label and move detail into note"],
      });
    }
  }
}

/** DG205: shape of the whole picture. */
export function canvasShape({ scene, opts, warn }: CheckContext): void {
  const maxWidth = opts.maxWidth ?? 2400;
  if (scene.width > maxWidth) {
    warn("DG205", `diagram is ${scene.width}px wide (over ${maxWidth}px)`, {
      evidence: { width: scene.width, height: scene.height },
      fixes: ["use direction: down", "group related nodes", "split into two diagrams"],
    });
  }
  const ratio = scene.width / Math.max(1, scene.height);
  if (ratio > 4.5 && scene.nodes.length > 6) {
    warn("DG205", `diagram is a ${ratio.toFixed(1)}:1 strip, hard to read in docs`, {
      evidence: { width: scene.width, height: scene.height },
      fixes: ["use direction: down for long chains", "group stages into zones"],
    });
  }
  // Tall diagrams are not scaled down in a page column, so only flag ones taller than two screens.
  const tall = scene.height / Math.max(1, scene.width);
  if (tall > 4.5 && scene.height > 1800 && scene.nodes.length > 6) {
    warn("DG205", `diagram is a ${tall.toFixed(1)}:1 tall strip, hard to read in docs`, {
      evidence: { width: scene.width, height: scene.height },
      fixes: [
        "use direction: right for long chains",
        "arrange stages in side-by-side zones",
        "split into two diagrams",
      ],
    });
  }
}

/** DG206: size. */
export function nodeCount({ model, warn }: CheckContext): void {
  if (model.nodes.length > 40) {
    warn("DG206", `${model.nodes.length} nodes in one diagram`, {
      fixes: [
        "split into an overview and detail diagrams",
        "collapse repeated nodes and use badge: x3",
      ],
    });
  }
}

/** A reporter that warns DG210 when a box reaches past any side of the canvas. */
function sticksOut({ scene, warn }: CheckContext) {
  return (
    what: string,
    subject: Record<string, unknown>,
    box: Box | undefined,
    fixes: string[],
  ) => {
    if (!box) return;
    const past = {
      left: -box.x,
      top: -box.y,
      right: box.x + box.w - scene.width,
      bottom: box.y + box.h - scene.height,
    };
    const sides = Object.entries(past).filter(([, v]) => v > EPS);
    if (!sides.length) return;
    warn(
      "DG210",
      `${what} sticks out of the ${scene.width}x${scene.height} canvas (${sides.map(([k, v]) => `${tenth(v)}px past the ${k}`).join(", ")})`,
      {
        subject,
        evidence: {
          box: boxOf(box),
          canvas: { width: scene.width, height: scene.height },
          past: Object.fromEntries(sides.map(([k, v]) => [k, tenth(v)])),
        },
        fixes,
      },
    );
  };
}

/** DG210: something is drawn outside the canvas and gets cut off. */
export function offCanvas(ctx: CheckContext): void {
  const { scene, model } = ctx;
  const off = sticksOut(ctx);
  const spread = ["use layout: { spacing: loose }", "move it elsewhere in the nodes list"];
  off("the title", { title: true }, scene.titleBox, spread);
  off("the subtitle", { subtitle: true }, scene.subtitleBox, spread);
  for (const n of scene.nodes) {
    const parts = [n.box, n.iconBox, n.labelBox, n.noteBox, badgeRect(n)];
    off(`node "${n.id}"`, { node: n.id }, hull(parts), [
      `move "${n.id}" in the nodes list`,
      ...spread,
    ]);
  }
  for (const g of scene.groups) {
    const parts = [g.box, g.label.lines.length ? g.labelBox : undefined, g.iconBox];
    off(`group "${g.id}"`, { group: g.id }, hull(parts), spread);
  }
  for (const e of scene.edges) {
    const free = model.edges.some((x) => x.id === e.id && !x.constraint);
    const fixes = free
      ? [
          "remove constraint: false from this edge so layout reserves room for its label and step",
          "shorten the label",
        ]
      : ["shorten the label", "use layout: { spacing: loose }"];
    const who = `${e.from} -> ${e.to}`;
    off(`the path of edge ${who}`, { edge: e.id, part: "path" }, pathBox(e.points), fixes);
    off(`the label of edge ${who}`, { edge: e.id, part: "label" }, e.labelBox, fixes);
    off(`step ${e.step} of edge ${who}`, { edge: e.id, part: "step" }, e.stepBox, fixes);
  }
  off("the legend", { legend: true }, scene.legend?.box, spread);
}
