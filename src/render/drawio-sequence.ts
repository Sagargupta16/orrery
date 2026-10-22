// draw.io cells for a sequence diagram (Scene.sequence): fragments as UML frames with their guards
// and dividers, one `shape=umlLifeline` per participant from under its head to its foot, the
// activation bars, the names at the foot of a tall diagram, and the messages as edges between the
// lifelines at their rows (renderDrawio leaves a sequence's edges to this file).
//
// Called from src/render/drawio.ts renderDrawio after the groups and before the heads, so the cells
// sit over the group panels and under the participants. Every id starts with "seq:".

import { mixHex } from "../color.ts";
import type { Box, Point, Scene } from "../types.ts";
import { type Ctx, FONT, geometry, lineStyle, n, style } from "./drawio.ts";
import { esc } from "./svg.ts";

/** The point halfway along a polyline, where draw.io centers an edge's label. */
function halfway(points: Point[]): Point {
  const lengths = points.slice(1).map((q, i) => {
    const p = points[i] ?? q;
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
  let left = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i] ?? 0;
    const p = points[i];
    const q = points[i + 1];
    if (!p || !q) break;
    if (left <= len && len > 0)
      return { x: p.x + ((q.x - p.x) * left) / len, y: p.y + ((q.y - p.y) * left) / len };
    left -= len;
  }
  return points[0] ?? { x: 0, y: 0 };
}

const value = (lines: string[]) => esc(esc(lines.join(" ")));

