# The review loop

How a rendered diagram gets reviewed and improved: **measure, critique, patch, ratchet**. Code measures everything that can be measured; three model reviewers judge only what code cannot; one orchestrator (the main session) is the only one that edits the spec; a patch is kept only when the measured score goes up and no hard count goes up.

## Roles

| Role | Who | Writes | Reads |
| --- | --- | --- | --- |
| Orchestrator | the main session | the spec, and nothing else | everything below |
| Measurer | `orrery review` (`src/review/`) | `<base>.review.json`, `<base>.review.png` | the spec |
| Conventions reviewer | `orrery:conventions-reviewer`, or an inline pass | one JSON findings array | the rubric files named in `rubrics` of the review JSON |
| Flow reviewer | `orrery:flow-reviewer`, or an inline pass | one JSON findings array | [flow.md](flow.md) |
| Legibility reviewer | `orrery:legibility-reviewer`, or an inline pass | one JSON findings array | [legibility.md](legibility.md) |

Reviewers are read-only (Read, Glob, Grep): they cannot edit, write or spawn agents. Rubrics: [conventions-aws.md](conventions-aws.md), [conventions-azure.md](conventions-azure.md), [conventions-gcp.md](conventions-gcp.md), [conventions-c4.md](conventions-c4.md), [conventions-bpmn.md](conventions-bpmn.md), [conventions-flowchart.md](conventions-flowchart.md), [conventions-state.md](conventions-state.md), [conventions-journey.md](conventions-journey.md), [conventions-er.md](conventions-er.md), [conventions-sequence.md](conventions-sequence.md), [conventions-timeline.md](conventions-timeline.md), [flow.md](flow.md), [legibility.md](legibility.md).

### Which conventions rubrics apply

`rubrics` in the review JSON names them, and `vendors` says why. A vendor rubric applies when its icons or group types appear (`aws`, `azure`, `gcp`; Kubernetes has no rubric), C4 when a group uses a `c4:` type or the title or subtitle names C4, and one notation rubric comes from the spec's `kind:`:

