# Diagram spec reference

A diagram is one YAML (or JSON) file with three collections: `nodes`, `groups` and `edges`. Everything else is optional. `orrery validate` checks a spec and prints every problem with a code and a fix; `orrery render` refuses to write files while errors remain.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/Sagargupta16/orrery/main/skills/orrery/references/diagram.schema.json
title: Serverless image pipeline
subtitle: Upload, resize and serve images on AWS
direction: right

groups:
  cloud:  { type: aws:cloud }
  region: { type: aws:region, label: us-east-1, in: cloud }

nodes:
  users:  { icon: aws:users, label: Users }
  cdn:    { icon: aws:cloudfront, in: region }
  api:    { icon: aws:api-gateway, in: region }
  upload: { icon: aws:lambda, label: Upload handler, in: region }
  bucket: { icon: aws:s3, label: Originals, in: region }

edges:
  - users -> cdn: HTTPS
  - cdn -> api
  - api -> upload: POST /images
  - upload -> bucket
```

## Top level

| Key | Values | Default | Notes |
| --- | --- | --- | --- |
| `title` | text | none | Drawn top left; also the SVG `<title>` and the TSX component name. |
| `subtitle` | text | none | One muted line under the title. |
| `kind` | `architecture`, `flowchart`, `process`, `state`, `tree`, `mindmap`, `journey` | `architecture` | What the diagram is; see [Kinds](#kinds). It sets the default `direction` and `arrowhead` (flowchart: `down` and `filled`; process: `right` and `filled`; tree: `down`), which the spec can still set. |
| `direction` | `right`, `down`, `left`, `up` | `right` | Main flow direction. `down` suits long chains and tiered architectures. |
| `theme` | `light`, `dark` | `dark` | `render --theme` overrides it; `--theme both` writes both. |
| `look` | `icon`, `card` | `icon` | Default look for nodes that have an icon. |
| `arrowhead` | `open`, `filled` | `open` | Open chevrons as in the AWS and Google Cloud decks, or filled triangles as in Azure's diagrams. |
| `layout.spacing` | `compact`, `normal`, `loose` or a number 0.5 to 3 | `normal` | Scales every gap. |
| `layout.routing` | `orthogonal`, `polyline`, `spline` | `orthogonal` | Edge style. Orthogonal is the house style of AWS and Azure diagrams. |
| `layout.layering` | `source`, `simplex` | `source` | `source` lines parallel branches up; `simplex` keeps edges shortest. Try the other one when a layout looks off. |
| `layout.merge` | `true`, `false` | `true` | Edges that share an endpoint and have the same line, arrow and color join into one trunk with a single arrowhead; different styles keep their own ports. `false` gives every edge its own port. |
| `layout.aspect` | a width:height ratio (`4:3`, `16:9`, `3/2`) or a number 0.25 to 4 | none | The canvas shape to aim for. Layout compares six candidates (the flow as written, the flow turned, and two ways of wrapping a long flow in each direction) and keeps the one nearest the target that adds no crossings, sends no edge through a node and keeps edges short; when none gets within a quarter of it, DG219 names the nearest. A long chain often needs `align` as well, to fold branches beside the main path. `4:3` suits a README or document, `16:9` a slide (DG116 for anything else). |
| `animate` | `packets`, `flow`, `relay`, `none` (`true` is `packets`, `false` is `none`) | `packets` for `classic`, `relay` for `stage` | Motion in SVG, TSX and HTML; PNG and draw.io are always still. `packets`: a dot travels every directed edge, and numbered edges run one after another in step order as a loop; line styles stay as drawn. `flow`: marching dashes along every edge. `relay`: on one clock each line draws itself in turn (step order when edges carry `step:`, else outward from the entry points) and the node it reaches lights up; everything holds, then the loop resets. In `stage`, `relay` and `packets` both play the stage story (see `skin`). `render --animate <mode>` or `--static` overrides it. |
| `skin` | `stage`, `classic` | `stage` | `classic`: the vendors' own diagram styles (AWS deck groups and colors, official icons in color, packets on every edge). `stage`: the same layout (every box and point identical) as an animated scene with no vendor hues: a hairline grid and one tint wash, structure in one color at a few alphas, icons as monochrome glyphs on ink tiles, labels in Geist Mono caps. Its motion is one story: the groups light, then the tiles, then a packet with a comet tail walks the spec's `story:` path, or in a `process` a BPMN token (it leaves every start event, splits at parallel gateways and waits at the join, takes the yes branch at a decision, sends message flows as their own hops and waits for them, and stops at end events), or in a `tree` or `mindmap` grows out of the root, else runs the numbered edges in step order, else the longest path, lighting each wire behind it; every step badge pops as its packet leaves, at most two other edges run a small packet, everything holds and loops. A node's or edge's `color:` becomes its lit tint. Both themes. `render --skin` and `review --skin` override it. |
| `background` | quoted hex color or `transparent` | theme | `transparent` drops the background rectangle. |
| `icons` | mapping of a name to an `.svg` file | none | Your own icons, used as `icon: local:<name>`. Paths are read relative to the spec's folder; names use lowercase letters, digits and `-`. A missing file or a bad name fails with DG111. `orrery icons new`, `icons check` and `icons adopt` make and verify them (see [icons.md](icons.md)). |
| `stages` | list of names | none | The columns of a journey (`kind: journey`), in order; their headers number them 1, 2, ... Every node of a journey names its `stage:` (DG112). |
| `story` | list of node ids | none | The path the stage skin's story walks, in order: each hop runs along the edge between two consecutive ids, backwards when that edge points the other way (DG113 warns when none connects them, and that pair is skipped). Without it a `process` plays a BPMN token, a `tree` or `mindmap` grows out of its root a level at a time, else the story follows the numbered steps, else the longest path. The classic skin's motion does not follow it. |
| `legend` | mapping of `solid`, `dashed`, `dotted` or `thick` to a short meaning | none | A key drawn bottom right that says what each line style means, for example `legend: { dashed: Asynchronous events, dotted: Replication }`. Keys are case-insensitive and rows keep the order you write them. An unknown style (`dashd`) or an empty meaning fails with DG107, and the fix names the closest style. Add an entry for every non-solid style the diagram uses (DG217 warns otherwise). Quote a meaning that contains a comma. |

Colors (node `color`, group `color` and `fill`, edge `color` and the top-level `background`) are `#` plus 3 or 6 hex digits, and they need quotes: `color: "#2563eb"`. `fill` also accepts `none` and `background` also accepts `transparent`. A value without the `#` (`color: 2563eb`) fails with DG107 "... must be a hex color with a leading #", fixed by `use a quoted hex color such as "#2563eb"`. An unquoted `#` starts a YAML comment, so `color: #2563eb` reaches orrery as an empty value; that fails with DG107 "<where> color is empty; an unquoted # starts a YAML comment" instead of silently dropping the color.

