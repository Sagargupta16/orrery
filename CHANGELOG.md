# Changelog

All notable changes to this project are documented here. Follows [Semantic Versioning](https://semver.org/).

## [0.11.1] - 2026-10-23

### Fixed

- **A long title or subtitle no longer widens the canvas.** Measured on one line up to 1,400 px, a subtitle wider than the drawing set the canvas width and left an empty band down the side; it now wraps to the drawing's width (never under 420 px) and the drawing moves down by the lines it adds. 20 of the 62 architecture examples change: the largest empty area drops from 17.3% of the canvas to 15.8% on average, aws-agentcore-mcp from 26.2% to 8.4% (793 px wide to 600 px, review 97.3 to 99), aws-central-logging from 17.1% to 7.1%; every example still passes review at 880 px and no score drops.

## [0.11.0] - 2026-10-22

### Added

- **Three new diagram kinds**, each with its own layout, both skins, draw.io and Mermaid export, a review rubric and examples:
  - `kind: er` draws data models: tables from `fields:` (`"id uuid pk"`, `"user_id uuid fk"`), relationships with crow's foot cardinality from `card: "1:0..n"`, lines that meet the field rows they join. `orrery import sql <schema.sql>` starts one from `CREATE TABLE` statements, with evidence on every table and relationship.
  - `kind: sequence` draws sequence diagrams written message by message: participants left to right, messages top to bottom, replies dashed, self messages, `fragments:` for loop, alt, opt, par, break and critical blocks, and the messages played in order as the animation. Views keep every message in order and renumber the fragments.
  - `kind: timeline` draws roadmaps: a time axis at the `timeline: { scale }` you pick, lanes from groups, bars from `start:`/`end:` and points or milestones from `date:`, a status style per item, dependencies as arrows and an optional today marker.
  - DG123 to DG126 check the new keys; the review measures each kind's conventions (keys and cardinality, labelled messages and dashed replies, dated items and dependency order).

### Fixed

- The release workflow retries the MCP Registry publish while npm catches up with a version it published a moment ago; the first 0.10.0 run failed there and needed a re-run.

## [0.10.0] - 2026-10-21

### Added

- **One spec, many figures.**
  - `views:` names subsets of one spec (by id, `group:<id>`, `tag:<name>`, with `depth:` to fold nested groups); `render --view <name>` draws one, `--view all` the whole diagram and every view as `<base>.<view>.<format>`.
  - `classes:` share presets that any node, group or edge applies with `class:`.
  - `include:` merges other spec files in (this spec wins a clash).
  - `tags:` with styles color and restyle what they mark, and a tag with a `label` gets a legend row.
  - DG117 to DG122.
- **Evidence you can check.**
  - `evidence:` on any node, group or edge names where it comes from: `path:line`, `path:line#identifier` or a resource address (`aws_lambda_function.api`, `Deployment/orders`).
  - `orrery verify` fails when one no longer exists.
  - `--link` (with `--commit <sha>`) sets each node's `url` to a commit-pinned permalink.
- **Importers for infrastructure.** `orrery import terraform | cloudformation | cdk | compose | kubernetes <file>` draws a deterministic first draft with official icons, boundaries from the VPC, subnet, namespace or network structure, flows from event mappings, subscriptions, rules and links, and `evidence:` on every item.
- **The spec inside the picture.**
  - Every SVG carries its spec in `<metadata>`, and every PNG in an `iTXt` chunk; `orrery import picture` gives it back byte for byte.
  - `embed: false` opts out.
  - `/orrery:import-image` and the `image-importer` agent read any other architecture picture into a spec.
- **`orrery diff <before> <after>`.**
  - Reports added, removed, renamed and changed nodes, groups and edges, with `git:<ref>:<path>` for either side.
  - Output is text, JSON, or the new diagram with the changes colored (green added, amber changed, gray dashed removed).
- **A GitHub Action** (`uses: Sagargupta16/orrery@v0.10.0`) validates, renders and reviews every spec, diffs the ones a pull request changed, and keeps one comment with the scores, plus an annotation per failing spec. `fail-on: error`, `warning` or `review` sets when it fails.
- **Two new outputs.**
  - `-f mmd` writes Mermaid text: `architecture-beta` for architectures (with logo icons where Mermaid has them), `stateDiagram-v2`, `mindmap` and `journey` for those kinds, and a `flowchart` for the rest.
  - `-f sequence.svg` draws the main path as a sequence diagram with one lifeline per node.
- **Nodes on a group's border.** `on: <group>` puts a node on that group's border, the way the AWS deck draws an internet gateway on its VPC: the icon centered on the line, the label outside, several on one side spread evenly, edges leaving by the icon's face. DG120, DG219.
- **`orrery lsp`**, a language server with no dependencies, and a VS Code client in `editors/vscode/`:
  - diagnostics on the characters they are about;
  - their fixes as quick fixes;
  - completion for icon ids, group types, ids and keys;
  - hover and an outline.
- **`orrery describe`** prints the laid-out diagram as plain text, for alt text and text-only models; also an MCP tool.
- **MCP:**
  - `orrery mcp install <client> [project|user]` writes the server entry for Claude Code, Claude Desktop, Cursor, VS Code, Gemini CLI, Codex or Kiro and keeps the rest of the file.
  - Render and review results open in an inline viewer in hosts that support MCP Apps.
  - Releases publish the server to the MCP Registry as `io.github.Sagargupta16/orrery` and attach an `.mcpb` bundle.
- **A playground** at sagargupta.online/orrery/play/ runs the CLI's own parser, layout, renderers and review in the browser. You can edit a spec and watch it redraw, download every format, or share a link that carries the spec.
- **Planner guardrails:** run the importers first, a list of traps (dependency graphs drawn as traffic, glue resources, invented hops), and evidence in the form `orrery verify` checks. Accuracy rules ACC-10 to ACC-12.
- **Plugin eval suites** in `evals/`: whether the skill fires, plan recall against fixture repos, draws that validate, and a review loop that raises the score, with a selftest for the graders.
- **14 more examples, 71 in all**, so every cloud has a full set:
  - Azure: Container Apps microservices, enterprise integration with Service Bus and Event Grid, Databricks analytics, and IoT analytics with Azure Data Explorer.
  - Google Cloud: event-driven processing with Eventarc, generative AI RAG on AlloyDB, a hub-and-spoke network on Network Connectivity Center, and multi-region disaster recovery.
  - Kubernetes: an Istio service mesh, StatefulSet storage with Velero backups, and a multi-tenant cluster.
  - IBM Cloud: a VPC landing zone, a Code Engine serverless pipeline, and agentic RAG on watsonx.
  - Azure, Google Cloud and Kubernetes now have 8 examples each, and IBM Cloud has 4.
  - The website gallery gains a General filter for the vendor-neutral examples.
- **Geometry checks for the arrows themselves:** DG222 (an arrowhead on a zero-length or too-short end run), DG223 (an edge that cuts through a group holding neither of its ends), DG224 (a straight run along a group border, which reads as part of the frame) and DG225 (an edge label in a group's title band, or a line crowding the title). DG208 now also warns once when a diagram has nodes but no edges at all.
- **Review findings** for a figure spread thin (`layout.sparse`, `layout.wide-pitch`), a gap between a group's rows, columns or sibling groups wider than its labels need (`grid.wide-gap`, `grid.group-gap`), two unrelated arrows running side by side (`flow.side-by-side`) and a subtitle that only repeats the title (`conventions.subtitle-echo`). The new check codes count in the score.
- **Vendor-neutral composition rules** for every diagram: groups only for real boundaries (FLOW-11), actors outside every group (FLOW-12), denied paths dashed red and labelled (FLOW-13), hubs keep their targets together (FLOW-14), side branches leave their own main-path node, egress at the far end, peers side by side (LEG-10), names copied exactly from the evidence (ACC-06) and one vocabulary across figures (ACC-09).
- The boundary-label, service-group and service-label checks (AWS-17 to AWS-19) now cover Azure, Google Cloud and Kubernetes too.
- **AWS service groups take their category color** in the classic skin: a group framed by a service's icon gets the color of that icon's category (compute orange, databases magenta, networking purple ...), read from the official category icons. An explicit `color:` still wins.

### Changed

- **Arrows meet icons cleanly.**
  - Every edge end lands on the face of what it meets, with no gap: on an icon's tile, never out where its label is. Several ends on one face sit around the center 14px apart, and a line into a side face meets the icon at its center line.
  - Routes take the fewest bends a clear path allows: straight where two faces overlap, otherwise one bend into a side face, else two. A simpler route is kept only when it hits nothing, crosses no new border or edge and leaves its label a clear spot.
  - Icons an edge joins in one row line up on one center line.
  - The review measures all of it: `flow.arrow-short` (an end outside the tile is major), `grid.off-center` (ends on a face off center or unevenly spread), `grid.avoidable-bend` (more bends than the router's own clear route), `grid.ragged` (joined icons off one line). These are rubric rules LEG-11 and LEG-12.
  - All 71 examples pass under the new rules, which caught 27 of them in the old layout.
- **Stage icons in their own color, muted.**
  - Each vendor icon is drawn in a muted share of its own official color instead of gray: the AWS category, the Azure, Google Cloud or Kubernetes blue, a logo's brand, IBM Blue 60 for IBM icons.
  - The color is mixed into the glyph gray and held between 4.5:1 against the tile and the gray's own contrast, so a neon green sits as quietly as an AWS purple.
  - Tiles take a faint frame in the same color, and glyph sets with no color of their own stay gray.
  - The classic skin is unchanged.
- **No step numbers in the examples.** The examples and the hero no longer carry `step:` badges, since the stage story already plays the order; the authoring rules now say to leave edges unnumbered unless a numbered walkthrough is asked for.
- Overlap fixes now lead with spacing or rerouting and suggest shortening a label last.
- Routes keep clear of group borders and titles, so three examples draw cleaner lines.

### Fixed

- `orrery verify` and the Action escaped regex and Markdown table characters incompletely, and on Windows runners `verify` compared an 8.3 short path (`RUNNER~1`) with the long one; both now escape every special character and compare real paths.
- `orrery icons check` printed a raw stack trace for an SVG over 512 KB; it now says the file is too large for an icon and writes no contact sheet.
- A local icon that references its own gradient or clip path as `url('#g')` or `url( #g )` was rejected as pointing outside the file.

## [0.9.0] - 2026-10-20

### Added

- **Layout you can steer.** `rank: first`, `last` or a layer number places a node along the flow; `align: <node>` lines two nodes up across it; `cols:` on a group lays its children out as a grid, row by row in spec order; `layout: { aspect: 4:3 }` aims the canvas at a shape that reads in a README or on a slide. A hint the layout cannot honor is reported, with the reason, as DG219, and a hint that would make an edge or a label cover a node is dropped rather than drawn over; bad values fail with DG114 to DG116. A hosted-agent diagram went from a 3:1 strip whose labels render at 6.6 px in a README column (review 89.3, failing) to 1.47:1 and 97.3 passing with `aspect: 4:3` and three `align` hints.
- **Lines that are not part of the layout go around nodes.** Edges with `constraint: false` and edges to overlay groups now try more routes and keep the first that clears every node they do not connect and every group header. No example's route changed; a spec whose free edge crossed nodes went from 7 warnings to none.
- **Agents that draw from your code** (Claude Code):
  - `/orrery:draw <what to draw>`: the new `planner` agent reads the infrastructure and code and returns every service, boundary and flow with the file and line it came from, marked declared or inferred, plus what it leaves out and why; you confirm that list before any spec is written.
  - `accuracy-reviewer`, a fourth reviewer, checks the drawing against the sources with rules ACC-01 to ACC-08 (invented nodes, dependencies drawn as traffic, arrows the wrong way, wrong boundaries, missing hops). It gets the evidence and the plan's left-out list, never the planner's reasoning.
  - `/orrery:doc <topic>`: one figure per aspect, drawn in parallel by `diagram-author` agents, each reviewed, then built with `orrery doc`.
  - `patch-proposer` agents write candidate fixes under one strategy each (reduce, restructure, words, conventions); `orrery patch` picks the winner by measurement.
  - A plugin hook validates a spec right after an agent writes or edits it and feeds errors back with their fixes.
  - The planning and accuracy rules are in `references/planning.md` and `references/review/accuracy.md`, so clients without subagents run the same passes in order.
- **`orrery patch <spec> <candidates.json>`** applies the review loop's patch ops to the YAML text in place, keeping comments, key order and quoting byte for byte, reviews every candidate set on its own copy at once, prints the table and writes the best one that improves the score with no hard count up.
- **`orrery mcp`**: the commands as Model Context Protocol tools (authoring guide, validate, render, review, icon search, templates, patch candidates, draw.io link) over stdio, or stateless HTTP on 127.0.0.1 with `--port`. Each spec input is a path or the text; over HTTP no path is read and nothing is written. It speaks MCP `2026-07-28` and the handshake revisions up to `2025-11-25`. Setup for Claude Code, Codex, Gemini CLI, Cursor and Kiro is in the README.
- **`orrery doc <design.md>`** builds a design document: each `<!-- orrery: spec.yaml | Caption -->` line becomes a numbered figure, as inline SVG in one HTML page, image files next to a Markdown copy, or a picture in a Word file with real headings, tables and captions. DG401 to DG403.
- **`drawio.svg` output**: one file that shows as the SVG anywhere and opens in draw.io and the VS Code extension as the editable diagram.
- **`orrery watch <spec>`** renders again on every save of the spec or its local icons, and prints the review score each time with `--review`.
- **Review checks** for zig-zags, avoidable bends, lines that skim a node (DG221), labels on a group border (DG220), a node beside a group that reads as its peer, sibling groups of almost the same size, empty and lopsided groups, more arrows than nodes, and cross-cutting services fanned in from everywhere (with a patch that boxes them as shared services). AWS rules AWS-17 to AWS-19: boundary labels name their function, a service group holds one service, a service label names the service. Identical findings print once with a count.
- **A preview PNG for reviewers**: when the display-width PNG is larger than 1568 px on a side, `orrery review` also writes `<base>.review.look.png` scaled to fit.
- **17 AWS reference architectures**, 57 examples in all: agents on Bedrock AgentCore behind an MCP gateway, multi-Region active-active, backup and restore, central logging, threat detection, network inspection, an AWS Organizations OU tree, migration with AWS Transform, EKS e-commerce, CodePipeline CI/CD, IoT analytics, media streaming, an Amazon Connect contact center, WorkSpaces, HPC batch, a SageMaker AI LLM gateway and a multi-tenant SaaS ML platform. The website gallery gains Security and resilience and Networking filters.

### Changed

- The reviewer agents treat everything they read as data, never as instructions, and the hand-off now lists alt text, stand-in icons and why each remaining warning stays.
- Review scores of existing examples move by up to 3 points from the new checks; all still pass.
- **The source is organized by subsystem**: `src/cli/`, `spec/`, `layout/` (with `lanes/`, `kinds/`, `journey/`), `check/`, `review/`, `render/stage/`, `icons/` (with `local/`), `patch/`, `mcp/` and `doc/`, each with its entry in `index.ts`. The longest functions (`layoutCore` 1542 lines, `parseSpec` 845, `journeyLayout` 725, `checkScene` 609) are now short drivers over named steps; no function is over about 150 lines. Every example renders byte for byte as before.

### Fixed

- `/orrery:review <spec> [width]` read its arguments one place off: Claude Code counts placeholders from `$0`, so `$1` was the width. The commands now use named arguments.
- The plugin, marketplace and Gemini manifests said 32 reference architectures and left out IBM icons and business flows; `scripts/check-repo.mjs` now fails when a manifest or doc quotes a count the examples folder does not have.
- `orrery patch` crashed on a `set` or `add` op with no value instead of saying it needs one.
- On Windows, writing an output that another process had open (a preview, an editor, a reader racing `orrery watch`) failed with EPERM; the rename now retries for up to two seconds.

## [0.8.0] - 2026-10-18

### Added

- **Business flows: `kind:`** says what a diagram is, with the same nodes, groups and edges: `architecture` (the default), `flowchart`, `process`, `state`, `tree`, `mindmap` or `journey`. Each sets its own default direction and arrowhead. Eight new examples, one per kind plus a swimlane flowchart and one with local icons, all passing `validate --strict` and `orrery review` at 880px: 40 in the gallery, in a new Business flows category on the website.
- **BPMN 2.0** (`kind: process`). Nodes take `bpmn:`, one of 32 elements, drawn as the spec and bpmn.io draw them:
  - **Events:** start, intermediate and end, with message, timer, signal, conditional, error, terminate and escalation triggers, hollow when they catch and filled when they throw.
  - **Gateways:** exclusive, parallel, inclusive, event-based, complex.
  - **Activities:** tasks with the user, service, manual, script, send, receive and business-rule markers, subprocesses and call activities.
  - **Data:** data objects and data stores.
  - **Flows:** edges take `flow: message`, `default`, `conditional` or `association`, with their markers.
  - Labels of events and gateways sit below the symbol, and lines end on the outline. draw.io gets its own BPMN shapes.
- **Pools and swimlanes:** `pool` and `lane` groups lay out as bands across the flow, horizontal or vertical, nested lanes and black-box pools included. ELK lays out the flow, the bands are placed after it, and every edge is rerouted orthogonally on a grid of channels so no line runs through a node or a name strip. Message flows cross between pools. Classic draws the bpmn-js look; stage draws its hairline kit. draw.io gets real swimlanes.
- **Flowchart and state shapes:** `parallelogram`, `subroutine`, `trapezoid` and `delay` (ISO 5807), plus `initial` and `final` (UML). Flowchart names work as shape synonyms: `terminator`, `decision`, `process`, `data`, `predefined`, `manual`, `database`, `state`.
- **Trees and mind maps:**
  - `kind: tree` is a tidy-tree layout with org-chart connectors and no arrowheads.
  - `kind: mindmap` is a two-sided map: curved branches thick out of the root and one accessible color per first-level branch.
  - Both are placed by orrery itself, because ELK's mrtree crashes on the ports layout makes.
- **State machines:** `kind: state` draws self-transitions as loops on a corner of their state, with their labels clear of everything.
- **Customer journey maps:** `kind: journey` has its own grid layout. `stages:` are the columns and lanes are the rows, with a card per step and edges routed in the gutters. An emotion row plots the stages' average `score:` (-2 to 2) as a smooth curve with a face per stage, in classic and stage.
- **Stage story for processes and trees:**
  - A `story:` path is walked hop by hop.
  - A `process` plays a BPMN token: it splits at parallel gateways, waits at the join, takes the yes branch, sends message flows as their own hops and waits for them.
  - A tree or mind map grows out of its root a level at a time.
- **Notation in the review:** `orrery review` picks notation rubrics by `kind:` (BPMN 2.0, ISO 5807 and ANSI X3.5, UML 2.5.1, journey mapping), each rule quoting its source. It adds nine measured checks: start and end events, gateway and decision labels, parallel joins, pool boundaries, initial and final states, and journey completeness.
- **Icons for business flows:**
  - 90 business `generic:` names, such as `generic:invoice`, `generic:approval`, `generic:shipping` and `generic:ticket` (482 aliases in all).
  - Phosphor as pack `ph`, with the regular weight indexed (1,527) and the other five weights by suffix: 18,209 icons in all.
  - Your own SVG icons: `icons: { name: ./file.svg }`, then `icon: local:<name>`. Files are sanitized (no scripts, handlers, external links or embedded images), single-color art becomes a monochrome template, and a bad file is DG111.
  - `orrery icons new`, `icons check` and `icons adopt` draw, check and import icons against drawing rules IC01 to IC10 (references/icons.md), and `icons check` writes a contact sheet in both skins and themes.

### Changed

- **Stage and dark are the defaults.** A spec without `skin:` now renders in the stage skin, and one without `theme:` in the dark theme; `skin: classic` and `theme: light` (or `--skin classic`, `--theme light`) bring back the vendors' own style and the light theme. The README, the examples gallery and the website lead with stage in dark, and the website's switch offers Stage before Classic and Dark before Light. Specs that set `skin:` or `theme:` render as before. The HTML viewer opens in the spec's theme instead of always light.
- The review no longer misfires on pools and lanes (`overlap.outside-group`, `grid.off-center`), tree and mind map connectors, BPMN message flows and associations, journey rows, or plain lines the legend explains (`flow.undirected`). Reviews of the 32 existing examples are unchanged, except four that lose `flow.undirected` findings their legends already answered.
- DG207, DG208, DG209 and DG217 understand pools, lanes, journeys and BPMN notation. Every existing example still renders byte-identical in both skins.
- `init` copies a template's icon files with it, and `demo` passes full spec paths.

## [0.7.1] - 2026-10-18

### Added

- **GitHub Discussions** is on, with Q&A, Ideas and Show and tell. The README has a Community section pointing at them, and the new-issue page links to Discussions for questions and ideas.

## [0.7.0] - 2026-10-18

### Changed

- **`skin: stage` is redrawn after the owner's portfolio scenes**, by its own renderer (`src/render/stage.ts`) over the same layout, so every box and point is still where `classic` puts it. A near-black canvas (paper in light) with a 20 px hairline grid and one tint wash behind the story; structure in one color at a few alphas (panels, frames, tiles, wires, chevrons); no vendor hues. Icons are monochrome glyphs on ink tiles: SVG filters keep the white artwork of AWS and Kubernetes tiles, the dark artwork of the white AWS Cloud tiles, and the silhouette of colored logos and Google Cloud and Azure icons (with their white detail on top), and single-color sets are painted directly, Tabler's line icons at the weight of the AWS glyphs. Labels are Geist Mono caps, fitted to the space layout measured, one size per scene where they fit. Group corner tiles turn solid tint when lit. Hairlines are one pixel at 880 px and wider for wider diagrams, so they survive being shrunk into a README.
- **The stage motion is one story** (for `relay`, its default, and `packets`): the groups light, then the tiles, then a packet with a comet tail runs the numbered edges in step order (else the longest chain of directed edges), easing through each hop and pausing at each node, while the wire behind it lights up; every step badge pops as its packet leaves and every story label lights; at most two other edges run a small packet; everything holds until 90% of the loop and is gone by 94%. A node's or edge's `color:` becomes its lit tint. PNG, draw.io and `animate: none` get the held frame: everything lit, nothing moving.
- Stage text holds 4.5:1 on the busiest surface it can land on (stacked panels under the lit tint and the wash), and on colored shapes in their own lit color: all 32 examples and both README diagrams pass `orrery review --skin stage` with no contrast failure.
- `classic` output is unchanged, and `animate: relay` in classic draws as before.

### Added

- Geist Mono 1.8.1 Regular and Bold (SIL OFL 1.1) are bundled for stage PNGs; `scripts/build-fonts.mjs` vendors them by checksum and checks that every ASCII glyph advances 0.6 em, which the stage renderer sizes text from.
- `iconTone()` in `src/icons.ts` sorts every icon into the tone the stage filters need, and `renderIcon` takes a `mono` paint for single-color icons.

### Removed

- The 0.6 stage look: the dot texture, translucent washes of grey group fills, ringed step discs and the packet trail.

### Fixed

- CodeQL stops reporting the edge operator `-->` as an HTML comment filter (`js/bad-tag-filter`), which came back as a new alert whenever the bundled CLI's line numbers shifted. Edge expressions are now read by a small scanner instead of one regex; on the examples' edges and 20,000 generated expressions it returns exactly what the regex did.

## [0.6.1] - 2026-10-18

### Fixed

- **The release workflow can publish to npm.** `publish.yml` ran `npm publish out/npm`, which npm reads as the GitHub repository `out/npm` and tries to clone over SSH ("Repository not found"), so the npm step failed on every release since 0.4.0. It now passes the folder as `./out/npm`. The usage line in `scripts/pack-npm.mjs` had the same mistake.

## [0.6.0] - 2026-10-18

### Added

- **`skin: stage`**, a showcase look over the same layout, after the animated scenes on the owner's portfolio site. Every box and point stays where `classic` puts it: the skin only recolors, after layout. The canvas is a gradient with a 16 px dot texture and one blue tint wash; grey and white group fills become translucent panels, so the texture shows through; step discs and badges are ink with a tint ring; lines are bright enough for 3:1 and text for 4.5:1 (all 32 examples and both README diagrams pass `orrery review --skin stage` with no contrast failure, at the same scores as classic). Vendor borders, tiles, icons and Google's blue frame keep their colors. Dark and light. `render --skin stage` and `review --skin stage` override the spec.
- **`animate: relay`**, the stage skin's default and available to classic: on one clock each line draws itself in turn behind a dot (a mask reveals it, so a dashed line stays dashed), its arrowhead lights when it arrives, and the node it reaches lights up on a flat tint plate; everything holds until 92% of the loop and resets by 95%. Beats follow the `step:` numbers when there are any, else the distance from the entry points, at most eight, so a loop lasts about three to six seconds. PNG and draw.io stay still, and the full diagram is always drawn underneath. In stage, `animate: packets` gets a fading trail instead of the halo.
- The README hero is drawn in the stage skin; the website gallery and every example page switch between Classic and Stage next to Light and Dark, starting on Classic.

### Changed

- `animate` no longer defaults in the spec: unset means the skin's default (`packets` for classic, `relay` for stage), so `--skin stage` on a classic spec animates with relay unless the spec names a mode.
- `diagram.schema.json` knows `skin` and `relay`.

## [0.5.2] - 2026-10-18

### Changed

- **Shorter README.** The ten-picture gallery is gone from the README: it keeps the hero diagram, moves "How it works" up next to what you get, and shows one example (`aws-three-tier`) with links to all 32 on the website gallery and in `examples/README.md`. 224 lines to 188.
- The website (https://sagargupta.online/orrery/) is the homepage of the npm package, both plugin manifests and the GitHub repository.

## [0.5.1] - 2026-10-18

### Fixed

- **An overlay's header no longer lands on another group's header.** When the members of an `around:` group are the first row of their group, as in an Auto Scaling group across two Availability Zones whose web tier comes first, the overlay's tile and label were drawn over that group's header ("Availability Zone" was unreadable), and `validate` and `review` reported nothing because overlays are left out of the group checks. Layout now gives the members' groups just enough extra top padding in its second pass that the header clears, and the trim after ELK keeps it. Diagrams whose overlays already had room render byte for byte as before, which is all 32 shipped examples.
- **DG214** warns when an overlay's header still covers a group header or a node, for example when its members have no group of their own, and `orrery review` scores it as a major overlap.

## [0.5.0] - 2026-10-18

### Added

- **Website at [sagargupta.online/orrery](https://sagargupta.online/orrery/).** An Astro 7 and Tailwind CSS 4 site in `site/` with the animated hero, install commands for every channel, a spec next to the picture it renders with links to all five outputs, how it works, the icon pack table, and a gallery of every example with filters by kind and a light and dark switch. Each example has its own page with its YAML, an `orrery init` command and every output to download. `site/scripts/prepare.mjs` renders all of it with the built CLI on every build, so the site always shows what the renderer draws; `.github/workflows/pages.yml` builds it on every pull request and deploys `main` to GitHub Pages.
- **Five new examples**, each reviewed at the 880 px README width:
  - `ai-agent-mcp` (99.1): an AI coding agent on the Model Context Protocol, one MCP client per server, stdio to a local server and Streamable HTTP with OAuth to remote ones, after modelcontextprotocol.io.
  - `azure-openai-rag` (96.1): Azure OpenAI grounded in Azure AI Search behind Application Gateway and private endpoints, after Microsoft's baseline chat reference architecture.
  - `gcp-vertex-mlops` (99.5): MLOps on Gemini Enterprise Agent Platform, the new name of Vertex AI, from Cloud Build CI/CD through Pipelines, Managed Training and Model Registry to an online endpoint, with drift alerts that retrain, after Google's MLOps reference architectures.
  - `ibm-cloud-openshift` (99.7): the first IBM Cloud example, Red Hat OpenShift across three zones in a VPC with Cloud Internet Services and Virtual Private Endpoints, after IBM's web app on OpenShift pattern.
  - `system-design-video-streaming` (100): upload, transcoding to HLS and DASH, CDN playback and recommendations from view events.
- `references/patterns.md` covers AI agents on MCP and IBM Cloud, and lists the new examples under RAG, ML and system design.

### Changed

- `.claude-plugin/plugin.json` points `documentationUrl` at the website.

### Fixed

- `examples/README.md` said "Twenty-six diagrams" with 27 in the gallery.

## [0.4.1] - 2026-10-18

### Fixed

- **An edge to or from an `around:` group no longer crashes layout.** `alb -> asg` failed in `render` and `validate` with ELK's "Referenced shape does not exist: asg", because overlay groups are outlined after layout and ELK never sees them. Such an edge is now drawn after layout like `constraint: false` and ends on the overlay's border, while layout gets hidden copies of it to the overlay's members so the diagram keeps its order. An end that would land under the overlay's header tile and label slides along the border 20 px past them. A copy of `aws-three-tier` with `alb -> asg` instead of `alb -> web-a, web-b` passes `orrery review --width 880` at 96.8 with every hard count at 0; without the slide the arrowhead sat under the header (93.2, FAIL). Diagrams without such an edge render byte for byte as before.

## [0.4.0] - 2026-10-18

### Added

- **npm package `@sagargupta1610/orrery`.** `npx @sagargupta1610/orrery render diagram.yaml` runs the CLI with no clone and no skill install. `scripts/pack-npm.mjs` stages the skill folder as it ships (the CLI finds its assets by walking up from `scripts/`) with the README, license and notices; the package is 3.0 MB packed. Publishing a GitHub release runs `.github/workflows/publish.yml`, which publishes it through npm trusted publishing and skips a version npm already has.
- **Gemini CLI extension.** `gemini-extension.json` makes the repository a Gemini CLI extension (`gemini extensions install https://github.com/Sagargupta16/orrery`) that loads the orrery skill. Each release also gets an `orrery.tar.gz` archive without `agents/`, because Gemini rejects Claude Code's agent format with one error per file.
- **Agent Plugins manifest.** A root `plugin.json` in the open [Agent Plugins](https://agent-plugins.org) format, which GitHub Copilot CLI and Cursor read, next to `.claude-plugin/plugin.json`, which Claude Code reads. Those clients get the skill; the reviewer agents and `/orrery:review` stay Claude Code only.
- Claude plugin directory fields in `.claude-plugin/plugin.json`: `displayName`, `documentationUrl` and `supportUrl`.
- `check-repo.mjs` fails when `plugin.json` or `gemini-extension.json` names another version than `package.json`.
- README install section lists `gh skill install`, the Gemini CLI and npm.

### Fixed

- README said a monthly workflow opens its own pull request with new icon packs; since 0.3.1 Renovate's monthly pull request carries them.

## [0.3.1] - 2026-10-18

### Changed

- **One update pull request a month.** Renovate's grouped monthly pull request now carries the icon libraries and everything generated from the dependencies. `.github/workflows/icons.yml` no longer opens its own pull request on the 2nd: it runs on every Renovate branch, fetches the newest official AWS, Azure, Google Cloud and Kubernetes packs, re-pins the libraries, rebuilds the catalogs, the bundled CLI and the gallery, commits the result and starts CI, so the pull request can auto-merge when it is green. Before, a Renovate bump of elkjs, resvg, yaml or esbuild failed `build.mjs --check`, because Renovate cannot run the build. `renovate.json` lists github-actions[bot] in `gitIgnoredAuthors`, so Renovate keeps rebasing a branch the workflow committed to.
- `sync-icons --latest` moves the Kubernetes icons and logo to the newest upstream commit that touched them; they stayed on a fixed commit before.
- `sync-icons` rewrites every pack count and version the docs quote (README, THIRD_PARTY_NOTICES.md, SKILL.md, references/icons.md, the how-it-works art), and `build.mjs` keeps the ELK and resvg versions in THIRD_PARTY_NOTICES.md current; `build.mjs --check` fails when they drift.
- pnpm 12.14.0 (was 11.28.1). TypeScript targets ES2024, the newest edition Node 22 runs in full.

### Fixed

- THIRD_PARTY_NOTICES.md named older logos (1.2.15) and Simple Icons (16.34.0, 1.2.99) versions than the ones the catalog loads (1.2.16, 16.35.0, 1.2.100).
- The vendored engines README named `elk.bundled.js`; the file is `elk.bundled.cjs`.

## [0.3.0] - 2026-10-18

### Added

- **Review board.** `orrery review <spec> --width 880` measures a diagram at the width readers see it and scores six dimensions: official conventions, layout, grid, arrows and flow, overlap, and size and quality. It writes `<base>.review.json` (scores, hard counts, findings with evidence and fixes, element boxes in display pixels) and `<base>.review.png` at that width; `--strict` exits 1 when the review fails. Three read-only Claude Code agents judge what measurement cannot: `orrery:conventions-reviewer` against vendor rubrics (AWS deck, Azure Well-Architected, Google's icon guide, C4 notation, every rule quoted with its source), `orrery:flow-reviewer` for the story the arrows tell, and `orrery:legibility-reviewer` for the display-width PNG. `/orrery:review` runs the loop: measure, critique in parallel, keep only findings that cite a measurement or a vendor rule, apply one to three spec patches, and keep a round only when the score goes up and no hard count does, for at most three rounds. Without subagents (`npx skills add`) the same three passes run inline from the rubrics in `references/review/`.
- **`legend:`** maps line styles to their meaning (`legend: { dashed: Asynchronous events }`) and draws a key in every format. DG217 warns when a dashed, dotted or thick line is used without one, as Azure's and C4's diagram guidance ask; every example that uses one of those styles now has a legend.
- New composition checks: DG209 (an edge runs through a group's header label), DG210 (something sticks out of the canvas), DG211 (a step or node badge covers a label or icon), DG212 (an edge runs through another edge's label), DG213 (an overlay group encloses a node it does not list) and DG218 (layout needed a fallback strategy). DG205 also flags strips more than two screens tall.
- **`aws-hybrid-landing-zone` example**: a hybrid, multi-Region, multi-account AWS landing zone after the AWS Security Reference Architecture: Organizations OUs with SCPs, IAM Identity Center federated to a corporate IdP, an organization trail and Config into a KMS-encrypted Log Archive bucket, GuardDuty and Security Hub with a delegated administrator, Network Firewall inspection, Route 53 Resolver for hybrid DNS, and Direct Connect with VPN backup to peered Transit Gateways in two Regions.
- CI tests Node 26.
- Light and dark (and the review's second theme) share one ELK run per graph, so `--theme both` and `review` lay out once.

### Changed

- **Renamed from stackdraw to orrery** (an orrery is a working model of a system that shows how its parts move around each other): the repository, the skill (`skills/orrery`), the CLI (`scripts/orrery.mjs`), the plugin and marketplace (`/plugin install orrery@orrery`), the reviewer agents (`orrery:conventions-reviewer`, `orrery:flow-reviewer`, `orrery:legibility-reviewer`), `/orrery:review` and the cache variable (`ORRERY_CACHE`). GitHub redirects the old repository URL.

- **Spec order is kept wherever it costs no crossing.** Layout orders siblings with semi-interactive crossing minimization and position hints instead of ELK's model-order option, which threw inside groups on 13 of the 27 shipped diagrams and then dropped the order. Groups always keep spec order; when the ordered layout crosses edges, only the nodes on those edges may move, and the layout with fewer crossings wins. Across the gallery: sibling pairs in spec order 88 of 119 before, 113 of 120 now; groups in order 17 of 23 before, 23 of 23 now; edge crossings 8 before, 4 now.
- Same-column nodes of different sizes share a center line, content sits centered in groups widened by their label, nested frames keep even padding, stacked frames of one type share a width, and tiny 1 to 6 px jogs and redundant bend points are gone.
- A group header label slides off the edges that cross it; in a vertical flow, a group whose label no edge could avoid is laid out wide enough for edges to enter right of the label, as in AWS reference diagrams. Multi-line group labels grow the header, and side-by-side frames share their top edge.
- AWS group tiles are 40 px, the deck's size next to 48 px service icons; the Auto Scaling group tile sits centered on its top border. Light-theme callouts are black with bold white digits (AWS deck).
- Google Cloud frame is #1a73e8 and regions are white panels with a #202124 outline, as measured from Google's six deployment archetype diagrams. orrery's own neutral outlines reach 3:1 against white.
- Edges into non-square logos (Kafka, PagerDuty) end on the drawn glyph instead of up to 9 px short of it.
- Edge labels and step badges sit on the same side of every horizontal line (ELK picked a side per edge; 13 of 27 gallery diagrams mixed them), and an overlay border moves out when an edge would run alongside it closer than 8 px.
- Badges are sized from their measured text, stay clear of an arriving arrow, and reserve room so they never run into a neighbor or out of their group. `constraint: false` edges no longer share a trunk, and their labels sit beside the line, inside the canvas.
- SVG ids are prefixed with the diagram name and theme, so several diagrams (or the light and dark file) can be inlined in one page. Repeated icons are written once as a `<symbol>` and reused. Edge labels are drawn after every edge line, so a later edge never paints over a label.
- HTML viewer: the PNG button exports a still frame at 3x, the SVG download is named per theme, and the buttons are 44 px tall.
- README gallery is one column, so the diagrams render at the full column width on GitHub.
- `gitops-kubernetes` went through the review loop first: the 0.2 version scores 85.3 and fails (node labels at 5.8 px in the README column); the shipped one scores 98.5 and passes. It now runs top to bottom, monitoring and Deployment-created pods have their own line styles, and both clusters pull from the registry.
- **Every example reviewed and fixed.** Four reviewers checked all 28 diagrams (the 26 examples, the hero and how-it-works) against vendor documentation and found 182 mistakes. Every one is fixed or, for 3 inherent crossings and long edges, reduced to a minor, and all 28 now pass `orrery review` at the 880 px README width (16 failed it before). Among them:
  - The hero is real GitOps: Actions bumps a manifests repository and Argo CD pulls from it.
  - The IAM role in the CI/CD example is an identity GitHub Actions assumes, not an actor.
  - The AWS RAG and open-source RAG examples embed the question before searching.
  - The three-tier example writes from both zones to the primary database.
  - A REST API uses a Cognito user pool authorizer, not a JWT authorizer.
  - Global services (CloudFront, IAM, the Direct Connect gateway) sit outside Regions.
  - AKS workload identity exchanges a token with Entra ID.
  - App Service reaches ExpressRoute through a VNet.
  - Cloud Run reaches Memorystore over Direct VPC egress.
  - The chat, URL shortener and C4 designs gained their missing reads, writes and relationships.
  - MinIO, whose open-source repository is archived, is replaced by Ceph with a Hive Metastore catalog.
  - Names are current: SageMaker AI, Quick Sight, the full Kubernetes kind names.
  - The Apple logo, whose use Apple's guidelines reserve for licensees, is gone.
  - The how-it-works diagram shows the npm icon libraries as fetched on first use.
  Most examples now run top to bottom, so their labels show at full size in a README column.
- **`--strict` is stricter.** It now also fails on the new warnings, so a 0.2 spec with dashed, dotted or thick lines and no `legend:` exits 1 with DG217 until it gets a legend.
- Dependencies: vitest 5.0.5, `@iconify-json/logos` 1.2.16, `@iconify-json/simple-icons` 1.2.100 and `simple-icons` 16.35.0, re-pinned (16,682 icons).

### Fixed

- Black logos with no explicit color (Okta, LangChain, Resend) vanished in the dark theme; they are repainted, and the GitHub mark stays black or white as GitHub's brand guide asks.
- Hex colors must start with "#": `color: ff9900` was accepted and wrote invalid SVG paint, and an unquoted `color: #ff9900` (a YAML comment) was dropped silently; both are now DG107 with the quoted form as the fix.
- A node `url` with a tab or other control character (`java\tscript:`) slipped past the scheme check and became a `javascript:` link when the SVG was inlined in HTML; control characters are rejected and the scheme is checked with whitespace removed.
- The label contrast fixer could lower contrast on mid-tone fills (4.43:1 to 3.06:1 on AWS teal); it now moves toward whichever of black or white contrasts more and never makes text worse.
- Unknown CLI flags (`--formats`) and bad values (`--animate flw`, `--limit abc`, `icons fetch githb`) exit 2 with a did-you-mean instead of being ignored. A missing input file or `--font` file, an offline `demo`, `icons fetch` or `icons show` report the problem without a stack trace.
- Mermaid import reads a frontmatter block with `config:` and keeps `;` inside quoted labels.
- Generated TSX type-checks under `strict` (Inkscape style residue is dropped, and stripped from the Kubernetes catalog); draw.io icon labels keep their line breaks instead of wrapping to the icon width; a stepped `<->` edge plays both packets inside its own step; edge label text is centered on its step badge.
- `sync-icons --latest` downloads fresh copies instead of re-pinning a cached package.
- `check-repo` also checks the version and icon-count badges in the README and the icon counts quoted in `docs/*.yaml` (the badges still said 0.2.1 and 16,652).

## [0.2.1] - 2026-10-11

### Fixed

- Mermaid import strips HTML tags from labels until none are left, then any stray angle bracket, so a nested tag such as `<scr<b>ipt>` can no longer collapse into a new one (CodeQL js/incomplete-multi-character-sanitization).
- The README tagline and the repository CLAUDE.md name the IBM pack and the animated output.

## [0.2.0] - 2026-10-11

### Changed

- **Renamed from diagramify to stackdraw**: the repository, the skill (`skills/stackdraw`), the CLI (`scripts/stackdraw.mjs`), the plugin and marketplace (`/plugin install stackdraw@stackdraw`) and the cache variable (`STACKDRAW_CACHE`). GitHub redirects the old repository URL.
- **SVGs are animated by default.** `animate: packets` (new default) sends a dot along every directed edge at one speed; numbered edges play one after another in step order as a loop, and each step badge ripples as its packet leaves. Line styles stay as drawn. SMIL only, so it works in GitHub READMEs. `animate: flow` keeps the marching dashes of 0.1.0, `animate: none` or `render --static` writes a still file; `--animate <mode>` overrides the spec. PNG and draw.io are always still.
- **Logo and glyph sets load from their npm libraries** instead of being copied into the skill. `github` (`@primer/octicons`), `logos`, `si` and `tabler` (`@iconify-json/*`) load at render time from a matching `node_modules`, the user cache or jsDelivr (unpkg as fallback), checked against a pinned SHA-256. The skill folder drops from 22 MB to 9 MB; search and validation stay offline. New `icons fetch` prefetches the libraries, `doctor` reports how many are available offline, and a render that needs a library it cannot get fails with DG301 and the fixes.
- **Google Cloud follows Google's current icon system.** The legacy console icons are gone (Google says not to use them as of 2026). Each of 188 products from Google's May 2026 icon guide draws the icon Google assigns it, under its own name: core products their unique icon, the rest their category icon (`gcp:pubsub` is the Data Analytics icon). Core icons carry today's names (`Spanner`, `Google Security Operations`).
- **No unofficial cloud icons**: the logo sets' redraws of AWS and Google Cloud service icons (`logos:aws-*`, `si:googlebigquery` and the like) are dropped in favor of the vendors' own packs, and SVG Logos' superseded marks give way to their current designs. 16,652 icons in all.
- Step badges are 28 px with 14 px digits (were 20 px and 11 px), within the 0.54 to 0.75 of icon size measured on official AWS, Azure and Google reference diagrams.
- `github:copilot-logo` and `github:octocat` now point at GitHub's own current marks (`github:copilot`, `github:mark-github`): Copilot's standalone logo is retired, and GitHub asks that the Octocat not stand in for its logo.
- PNGs default to 3x, and the HTML viewer re-rasterizes on zoom, so both stay sharp when zoomed in.
- New README hero: GitOps delivery from GitHub Actions and Argo CD to GKE, AKS and EKS behind Cloudflare, animated.

### Added

- **IBM Carbon icons** (`ibm:`, 2,776 icons from `@iconify-json/carbon`, Apache-2.0, loaded at render time): the UI icons IBM's technical diagram guide puts in diagram nodes, including 204 IBM product glyphs for IBM Cloud and watsonx diagrams.
- Non-AWS cloud examples: `gitops-kubernetes` (GitHub Actions and Argo CD syncing staging and production clusters), `azure-hub-spoke` (ExpressRoute, VPN, Azure Firewall, Bastion, two peered spokes) and `gcp-gke-platform` (Cloud Build, Artifact Registry and Cloud Deploy to GKE). The README and gallery previews are now the animated SVGs, non-AWS first.
- Vendor-neutral examples: `modern-web-stack` (Cloudflare, Next.js on Vercel, Neon, Upstash, Stripe, Clerk, Resend, Sentry, PostHog), `data-platform-oss` (Debezium, Airbyte, Kafka, Flink, Iceberg on MinIO, dbt, Trino, Superset, Airflow) and `rag-open-source` (Qdrant, bge-m3, LangChain, FastAPI, Ollama, Langfuse).

### Fixed

- A `constraint: false` edge between two stacked icon nodes in a left-to-right diagram ran through the upper node's label and note; it now leaves below the text.

## [0.1.0] - 2026-10-11

### Added

- **`diagramify` skill**: a fast path from brief to spec to validated render, rules for diagrams that read like official documentation (one main flow, vendor boundaries from the outside in, official names, sparse edge labels), and guidance for diagrams drawn from a repository, Terraform, Kubernetes manifests or a Mermaid flowchart.
- **Spec format**: YAML or JSON with `nodes`, `groups` (nested with `in:` or `contains`) and `edges` in a short arrow syntax (`a -> b: label`, `-->` dashed, `..>` dotted, `==>` thick, `<->`, fan-out `a -> b, c`, chains with inline labels `a -[x]-> b -> c`), numbered steps, badges, notes, links, three node looks (icon, card, shape) and 13 shapes. JSON Schema for editor completion.
- **13,991 official icons in 8 packs**, rebuilt from the vendors' own downloads with pinned SHA-256 checksums: AWS Architecture Icons (2026-07-31 package: services, resources with light and dark variants, group tiles, categories), Azure Architecture Icons V24, Google Cloud 2025 product, category and console icons, the Kubernetes community icons and logo, GitHub Octicons, SVG Logos, Simple Icons (entries with restrictive licenses excluded) and Tabler Icons. 392 short aliases (`aws:s3`, `azure:aks`, `gcp:bq`, `k8s:deploy`, `github:actions`) and a vendor-neutral `generic:` vocabulary for system design.
- **54 group styles with sources**: AWS groups read from the official Architecture Icons deck (square corners, no fills, 1.67 px borders, the deck's dash patterns, corner tiles, centered labels for Availability Zones and security groups, the Auto Scaling tile at the top center), Google Cloud groups measured from its 2025 Architecture Center diagrams (blue Google Cloud frame, grey project and region panels, dashed VPC and subnets), Azure groups measured from its reference diagrams (light-blue VNet panel, grey subnets, yellow-bordered zones), Kubernetes, C4 and neutral styles. `around:` overlay groups outline nodes that live in other groups, such as an Auto Scaling group spanning two zones.
- **Layout** with the Eclipse Layout Kernel: hierarchical, orthogonal routing, edge labels placed by the layout, fan-in and fan-out trunks that merge only edges of the same line, arrow and color (`layout.merge`), `constraint: false` edges drawn after layout for links that must not reorder anything, spec order kept for siblings, minimum group widths kept in vertical flows, fan-outs kept in one column when only some sibling edges are labelled, four directions, spacing and layering controls, and a retry with simpler strategies when a graph trips ELK. Group headers draw above edges on a chip, node labels keep 4.5:1 contrast on any group fill, and arrowheads are open chevrons (AWS and Google decks) or filled triangles (`arrowhead: filled`).
- **Renderers**: self-contained accessible SVG, PNG through resvg (WebAssembly) with the bundled Inter font, editable draw.io with embedded icons and container groups, a React TSX component with `useId`-scoped ids, and a standalone HTML viewer with light/dark switch, pan, pinch zoom and downloads. Light and dark themes; `--theme both`; optional animated edges.
- **Validation**: diagnostics DG100 to DG110 for the spec and DG201 to DG208 for the composition (edges through nodes, label collisions, very wide diagrams, empty groups, unconnected nodes), each with a subject and concrete fixes; `render --json` writes atomically and prints a receipt with sizes and SHA-256 per file.
- **CLI** (bundled, zero install, Node 22+): `render`, `validate`, `icons search|show|list|packs`, `styles`, `init`, `import mermaid`, `doctor`, `demo`.
- **Mermaid import**: flowcharts become specs with subgraphs as groups, edge styles and labels kept, shapes mapped, and official icons set where a label is exactly a product name.
- **Official names**: labels default to the vendor's name for a service ("AWS X-Ray", "PostgreSQL", "GitHub Actions"), long CamelCase names wrap at word boundaries, and search ranks the vendor's own icon above logo-pack copies (`sqs`, `vpc`, `eks`) and a product's logo above cloud aliases (`redis`, `kafka`).
- **Examples gallery** (20 reference architectures across AWS, Google Cloud, Azure, Kubernetes, GitHub, C4 and vendor-neutral system design), plugin manifest and self-hosted marketplace, `npx skills add` support, repo checks, tests and CI, and a monthly workflow that re-pins newer official icon packages.
