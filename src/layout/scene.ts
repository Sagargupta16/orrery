// The Scene every renderer draws: the canvas, the parts placed by the phases before, and a plain
// text description of the diagram for screen readers.

import type { Model, Routing, Scene } from "../types.ts";
import type { Canvas } from "./canvas.ts";
import type { Routed } from "./context.ts";
import { animateOf } from "./sizes.ts";

export function assemble(ctx: Routed, routing: Routing, canvas: Canvas): Scene {
  const { model, theme, titleBlock, subtitleBlock, nodes, groups, edges, fallback, plan } = ctx;
  const { width, height, titleBox, subtitleBox, legend } = canvas;
  return {
    width,
    height,
    theme,
    direction: model.direction,
    routing,
    arrowhead: model.arrowhead,
    animate: animateOf(model),
    skin: model.skin,
    background: model.background,
    title: canvas.title ?? titleBlock,
    ...(model.title ? { name: model.title } : {}),
    titleBox,
    subtitle: canvas.subtitle ?? subtitleBlock,
    subtitleBox,
    nodes,
    groups,
    edges,
    legend,
    layoutFallback: fallback,
    description: describe(model),
    kind: model.kind,
    ...(model.story ? { story: model.story } : {}),
    ...(plan.ignored.length ? { ignored: plan.ignored } : {}),
  };
}

function describe(model: Model): string {
  const name = (id: string) =>
    model.nodes.find((n) => n.id === id)?.label ??
    model.groups.find((g) => g.id === id)?.label ??
    id;
  const parts: string[] = [];
  if (model.title) parts.push(`${model.title}.`);
  parts.push(
    `${model.nodes.length} components${model.groups.length ? ` in ${model.groups.length} groups` : ""}.`,
  );
  const flows = model.edges
    .slice(0, 24)
    .map((e) => `${name(e.from)} to ${name(e.to)}${e.label ? ` (${e.label})` : ""}`);
  if (flows.length)
    parts.push(`Connections: ${flows.join("; ")}${model.edges.length > 24 ? "; and more" : ""}.`);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
