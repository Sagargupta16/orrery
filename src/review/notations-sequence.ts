// Conventions of sequence diagrams (kind: sequence, UML 2.5.1 interactions): every message says
// what it sends, every participant takes part, a reply runs dashed back to its caller, fragments
// hold the messages they name, and one figure stays short enough to follow. The rubric is
// references/review/conventions-sequence.md (SEQ-xx).
//
// Called from src/review/notations.ts NOTATION_CHECKS.sequence.

import { edgeName, travel } from "./names.ts";
import type { Ctx } from "./types.ts";

/** Past this many messages a figure stops reading as one scenario; past LONG it is two. */
const LENGTH = 16;
const LONG = 24;

export function measureSequence(c: Ctx): Record<string, number> {
  const { model, scene, add } = c;
  const nodes = new Set(model.nodes.map((n) => n.id));
  const messages = model.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to));
  const kinds = new Map((scene.sequence?.messages ?? []).map((m) => [m.id, m.kind]));

  // SEQ-04: a message says what it sends. A reply may stay unlabelled: it answers its call.
  const bare = messages.filter((e) => !e.label?.trim() && kinds.get(e.id) !== "reply");
  const firstBare = bare[0];
  if (firstBare)
    add(
      "conventions.sequence-unlabelled",
      bare.length > 1 ? "major" : "minor",
      bare.map((e) => e.id),
      {
        unlabelled: bare.length,
        messages: messages.length,
        first: edgeName(firstBare),
      },
      `${bare.length} of ${messages.length} messages have no label, so the reader cannot tell what is asked or sent`,
      [
        `label each message with a verb and its payload: - ${edgeName(firstBare)}: "POST /orders (cart)"`,
      ],
      Math.min(16, 4 * bare.length),
      undefined,
      "SEQ-04",
    );

  // SEQ-02: every participant sends or receives something.
  const used = new Set(messages.flatMap((e) => [e.from, e.to]));
  const idle = model.nodes.filter((n) => !used.has(n.id));
  if (idle.length)
    add(
      "conventions.sequence-unused",
      "major",
      idle.map((n) => n.id),
      { unused: idle.length, participants: model.nodes.length },
      `${idle.map((n) => `"${n.id}"`).join(", ")} ${idle.length === 1 ? "takes" : "take"} no part in any message, so ${idle.length === 1 ? "its lifeline is" : "their lifelines are"} empty`,
      [
        `remove ${idle.map((n) => `"${n.id}"`).join(", ")} from nodes`,
        "or add the message it sends or receives",
      ],
      Math.min(15, 6 * idle.length),
      undefined,
      "SEQ-02",
    );

  // SEQ-05: an answer straight back to the caller is a reply, drawn dashed.
  const solid: string[] = [];
  messages.forEach((e, i) => {
    const prev = messages[i - 1];
    if (!prev || e.line === "dashed" || e.line === "dotted" || e.from === e.to) return;
    const [a, b] = travel(prev);
    const [s, r] = travel(e);
    if (prev.line !== "dashed" && prev.line !== "dotted" && a !== b && s === b && r === a)
      solid.push(e.id);
  });
  if (solid.length) {
    const first = model.edges.find((e) => e.id === solid[0]);
    add(
      "conventions.sequence-reply",
      "minor",
      solid,
      { solidReplies: solid.length, first: first ? edgeName(first) : "" },
      `${solid.length} message(s) answer the call just before them with a solid line, which reads as a new call`,
      [
        `draw the answer dashed: - ${first ? `${first.from} --> ${first.to}` : "b --> a"}: "<what it returns>"`,
      ],
      Math.min(12, 4 * solid.length),
      undefined,
      "SEQ-05",
    );
  }

  // SEQ-07: a fragment holds the messages it names and nests inside any it overlaps.
  const laid = scene.sequence?.fragments ?? [];
  const lost = (model.fragments ?? []).filter(
    (f) => !laid.some((x) => x.type === f.type && x.from === f.from && x.to === f.to),
  );
  if (lost.length)
    add(
      "conventions.sequence-fragment",
      "major",
      [],
      {
        fragments: lost.length,
        ranges: lost.map((f) => `${f.type} ${f.from}-${f.to}`).join(", "),
      },
      `${lost.length} fragment(s) (${lost.map((f) => `${f.type} ${f.from} to ${f.to}`).join(", ")}) hold no drawn message or cross another without nesting, so they are not drawn`,
      [
        "set from: and to: to the first and last message the fragment holds (counted from 1 in edges order)",
        "nest overlapping fragments: one starts and ends inside the other",
      ],
      Math.min(20, 8 * lost.length),
      undefined,
      "SEQ-07",
    );

  // SEQ-08: one scenario a reader follows in one pass.
  if (messages.length > LENGTH)
    add(
      "conventions.sequence-length",
      messages.length > LONG ? "major" : "minor",
      [],
      { messages: messages.length, limit: LENGTH },
      `${messages.length} messages in one figure; past ${LENGTH} the reader loses the thread`,
      [
        "split the scenario at a natural seam into two figures (setup, then use)",
        "fold a repeated exchange into one loop fragment",
        "drop messages the story does not need (logging, retries)",
      ],
      messages.length > LONG ? 10 : 4,
      undefined,
      "SEQ-08",
    );

  return {
    messages: messages.length,
    participants: model.nodes.length,
    unlabelled: bare.length,
    unused: idle.length,
    solidReplies: solid.length,
    fragmentProblems: lost.length,
  };
}
