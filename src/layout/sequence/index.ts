// Sequence diagrams (kind: sequence): participants as lifelines left to right, messages as rows
// top to bottom in spec order, combined fragments as boxes around their rows and activation bars
// from a call to its reply. Its own layout, not ELK's. The participant heads are scene nodes and
// the messages scene edges, so icons, ids, checks and the review read them as in any other kind;
// scene.sequence carries the rest for the renderers (render/sequence.ts).
//
// The steps live beside this file: columns.ts (participant order, heads, message kinds,
// activations and lifeline spacing), rows.ts (message rows and fragments, top to bottom) and
// parts.ts (scene nodes, edges, groups, canvas and alt text).

import { THEME_TOKENS, type Theme } from "../../themes.ts";
import type { Box, EdgeLine, Model, Scene, TextBlock, ThemeName } from "../../types.ts";
import { animateOf } from "../sizes.ts";
import { activations, columnsOf, kindsOf, messagesOf, spaceColumns } from "./columns.ts";
import { assemble, clearGroupBorders } from "./parts.ts";
import { fragmentsOf, placeFragmentsX, placeMessagesX, placeRows } from "./rows.ts";

export interface SequenceLifeline {
  /** The participant's node id. */
  id: string;
  /** The line's x, and where it starts (under the head) and ends. */
  x: number;
  top: number;
  bottom: number;
  /** The participant's name again at the foot of a tall diagram. */
  foot?: { box: Box; label: TextBlock; labelBox: Box };
}

/**
 * call: a solid message that waits for its answer; reply: a dashed one back to a caller that waits;
 * async: dashed with nobody waiting; signal: dotted; self: to its own lifeline.
 */
export type SequenceMessageKind = "call" | "reply" | "async" | "signal" | "self";

export interface SequenceMessage {
  /** The edge id. */
  id: string;
  /** 1-based position among the spec's edges: what fragments count. */
  index: number;
  /** Sender and receiver, in travel order. */
  from: string;
  to: string;
  kind: SequenceMessageKind;
  line: EdgeLine;
  /** The row's line; a self message loops down from it by `loop` px. */
  y: number;
  loop?: number;
  /** Where the line leaves the sender and where its arrow lands. */
  x0: number;
  x1: number;
  /** The row's band, label included. */
  top: number;
  bottom: number;
}

export interface SequenceActivation {
  /** The participant whose bar it is. */
  id: string;
  box: Box;
  /** 0 on the lifeline, 1 for a bar nested on it, and so on. */
  level: number;
  /** The call that opens it and the reply that closes it (edge ids). */
  call: string;
  reply: string;
}

export interface SequenceFragment {
  type: "loop" | "alt" | "opt" | "par" | "break" | "critical";
  box: Box;
  /** The operator tag in the top-left corner: a box with its bottom-right corner cut. */
  tag: { box: Box; label: TextBlock; labelBox: Box };
  /** The guard beside the tag, in brackets as UML writes it. */
  label?: TextBlock;
  labelBox?: Box;
  /** Dashed lines between the branches of an alt or par, each with its guard under it. */
  dividers: { y: number; label?: TextBlock; labelBox?: Box }[];
  /** The 1-based message range, as written. */
  from: number;
  to: number;
  /** 0 for a fragment in no other, 1 inside one, and so on. */
  depth: number;
}

export interface SceneSequence {
  lifelines: SequenceLifeline[];
  messages: SequenceMessage[];
  activations: SequenceActivation[];
  fragments: SequenceFragment[];
}

/**
 * Widest the spacing lets a diagram grow before it wraps labels tighter: a README column (880px)
 * and a little over, since a slightly scaled picture reads better than labels on three lines.
 */
const DISPLAY = 950;
/** Widest a message label wraps at, tried from the roomiest down until the diagram fits. */
const WRAPS = [200, 180, 160, 140, 120];

/** The scene for a sequence spec, laid out in one synchronous pass (render/sequence.ts uses it). */
export function sequenceScene(model: Model, theme: ThemeName | Theme): Scene | undefined {
  const name = typeof theme === "string" ? theme : theme.name;
  const cols = columnsOf(model);
  if (!cols.length) return undefined;
  const msgs = messagesOf(model, cols);
  kindsOf(msgs);
  const acts = activations(msgs);
  const frags = fragmentsOf(model, msgs);
  // The roomiest label wrap that keeps the diagram about a README column wide, else the narrowest.
  let spaced = spaceColumns(model, cols, msgs, acts, frags, WRAPS[0] ?? 200);
  for (const wrap of WRAPS.slice(1)) {
    if (spaced.width <= DISPLAY) break;
    spaced = spaceColumns(model, cols, msgs, acts, frags, wrap);
  }
  const rows = placeRows(model, cols, msgs, frags, spaced.width);
  placeMessagesX(cols, msgs, acts);
  clearGroupBorders(model, cols, msgs);
  placeFragmentsX(cols, msgs, acts, frags);
  const scene = assemble(model, name, THEME_TOKENS[name], cols, msgs, acts, frags, rows);
  return {
    ...scene,
    theme: name,
    direction: "down",
    routing: "orthogonal",
    arrowhead: model.arrowhead,
    animate: animateOf(model),
    skin: model.skin,
    background: model.background,
    kind: model.kind,
  };
}

/** The whole scene for a sequence spec, or undefined to lay it out as a flow. */
export async function sequenceLayout(
  model: Model,
  theme: ThemeName | Theme,
): Promise<Scene | undefined> {
  return sequenceScene(model, theme);
}
