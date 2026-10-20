// The story clock: when each layer lights, how packets travel, and the SMIL timing helpers.

import { keyTimes, secs } from "../svg.ts";
import type { Ctx } from "./ctx.ts";

// Seconds. Hops travel at one display speed within bounds, and pause at each node they reach.
export const GROUPS_ON = 0.35;
export const TILES_ON = 0.7;
export const STORY_AT = 1.25;
export const SPEED = 320;
export const PAUSE = 0.24;
export const HOLD_FOR = 0.9;
export const RAMP = 0.18;
export const FADE = 0.15;
/** Comet tail length in display px. */
export const COMET = 26;
/** The lit frame holds until HOLD of the loop and is gone by GONE. */
export const HOLD = 0.9;
export const GONE = 0.94;
export const SIDE_FLOWS = 2;
export const EASE = "0.65 0 0.35 1";

export interface Run {
  t0: number;
  t1: number;
  reverse: boolean;
  /** Seconds the packet waits where it arrives (the next hop leaves from there). */
  park: number;
}

export const loop = (ctx: Ctx) => `dur="${secs(ctx.story.cycle)}" repeatCount="indefinite"`;
export const kt = (ctx: Ctx, times: number[]) => keyTimes(times, ctx.story.cycle);

/** Opacity that fades in at `on` and is gone by `off`. */
export function show(ctx: Ctx, on: number, off: number): string {
  const { cycle } = ctx.story;
  return `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="${kt(ctx, [0, on, on + RAMP, off - RAMP, off, cycle])}" ${loop(ctx)}/>`;
}

/** Lit content: drawn plainly in a still frame, else shown from `on` until `off`. */
export function lit(ctx: Ctx, body: string, on: number, off = ctx.story.gone): string {
  if (!body) return "";
  return ctx.story.animated ? `<g opacity="0">${body}${show(ctx, on, off)}</g>` : body;
}
