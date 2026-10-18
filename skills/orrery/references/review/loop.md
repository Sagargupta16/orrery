# The review loop

How a rendered diagram gets reviewed and improved: **measure, critique, patch, ratchet**. Code measures everything that can be measured; three model reviewers judge only what code cannot; one orchestrator (the main session) is the only one that edits the spec; a patch is kept only when the measured score goes up and no hard count goes up.

## Roles

| Role | Who | Writes | Reads |
| --- | --- | --- | --- |
| Orchestrator | the main session | the spec, and nothing else | everything below |
| Measurer | `orrery review` (`src/review.ts`) | `<base>.review.json`, `<base>.review.png` | the spec |
| Conventions reviewer | `orrery:conventions-reviewer`, or an inline pass | one JSON findings array | the rubric files named in `rubrics` of the review JSON |
| Flow reviewer | `orrery:flow-reviewer`, or an inline pass | one JSON findings array | [flow.md](flow.md) |
| Legibility reviewer | `orrery:legibility-reviewer`, or an inline pass | one JSON findings array | [legibility.md](legibility.md) |

Reviewers are read-only (Read, Glob, Grep): they cannot edit, write or spawn agents. Rubrics: [conventions-aws.md](conventions-aws.md), [conventions-azure.md](conventions-azure.md), [conventions-gcp.md](conventions-gcp.md), [conventions-c4.md](conventions-c4.md), [flow.md](flow.md), [legibility.md](legibility.md).

## Why this shape

