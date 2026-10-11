---
name: stackdraw
description: >-
  Draws professional architecture and system design diagrams with official icons (AWS, Azure,
  Google Cloud, Kubernetes, GitHub Octicons, 5,500 tech logos and 6,000 generic symbols) and
  renders them to SVG and PNG for docs and READMEs, plus an editable draw.io file, a React TSX
  component and a standalone HTML viewer. Use when the user asks for an architecture diagram, a
  cloud, infrastructure or network diagram, a system design diagram, a data, ML or CI/CD pipeline,
  a Kubernetes layout, a C4 container view, "diagram this repo", "draw the architecture for the
  README", or to turn a description, Terraform, Kubernetes manifests, docker-compose or a Mermaid
  flowchart into a clean diagram with real vendor icons.
license: MIT
metadata:
  version: "0.2.1"
  author: Sagar Gupta
---

# stackdraw

Write a small YAML spec (nodes with official icons, nested groups, labelled edges); the bundled CLI lays it out with ELK and renders it. No install: the CLI, the layout engine, the PNG renderer, the fonts and the official AWS, Azure, Google Cloud and Kubernetes packs ship in this folder; the logo and glyph sets (16,652 icons in all) load from their npm libraries the first time a diagram uses them and are cached. Node.js 22 or newer is the only requirement.

```bash
node <this-skill-folder>/scripts/stackdraw.mjs <command>
```

Below, `stackdraw` means that command.

## Fast path

Follow this order. Write the spec early and let the validator steer; do not plan coordinates, layout is automatic.

1. **Pin the brief** in one line before drawing: what the diagram must show, for whom (README, design doc, slide), which cloud or vendor style, light/dark, which outputs. Default: SVG + PNG, light theme, `direction: right` (`down` for tiered stacks and long chains).
2. **Find every icon id**, never guess one:

   ```bash
   stackdraw icons search api gateway
   stackdraw icons search postgres
   stackdraw icons search load balancer --pack azure
   ```

   Official vendor icons for vendor services (`aws:`, `azure:`, `gcp:`, `k8s:`, `github:`), `logos:` (color) or `si:` (one-color brand) for third-party products, `generic:` aliases or `tabler:` for neutral concepts (user, browser, server, queue, cache). Short aliases work: `aws:s3`, `aws:alb`, `azure:aks`, `gcp:bq`, `k8s:deploy`, `generic:database`.
3. **Start from the nearest example** when one fits (`stackdraw init --list`, then `stackdraw init aws-three-tier -o docs/architecture.yaml`), otherwise write the spec from scratch. The format is in [references/spec.md](references/spec.md); a minimal one:

   ```yaml
   title: Orders API
   direction: right
   groups:
     cloud:  { type: aws:cloud }
     region: { type: aws:region, label: eu-west-1, in: cloud }
   nodes:
     users: { icon: aws:users, label: Customers }
     api:   { icon: aws:api-gateway, in: region }
     fn:    { icon: aws:lambda, label: Create order, in: region }
     table: { icon: aws:dynamodb, label: Orders, in: region }
   edges:
     - users -> api: HTTPS
     - api -> fn -> table
   ```

4. **Validate and repair**: `stackdraw validate docs/architecture.yaml --strict`. Each finding has a code, a subject and `fix:` lines; apply the first fix that keeps the meaning, change only the reported subject, and re-run. Two rounds without improvement means stop and report what is left.
5. **Render**: `stackdraw render docs/architecture.yaml -o docs/architecture -f svg,png` (add `drawio`, `tsx`, `html` or `-f all` when asked; `--theme both` writes `-light` and `-dark` files). A non-zero exit means nothing usable was written; never describe it as success.
6. **Look at the PNG** (open the image file and view it). Check that the main path reads in one direction, nothing overlaps, labels are legible and groups nest the way the real system does. If something reads badly, change the spec (node order, `direction`, grouping, `layout.layering: simplex`, `layout.spacing: loose`) and render again.
7. **Report** the written paths, node/group/edge counts, any warnings that remain and why, and the embed snippet if it goes into a README.

## What makes it look professional

- One obvious main flow. List nodes in the order data moves through them; ELK keeps that order where it can.
- Boundaries from the outside in, with the vendor's group types: `aws:cloud` > `aws:account` > `aws:region` > `aws:vpc` > `aws:az` > `aws:public-subnet` / `aws:private-subnet`; Google Cloud `gcp:cloud` > `gcp:project` > `gcp:region` > `gcp:zone`; Azure `azure:subscription` > `azure:resource-group` > `azure:vnet` > `azure:subnet`; Kubernetes `k8s:cluster` > `k8s:namespace`. Neutral diagrams use `zone`, `box`, `dashed` and `boundary`. Run `stackdraw styles` for all of them.
- Official names, short. Labels default to the icon's official name; override with the name readers know ("Amazon SQS", "Orders queue") and put specifics in `note` ("t3.medium x3", "PostgreSQL 16").
- Label an edge only when it says something the endpoints do not: protocol, action, sync vs async, cross-boundary mechanism. Numbered `step:` edges for walkthroughs.
- Dashed edges for async or optional paths, thick for the hot path, `<->` for request/response only when both directions matter.
- 6 to 25 nodes. Beyond that, draw an overview plus detail diagrams; repeated workers become one node with `badge: x3`.
- `look: card` gives the boxed product-card style of Google Cloud diagrams; `shape:` nodes (cylinder, queue, person, document) give whiteboard and C4 views.
- Vendor colors are built in; do not recolor official icons. `color:` is for neutral shapes and cards.

