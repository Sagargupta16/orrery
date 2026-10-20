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

/** The spec's animate mode, else the skin's: relay for stage, packets for classic. */
export const animateOf = (model: Pick<Model, "animate" | "skin">): AnimateMode =>
  model.animate ?? (model.skin === "stage" ? "relay" : "packets");
