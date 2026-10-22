// Conventions of timelines and roadmaps (kind: timeline): every item dated, dependencies in date
// order, items inside the axis, a legend for statuses, point labels that do not pile up.
//
// Stub from the foundation lane; the TL lane owns this file and replaces the body.
// Called from: src/review/notations.ts NOTATION_CHECKS.timeline. Findings go through c.add() with
// the ids registered in src/review/findings.ts: conventions.timeline-undated,
// conventions.timeline-order, conventions.timeline-range, conventions.timeline-legend,
// conventions.timeline-crowded.

import type { Ctx } from "./types.ts";

export function measureTimeline(_c: Ctx): Record<string, number> {
  return {};
}
