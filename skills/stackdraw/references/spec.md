# Diagram spec reference

A diagram is one YAML (or JSON) file with three collections: `nodes`, `groups` and `edges`. Everything else is optional. `stackdraw validate` checks a spec and prints every problem with a code and a fix; `stackdraw render` refuses to write files while errors remain.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/Sagargupta16/stackdraw/main/skills/stackdraw/references/diagram.schema.json
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
| `animate` | `packets`, `flow`, `none` (`true` is `packets`, `false` is `none`) | `packets` | Motion in SVG, TSX and HTML; PNG and draw.io are always still. `packets`: a dot travels every directed edge, and numbered edges run one after another in step order as a loop; line styles stay as drawn. `flow`: marching dashes along every edge. `render --animate <mode>` or `--static` overrides it. |
| `background` | hex color or `transparent` | theme | `transparent` drops the background rectangle. |

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
| `icon` | Icon id such as `aws:lambda` or an alias such as `aws:s3`. Find ids with `stackdraw icons search <words>`. |
| `label` | Text under (or inside) the node. Defaults to the icon's official name, so `{ icon: aws:sqs }` reads "Amazon Simple Queue Service". |
| `note` | Second, smaller, muted line: instance type, version, count, purpose. Quote it if it contains a comma. |
| `in` | Id of the group the node sits in. |
| `look` | `icon` (icon with the label below), `card` (icon beside the label in a bordered box) or `shape`. |
| `shape` | For icon-less nodes: `box`, `rounded` (default), `pill`, `circle`, `diamond`, `hexagon`, `cylinder` (database), `queue`, `document`, `note`, `person`, `cloud`, `stack`. Setting a shape on an icon node draws the shape with a small icon inside. |
| `color` | Hex accent: the outline and tint of a shape, the side bar of a card, or the color of a monochrome glyph icon. |
| `badge` | Short tag drawn on the top right corner, for example `x3` or `HA`. |
| `url` | Makes the node a link in SVG, HTML and draw.io. |
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
| `type` | A group style; run `stackdraw styles` for the list and see [styles.md](styles.md) for how each looks and where it comes from. AWS: `aws:cloud`, `aws:cloud-alt`, `aws:account`, `aws:region`, `aws:az`, `aws:vpc`, `aws:public-subnet`, `aws:private-subnet`, `aws:security-group`, `aws:auto-scaling`, `aws:corporate-dc`, `aws:server-contents`, `aws:ec2-contents`, `aws:spot-fleet`, `aws:iot-greengrass`, `aws:step-functions`, `aws:elastic-beanstalk`, `aws:generic`, `aws:generic-dashed`. Google Cloud: `gcp:cloud`, `gcp:project`, `gcp:region`, `gcp:zone`, `gcp:vpc`, `gcp:subnet`, `gcp:tier`, `gcp:gke-cluster`, `gcp:on-prem`, `gcp:external`, `gcp:optional`, `gcp:users`. Azure: `azure:tenant`, `azure:subscription`, `azure:resource-group`, `azure:region`, `azure:az`, `azure:vnet`, `azure:vnet-hub`, `azure:subnet`, `azure:service-group`, `azure:optional`, `azure:node-pool`, `azure:on-prem`. Kubernetes: `k8s:cluster`, `k8s:namespace`, `k8s:node`, `k8s:control-plane`. C4: `c4:boundary`. Neutral: `box`, `dashed`, `zone`, `boundary`, `on-prem`, `internet`. |
| `label` | Header text. Defaults to the style's label ("VPC", "Region", ...). |
| `in` | Parent group id. Groups nest to any depth. |
| `contains` | List of child ids; the same as writing `in:` on each child. |
| `around` | List of node or group ids to outline after layout, without moving them: an overlay for things that cross the tree, such as an Auto Scaling group spanning two Availability Zones. Its label sits on the top border. |
| `color` | Hex override for the border and label. |
| `fill` | Hex override for the background, or `none`. |
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
- Endpoints can be groups as well as nodes: `vpc -> s3` connects to the VPC's border.

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
| `color` | Hex color for the line and arrow. |
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
| DG107 | error | A value is not one of the allowed options (with the nearest one). |
| DG108 | error | Unknown key (a typo such as `lable`, or a comma inside an unquoted `{...}` value). |
| DG109 | error | An edge cannot be read. |
| DG110 | warning | A label on a chain was dropped; label one hop inline instead. |
| DG201 | warning | An edge passes through a node it does not connect. |
| DG202 | warning | An edge label covers a node or another label. |
| DG203 | warning | Two nodes' labels collide. |
| DG204 | warning | A label wraps to more than three lines. |
| DG205 | warning | The diagram is very wide, or a long thin strip. |
| DG206 | warning | More than 40 nodes in one diagram. |
| DG207 | warning | An empty group. |
| DG208 | warning | A node nothing connects to. |
