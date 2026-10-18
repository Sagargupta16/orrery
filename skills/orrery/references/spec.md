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
| `direction` | `right`, `down`, `left`, `up` | `right` | Main flow direction. `down` suits long chains and tiered architectures. |
| `theme` | `light`, `dark` | `light` | `render --theme` overrides it; `--theme both` writes both. |
| `look` | `icon`, `card` | `icon` | Default look for nodes that have an icon. |
| `arrowhead` | `open`, `filled` | `open` | Open chevrons as in the AWS and Google Cloud decks, or filled triangles as in Azure's diagrams. |
| `layout.spacing` | `compact`, `normal`, `loose` or a number 0.5 to 3 | `normal` | Scales every gap. |
| `layout.routing` | `orthogonal`, `polyline`, `spline` | `orthogonal` | Edge style. Orthogonal is the house style of AWS and Azure diagrams. |
| `layout.layering` | `source`, `simplex` | `source` | `source` lines parallel branches up; `simplex` keeps edges shortest. Try the other one when a layout looks off. |
| `layout.merge` | `true`, `false` | `true` | Edges that share an endpoint and have the same line, arrow and color join into one trunk with a single arrowhead; different styles keep their own ports. `false` gives every edge its own port. |
| `animate` | `packets`, `flow`, `relay`, `none` (`true` is `packets`, `false` is `none`) | `packets` for `classic`, `relay` for `stage` | Motion in SVG, TSX and HTML; PNG and draw.io are always still. `packets`: a dot travels every directed edge, and numbered edges run one after another in step order as a loop; line styles stay as drawn. `flow`: marching dashes along every edge. `relay`: on one clock each line draws itself in turn (step order when edges carry `step:`, else outward from the entry points) and the node it reaches lights up; everything holds, then the loop resets. `render --animate <mode>` or `--static` overrides it. |
| `skin` | `classic`, `stage` | `classic` | `classic`: the vendors' own diagram styles. `stage`: the same layout (every box and point identical) on a showcase canvas: a gradient with a dot texture and one tint, translucent panels in place of grey and white group fills, ringed step discs, `relay` motion by default. Vendor borders, tiles and icons keep their colors. Both themes. `render --skin` and `review --skin` override it. |
| `background` | quoted hex color or `transparent` | theme | `transparent` drops the background rectangle. |
| `legend` | mapping of `solid`, `dashed`, `dotted` or `thick` to a short meaning | none | A key drawn bottom right that says what each line style means, for example `legend: { dashed: Asynchronous events, dotted: Replication }`. Keys are case-insensitive and rows keep the order you write them. An unknown style (`dashd`) or an empty meaning fails with DG107, and the fix names the closest style. Add an entry for every non-solid style the diagram uses (DG217 warns otherwise). Quote a meaning that contains a comma. |

Colors (node `color`, group `color` and `fill`, edge `color` and the top-level `background`) are `#` plus 3 or 6 hex digits, and they need quotes: `color: "#2563eb"`. `fill` also accepts `none` and `background` also accepts `transparent`. A value without the `#` (`color: 2563eb`) fails with DG107 "... must be a hex color with a leading #", fixed by `use a quoted hex color such as "#2563eb"`. An unquoted `#` starts a YAML comment, so `color: #2563eb` reaches orrery as an empty value; that fails with DG107 "<where> color is empty; an unquoted # starts a YAML comment" instead of silently dropping the color.

Ids (node and group keys) use letters, digits, `_`, `-` and `.`, and must be unique across nodes and groups.

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
| `shape` | For icon-less nodes: `box`, `rounded` (default), `pill`, `circle`, `diamond`, `hexagon`, `cylinder` (database), `queue`, `document`, `note`, `person`, `cloud`, `stack`. Setting a shape on an icon node draws the shape with a small icon inside. |
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
| `type` | A group style; run `orrery styles` for the list and see [styles.md](styles.md) for how each looks and where it comes from. AWS: `aws:cloud`, `aws:cloud-alt`, `aws:account`, `aws:region`, `aws:az`, `aws:vpc`, `aws:public-subnet`, `aws:private-subnet`, `aws:security-group`, `aws:auto-scaling`, `aws:corporate-dc`, `aws:server-contents`, `aws:ec2-contents`, `aws:spot-fleet`, `aws:iot-greengrass`, `aws:step-functions`, `aws:elastic-beanstalk`, `aws:generic`, `aws:generic-dashed`. Google Cloud: `gcp:cloud`, `gcp:project`, `gcp:region`, `gcp:zone`, `gcp:vpc`, `gcp:subnet`, `gcp:tier`, `gcp:gke-cluster`, `gcp:on-prem`, `gcp:external`, `gcp:optional`, `gcp:users`. Azure: `azure:tenant`, `azure:subscription`, `azure:resource-group`, `azure:region`, `azure:az`, `azure:vnet`, `azure:vnet-hub`, `azure:subnet`, `azure:service-group`, `azure:optional`, `azure:node-pool`, `azure:on-prem`. Kubernetes: `k8s:cluster`, `k8s:namespace`, `k8s:node`, `k8s:control-plane`. C4: `c4:boundary`. Neutral: `box`, `dashed`, `zone`, `boundary`, `on-prem`, `internet`. |
| `label` | Header text. Defaults to the style's label ("VPC", "Region", ...). |
| `in` | Parent group id. Groups nest to any depth. |
| `contains` | List of child ids; the same as writing `in:` on each child. |
| `around` | List of node or group ids to outline after layout, without moving them: an overlay for things that cross the tree, such as an Auto Scaling group spanning two Availability Zones. Its label sits on the top border. When the members are the first row of their group, so the overlay's header would land on that group's header, layout moves them down just far enough for the header to clear. |
| `color` | Quoted hex override for the border and label. |
| `fill` | Quoted hex override for the background, or `none`. |
| `icon` | Override the header icon with any icon id, or `false` to hide it. |
| `dashed` | `true` or `false` to override the style's border. |

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
| DG201 | warning | An edge passes through a node it does not connect. |
| DG202 | warning | An edge label covers a node or another label. |
| DG203 | warning | Two nodes' labels collide. |
| DG204 | warning | A label wraps to more than three lines. |
| DG205 | warning | The diagram is over 2400 px wide, or a long thin strip: wider than 4.5 times its height, or taller than 4.5 times its width, with more than six nodes. |
| DG206 | warning | More than 40 nodes in one diagram. |
| DG207 | warning | An empty group. |
| DG208 | warning | A node nothing connects to. |
| DG209 | warning | An edge runs through a group's header label, which hides the line and makes it look broken. |
| DG210 | warning | Something is drawn outside the canvas (a step badge, label, node, group, the title or the legend) and gets cut off. The evidence says how far and past which side. |
| DG211 | warning | A step badge or a node badge sits on a node, a node or edge label, or another badge. |
| DG212 | warning | An edge runs through another edge's label. |
| DG213 | warning | An `around:` group encloses a node or group that it does not list. |
| DG214 | warning | An `around:` group's header (its tile and label) still covers another group's header or a node after layout made room for it, for example when its members have no group of their own. |
| DG217 | warning | The diagram draws a dashed, dotted or thick line that `legend:` does not explain. |
| DG218 | warning | Layout needed a fallback strategy, so the node order in the picture may not follow the spec. |
| DG301 | error | An icon library that comes from npm (`github`, `ibm`, `logos`, `si`, `tabler`) could not be loaded: it is not in `node_modules` or the cache and the download failed. The fixes say how to prefetch it (`orrery icons fetch`, `ORRERY_CACHE`) or to use the bundled packs (`aws`, `azure`, `gcp`, `k8s`). |