export function sequenceDrawio(ctx: Ctx, scene: Scene): string[] {
  const sq = scene.sequence;
  if (!sq) return [];
  const { t } = ctx;
  const bg =
    scene.background && scene.background !== "transparent" ? scene.background : t.background;
  const frame = mixHex(t.edge, bg, 0.55);
  const life = mixHex(t.edge, bg, 0.5);
  const cells: string[] = [];
  const SIZE = 11.5;
  const textCell = (id: string, lines: string[], b: Box, color: string, align = "left") =>
    `<mxCell id="${id}" value="${value(lines)}" style="${style({ text: null, html: 1, align, verticalAlign: "middle", whiteSpace: "nowrap", fontSize: SIZE, fontColor: color, fontFamily: FONT, spacing: 0, labelBackgroundColor: bg })}" vertex="1" parent="1">${geometry(b)}</mxCell>`;

  // Fragments: draw.io's UML frame, its operator in the corner tag.
  sq.fragments.forEach((f, i) => {
    cells.push(
      `<mxCell id="seq:frag:${i}" value="${value(f.tag.label.lines)}" style="${style({ shape: "umlFrame", whiteSpace: "wrap", html: 1, pointerEvents: 0, width: n(f.tag.box.w), height: f.tag.box.h, fillColor: "none", swimlaneFillColor: "none", strokeColor: frame, fontColor: t.text, fontStyle: 1, fontSize: 11, fontFamily: FONT })}" vertex="1" parent="1">${geometry(f.box)}</mxCell>`,
    );
    if (f.label && f.labelBox)
      cells.push(textCell(`seq:frag:${i}:guard`, f.label.lines, f.labelBox, t.edgeLabel));
    f.dividers.forEach((d, j) => {
      cells.push(
        `<mxCell id="seq:frag:${i}:else:${j}" value="" style="${style({ line: null, html: 1, fillColor: "none", strokeColor: frame, strokeWidth: 1, dashed: 1, dashPattern: "6 4" })}" vertex="1" parent="1">${geometry({ x: f.box.x, y: d.y - 5, w: f.box.w, h: 10 })}</mxCell>`,
      );
      if (d.label && d.labelBox)
        cells.push(
          textCell(`seq:frag:${i}:else:${j}:guard`, d.label.lines, d.labelBox, t.edgeLabel),
        );
    });
  });

  // Lifelines: a header too thin to draw, so the head above stays the participant's own node.
  const lines = new Map<string, Box>();
  for (const l of sq.lifelines) {
    const b = { x: l.x - 1, y: l.top, w: 2, h: Math.max(1, l.bottom - l.top) };
    lines.set(l.id, b);
    cells.push(
      `<mxCell id="seq:life:${l.id}" value="" style="${style({ shape: "umlLifeline", perimeter: "lifelinePerimeter", whiteSpace: "wrap", html: 1, container: 0, collapsible: 0, recursiveResize: 0, outlineConnect: 0, portConstraint: "eastwest", size: 0, fillColor: "none", strokeColor: life, strokeWidth: 1.25 })}" vertex="1" parent="1">${geometry(b)}</mxCell>`,
    );
    if (l.foot)
      cells.push(
        `<mxCell id="seq:foot:${l.id}" value="${value(l.foot.label.lines)}" style="${style({ rounded: 1, absoluteArcSize: 1, arcSize: 12, whiteSpace: "wrap", html: 1, fillColor: t.surface, strokeColor: t.border, fontColor: t.text, fontStyle: 1, fontSize: 12, fontFamily: FONT })}" vertex="1" parent="1">${geometry(l.foot.box)}</mxCell>`,
      );
  }
  sq.activations.forEach((a, i) => {
    cells.push(
      `<mxCell id="seq:bar:${i}" value="" style="${style({ html: 1, points: "[]", perimeter: "orthogonalPerimeter", outlineConnect: 0, targetShapes: "umlLifeline", portConstraint: "eastwest", fillColor: mixHex(t.flow, t.surface, 0.14), strokeColor: mixHex(t.edge, bg, 0.85) })}" vertex="1" parent="1">${geometry(a.box)}</mxCell>`,
    );
  });

  // Messages: from lifeline to lifeline, anchored at their row; a self message keeps its loop.
  const at = (p: Point, b: Box | undefined): [number, number] => {
    if (!b) return [0.5, 0.5];
    const clamp = (v: number) => Math.max(0, Math.min(1, Math.round(v * 1000) / 1000));
    return [clamp((p.x - b.x) / (b.w || 1)), clamp((p.y - b.y) / (b.h || 1))];
  };
  for (const e of scene.edges) {
    const first = e.points[0];
    const last = e.points[e.points.length - 1];
    if (!first || !last) continue;
    const [ex, ey] = at(first, lines.get(e.from));
    const [nx, ny] = at(last, lines.get(e.to));
    const end = e.arrow === "end" || e.arrow === "both";
    const start = e.arrow === "start" || e.arrow === "both";
    const head = scene.arrowhead === "open" ? "open" : "block";
    const s = style({
      edgeStyle: "none",
      rounded: 1,
      html: 1,
      endArrow: end ? head : "none",
      endFill: 1,
      endSize: 6,
      startArrow: start ? head : "none",
      startFill: 1,
      startSize: 6,
      strokeColor: e.color ?? t.edge,
      ...lineStyle(e.line),
      fontColor: t.edgeLabel,
      fontSize: 11,
      fontFamily: FONT,
      labelBackgroundColor: bg,
      exitX: ex,
      exitY: ey,
      exitPerimeter: 0,
      entryX: nx,
      entryY: ny,
      entryPerimeter: 0,
    });
    const bends = e.points.slice(1, -1);
    const points = bends.length
      ? `<Array as="points">${bends.map((p) => `<mxPoint x="${n(p.x)}" y="${n(p.y)}"/>`).join("")}</Array>`
      : "";
    // The label where the SVG puts it: above the line, or beside a loop.
    const mid = halfway(e.points);
    const b = e.labelBox;
    const offset = b
      ? `<mxPoint x="${n(b.x + b.w / 2 - mid.x)}" y="${n(b.y + b.h / 2 - mid.y)}" as="offset"/>`
      : "";
    const source = lines.has(e.from) ? ` source="seq:life:${e.from}"` : "";
    const target = lines.has(e.to) ? ` target="seq:life:${e.to}"` : "";
    cells.push(
      `<mxCell id="seq:msg:${e.id}" value="${value(e.label?.lines ?? [])}" style="${s}" edge="1" parent="1"${source}${target}><mxGeometry relative="1" as="geometry"><mxPoint x="${n(first.x)}" y="${n(first.y)}" as="sourcePoint"/><mxPoint x="${n(last.x)}" y="${n(last.y)}" as="targetPoint"/>${points}${offset}</mxGeometry></mxCell>`,
    );
    if (e.step !== undefined && e.stepBox)
      cells.push(
        `<mxCell id="seq:msg:${e.id}:step" value="${e.step}" style="${style({ ellipse: null, whiteSpace: "wrap", html: 1, fillColor: t.stepFill, strokeColor: "none", fontColor: t.stepText, fontStyle: 1, fontSize: 14, fontFamily: FONT })}" vertex="1" parent="1">${geometry(e.stepBox)}</mxCell>`,
      );
  }
  return cells;
}
