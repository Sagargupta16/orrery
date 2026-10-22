// Mermaid gantt text for a timeline spec: lanes as sections, items as tasks, milestones.
//
// Stub from the foundation lane; the TL lane owns this file and replaces the body.
// Called from: src/render/mermaid.ts renderMermaid for kind timeline; a missing final newline is
// added.

import type { Model } from "../types.ts";

export function timelineMermaid(_model: Model): string {
  return "gantt\n  dateFormat YYYY-MM-DD\n";
}
