// Edge label chips, the numbered step badges that pop as their packet leaves, and the legend.

import type { SceneEdge } from "../../types.ts";
import { n } from "../svg.ts";
import { type Ctx, fill, rect, stroke } from "./ctx.ts";
import { block, DIGIT, EDGE, KEY, mono, monoWidth, sizeFor } from "./text.ts";
import { kt, lit, loop, RAMP } from "./timing.ts";

export function edgeLabel(ctx: Ctx, e: SceneEdge): string {
  const { k, h, story } = ctx;
  const parts: string[] = [];
  const runs = story.runs.get(e.id);
  const on = runs?.[0]?.t0 ?? 0;
  if (e.labelBox && e.label?.lines.length) {
    const b = e.labelBox;
    const size = Math.min(ctx.sizes.edge, sizeFor(e.label.lines, EDGE, b.w - 8, 7));
    const w = Math.max(b.w, ...e.label.lines.map((l) => monoWidth(l, EDGE, size) + 8));
    const chip = { x: b.x + b.w / 2 - w / 2, y: b.y, w, h: b.h };
    parts.push(rect(chip, 3, `${fill(k.tile)} ${stroke(k.line, k.hair, h)}`));
    parts.push(block(e.label, b, EDGE, size, ctx.t.edgeLabel));
    if (runs) {
      const color = e.color ?? k.tint;
      parts.push(
        lit(
          ctx,
          rect(chip, 3, `${fill(k.tile)} ${stroke(color, 0.5, h)}`) +
            block(e.label, b, EDGE, size, color),
          on,
          story.hold + RAMP,
        ),
      );
    }
  }
  if (e.stepBox && e.step !== undefined) {
    const s = e.stepBox;
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const r = s.w / 2;
    const digit = (color: string, x: number, y: number) =>
      mono(
        [String(e.step)],
        DIGIT,
        Math.min(DIGIT.size, r),
        { x, y: y - r, lead: 2 * r },
        color,
        "middle",
      );
    parts.push(
      `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${fill(k.tile)} ${stroke(k.line, k.frame, h)}/>`,
    );
    parts.push(digit(ctx.t.text, cx, cy));
    const pop = `<circle r="${n(r)}" ${fill(e.color ?? k.tint)}/>${digit(k.onTint, 0, 0)}`;
    const at = story.badges.get(e.id);
    if (!story.animated) parts.push(`<g transform="translate(${n(cx)} ${n(cy)})">${pop}</g>`);
    else if (at !== undefined) {
      const times = kt(ctx, [0, at, at + RAMP, at + 2 * RAMP, story.hold, story.gone, story.cycle]);
      parts.push(
        `<g transform="translate(${n(cx)} ${n(cy)})"><g opacity="0">${pop}` +
          `<animate attributeName="opacity" values="0;0;1;1;1;0;0" keyTimes="${times}" ${loop(ctx)}/>` +
          `<animateTransform attributeName="transform" type="scale" values="0.4;0.4;1.3;1;1;1;0.4" keyTimes="${times}" ${loop(ctx)}/></g></g>`,
      );
    }
  }
  return parts.length ? `<g id="${ctx.prefix}el-${e.id}">${parts.join("")}</g>` : "";
}

export function legend(ctx: Ctx): string {
  const l = ctx.scene.legend;
  if (!l?.items.length) return "";
  const { k, h } = ctx;
  const parts = [rect(l.box, 6, `${fill(k.tile)} ${stroke(k.line, k.hair, h)}`)];
  for (const item of l.items) {
    const s = item.swatch;
    const y = s.y + s.h / 2;
    const dash =
      item.line === "dashed"
        ? ` stroke-dasharray="${n(4 * h)} ${n(3 * h)}"`
        : item.line === "dotted"
          ? ` stroke-dasharray="${n(h)} ${n(2.5 * h)}"`
          : "";
    parts.push(
      `<path d="M${n(s.x)} ${n(y)} H${n(s.x + s.w)}" fill="none" ${stroke(k.line, k.arrow, item.line === "thick" ? 1.8 * h : h)} stroke-linecap="round"${dash}/>`,
    );
    const b = item.labelBox;
    parts.push(
      block(
        item.label,
        b,
        KEY,
        sizeFor(item.label.lines, KEY, l.box.x + l.box.w - b.x - 10, 7),
        ctx.t.text,
        "start",
      ),
    );
  }
  return `<g id="${ctx.prefix}legend">${parts.join("")}</g>`;
}
