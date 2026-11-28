// Text sizes and fixed measures every layout module shares (the journey modules read them too, so
// this file imports nothing), and the spec's animate mode.

import type { AnimateMode, Model } from "../types.ts";

export const SIZES = {
  pad: 28,
  nodeLabel: 13,
  note: 11.5,
  groupLabel: 13,
  edgeLabel: 11.5,
  title: 20,
  subtitle: 13,
  iconLabelMax: 132,
  // Step badges: official AWS, Azure and Google badges are 0.54 to 0.75 of the icon size.
  step: 28,
  cardLabelMax: 168,
  shapeLabelMax: 156,
  edgeLabelMax: 150,
  // AWS group tiles are 40x40 next to 48px service icons in the deck ("DON'T: Resize group icons").
  tile: 40,
  inlineIcon: 20,
};

/**
 * Where edge ends sit on the face of what they meet (layout/faces.ts, and the review's checks of
 * the same): `pitch` apart around the face's center, shrunk to fit; at least `inset` from its
 * corners, clear of a tile's rounded corner; `gap` off the face (0: every tip touches).
 */
export const ENDS = { pitch: 14, inset: 8, gap: 0 };

/**
 * The most edges layout runs ELK more than once for: past it, one run takes seconds (300 dense
 * edges take about 8 s), so the layout keeps its first run instead of trying again with crossing
 * ends unpinned, layout.aspect does not lay out its other candidates (DG206 and DG219 say so), and
 * ELK breaks cycles greedily (context.ts).
 */
export const ELK_BUDGET = 150;

/** Clear space kept on each side of an edge label placed beside its line, in px. */
export const LABEL_CLEAR = 8;

/**
 * Whether an edge label fits in a normal layer gap beside its line, so ELK needs no label layer
 * for it: `extent` is the label's height in a vertical flow and its width in a horizontal one,
 * `spacing` the spec's layout.spacing factor (the gap between layers is 64px times it).
 */
export const fitsBeside = (extent: number, spacing: number) =>
  extent + 2 * LABEL_CLEAR <= 64 * spacing;

/** The spec's animate mode, else the skin's: relay for stage, none (still) for classic. */
export const animateOf = (model: Pick<Model, "animate" | "skin">): AnimateMode =>
  model.animate ?? (model.skin === "stage" ? "relay" : "none");
