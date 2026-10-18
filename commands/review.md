---
description: Review a orrery diagram spec with the measured review and the three reviewer agents, then improve it with patches that must raise the score.
argument-hint: <spec.yaml> [width]
---

Review and improve the orrery diagram spec `$1` at a display width of `$2` CSS pixels (880, a GitHub README column, when no width is given).

Follow the review loop in `${CLAUDE_PLUGIN_ROOT}/skills/orrery/references/review/loop.md` exactly. In short:

1. Pin the brief in one line from the spec's title and the user's request: what the diagram shows, for whom, where it is shown.
2. Measure: `node "${CLAUDE_PLUGIN_ROOT}/skills/orrery/scripts/orrery.mjs" review $1 --width <width> --json -o <spec path without .yaml>`. Read the review JSON it writes.
3. Scale the effort as loop.md says. When reviewers are needed, launch `orrery:conventions-reviewer`, `orrery:flow-reviewer` and `orrery:legibility-reviewer` in one message, each with the spec path, the brief, the review JSON path, the review PNG path and (for the conventions reviewer) the `rubrics` from the JSON.
4. Merge their findings with the measured ones, then apply 1 to 3 non-overlapping patches to the spec. You are the only one who edits the spec; keep a copy of its text first.
5. Re-run the review. Keep the round only if no hard count went up and the score went up; otherwise restore the copy.
6. Stop on pass, after 3 rounds, or after 2 rounds in a row without a kept patch. Then render the outputs the user asked for with `orrery render`.

Report the score before and after, the kept patches, what is left with its evidence, and the round ledger.
