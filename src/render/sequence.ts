// Sequence diagrams in both skins. sequenceClassic and sequenceStage draw what scene.sequence
// holds (fragments, lifelines, the participants' names at the foot, activation bars) over the
// group panels and under the messages; the heads are scene nodes and the messages scene edges, so
// renderSvg and renderStage draw those, and animate them in order.
//
// renderSequence is `-f sequence.svg` for a spec of any kind: the numbered steps (else the longest
// path) as a sequence diagram, one lifeline per node they visit in the order they first reach it,
// laid out by layout/sequence like a `kind: sequence` spec.

import { mixHex } from "../color.ts";
import { sequenceScene } from "../layout/sequence/index.ts";
import { SIZES } from "../layout/sizes.ts";
import { stageColors } from "../skins.ts";
import { textBlock } from "../text.ts";
import type { StageInk, Theme } from "../themes.ts";
import type { Box, Model, ModelEdge, ModelNode, Scene, SceneEdge } from "../types.ts";
import { type Ctx, fill, rect, stroke } from "./stage/ctx.ts";
import { block, KEY, LABEL, NOTE, sizeFor } from "./stage/text.ts";
import { lit } from "./stage/timing.ts";
import { ends, longestPath } from "./stage/walks.ts";
import { n, renderSvg, text } from "./svg.ts";

// ---------------------------------------------------------------- classic

/** The operator tag: a box whose bottom-right corner is cut, its top-left rounded like the frame. */
function tagPath(b: Box, r: number): string {
  const cut = 6;
  return `M${n(b.x)} ${n(b.y + r)} Q${n(b.x)} ${n(b.y)} ${n(b.x + r)} ${n(b.y)} H${n(b.x + b.w)} V${n(b.y + b.h - cut)} L${n(b.x + b.w - cut)} ${n(b.y + b.h)} H${n(b.x)} Z`;
}

const canvasOf = (scene: Scene, t: Theme) =>
  scene.background && scene.background !== "transparent" ? scene.background : t.background;

export function sequenceClassic(scene: Scene, t: Theme): string {
  const sq = scene.sequence;
  if (!sq) return "";
  const bg = canvasOf(scene, t);
  const frame = mixHex(t.edge, bg, 0.55);
  const life = mixHex(t.edge, bg, 0.5);
  const chip = (b: Box) =>
    `<rect x="${n(b.x - 4)}" y="${n(b.y - 1)}" width="${n(b.w + 8)}" height="${n(b.h + 2)}" rx="4" fill="${bg}" fill-opacity="0.92"/>`;
  const out: string[] = [];
  // Frames first, outer under inner: each adds a faint wash, so nesting reads as depth.
  for (const f of [...sq.fragments].sort((p, q) => p.depth - q.depth)) {
    const b = f.box;
    out.push(
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="6" fill="${t.flow}" fill-opacity="0.035" stroke="${frame}" stroke-width="1"/>`,
    );
  }
  for (const l of sq.lifelines) {
    out.push(
      `<path d="M${n(l.x)} ${n(l.top)} V${n(l.bottom)}" fill="none" stroke="${life}" stroke-width="1.25" stroke-dasharray="5 4"/>`,
    );
    const foot = l.foot;
    if (foot) {
      const b = foot.box;
      out.push(
        `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="6" fill="${t.surface}" stroke="${t.border}" stroke-width="1"/>`,
        text(foot.label, foot.labelBox, t.text),
      );
    }
  }
  // Bars cover their lifeline; tags, guards and dividers go on top of both.
  for (const a of sq.activations) {
    const b = a.box;
    out.push(
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="2" fill="${mixHex(t.flow, t.surface, 0.14)}" stroke="${mixHex(t.edge, bg, 0.85)}" stroke-width="1"/>`,
    );
  }
  for (const f of sq.fragments) {
    out.push(
      `<path d="${tagPath(f.tag.box, 6)}" fill="${mixHex(t.flow, bg, 0.14)}" stroke="${frame}" stroke-width="1"/>`,
      text(f.tag.label, f.tag.labelBox, t.text, "start"),
    );
    if (f.label && f.labelBox)
      out.push(chip(f.labelBox), text(f.label, f.labelBox, t.edgeLabel, "start"));
    for (const d of f.dividers) {
      out.push(
        `<path d="M${n(f.box.x)} ${n(d.y)} H${n(f.box.x + f.box.w)}" fill="none" stroke="${frame}" stroke-width="1" stroke-dasharray="6 4"/>`,
      );
      if (d.label && d.labelBox)
        out.push(chip(d.labelBox), text(d.label, d.labelBox, t.edgeLabel, "start"));
    }
  }
  return `<g>${out.filter(Boolean).join("")}</g>`;
}