Ids (node and group keys) use letters, digits, `_`, `-` and `.`, and must be unique across nodes and groups.

## Kinds

`kind:` says what the diagram is. Every kind uses the same nodes, groups and edges; it sets defaults and how they are laid out.

- **`architecture`** (the default): vendor boundaries, icons and edges on the layered layout, as everything above describes.
- **`flowchart`**: ISO 5807 symbols (`terminator`, `process`, `decision`, `data`, `predefined`, `manual`, `delay`, `document`), `direction: down` and filled arrowheads by default. Label each decision's branches (`yes`, `no`). Lanes (below) make it a cross-functional flowchart.
- **`process`**: BPMN 2.0. Nodes carry `bpmn:` (events, gateways, tasks, data), `pool` and `lane` groups hold them, and `flow: message` connects pools. `direction: right` and filled arrowheads by default; `direction: down` runs the pools top to bottom, which reads better on a phone. In the stage skin the story is a BPMN token (see `story`).
- **`state`**: a UML state machine on the layered layout, with `shape: initial` and `shape: final` for the pseudostates (unlabeled unless given a label) and `shape: state` for states; write transitions as `event [guard] / action`. A self-transition (`a -> a`) is a loop on a corner of its state with its label beside it. `layout: { merge: false }` gives every transition its own end, as UML draws them.
- **`tree`**: org charts, decision trees, taxonomies. Each node sits under the node whose edge points at it (the first such edge in spec order); nodes nothing points at are roots, side by side. Levels follow `direction` (default `down`), siblings are evenly spaced, each parent is centered over its first and last child, and edges are org-chart connectors without arrowheads (a decision tree's `yes`/`no` label sits on the child's drop). `layout: { routing: spline }` curves them; an edge outside the hierarchy (a second parent, a cycle) is an elbow with its arrowhead.
- **`mindmap`**: the root (the node nothing points at, else the first node) is drawn larger in the middle; its branches split between the two halves (left and right, or above and below for `down` and `up`) in spec order, each to the half with less in it so far, and each half grows away from the root as a tidy tree. Edges are curves without arrowheads, thick out of the root, and may be written either way round; each first-level branch takes one color from a fixed palette that keeps 3:1 in every theme and skin, unless `color:` says otherwise.
- **`journey`**: a customer journey map. `stages:` are the columns, numbered left to right; each group a step is `in:` is a row (its `label` heads it, its `color` marks the header) and steps in no group share a first row named Steps. Every step is a card (icon, label, note) whatever its `look`; cards in a column share its width and cards in a row its tallest height, so the steps of a row line up. Edges are optional and show the order, routed in the gutters between cards; a line without an arrowhead (`a ... b`) links a step to its touchpoint. Steps with `score:` give an emotion row under the grid: each stage's average as a curve with a face per stage. `direction` does not apply.

