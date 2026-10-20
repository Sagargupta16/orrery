// Shared text helpers for the measures: label matching, edge names and edge travel order.
import type { ModelEdge } from "../types.ts";

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word (optionally plural) match of a phrase in normalized text. */
export const hasPhrase = (text: string, phrase: string) =>
  !!phrase && new RegExp(`(^| )${escapeRe(norm(phrase))}s?( |$)`).test(text);

export const edgeName = (e: { from: string; to: string }) => `${e.from} -> ${e.to}`;

/** Endpoints in travel order: an arrow at the start runs to -> from. */
export const travel = (e: ModelEdge): [string, string] =>
  e.arrow === "start" ? [e.to, e.from] : [e.from, e.to];