- **One writer.** Parallel writers make conflicting decisions; subagents answer questions and one agent acts on the answers ([Cognition, Don't build multi-agents](https://cognition.com/blog/dont-build-multi-agents)).
- **Orchestrator and parallel workers, effort scaled to the task** ([Anthropic, How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)).
- **Evaluator and optimizer** pays off when the evaluation criteria are clear ([Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)), so the criteria are numbers first.
- **Code is the authority for geometry.** Vision models count line intersections correctly 56.84% of the time and overlapping circles 39.44% ([VLMs are blind](https://arxiv.org/html/2407.06581)); model judgments of visualizations correlate 0.428 with people ([VisJudge-Bench](https://arxiv.org/abs/2510.22373)). Reviewers never assert an overlap, crossing, size or contrast problem the measurement does not show.
- **Structured artifacts between roles**: the review JSON and the findings arrays, not chat ([MetaGPT](https://arxiv.org/html/2308.00352)).
- **Separate numeric, lexical and visual feedback** ([PlotGen](https://arxiv.org/html/2502.00988v1)): conventions (names and vendor rules), flow (structure and story), legibility (the picture at display width).
- **Few edits per round, revert when nothing improves, three rounds** ([See it. Say it. Sorted](https://arxiv.org/html/2508.15222); [MatPlotAgent](https://arxiv.org/html/2402.11453) and [PaperBanana](https://arxiv.org/html/2601.23265) both stop at 3 rounds; PaperBanana's critics miss connectivity, so the flow reviewer checks it from the spec, not the image).
- **Progress ledger with a stall threshold of 2** ([Magentic-One](https://arxiv.org/html/2411.04468)).

## Steps

### 0. Brief and width

One line: what the diagram must show, for whom, and where it is shown. The place sets the review width, the CSS width readers see it at: GitHub README `880`, a docs site its content column (720 to 1000), a slide `1280`, a phone `360`.

### 1. Measure

```bash
orrery review docs/architecture.yaml --width 880 --json -o docs/architecture
```

It lays out the spec in both themes, writes `docs/architecture.review.json` and `docs/architecture.review.png` (a still PNG at the display width, one pixel per CSS pixel: what the reader sees) and prints the report (`--json`) or a table. `--theme dark` reviews the dark scene's geometry; contrast is checked in both themes either way. Read from the JSON: `score`, `pass`, `hard`, `dimensions.*.score` and `metrics`, `findings`, `elements` (every node, group and edge with its box in PNG pixels), `rubrics`.

### 2. Scale the effort

- `pass` is true and there are no findings: stop and report.
- Under 10 nodes, or only minor findings: one inline pass that reads all the named rubrics.
- Otherwise: the three reviewers.

### 3. Critique

With subagents (the Claude Code plugin), spawn the three reviewers **in one message** so they run in parallel, each with this prompt:

```text
Spec: <spec path>. Brief: <one line>. Review JSON: <base>.review.json.
Display PNG: <base>.review.png (<display.width>x<display.height>, the diagram as readers see it at <width>px).
Rubrics: <rubrics from the JSON, for the conventions reviewer>.
Return only the JSON findings array.
```

Without subagents (the Agent Skills install, or a client with no agent tool), run three passes inline, one after another. In each pass read only that pass's rubric, the spec, the review JSON and the PNG, write that pass's findings array down, and only then start the next pass, so one rubric does not color another.

### 4. Merge

1. **Drop** a finding when it has no evidence; when its `id` is neither a measured id (table below) nor a rule id in one of the rubric files; when a subject is not an `elements` id; or when it asserts geometry (overlap, crossing, cut off, text size, contrast) that no measured finding shows.
2. **Dedupe** by dimension plus sorted subjects. Keep the higher priority finding; union the fixes and patches.
3. **Rank**: measured blocker > cited vendor rule > brief and audience > taste. Within a level: higher severity, then measured before judged, then the patch that touches fewer elements.

### 5. Patch

Take 1 to 3 non-overlapping patches from the top of the ranking. Keep a copy of the spec text, apply the patches, and render again. Never patch away something the brief asks for (a node, an edge, a label) to silence a finding.

### 6. Ratchet

Re-run step 1. Keep the round only when it was reviewed at the same width and theme, **no hard count went up, blockers plus majors did not go up, no node was removed (dropping an edge is fine) and the score went up** (`improves(before, after)` in `src/review.ts`); otherwise restore the copy and do not propose the same patch again.

| Round | Patches | Score | Hard (overlaps/nodes/headers/labels/canvas/contrast) | Kept |
| --- | --- | --- | --- | --- |
| 1 | `set direction down`; `set nodes.db.note` | 71.4 -> 83.0 | 0/0/6/0/0/0 -> 0/0/2/0/0/0 | yes |

Keep this ledger in the conversation.

### 7. Stop

When `pass` is true, after 3 rounds, or after 2 rounds in a row without a kept patch.

### 8. Report

The final table (the CLI prints it), each kept patch with its score change, what is left with its evidence (finding id plus the measured value or the rubric quote), the ledger, and the written paths.

## Finding format

Measured findings (in the review JSON) and reviewer findings share one shape; reviewers add `patches`.

```json
[
  {
    "id": "AWS-08",
    "dimension": "conventions",
    "severity": "minor",
    "subjects": ["db"],
    "evidence": {
      "rule": "AWS-08",
      "quote": "Use short forms without first mentioning the full service name somewhere in the document.",
      "label": "Aurora"
    },
    "claim": "The database is labelled Aurora and Amazon Aurora appears nowhere in the diagram.",
    "fixes": ["Name the service in full once."],
    "patches": [{ "op": "set", "path": "nodes.db.note", "value": "Amazon Aurora PostgreSQL" }]
  }
]
```

- `dimension`: conventions, layout, grid, flow, overlap or quality. `severity`: blocker, major or minor.
- `evidence` carries at least one of: `measured` (a metric name from `dimensions.*.metrics` or a measured finding id) with its `value`; `rule` and `quote` (a rubric rule id and its quote, verbatim); `box` (an `elements` id) with the region in PNG pixels.
- `subjects` are spec ids. An empty list means the whole diagram.

### Patches

Concrete edits to the YAML spec. Paths are dotted keys of the spec: `nodes.<id>.<key>`, `groups.<id>.<key>`, `legend.<style>`, `layout.<key>`, and top-level keys.

| op | Fields | Example |
| --- | --- | --- |
| `set` | `path`, `value` | `{ "op": "set", "path": "direction", "value": "down" }` |
| `unset` | `path` | `{ "op": "unset", "path": "nodes.api.color" }` |
| `add` | `path`, `value` | `{ "op": "add", "path": "nodes.int", "value": { "icon": "azure:network-interfaces", "in": "snet-app" } }` |
| `move` | `path`, `after` or `before` | `{ "op": "move", "path": "nodes.db", "after": "api" }` (spec order drives layout) |
| `edge` | `match` (a spec edge line; null appends), `value` (null removes) | `{ "op": "edge", "match": "api -> db", "value": "api -> db: Reads orders [SQL]" }` |

Two patches overlap when they touch the same node, group or edge, or one path is a prefix of the other.

## Scores

Each dimension starts at 100; every finding kind takes off its cost, at most its cap. The total is the weighted sum: conventions 0.15, layout 0.15, grid 0.10, flow 0.20, overlap 0.20, quality 0.20. **Pass** means a score of 85 or more and no blocker or major finding.

**Hard counts** must never go up: `overlaps` (labels over nodes, colliding nodes or labels, badges, hidden arrowheads, groups out of place), `edgesThroughNodes`, `edgesThroughHeaders`, `edgesThroughLabels`, `offCanvas`, `contrastFailures` (both themes).

## Measured finding ids

| id | Rule | Cap | Fires when |
| --- | --- | --- | --- |
| `overlap.edge-through-node` | DG201 | 60 | an edge runs through a node it does not connect |
| `overlap.label-over-node` | DG202 | 40 | an edge label covers a node |
| `overlap.labels-collide` | DG202 | 40 | two edge labels overlap |
| `overlap.nodes-collide` | DG203 | 60 | two nodes' drawn footprints overlap |
| `overlap.edge-through-header` | DG209 | 40 | an edge runs under a group header label, so it looks broken |
| `overlap.edge-through-label` | DG212 | 40 | an edge runs through another edge's label or step badge, or a node's label text |
| `overlap.off-canvas` | DG210 | 60 | something is drawn outside the canvas and gets cut off |
| `overlap.badge` | DG211 | 40 | a step badge or node badge covers a node, a label or another badge |
| `overlap.overlay-encloses` | DG213 | 30 | an overlay (around:) group draws around a node that is not a member |
| `overlap.outside-group` |  | 30 | a node or group sticks out of its parent group or into its header |
| `overlap.groups-collide` |  | 30 | two groups that do not nest overlap |
| `flow.head-hidden` |  | 40 | an arrowhead sits under a label, badge, header or node, so the direction is lost |
| `flow.shared-trunk` |  | 32 | two unrelated edges run on the same line, so readers cannot tell them apart |
| `flow.step-order` | AWS-14 | 32 | step numbers do not follow reading order (left to right, top to bottom, or clockwise) |
| `flow.step-numbering` |  | 8 | step numbers skip a number or do not start at 1 |
| `flow.bidirectional` | AZ-04 | 12 | a two-headed arrow hides who initiates |
| `flow.undirected` | AZ-03 | 12 | a line without an arrowhead leaves the relationship unclear |
| `flow.unlabelled-boundary` |  | 10 | an unlabelled edge crosses a group boundary |
| `flow.head-on-bend` |  | 15 | the last straight run is shorter than the arrowhead, so the head sits on the bend |
| `flow.arrow-short` |  | 10 | an edge stops short of the drawn icon glyph |
| `flow.unconnected` | DG208 | 12 | a node nothing connects to |
| `layout.against-flow` |  | 30 | an arrowhead points against the diagram direction |
| `layout.crossings` |  | 30 | edges cross each other |
| `layout.empty-space` |  | 25 | a large empty rectangle inside the content |
| `layout.aspect` | DG205 | 25 | the picture is a strip, hard to read in a document column |
| `layout.too-wide` | DG205 | 15 | the canvas is wider than 2400px |
| `layout.long-edge` |  | 15 | an edge is far longer than the median edge |
| `layout.fallback` | DG218 | 5 | ELK needed a fallback strategy, so spec order may not be kept |
| `layout.empty-group` | DG207 | 10 | a group with nothing in it |
| `grid.ragged` |  | 24 | items in one layer share no start, center or end line |
| `grid.jog` |  | 24 | an edge has a tiny step (under 6px) where it could run straight |
| `grid.off-center` |  | 21 | a group's content is off its center by more than 6px |
| `grid.uneven-gaps` |  | 15 | gaps between layers vary a lot |
| `quality.label-size` | LEG-01 | 60 | node labels are too small at the display width |
| `quality.text-size` | LEG-02 | 20 | the smallest text (notes, edge labels, badges) is too small at the display width |
| `quality.icon-size` | LEG-03 | 15 | icons are too small to recognize at the display width |
| `quality.contrast` | LEG-04 | 40 | text below the WCAG 2.2 contrast minimum |
| `quality.node-count` | DG206 | 20 | more nodes than one diagram can carry |
| `quality.long-label` | DG204 | 12 | a node label wraps to more than three lines |
| `quality.mid-word-break` | AWS-07 | 12 | a label breaks in the middle of a word |
| `conventions.legend-missing` | DG217 | 30 | a line style is used without a legend that explains it |
| `conventions.legend-unused` |  | 6 | the legend explains a line style the diagram does not draw |
| `conventions.title-missing` | C4-01 | 8 | the diagram has no title |
| `conventions.short-name` | AWS-08 | 20 | an AWS short form with no full service name anywhere in the diagram |
| `conventions.label-lines` | AWS-07 | 15 | an AWS service label runs over two lines |
| `conventions.callout-sizes` | AWS-13 | 5 | step callouts come in more than one size |
| `conventions.c4-element` | C4-04 | 24 | a C4 element lacks its type, description or technology |
| `conventions.c4-relationship` | C4-07 | 15 | a C4 relationship lacks a specific label or its technology |
| `conventions.icon-recolored` | AZ-06 | 15 | a brand mark is recolored |
| `conventions.gcp-product-icon` | GCP-02 | 24 | a Google Cloud product is drawn with another product's icon |