// ---------------------------------------------------------------- stage

/**
 * The same parts from the stage kit: hairline frames on a faint panel, dim dashed lifelines, ink
 * tiles for the bars and the feet, the operator tag in the tint. With the story clock (`ctx`), a
 * bar lights when its call arrives.
 */
export function sequenceStage(scene: Scene, k: StageInk, t: Theme, h: number, ctx?: Ctx): string {
  const sq = scene.sequence;
  if (!sq) return "";
  const out: string[] = [];
  const dash = ` stroke-dasharray="${n(3 * h)} ${n(3 * h)}"`;
  const chip = (b: Box) =>
    rect(
      { x: b.x - 4, y: b.y - 1, w: b.w + 8, h: b.h + 2 },
      3,
      `${fill(k.tile)} ${stroke(k.line, k.hair, h)}`,
    );
  for (const f of [...sq.fragments].sort((p, q) => p.depth - q.depth))
    out.push(rect(f.box, 4, `${fill(k.line, k.panel)} ${stroke(k.line, k.frame, h)}`));
  // The feet share one size, the one the longest name fits at.
  const feet = Math.min(
    LABEL.size,
    ...sq.lifelines.flatMap((l) =>
      l.foot ? [sizeFor(l.foot.label.lines, LABEL, l.foot.box.w - 10, 8)] : [],
    ),
  );
  for (const l of sq.lifelines) {
    out.push(
      `<path d="M${n(l.x)} ${n(l.top)} V${n(l.bottom)}" fill="none" ${stroke(k.line, k.wire * 0.8, h)}${dash}/>`,
    );
    const foot = l.foot;
    if (foot) {
      const size = feet;
      out.push(
        rect(foot.box, 4, `${fill(k.tile)} ${stroke(k.line, k.frame, h)}`),
        block(foot.label, foot.labelBox, LABEL, size, t.text),
      );
    }
  }
  // Bars: an ink tile over the lifeline, tinted once its call has arrived (always, in a still).
  for (const a of sq.activations) {
    const tinted = rect(a.box, 2, `${fill(k.tint, 0.16)} ${stroke(k.tint, 0.55, h)}`);
    const on = ctx?.story.runs.get(a.call)?.[0]?.t1;
    out.push(
      rect(a.box, 2, `${fill(k.tile)} ${stroke(k.line, k.frame, h)}`),
      ctx && on !== undefined ? lit(ctx, tinted, on) : ctx?.story.animated ? "" : tinted,
    );
  }
  for (const f of sq.fragments) {
    const size = sizeFor(f.tag.label.lines, KEY, f.tag.box.w - 14, 7);
    // Opaque under the tint, so a bar or lifeline behind the tag stops at its edge.
    out.push(
      `<path d="${tagPath(f.tag.box, 4)}" ${fill(k.tile)}/>`,
      `<path d="${tagPath(f.tag.box, 4)}" ${fill(k.tint, 0.14)} ${stroke(k.tint, 0.5, h)}/>`,
      block(f.tag.label, f.tag.labelBox, KEY, size, k.header, "start"),
    );
    if (f.label && f.labelBox) {
      const s = sizeFor(f.label.lines, NOTE, f.labelBox.w + 6, 8);
      out.push(chip(f.labelBox), block(f.label, f.labelBox, NOTE, s, t.edgeLabel, "start"));
    }
    for (const d of f.dividers) {
      out.push(
        `<path d="M${n(f.box.x)} ${n(d.y)} H${n(f.box.x + f.box.w)}" fill="none" ${stroke(k.line, k.frame, h)}${dash}/>`,
      );
      if (d.label && d.labelBox) {
        const s = sizeFor(d.label.lines, NOTE, d.labelBox.w + 6, 8);
        out.push(chip(d.labelBox), block(d.label, d.labelBox, NOTE, s, t.edgeLabel, "start"));
      }
    }
  }
  return `<g>${out.filter(Boolean).join("")}</g>`;
}

// ---------------------------------------------------------------- sequence.svg of any spec

interface Message {
  edge: SceneEdge;
  from: string;
  to: string;
  label: string;
  step: number;
}

/** The step edges in step order (spec order breaks ties), else the longest path numbered 1, 2, ... */
function messages(scene: Scene, model: Model): Message[] {
  const stepped = scene.edges
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.step !== undefined)
    .sort((a, b) => (a.e.step ?? 0) - (b.e.step ?? 0) || a.i - b.i)
    .map(({ e }) => e);
  const path = stepped.length ? stepped : longestPath(scene.edges);
  const labels = new Map(model.edges.map((e) => [e.id, e.label]));
  return path.map((e, i) => {
    const [from, to] = ends(e);
    const label = labels.get(e.id) ?? e.label?.lines.join(" ") ?? "";
    return { edge: e, from, to, label, step: e.step ?? i + 1 };
  });
}