| `kind:` | Notation rubric |
| --- | --- |
| `process` | [conventions-bpmn.md](conventions-bpmn.md) (BPMN 2.0) |
| `flowchart` | [conventions-flowchart.md](conventions-flowchart.md) (ISO 5807) |
| `state` | [conventions-state.md](conventions-state.md) (UML state machines) |
| `journey` | [conventions-journey.md](conventions-journey.md) (customer journey maps) |
| `er` | [conventions-er.md](conventions-er.md) (data models, crow's foot notation) |
| `sequence` | [conventions-sequence.md](conventions-sequence.md) (UML sequence diagrams) |
| `timeline` | [conventions-timeline.md](conventions-timeline.md) (roadmaps and timelines) |
| `architecture`, `tree`, `mindmap` | none |

A process drawn with AWS icons gets both `conventions-aws.md` and `conventions-bpmn.md`. The measurement knows the kinds too: step order (AWS-14) is measured only on an architecture, arrowheads against the direction are not reported for `state` or `mindmap`, lines without heads are not reported for `tree` or `mindmap`, for a BPMN association or for a line style the legend explains, edges into or out of a pool or lane need no label and journey rows are no boundary, pools and lanes are not checked for centered content, and a message flow's dashed line needs no legend entry.

## Why this shape

- **One writer.** Parallel writers make conflicting decisions; subagents answer questions and one agent acts on the answers ([Cognition, Don't build multi-agents](https://cognition.com/blog/dont-build-multi-agents)).
- **Orchestrator and parallel workers, effort scaled to the task** ([Anthropic, How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)).
- **Evaluator and optimizer** pays off when the evaluation criteria are clear ([Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)), so the criteria are numbers first.
- **Code is the authority for geometry.** Vision models count line intersections correctly 56.84% of the time and overlapping circles 39.44% ([VLMs are blind](https://arxiv.org/html/2407.06581)); model judgments of visualizations correlate 0.428 with people ([VisJudge-Bench](https://arxiv.org/abs/2510.22373)). Reviewers never assert an overlap, crossing, size or contrast problem the measurement does not show.
- **Structured artifacts between roles**: the review JSON and the findings arrays, not chat ([MetaGPT](https://arxiv.org/html/2308.00352)).
- **Separate numeric, lexical and visual feedback** ([PlotGen](https://arxiv.org/html/2502.00988v1)): conventions (names and vendor rules), flow (structure and story), legibility (the picture at display width).
- **Few edits per round, revert when nothing improves, three rounds** ([See it. Say it. Sorted](https://arxiv.org/html/2508.15222); [MatPlotAgent](https://arxiv.org/html/2402.11453) and [PaperBanana](https://arxiv.org/html/2601.23265) both stop at 3 rounds; PaperBanana's critics miss connectivity, so the flow reviewer checks it from the spec, not the image).
- **Progress ledger with a stall threshold of 2** ([Magentic-One](https://arxiv.org/html/2411.04468)).
- **Reduce before nudging, then try candidates in one batch**: an overlap is often a symptom of too many arrows, and one batch of candidates replaces several fix, render and look cycles.

## Steps

### 0. Brief and width

One line: what the diagram must show, for whom, and where it is shown. The place sets the review width, the CSS width readers see it at: GitHub README `880`, a docs site its content column (720 to 1000), a slide `1280`, a phone `360`.

### 1. Measure

```bash
orrery review docs/architecture.yaml --width 880 --json -o docs/architecture
```

It lays out the spec in both themes, writes `docs/architecture.review.json` and `docs/architecture.review.png` (a still PNG at the display width, one pixel per CSS pixel: what the reader sees) and prints the report (`--json`) or a table, where identical finding lines print once with a count (`(x3)`). `--theme dark` reviews the dark scene's geometry; contrast is checked in both themes either way. Read from the JSON: `score`, `pass`, `hard`, `dimensions.*.score` and `metrics`, `findings` (with `patches` when a fix can be written as one), `elements` (every node, group and edge with its box in PNG pixels), `rubrics`.

When the display PNG is taller or wider than 1568 px (a tall diagram at a README width), the review also writes the **look PNG**, `docs/architecture.review.look.png`: the same picture scaled to fit inside 1568 x 1568. Models stall on images over about 2000 px a side, and a rejected image stays in the conversation, so whoever looks (the orchestrator or a reviewer) views the look PNG when it exists, never the full one, and takes every size from the JSON.

### 2. Scale the effort

- `pass` is true and there are no findings: stop and report.
- Under 10 nodes, or only minor findings: one inline pass that reads all the named rubrics.
- Otherwise: the three reviewers.

### 3. Critique

With subagents (the Claude Code plugin), spawn the three reviewers **in one message** so they run in parallel, each with this prompt:

```text
Spec: <spec path>. Brief: <one line>. Review JSON: <base>.review.json.
Display PNG: <base>.review.png (<display.width>x<display.height>, the diagram as readers see it at <width>px).
Look PNG: <base>.review.look.png (only when the review wrote one; view it instead of the display PNG).
Rubrics: <rubrics from the JSON, for the conventions reviewer>.
Return only the JSON findings array.
```

Without subagents (the Agent Skills install, or a client with no agent tool), run three passes inline, one after another. In each pass read only that pass's rubric, the spec, the review JSON and the PNG (the look PNG when there is one), write that pass's findings array down, and only then start the next pass, so one rubric does not color another.

### 4. Merge

1. **Drop** a finding when it has no evidence; when its `id` is neither a measured id (table below) nor a rule id in one of the rubric files; when a subject is not an `elements` id; or when it asserts geometry (overlap, crossing, cut off, text size, contrast) that no measured finding shows.
2. **Dedupe** by dimension plus sorted subjects. Keep the higher priority finding; union the fixes and patches.
3. **Rank**: measured blocker > cited vendor rule > brief and audience > taste. Within a level: higher severity, then measured before judged, then the patch that touches fewer elements.

### 5. Patch: reduce, then candidates, then restructure

Climb this ladder one rung at a time, and stop on the rung that clears the top findings.

1. **Reduce first.** An overlap, a crossing or a shared line is often a symptom of too many edges (`flow.edge-budget` fires when edges outnumber nodes). Before any geometry patch, question the edges behind the finding, in this order:
   - Parallel edges into members of one group become one edge to the group (`to: <group id>`), with one label that says what the several edges said.
   - Echo, reply and callback edges go: the forward edge already says it.
   - Edges from every node into a cross-cutting service (logs, metrics, tracing, audit, identity, keys) go, and the service moves into a group labelled Shared services with no edges to it; `flow.cross-cutting` carries that patch.
2. **Candidates.** Write 2 to 4 candidate patch sets, each a different hypothesis (move a node in the nodes list, a `rank:` or `align:` hint, `direction`, `layout.spacing`, a shorter label) and each 1 to 3 non-overlapping patches from the top of the ranking, and try them all in one call:

   ```bash
   orrery patch docs/architecture.yaml candidates.json --width 880 -o docs/architecture.best.yaml --json
   ```

   `candidates.json` is an array of patch sets: `[[{ "op": "move", "path": "nodes.db", "after": "api" }], [{ "op": "set", "path": "direction", "value": "down" }]]`. Each set is reviewed on its own copy of the spec and kept only when step 6's ratchet passes; keep only the best kept one (`best` in the output), drop the rest without looking at them, and look once at the winner's PNG.
3. **Restructure** when no candidate is kept, or the best one trades one finding for another: the composition is wrong, not the edge. Put connected nodes next to each other in the nodes list, move a group next to the tier that feeds it, change `direction`, or split the diagram, then start again from step 1.

Never patch away something the brief asks for (a node, an edge, a label) to silence a finding; dropping an echo or cross-cutting edge on rung 1 is not that, since the layout still says it.

### 6. Ratchet

Keep a round only when it was reviewed at the same width and theme, **no hard count went up, blockers plus majors did not go up, no node was removed (dropping an edge is fine) and the score went up** (`improves(before, after)` in `src/review/index.ts`). `orrery patch` applies it to every candidate; a patch applied by hand needs step 1 again. Otherwise restore the copy and do not propose the same patch again.

| Round | Patches | Score | Hard (overlaps/nodes/headers/labels/canvas/contrast) | Kept |
| --- | --- | --- | --- | --- |
| 1 | `set direction down`; `set nodes.db.note` | 71.4 -> 83.0 | 0/0/6/0/0/0 -> 0/0/2/0/0/0 | yes |

Keep this ledger in the conversation.

### 7. Stop

When `pass` is true, after 3 rounds, or after 2 rounds in a row without a kept patch.

### 8. Report

The final table (the CLI prints it), each kept patch with its score change, what is left with its evidence (finding id plus the measured value or the rubric quote), the ledger, and the written paths.

## Finding format

Measured findings (in the review JSON) and reviewer findings share one shape. Reviewers always add `patches`; a measured finding carries them when its first fix can be written as one.

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

**Hard counts** must never go up: `overlaps` (labels over nodes, colliding nodes or labels, badges, hidden arrowheads, groups out of place), `edgesThroughNodes`, `edgesThroughHeaders`, `edgesThroughLabels`, `offCanvas`, `contrastFailures` (both themes). Near misses (`overlap.label-on-border`, `overlap.edge-skims-node`) cost points but raise no hard count.

The composition findings (zig-zag, avoidable bend, beside a group, uneven siblings, sparse group, padding, and DG221's 10px) measure canvas px, not display px: they say how far layout put two ends out of line or how loosely a frame fits, in the units layout works in, and a narrower column shrinks the defect and its fix alike. A sparse group's nodes cover 32px around them (times `layout.spacing`), half of orrery's gap between layers, so the layout's own spacing never counts as empty.

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
| `overlap.overlay-header` | DG214 | 30 | an overlay (around:) group's header covers another group's header or a node |
| `overlap.outside-group` |  | 30 | a node or group sticks out of its parent group or into its header |
| `overlap.groups-collide` |  | 30 | two groups that do not nest overlap |
| `overlap.label-on-border` | DG220 | 16 | an edge label sits on a group's border line, so the frame looks broken there |
| `overlap.edge-through-group` | DG223 | 24 | an edge cuts through a group that holds neither of its ends (major only when it runs more than 24px inside) |
| `overlap.title-band` | DG225 | 16 | an edge label sits in a group's title band, or a vertical run passes just right of the title |
| `overlap.edge-skims-node` | DG221 | 16 | an edge passes within 10px of a node it does not connect, so it reads as touching it |
| `flow.head-hidden` |  | 40 | an arrowhead sits under a label, badge, header or node, so the direction is lost |
| `flow.shared-trunk` |  | 32 | two unrelated edges run on the same line, so readers cannot tell them apart |
| `flow.step-order` | AWS-14 | 32 | step numbers do not follow reading order (left to right, top to bottom, or clockwise) |
| `flow.step-numbering` |  | 8 | step numbers skip a number or do not start at 1 |
| `flow.bidirectional` | AZ-04 | 12 | a two-headed arrow hides who initiates |
| `flow.undirected` | AZ-03 | 12 | a line without an arrowhead leaves the relationship unclear |
| `flow.unlabelled-boundary` |  | 10 | an unlabelled edge crosses a group boundary |
| `flow.head-on-bend` |  | 15 | the last straight run is shorter than the arrowhead, so the head sits on the bend |
| `flow.arrow-short` |  | 10 | an edge stops short of what it points at (the icon glyph or tile, a card, shape or group border) or runs into it; major when an end lands outside an icon's tile, out where its label is |
| `flow.unconnected` | DG208 | 12 | a node nothing connects to |
| `flow.edge-budget` |  | 6 | an architecture diagram with more edges than nodes, which reads as a call sequence |
| `flow.side-by-side` |  | 12 | two unrelated edges run 1.5 to 12px apart for more than 48px, so they read as one line |
| `flow.cross-cutting` |  | 12 | four or more edges into a monitoring, logging, audit, identity or key service from outside its family; a shared services group says it without arrows |
| `layout.against-flow` |  | 30 | an arrowhead points against the diagram direction |
| `layout.crossings` |  | 30 | edges cross each other |
| `layout.empty-space` |  | 25 | a large empty rectangle inside the content |
| `layout.aspect` | DG205 | 25 | the picture is a strip, hard to read in a document column |
| `layout.too-wide` | DG205 | 15 | the canvas is wider than 2400px |
| `layout.long-edge` |  | 15 | an edge is far longer than the median edge |
| `layout.fallback` | DG218 | 5 | ELK needed a fallback strategy, so spec order may not be kept |
| `layout.empty-group` | DG207 | 10 | a group with nothing in it |
| `layout.ignored` | DG219 | 9 | a setting layout could not honor (for example `rank:`, `align:`, `cols:` or `layout.aspect`); the patch unsets it |
| `layout.sparse-group` |  | 12 | a group more than 65% empty (8px raster below its header) |
| `layout.sparse` |  | 15 | the median empty gap between neighbouring nodes is over 300px (canvas px): the figure is spread thin |
| `layout.wide-pitch` |  | 8 | the median centre-to-centre pitch of neighbouring nodes is over 400px |
| `layout.beside-group` |  | 12 | a node outside a group shares 20 to 80% of its height with it, so the two read as one row of peers |
| `grid.ragged` |  | 24 | items in one layer share no start, center or end line, or icons joined by an edge in one row (one column) sit off one center line |
| `grid.jog` |  | 24 | an edge has a tiny step (under 6px) where it could run straight |
| `grid.off-center` |  | 21 | a group's content is off its center by more than 6px, or the ends on one face of an icon sit off its center or at an uneven, too wide or too tight pitch |
| `grid.uneven-gaps` |  | 15 | gaps between layers vary a lot |
| `grid.zig-zag` |  | 15 | a one-to-one edge steps 12 to 180px between two parallel runs (a Z): its ends are out of line |
| `grid.wide-gap` |  | 12 | a gap between a group's rows or columns is over the room layout needs there plus 96px, or over 2.5x that room |
| `grid.group-gap` |  | 12 | two sibling groups sit further apart than the edge labels between them need, plus 32px |
| `grid.edge-on-border` | DG224 | 12 | a straight edge run lies within 4px of a parallel group border for more than 24px |
| `grid.avoidable-bend` |  | 15 | a one-to-one edge turns once with a leg of 240px or less: its ends are out of line; or an edge bends more than a clear simpler route between its faces would |
| `grid.uneven-siblings` |  | 12 | same-kind boundary groups under one parent differ 10 to 40% in height in a row or width in a column (any amount over 10% when their labels differ only by a letter or digit) |
| `grid.padding` |  | 12 | one side of a group's padding is over 80px and over 3x its tightest side, so the box does not hug its content |
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
| `conventions.subtitle-echo` |  | 4 | the subtitle repeats the title or only lists node labels |
| `conventions.short-name` | AWS-08 | 20 | an AWS short form with no full service name anywhere in the diagram |
| `conventions.label-lines` | AWS-07 | 15 | an AWS service label runs over two lines |
| `conventions.callout-sizes` | AWS-13 | 5 | step callouts come in more than one size |
| `conventions.boundary-label` | AWS-17 | 12 | an AWS boundary group's label does not name the boundary (Private subnet, VPC, Region) |
| `conventions.service-group` | AWS-18 | 12 | a group with an AWS service icon holds other services |
| `conventions.service-label` | AWS-19 | 15 | an AWS service icon's label does not name the service; the role belongs in note |
| `conventions.c4-element` | C4-04 | 24 | a C4 element lacks its type, description or technology |
| `conventions.c4-relationship` | C4-07 | 15 | a C4 relationship lacks a specific label or its technology |
| `conventions.icon-recolored` | AZ-06 | 15 | a brand mark is recolored |
| `conventions.gcp-product-icon` | GCP-02 | 24 | a Google Cloud product is drawn with another product's icon |
| `conventions.bpmn-start-end` | BPMN-01 | 24 | a process (or one pool's process) has no start event or no end event |
| `conventions.bpmn-gateway` | BPMN-04 | 24 | a splitting exclusive or inclusive gateway asks no question or leaves a branch unlabelled |
| `conventions.bpmn-join` | BPMN-06 | 20 | parallel branches meet at something other than a joining gateway, so what follows runs once per branch |
| `conventions.bpmn-pools` | BPMN-07 | 30 | a message flow inside one pool, or a sequence flow that crosses from one pool to another |
| `conventions.flowchart-terminals` | FC-01 | 20 | a flowchart without exactly one start terminator and at least one end terminator |
| `conventions.flowchart-decision` | FC-03 | 24 | a decision with fewer than two exits, or an exit that does not say which answer it is |
| `conventions.state-initial` | SM-01 | 20 | a state machine with no initial pseudostate, more than one in a region, or one with several transitions out |
| `conventions.state-final` | SM-03 | 15 | a transition leaves a final state |
| `conventions.journey-incomplete` | JM-04 | 10 | a journey stage with no step, or a journey with no emotion score anywhere |
| `conventions.er-primary-key` | ER-03 | 20 | a table with no primary key field |
| `conventions.er-dangling-fk` | ER-04 | 15 | a foreign key field that no relationship uses |
| `conventions.er-cardinality` | ER-05 | 20 | a relationship with no `card:` |
| `conventions.er-orphan` | ER-07 | 15 | a table that takes part in no relationship |
| `conventions.er-many-to-many` | ER-08 | 15 | a many to many relationship drawn directly instead of through a join table |
| `conventions.sequence-unused` | SEQ-02 | 15 | a participant that sends and receives nothing |
| `conventions.sequence-unlabelled` | SEQ-04 | 20 | a message with no label (a reply may stay unlabelled) |
| `conventions.sequence-reply` | SEQ-05 | 15 | a reply to the caller drawn solid instead of dashed |
| `conventions.sequence-fragment` | SEQ-07 | 20 | a fragment the layout could not draw: an empty range or one that crosses another |
| `conventions.sequence-length` | SEQ-08 | 10 | more messages than one figure reads well (minor over 16, major over 24) |
| `conventions.timeline-undated` | TL-01 | 20 | an item with no date, left out of the picture |
| `conventions.timeline-range` | TL-03 | 15 | an item outside the axis bounds |
| `conventions.timeline-legend` | TL-07 | 10 | statuses used with no key |
| `conventions.timeline-order` | TL-08 | 20 | a dependency whose target starts before its source ends |
| `conventions.timeline-crowded` | TL-11 | 10 | point labels stacked more than three deep |
