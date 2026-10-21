---
name: orrery
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
  version: "0.10.0"
  author: Sagar Gupta
---

# orrery

Write a small YAML spec (nodes with official icons, nested groups, labelled edges); the bundled CLI lays it out with ELK and renders it. No install: the CLI, the layout engine, the PNG renderer, the fonts and the official AWS, Azure, Google Cloud and Kubernetes packs ship in this folder; the logo and glyph sets (18,209 icons in all) load from their npm libraries the first time a diagram uses them and are cached. Node.js 22 or newer is the only requirement.

```bash
node <this-skill-folder>/scripts/orrery.mjs <command>
```

Below, `orrery` means that command.

## Fast path

Follow this order. Write the spec early and let the validator steer; do not plan coordinates, layout is automatic.

1. **Pin the brief** in one line before drawing: what the diagram must show, for whom (README, design doc, slide), which cloud or vendor style, light/dark, which outputs. Default: SVG + PNG, the `stage` skin in the dark theme, `direction: right` (`down` for tiered stacks and long chains). A flow rather than an architecture gets a `kind:` (see [Kinds](references/spec.md#kinds)): `flowchart` (ISO 5807 symbols), `process` (BPMN 2.0 with `pool` and `lane` groups and `bpmn:` nodes), `state` (UML), `tree` (org charts), `mindmap`, `journey` (stages, lanes and scores).
2. **Find every icon id**, never guess one:

   ```bash
   orrery icons search api gateway
   orrery icons search postgres
   orrery icons search load balancer --pack azure
   ```

   Official vendor icons for vendor services (`aws:`, `azure:`, `gcp:`, `k8s:`, `github:`), `logos:` (color) or `si:` (one-color brand) for third-party products, `generic:` aliases or `tabler:` for neutral concepts (user, browser, server, queue, cache). Short aliases work: `aws:s3`, `aws:alb`, `azure:aks`, `gcp:bq`, `k8s:deploy`, `generic:database`. Business flows: the `generic:` business names (`generic:invoice`, `generic:approval`, `generic:shipping`, `generic:customer`, `generic:ticket`; 90 in all, listed in [references/icons.md](references/icons.md)), then `ph:` (Phosphor; other weights by suffix, `ph:handshake-duotone`) or `tabler:`. A step only this team has gets its own SVG: `icons: { order-desk: ./icons/order-desk.svg }`, then `icon: local:order-desk`. Draw it with `orrery icons new`, prove it with `orrery icons check` (rules IC01 to IC10) and look at the sheet it writes, or bring one in with `orrery icons adopt`.
3. **Start from the nearest example** when one fits (`orrery init --list`, then `orrery init aws-three-tier -o docs/architecture.yaml`), otherwise write the spec from scratch. The format is in [references/spec.md](references/spec.md); a minimal one:

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

4. **Validate and repair**: `orrery validate docs/architecture.yaml --strict`. Each finding has a code, a subject and `fix:` lines; apply the first fix that keeps the meaning, change only the reported subject, and re-run. Two rounds without improvement means stop and report what is left.
5. **Render**: `orrery render docs/architecture.yaml -o docs/architecture -f svg,png` (add `drawio`, `tsx`, `html` or `-f all` when asked; `--theme both` writes `-light` and `-dark` files). A non-zero exit means nothing usable was written; never describe it as success.
6. **Review at the width readers see it**, then improve. Measure first:

   ```bash
   orrery review docs/architecture.yaml --width 880 --json -o docs/architecture
   ```

   It scores six dimensions (conventions, layout, grid, flow, overlap, quality), lists findings with evidence and fixes, and writes `docs/architecture.review.json` plus `docs/architecture.review.png`, the diagram at that width (README 880, a docs column 720 to 1000, a slide 1280, a phone 360). Then run the review loop in [references/review/loop.md](references/review/loop.md):
   - With subagents, launch `orrery:conventions-reviewer`, `orrery:flow-reviewer` and `orrery:legibility-reviewer` in one message, plus `orrery:accuracy-reviewer` with the evidence paths when the diagram shows a real system. Without them, run the passes inline, one after another, each reading only its rubric. Skip the reviewers when the measured review passes with no findings.
   - Only you edit the spec. Reduce first (fewer arrows, one arrow to a group, cross-cutting services in a box), then write 2 to 4 candidate patch sets (with subagents, from `orrery:patch-proposer` agents, one strategy each) and try them in one call: `orrery patch <spec> candidates.json -o <spec>` reviews each on its own copy and keeps only the best one that raises the score with no hard count up.
   - Stop when it passes, after 3 rounds, or after 2 rounds without a kept patch. Never trust a reviewer's claim of an overlap or crossing that the measurement does not show.
   - For a process, flowchart, state machine or journey, `kind:` picks the notation rubric (BPMN 2.0, ISO 5807, UML, journey maps) and `rubrics` in the review JSON lists it next to any vendor rubric. The measured review already checks start and end events, labelled gateway and decision branches, parallel joins and pool boundaries, so reviewers judge names (tasks verb plus object, events as states, lanes as roles) and symbol choice.
7. **Report** the written paths, node/group/edge counts, the review score and pass, the patches kept, any findings that remain with their evidence, and the embed snippet if it goes into a README.

## What makes it look professional

- One obvious main flow. List nodes in the order data moves through them; ELK keeps that order where it can.
- Boundaries from the outside in, with the vendor's group types: `aws:cloud` > `aws:account` > `aws:region` > `aws:vpc` > `aws:az` > `aws:public-subnet` / `aws:private-subnet`; Google Cloud `gcp:cloud` > `gcp:project` > `gcp:region` > `gcp:zone`; Azure `azure:subscription` > `azure:resource-group` > `azure:vnet` > `azure:subnet`; Kubernetes `k8s:cluster` > `k8s:namespace`. Neutral diagrams use `zone`, `box`, `dashed` and `boundary`. Run `orrery styles` for all of them.
- Official names, short. Labels default to the icon's official name; override with the name readers know, keeping the service in it ("Amazon SQS", "SQS orders queue"), and put the role and specifics in `note` ("Orders queue", "t3.medium x3", "PostgreSQL 16").
- Mix the axes: the main path runs one way and its branches and back ends the other (across and down), so the figure stays compact instead of becoming one long strip.
- Order a group's children by where the arrows enter it: the child the incoming arrow reaches first comes first in the spec. A hub's targets sit next to it on one side; a fan-out labels each arrow at its target, a fan-in labels the shared hop once.
- Users, clients and outside systems stay outside every group; draw a group only for a real boundary: a cloud account, subscription or project, a region, a network or subnet, a zone, a cluster or namespace, a site, one service's own frame, a pool or lane. A path blocked on purpose is dashed `#C7243A` with the label `denied`, on any vendor.
- Label an edge only when it says something the endpoints do not: protocol, action, sync vs async, cross-boundary mechanism. Leave edges unnumbered: the stage story already plays the order, so `step:` badges are only for a walkthrough the user asks to be numbered.
- Dashed edges for async or optional paths, thick for the hot path, `<->` for request/response only when both directions matter.
- 6 to 25 nodes. Beyond that, draw an overview plus detail diagrams; repeated workers become one node with `badge: x3`.
- Keep it compact for where it is shown: `layout: { aspect: 4:3 }` for a README or a document, `16:9` for a slide. When the automatic layout puts something in the wrong place, steer it instead of fighting it: `rank: first` or `last` (or a layer number) on a node, `align: <node>` to line two nodes up across the flow, `cols: 2` on a group to grid its children. A hint that cannot be honored is reported as DG219 with the reason.
- `look: card` gives the boxed product-card style of Google Cloud diagrams; `shape:` nodes (cylinder, queue, person, document) give whiteboard and C4 views.
- Vendor colors are built in; do not recolor official icons. `color:` is for neutral shapes and cards.

## Outputs

| Format | Use for |
| --- | --- |
| `svg` | READMEs, docs sites, wikis. Self-contained, scalable, with `<title>`/`<desc>` for screen readers. Animated by default: one story plays along the edges in order (`animate: none` or `--static` for a still file). The default `stage` skin draws it as an animated scene in one tint (icons in a muted share of their own color, mono caps labels, one story along the edges), dark unless `theme: light`; use `skin: classic` (or `--skin classic`) for vendor architecture docs that must follow the vendor's own deck, colors and icons. |
| `png` | Slides, chat, tickets, anywhere SVG is not accepted. Always a still frame. Rendered with the bundled Inter font at 3x by default (`--scale`), so it stays sharp when zoomed or projected. |
| `drawio` | Hand-editing in diagrams.net or the VS Code Draw.io extension; every node, group and edge is an editable cell with the official icon embedded. |
| `drawio.svg` | One file for both: the SVG picture for a README, with the draw.io model inside, so draw.io and the VS Code extension open it as an editable diagram. |
| `tsx` | A React component (`export default function Name(props)`) for docs sites and apps. |
| `html` | A standalone viewer with light/dark switch, pan, pinch zoom and SVG/PNG download; opens offline. |

For a README that follows the reader's theme, render `--theme both` and embed:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture-dark.svg">
  <img alt="Orders API architecture on AWS" src="docs/architecture-light.svg">
</picture>
```

Details, the JSON receipt and per-format notes: [references/outputs.md](references/outputs.md). For a design document, write Markdown with one `<!-- orrery: diagrams/overview.yaml | Caption -->` line per figure and run `orrery doc design.md -f html,docx`: the figures are numbered, the caption is the alt text, and the build fails if a figure spec has errors.

## Diagrams from existing material

- **A repository**: plan before drawing, as [references/planning.md](references/planning.md) says. Read the deploy and infra files first (Terraform, CDK output, CloudFormation, SAM, Kubernetes manifests, Helm output, docker-compose), then the code; every node, group and edge gets its file and line, flows come from call sites, event mappings, subscriptions and network rules (never from `depends_on` or a dependency graph), and each is marked declared or inferred. Show the user the confirm list (Services, Boundaries, Flows, Left out on purpose) before writing the spec. In Claude Code, `/orrery:draw` runs the `orrery:planner` agent for this and adds `orrery:accuracy-reviewer` to the review; elsewhere run the planning pass yourself, then an accuracy pass with [references/review/accuracy.md](references/review/accuracy.md) after the spec renders.
- **Terraform**: one node per meaningful resource (`aws_lambda_function` -> `aws:lambda`, `aws_db_instance` -> `aws:rds`), groups from VPC/subnet/region/account structure; skip glue resources (policies, attachments) unless they are the point.
- **Kubernetes**: `k8s:` icons for kinds, `k8s:namespace` groups, Ingress -> Service -> Deployment -> Pods edges.
- **Infrastructure, a picture, Mermaid**: [references/importing.md](references/importing.md). `orrery import terraform|cloudformation|cdk|kubernetes|compose <file>` draws a deterministic first draft with `evidence:` on every item; `orrery import picture <svg|png>` gives back the spec an orrery picture carries; `/orrery:import-image` reads any other picture.
- **Mermaid flowchart**: `orrery import mermaid flow.mmd -o docs/architecture.yaml` converts nodes, subgraphs, edge styles and shapes, and sets an official icon where a label is exactly a product name (listed in a comment to check). Then swap the remaining shapes for icons, turn the `zone` groups into vendor groups and validate. Mermaid styling (`classDef`, `style`) is dropped on purpose.

Patterns with spec fragments (three-tier, serverless, event-driven, data lake, streaming, RAG, CI/CD, hybrid network, Kubernetes, system design primitives): [references/patterns.md](references/patterns.md).

## Commands

| Command | Does |
| --- | --- |
| `render <spec> [-o base] [-f svg,png,drawio,drawio.svg,tsx,html,mmd,sequence.svg\|all] [--theme light\|dark\|both] [--scale 3] [--skin classic\|stage] [--animate packets\|flow\|relay\|none] [--static] [--font extra.ttf] [--view <name>\|all] [--strict] [--json]` | Validate, lay out, render, write atomically; `--json` prints a receipt with sha256 and size per file. `--view` draws one of the spec's `views:`, `all` the whole diagram and every view. |
| `validate <spec> [--strict] [--json]` | Spec errors plus layout warnings (edge through a node, label collisions, too wide). |
| `review <spec> [--width 880] [--theme light\|dark] [--skin classic\|stage] [--json] [-o base]` | Scores the diagram at a display width on six dimensions, writes `<base>.review.json` and a PNG at that width, plus `<base>.review.look.png` scaled to fit 1568 px when that PNG is larger (view that one). `/orrery:review` in Claude Code runs the whole loop. |
| `patch <spec> <candidates.json\|-> [-o best.yaml] [--width 880] [--json]` | Applies each candidate patch set (an array of arrays of loop.md ops) to its own copy, reviews them all, prints the table and writes the best kept one; exit 1 when none improves. Comments and formatting are kept. |
| `watch <spec> [-o base] [-f svg,png] [--review]` | Renders on every save of the spec or its local icons; keeps watching through errors. |
| `doc <design.md> [-o out] [-f html,md,docx] [--theme light]` | Builds a design document with numbered figures from `<!-- orrery: spec.yaml \| Caption -->` lines. |
| `mcp [--port 8765]` | The commands as MCP tools over stdio (or HTTP on 127.0.0.1) for clients without skills. |
| `mcp install <client> [project\|user] [--force]`, `mcp install --list` | Writes the server entry into Claude Code, Claude Desktop, Cursor, VS Code, Gemini CLI, Codex or Kiro config, keeping the rest. |
| `diff <before> <after> [-o changes.svg] [--json]` | Nodes, groups and edges added, removed, renamed or changed (`git:<ref>:<path>` reads a side from git); the SVG is the new diagram with the changes colored. |
| `verify <spec> [--link] [--commit <sha>] [--json]` | Every `evidence:` must still point at a real file, line and identifier (exit 1 otherwise); `--link` sets each node's `url` to a commit-pinned permalink. |
| `describe <spec> [--json]` | The laid-out diagram in plain text, for alt text and text-only models. |
| `lsp` | Language server over stdio: diagnostics on their characters, fixes as code actions, completion. |
| `icons search <words> [--pack aws] [--type service]` | Ranked icon ids with official names. |
| `icons show <id> [-o icon.png]` | One icon's metadata, optionally rendered. |
| `icons list [--pack gcp] [--category Databases]`, `icons packs` | Browse the catalog and its sources. |
| `icons fetch [pack...]` | Download and cache the logo and glyph libraries now, for offline renders later. |
| `icons new <name> [--dir icons]`, `icons check <file.svg> [-o sheet]`, `icons adopt <file.svg> --name <name>` | Start a 24-grid icon, check one against rules IC01 to IC10 with a contact sheet in both skins and themes (exit 1 on a failure), or turn someone's SVG into a clean `local:` icon. |
| `styles` | Group types and node shapes. |
| `init [template] [-o file] [--list]` | Copy an example spec as a starting point. |
| `import <mermaid\|terraform\|cloudformation\|cdk\|compose\|kubernetes\|picture> <file> [-o file]` | A first draft from a Mermaid flowchart or infrastructure, with `evidence:` on every item, or the spec an orrery SVG or PNG carries. |
| `doctor` | Checks Node, the catalogs, the icon libraries, the layout engine and the PNG renderer. |
| `demo [dir]` | Renders every bundled example. |

Labels in scripts Inter lacks (CJK, Devanagari, Arabic) need a font for the PNG: `--font path/to/NotoSansDevanagari-Regular.ttf`. SVG output uses the viewer's fonts.

## References

- [references/spec.md](references/spec.md): every spec field, the edge syntax and all diagnostic codes.
- [references/icons.md](references/icons.md): the icon packs, id rules, aliases, the `generic:` vocabulary (system design and business), your own `local:` icons, the drawing rules IC01 to IC10 and their workflow, licenses.
- [references/styles.md](references/styles.md): group styles per vendor, with the colors and where they come from.
- [references/patterns.md](references/patterns.md): reference architectures as spec fragments.
- [references/outputs.md](references/outputs.md): formats, embedding, the receipt, `orrery doc`.
- [references/importing.md](references/importing.md): starting from what exists: a picture orrery drew (it carries its spec), Terraform, CloudFormation, CDK, Kubernetes and Compose importers, Mermaid, and any other picture.
- [references/planning.md](references/planning.md): planning a diagram from code and infrastructure: the plan, the evidence table, what counts as a flow, what to leave out, how many figures, the confirm list.
- [references/review/loop.md](references/review/loop.md): the review loop, the finding and patch format, scores and every measured finding id. Its rubrics, one per reviewer pass: conventions for [AWS](references/review/conventions-aws.md), [Azure](references/review/conventions-azure.md), [Google Cloud](references/review/conventions-gcp.md) and [C4](references/review/conventions-c4.md) (vendor rules with ids, quotes and sources), notation for [BPMN](references/review/conventions-bpmn.md), [flowcharts](references/review/conventions-flowchart.md), [state machines](references/review/conventions-state.md) and [journeys](references/review/conventions-journey.md), [flow](references/review/flow.md), [legibility](references/review/legibility.md), and [accuracy](references/review/accuracy.md) against the code and infrastructure.
- [references/diagram.schema.json](references/diagram.schema.json): JSON Schema for editors (`# yaml-language-server: $schema=...`).
- `examples/*.yaml`: complete specs for each pattern, used by `init` and `demo`.