/** Each node or group the messages visit, in the order they first appear, as a participant. */
function participants(scene: Scene, model: Model, list: Message[]): ModelNode[] {
  const out: ModelNode[] = [];
  for (const id of list.flatMap((m) => [m.from, m.to])) {
    if (out.some((p) => p.id === id)) continue;
    const node = model.nodes.find((x) => x.id === id);
    const group = model.groups.find((x) => x.id === id);
    const icon =
      node?.icon ?? scene.groups.find((g) => g.id === id)?.icon ?? group?.icon ?? undefined;
    out.push({
      id,
      label: node?.label || group?.label || id,
      ...(node?.note ? { note: node.note } : {}),
      ...(icon ? { icon } : {}),
      ...(node?.color ? { color: node.color } : {}),
      look: icon ? "icon" : "shape",
      shape: "rounded",
      iconSize: icon && node?.look === "icon" ? node.iconSize : 48,
    });
  }
  return out;
}

/** A still picture that says there was nothing to draw. */
function empty(scene: Scene, model: Model): Scene {
  const P = SIZES.pad;
  const say = "No edges to put in sequence";
  const title = model.title ? textBlock(model.title, SIZES.title, 1400, 600, 1.25) : undefined;
  const note = textBlock(say, SIZES.subtitle, 1400, 400);
  const top = title ? P + title.height : P;
  return {
    ...scene,
    width: Math.ceil(Math.max(note.width, title?.width ?? 0) + 2 * P),
    height: Math.ceil(top + note.height + P),
    ...(title ? { title, titleBox: { x: P, y: P - 4, w: title.width, h: title.height } } : {}),
    subtitle: note,
    subtitleBox: { x: P, y: top, w: note.width, h: note.height },
    nodes: [],
    groups: [],
    edges: [],
    legend: undefined,
    journey: undefined,
    sequence: undefined,
    animate: "none",
    description: say,
  };
}

/**
 * `-f sequence.svg`: a sequence spec as it is, any other the numbered steps (else the longest path)
 * as messages between the nodes they visit. A message back to an earlier lifeline is drawn as a
 * reply, dashed.
 */
export function renderSequence(
  scene: Scene,
  model: Model,
  opts: { idPrefix?: string } = {},
): string {
  if (scene.sequence) return renderSvg(scene, opts);
  const list = messages(scene, model);
  const who = participants(scene, model, list);
  const order = new Map(who.map((p, i) => [p.id, i]));
  const edges: ModelEdge[] = list.map((m) => {
    const back = (order.get(m.to) ?? 0) < (order.get(m.from) ?? 0);
    return {
      id: m.edge.id,
      from: m.from,
      to: m.to,
      ...(m.label ? { label: m.label } : {}),
      line: back && m.edge.line === "solid" ? "dashed" : m.edge.line,
      arrow: m.edge.arrow === "both" ? "both" : m.edge.arrow === "none" ? "none" : "end",
      ...(m.edge.color ? { color: m.edge.color } : {}),
      step: m.step,
      constraint: true,
    };
  });
  const seq: Model = {
    ...(model.title ? { title: model.title } : {}),
    ...(model.subtitle ? { subtitle: model.subtitle } : {}),
    direction: "down",
    theme: scene.theme,
    routing: "orthogonal",
    spacing: 1,
    layering: "source",
    merge: false,
    arrowhead: scene.arrowhead,
    animate: scene.animate,
    skin: scene.skin,
    ...(scene.background ? { background: scene.background } : {}),
    nodes: who,
    groups: [],
    edges,
    kind: "sequence",
  };
  const laid = list.length ? sequenceScene(seq, scene.theme) : undefined;
  if (!laid) return renderSvg(empty(scene, model), opts);
  const named = (id: string) => who.find((p) => p.id === id)?.label ?? id;
  const steps = list.map(
    (m) => `${m.step}. ${named(m.from)} to ${named(m.to)}${m.label ? ` (${m.label})` : ""}`,
  );
  const what = list.some((m) => m.edge.step !== undefined)
    ? "the numbered steps"
    : "the longest path";
  const described = { ...laid, description: `Sequence of ${what}: ${steps.join("; ")}` };
  return renderSvg(scene.skin === "stage" ? stageColors(described) : described, opts);
}