## Nodes

```yaml
groups:
  private-a: { type: aws:private-subnet, label: Private subnet A }
nodes:
  db: { icon: aws:aurora, label: Orders DB, note: "PostgreSQL 16, Multi-AZ", in: private-a }
  cache: aws:elasticache          # shorthand: just an icon id
  legacy: Mainframe               # shorthand: a label (draws a shape node)
```

| Key | Meaning |
| --- | --- |
| `icon` | Icon id such as `aws:lambda` or an alias such as `aws:s3`. Find ids with `orrery icons search <words>`. |
| `label` | Text under (or inside) the node. Defaults to the icon's official name, so `{ icon: aws:sqs }` reads "Amazon Simple Queue Service". |
| `note` | Second, smaller, muted line: instance type, version, count, purpose. Quote it if it contains a comma. |
| `in` | Id of the group the node sits in. |
| `look` | `icon` (icon with the label below), `card` (icon beside the label in a bordered box) or `shape`. |
| `shape` | For icon-less nodes: `box`, `rounded` (default), `pill`, `circle`, `diamond`, `hexagon`, `cylinder` (database), `queue`, `document`, `note`, `person`, `cloud`, `stack`; for flowcharts (ISO 5807) `parallelogram` (data in or out), `subroutine` (predefined process), `trapezoid` (manual operation), `delay`; for state machines `initial` and `final`. Flowchart shapes are drawn as ISO 5807 draws them (the parallelogram leans right, the subroutine has double side bars, the trapezoid its wide side on top, the delay is flat on the left and round on the right); `initial` is a filled dot and `final` a bullseye, unlabeled unless `label:` is set, and then the label sits below. The flowchart and state names work too: `terminator` and `terminal` (pill), `decision` (diamond), `process` (box), `data`, `io`, `input`, `output` (parallelogram), `predefined` (subroutine), `manual` (trapezoid), `database` (cylinder), `state` (rounded). Setting a shape on an icon node draws the shape with a small icon inside. |
| `bpmn` | A BPMN 2.0 element, for `kind: process`: events `start`, `start-message`, `start-timer`, `start-signal`, `start-conditional`, `intermediate`, `intermediate-message`, `intermediate-timer`, `intermediate-signal`, `end`, `end-message`, `end-error`, `end-signal`, `end-terminate`, `end-escalation`; gateways `exclusive`, `parallel`, `inclusive`, `event-based`, `complex`; activities `task`, `user-task`, `service-task`, `manual-task`, `script-task`, `send-task`, `receive-task`, `business-rule-task`, `subprocess`, `call-activity`; data `data-object`, `data-store`. Drawn as the BPMN 2.0 spec and bpmn.io draw them: events are 36px circles (start thin, intermediate a double ring, end thick) with their trigger inside, hollow when it catches and filled when it throws; gateways are 50px diamonds (exclusive X, parallel +, inclusive circle, event-based double circle with a pentagon, complex asterisk); tasks are rounded boxes with a type marker at the top left (person, gear, hand, script, filled or hollow envelope, table); a subprocess and a call activity carry [+], and a call activity has a thick border; a data object is a page with a folded corner and a data store a cylinder. Events, gateways and data carry their label below the symbol and default to no label; lines end on the symbol's outline. draw.io gets its own BPMN shapes. |
| `stage` | The journey column this step sits in, one of `stages`. Its row is the group it is `in:` (any group, usually `type: lane`); steps in one cell stack in spec order. |
| `score` | How the step feels in a journey, from `-2` (very negative) to `2` (very positive); the emotion row under the grid plots each stage's average over its scored steps as a smooth curve with a face per stage (classic: green above 0.5, amber around neutral, red below -0.5) between a dashed neutral line and the ends of the scale (DG112 outside that range). |
| `rank` (`layer`) | Where the node sits along the flow: `first`, `last`, or a layer number from 1 (the first column in `direction: right`, the first row in `down`), counted among the layers of the node's own group. A rank that cannot hold (two linked nodes both first, a layer the group does not have) is reported as DG219 and the node stays where the edges put it. DG114 for anything else. |
| `align` | Another node's id: this node shares that node's layer, so the two line up across the flow (side by side in `direction: down`, stacked in `right`), in spec order. Edges between aligned nodes are routed after layout. Use it to fold a branch beside the main path. Not together with `rank` (DG114). |
| `color` | Quoted hex accent: the outline and tint of a shape, the side bar of a card, or the color of a monochrome glyph icon. |
| `badge` | Short tag drawn on the top right corner, for example `x3` or `HA`. |
| `url` | Makes the node a link in SVG, HTML and draw.io. Only `http`, `https`, `mailto` and relative links are accepted (DG107); the scheme check ignores whitespace. Any control character, U+0000 to U+001F (tab, newline ...) or U+007F, fails with DG107: browsers drop them inside a URL, so `java<TAB>script:` would still run as `javascript:`. |
| `size` | Icon size: `sm` (32), `md` (48, default), `lg` (64), `xl` (80) or a number of px. |