## Outputs

| Format | Use for |
| --- | --- |
| `svg` | READMEs, docs sites, wikis. Self-contained, scalable, with `<title>`/`<desc>` for screen readers. Animated by default: packets travel the edges, numbered steps play in order (`animate: none` or `--static` for a still file). |
| `png` | Slides, chat, tickets, anywhere SVG is not accepted. Always a still frame. Rendered with the bundled Inter font at 3x by default (`--scale`), so it stays sharp when zoomed or projected. |
| `drawio` | Hand-editing in diagrams.net or the VS Code Draw.io extension; every node, group and edge is an editable cell with the official icon embedded. |
| `tsx` | A React component (`export default function Name(props)`) for docs sites and apps. |
| `html` | A standalone viewer with light/dark switch, pan, pinch zoom and SVG/PNG download; opens offline. |

For a README that follows the reader's theme, render `--theme both` and embed:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture-dark.svg">
  <img alt="Orders API architecture on AWS" src="docs/architecture-light.svg">
</picture>
```

Details, the JSON receipt and per-format notes: [references/outputs.md](references/outputs.md).

## Diagrams from existing material

- **A repository**: read the deploy and infra files (Terraform, CDK, CloudFormation, Kubernetes manifests, Helm values, docker-compose, serverless.yml, workflow files) and draw what they create. Every node must trace to a file; when something is inferred, say so in your report rather than inventing a component.
- **Terraform**: one node per meaningful resource (`aws_lambda_function` -> `aws:lambda`, `aws_db_instance` -> `aws:rds`), groups from VPC/subnet/region/account structure; skip glue resources (policies, attachments) unless they are the point.
- **Kubernetes**: `k8s:` icons for kinds, `k8s:namespace` groups, Ingress -> Service -> Deployment -> Pods edges.
- **Mermaid flowchart**: `stackdraw import mermaid flow.mmd -o docs/architecture.yaml` converts nodes, subgraphs, edge styles and shapes, and sets an official icon where a label is exactly a product name (listed in a comment to check). Then swap the remaining shapes for icons, turn the `zone` groups into vendor groups and validate. Mermaid styling (`classDef`, `style`) is dropped on purpose.

Patterns with spec fragments (three-tier, serverless, event-driven, data lake, streaming, RAG, CI/CD, hybrid network, Kubernetes, system design primitives): [references/patterns.md](references/patterns.md).

## Commands

| Command | Does |
| --- | --- |
| `render <spec> [-o base] [-f svg,png,drawio,tsx,html\|all] [--theme light\|dark\|both] [--scale 3] [--animate packets\|flow\|none] [--static] [--font extra.ttf] [--strict] [--json]` | Validate, lay out, render, write atomically; `--json` prints a receipt with sha256 and size per file. |
| `validate <spec> [--strict] [--json]` | Spec errors plus layout warnings (edge through a node, label collisions, too wide). |
| `icons search <words> [--pack aws] [--type service]` | Ranked icon ids with official names. |
| `icons show <id> [-o icon.png]` | One icon's metadata, optionally rendered. |
| `icons list [--pack gcp] [--category Databases]`, `icons packs` | Browse the catalog and its sources. |
| `icons fetch [pack...]` | Download and cache the logo and glyph libraries now, for offline renders later. |
| `styles` | Group types and node shapes. |
| `init [template] [-o file] [--list]` | Copy an example spec as a starting point. |
| `import mermaid <file.mmd\|-> [-o file]` | Convert a Mermaid flowchart into a spec. |
| `doctor` | Checks Node, the catalogs, the icon libraries, the layout engine and the PNG renderer. |
| `demo [dir]` | Renders every bundled example. |

Labels in scripts Inter lacks (CJK, Devanagari, Arabic) need a font for the PNG: `--font path/to/NotoSansDevanagari-Regular.ttf`. SVG output uses the viewer's fonts.

## References

- [references/spec.md](references/spec.md): every spec field, the edge syntax and all diagnostic codes.
- [references/icons.md](references/icons.md): the icon packs, id rules, aliases, the `generic:` vocabulary, licenses.
- [references/styles.md](references/styles.md): group styles per vendor, with the colors and where they come from.
- [references/patterns.md](references/patterns.md): reference architectures as spec fragments.
- [references/outputs.md](references/outputs.md): formats, embedding, the receipt.
- [references/diagram.schema.json](references/diagram.schema.json): JSON Schema for editors (`# yaml-language-server: $schema=...`).
- `examples/*.yaml`: complete specs for each pattern, used by `init` and `demo`.