## Groups

```yaml
groups:
  vpc:      { type: aws:vpc, label: Production VPC, in: region }
  public-a: { type: aws:public-subnet, label: Public subnet A, in: vpc }
  team:     { type: zone, label: Payments team, color: "#2563eb" }
  asg:      { type: aws:auto-scaling, around: [web-a, web-b] }
```

| Key | Meaning |
| --- | --- |
| `type` | A group style; run `orrery styles` for the list and see [styles.md](styles.md) for how each looks and where it comes from. AWS: `aws:cloud`, `aws:cloud-alt`, `aws:account`, `aws:region`, `aws:az`, `aws:vpc`, `aws:public-subnet`, `aws:private-subnet`, `aws:security-group`, `aws:auto-scaling`, `aws:corporate-dc`, `aws:server-contents`, `aws:ec2-contents`, `aws:spot-fleet`, `aws:iot-greengrass`, `aws:step-functions`, `aws:elastic-beanstalk`, `aws:generic`, `aws:generic-dashed`. Google Cloud: `gcp:cloud`, `gcp:project`, `gcp:region`, `gcp:zone`, `gcp:vpc`, `gcp:subnet`, `gcp:tier`, `gcp:gke-cluster`, `gcp:on-prem`, `gcp:external`, `gcp:optional`, `gcp:users`. Azure: `azure:tenant`, `azure:subscription`, `azure:resource-group`, `azure:region`, `azure:az`, `azure:vnet`, `azure:vnet-hub`, `azure:subnet`, `azure:service-group`, `azure:optional`, `azure:node-pool`, `azure:on-prem`. Kubernetes: `k8s:cluster`, `k8s:namespace`, `k8s:node`, `k8s:control-plane`. C4: `c4:boundary`. Neutral: `box`, `dashed`, `zone`, `boundary`, `on-prem`, `internet`. Processes and swimlanes: `pool` (a BPMN participant) and `lane` (who does the steps inside it; in a pool or on its own). |
| `label` | Header text. Defaults to the style's label ("VPC", "Region", ...). |
| `in` | Parent group id. Groups nest to any depth. |
| `contains` | List of child ids; the same as writing `in:` on each child. |
| `around` | List of node or group ids to outline after layout, without moving them: an overlay for things that cross the tree, such as an Auto Scaling group spanning two Availability Zones. Its label sits on the top border. When the members are the first row of their group, so the overlay's header would land on that group's header, layout moves them down just far enough for the header to clear. |
| `color` | Quoted hex override for the border and label. |
| `fill` | Quoted hex override for the background, or `none`. |
| `icon` | Override the header icon with any icon id, or `false` to hide it. |
| `dashed` | `true` or `false` to override the style's border. |
| `cols` (`columns`) | A whole number 1 to 12: the group's direct children (nodes and groups) form a grid of that many columns, row by row in spec order, each centered in a cell as wide as the widest child and as tall as the tallest. Edges route around the grid as usual; when an edge or its label would still cover a node or another label inside the grid, the group is laid out without it and DG219 says so. DG115 for anything else. |

### Pools and lanes

`pool` and `lane` groups draw a process or a cross-functional flowchart as BPMN 2.0 pools and lanes: bands across the flow. A node goes in a lane with `in: <lane>`, a lane in a pool with `in: <pool>`; lanes may also stand on their own or nest in another lane.

```yaml
kind: process
groups:
  customer: { type: pool, label: Customer }
  shop: { type: pool, label: Shop }
  sales: { type: lane, in: shop, label: Sales }
  warehouse: { type: lane, in: shop, label: Warehouse }
nodes:
  order: { bpmn: user-task, label: Place order, in: customer }
  take: { bpmn: start-message, label: Order in, in: sales }
  ship: { bpmn: service-task, label: Ship, in: warehouse }
  sent: { bpmn: end, label: Shipped, in: warehouse }
edges:
  - order -> take: { flow: message, label: Order }
  - take -> ship -> sent
```

- In a horizontal flow (`right`, `left`) each lane is a band across its whole pool, stacked in spec order, its name read bottom to top in a strip on the left, outside which sits the pool's strip. In a vertical flow (`down`, `up`) lanes are columns with the name in a strip on top.
- Layers along the flow keep the layered layout's order. Across it each band is as deep as its deepest layer; a node alone in its layer sits on the band's center line, so a chain inside one lane is one straight line.
- Every edge is routed again once the bands exist: orthogonal, turning in the gaps between layers, never through a node or a name strip. A loop back runs around the edge of its band; a message flow crosses in the gap between pools. Labels and step badges sit beside the new route.
- A pool with no nodes and no lanes is a black box: no strip, its name centered, and message flows end on its border. Nodes in no pool or lane go in an unframed band after the last pool. An ordinary group inside a lane (an expanded subprocess) moves into its band whole.
- `fill:` tints a band, `color:` sets its line and name, `dashed:` its border.

## Edges

Write edges as short strings. The arrow sets the line:

| Write | Draws |
| --- | --- |
| `a -> b` | solid, arrow at b |
| `a <- b` | solid, arrow at a (laid out as b to a) |
| `a <-> b` | solid, arrows at both ends |
| `a -- b` | solid, no arrow |
| `a --> b`, `a <-- b`, `a <--> b`, `a --- b` | dashed |
| `a ..> b`, `a <.. b`, `a <..> b`, `a ... b` | dotted |
| `a ==> b`, `a <== b`, `a <==> b`, `a === b` | thick |

- Label: `a -> b: HTTPS`. In a YAML list, `- a -> b: HTTPS` is fine as it is.
- Fan out and in: `a -> b, c, d` and `a, b -> c`.
- Chains: `a -> b -> c`. Label one hop inline: `a -[HTTPS]-> b -> c` (dashed: `a --[async]--> b`).
- Spaces around `--`, `---`, `...` and `===` are required; arrows with `<` or `>` work without spaces.
- Endpoints can be groups as well as nodes: `vpc -> s3` connects to the VPC's border. An `around:` group works too (`alb -> asg`): it is outlined only after layout, so the edge is drawn afterwards like `constraint: false`, ends on the overlay's border beside its header, and layout still orders the diagram as if the edge went to the overlay's members.
- Dashed, dotted and thick lines carry meaning only if the reader can look it up: explain each one you use in the top-level `legend:`.

Edges also accept a mapping for options that have no arrow syntax:

```yaml
edges:
  - api -> queue: { label: enqueue, step: 2, color: "#ed7100" }
  - { from: queue, to: [worker-a, worker-b], label: poll, line: dashed }
```

| Key | Meaning |
| --- | --- |
| `from`, `to` | Endpoint id, or a list of ids (every pair is connected). |
| `label` | Text on the edge. |
| `line` | `solid`, `dashed`, `dotted`, `thick`. |
| `arrow` | `end`, `start`, `both`, `none`. |
| `step` | A number drawn in a dark circle on the edge, for numbered walkthroughs (AWS reference architecture style). |
| `color` | Quoted hex color for the line and arrow. |
| `constraint` | `false` keeps the edge out of the layout: it is drawn afterwards between the placed nodes. Use it for links that should not reorder anything, such as replication between two side-by-side Availability Zones. |
| `flow` | In a process: `sequence` (the default), `message` (between pools: dashed, a hollow circle at the start, an open arrowhead), `default` (the branch a gateway takes when no condition holds: a slash at the start), `conditional` (a small diamond at the start), `association` (links data or an annotation: dotted, no arrowhead). |

## Diagnostics

`validate` and `render` report findings as `code`, `message`, `subject` and `fixes`. With `--json` the receipt lists them as data. Errors stop the render; warnings do not unless `--strict` is set.

| Code | Severity | Meaning |
| --- | --- | --- |
| DG100 | error | The file does not parse, or there are no nodes. |
| DG101 | error | Unknown icon id; fixes list the closest ids. |
| DG102 | error | Unknown group type. |
| DG103 | error | Duplicate or malformed id. |
| DG104 | error | `in:` or `contains` points at something that is not a group. |
| DG105 | error | Groups contain each other. |
| DG106 | error | An edge names an id that does not exist. |
| DG107 | error | A value is not one of the allowed options (with the nearest one): also a color that is not `#` plus 3 or 6 hex digits or is empty because an unquoted `#` started a YAML comment, a `legend:` entry with an unknown line style or an empty meaning, and a node `url` with an unsafe scheme or a control character. |
| DG108 | error | Unknown key (a typo such as `lable`, or a comma inside an unquoted `{...}` value). |
| DG109 | error | An edge cannot be read. |
| DG110 | warning | A label on a chain was dropped; label one hop inline instead. |
| DG111 | error | An `icons:` entry has a bad name, is not an `.svg` file or does not exist; or a node or group uses `local:<name>` without declaring it. |
| DG112 | error | A journey problem: `stages` is not a list of names, a journey has no stages, a node's `stage` is not one of them or a journey node has none, or a `score` is not a number from -2 to 2. |
| DG113 | error or warning | `story` is not a list of at least two node ids or names something that is not a node (error), or two consecutive ids share no edge (warning). |
| DG114 | error | `rank` is not `first`, `last` or a layer number from 1, `align` names no node or the node itself, or a node uses both. |
| DG115 | error | A group's `cols` is not a whole number from 1 to 12. |
| DG116 | error | `layout.aspect` is not a width:height ratio between 1:4 and 4:1. |
| DG201 | warning | An edge passes through a node it does not connect. |
| DG202 | warning | An edge label covers a node or another label. |
| DG203 | warning | Two nodes' labels collide. |
| DG204 | warning | A label wraps to more than three lines. |
| DG205 | warning | The diagram is over 2400 px wide, or a long thin strip: wider than 4.5 times its height, or taller than 4.5 times its width, with more than six nodes. |
| DG206 | warning | More than 40 nodes in one diagram. |
| DG207 | warning | An empty group. |
| DG208 | warning | A node nothing connects to. |
| DG209 | warning | An edge runs through a group's header label, or a pool's or lane's name strip, which hides the line and makes it look broken. |
| DG210 | warning | Something is drawn outside the canvas (a step badge, label, node, group, the title or the legend) and gets cut off. The evidence says how far and past which side. |
| DG211 | warning | A step badge or a node badge sits on a node, a node or edge label, or another badge. |
| DG212 | warning | An edge runs through another edge's label. |
| DG213 | warning | An `around:` group encloses a node or group that it does not list. |
| DG214 | warning | An `around:` group's header (its tile and label) still covers another group's header or a node after layout made room for it, for example when its members have no group of their own. |
| DG217 | warning | The diagram draws a dashed, dotted or thick line that `legend:` does not explain. |
| DG218 | warning | Layout needed a fallback strategy, so the node order in the picture may not follow the spec. |
| DG219 | warning | A placement setting had no effect (`rank`, `align`, `cols`, `layout.aspect`), with the reason: it conflicts with an edge or another hint, the kind places nodes itself, or no layout got close enough. |
| DG220 | warning | An edge label sits on a group's border line, so the frame looks cut where it passes. |
| DG221 | warning | An edge passes within 10 px of a node it does not connect, so it reads as touching that node. |
| DG301 | error | An icon library that comes from npm (`github`, `ibm`, `logos`, `si`, `tabler`, `ph`) could not be loaded: it is not in `node_modules` or the cache and the download failed. The fixes say how to prefetch it (`orrery icons fetch`, `ORRERY_CACHE`) or to use the bundled packs (`aws`, `azure`, `gcp`, `k8s`). |
| DG401 | error | `orrery doc`: a figure marker names a spec file that does not exist, or no file at all. |
| DG402 | error | `orrery doc`: an output would have a different number of figures than the document has markers, usually because a marker is not on a line of its own at the top level (inside a list or a quote). |
| DG403 | warning | `orrery doc`: an image the Markdown embeds is not a PNG, so the Word file shows its alt text instead. |
