# Changelog

All notable changes to this project are documented here. Follows [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-10-17

### Added

- **Review board.** `stackdraw review <spec> --width 880` measures a diagram at the width readers see it and scores six dimensions: official conventions, layout, grid, arrows and flow, overlap, and size and quality. It writes `<base>.review.json` (scores, hard counts, findings with evidence and fixes, element boxes in display pixels) and `<base>.review.png` at that width; `--strict` exits 1 when the review fails. Three read-only Claude Code agents judge what measurement cannot: `stackdraw:conventions-reviewer` against vendor rubrics (AWS deck, Azure Well-Architected, Google's icon guide, C4 notation, every rule quoted with its source), `stackdraw:flow-reviewer` for the story the arrows tell, and `stackdraw:legibility-reviewer` for the display-width PNG. `/stackdraw:review` runs the loop: measure, critique in parallel, keep only findings that cite a measurement or a vendor rule, apply one to three spec patches, and keep a round only when the score goes up and no hard count does, for at most three rounds. Without subagents (`npx skills add`) the same three passes run inline from the rubrics in `references/review/`.
- **`legend:`** maps line styles to their meaning (`legend: { dashed: Asynchronous events }`) and draws a key in every format. DG217 warns when a dashed, dotted or thick line is used without one, as Azure's and C4's diagram guidance ask; every example that uses one of those styles now has a legend.
- New composition checks: DG209 (an edge runs through a group's header label), DG210 (something sticks out of the canvas), DG211 (a step or node badge covers a label or icon), DG212 (an edge runs through another edge's label), DG213 (an overlay group encloses a node it does not list) and DG218 (layout needed a fallback strategy). DG205 also flags strips more than two screens tall.
- **`aws-hybrid-landing-zone` example**: a hybrid, multi-Region, multi-account AWS landing zone after the AWS Security Reference Architecture: Organizations OUs with SCPs, IAM Identity Center federated to a corporate IdP, an organization trail and Config into a KMS-encrypted Log Archive bucket, GuardDuty and Security Hub with a delegated administrator, Network Firewall inspection, Route 53 Resolver for hybrid DNS, and Direct Connect with VPN backup to peered Transit Gateways in two Regions.
- CI tests Node 26.
- Light and dark (and the review's second theme) share one ELK run per graph, so `--theme both` and `review` lay out once.

### Changed

- **Spec order is kept wherever it costs no crossing.** Layout orders siblings with semi-interactive crossing minimization and position hints instead of ELK's model-order option, which threw inside groups on 13 of the 27 shipped diagrams and then dropped the order. Groups always keep spec order; when the ordered layout crosses edges, only the nodes on those edges may move, and the layout with fewer crossings wins. Across the gallery: sibling pairs in spec order 88 of 119 before, 113 of 120 now; groups in order 17 of 23 before, 23 of 23 now; edge crossings 8 before, 4 now.
- Same-column nodes of different sizes share a center line, content sits centered in groups widened by their label, nested frames keep even padding, stacked frames of one type share a width, and tiny 1 to 6 px jogs and redundant bend points are gone.
- A group header label slides off the edges that cross it; in a vertical flow, a group whose label no edge could avoid is laid out wide enough for edges to enter right of the label, as in AWS reference diagrams. Multi-line group labels grow the header, and side-by-side frames share their top edge.
- AWS group tiles are 40 px, the deck's size next to 48 px service icons; the Auto Scaling group tile sits centered on its top border. Light-theme callouts are black with bold white digits (AWS deck).
- Google Cloud frame is #1a73e8 and regions are white panels with a #202124 outline, as measured from Google's six deployment archetype diagrams. stackdraw's own neutral outlines reach 3:1 against white.
- Edges into non-square logos (Kafka, PagerDuty) end on the drawn glyph instead of up to 9 px short of it.
- Edge labels and step badges sit on the same side of every horizontal line (ELK picked a side per edge; 13 of 27 gallery diagrams mixed them), and an overlay border moves out when an edge would run alongside it closer than 8 px.
- Badges are sized from their measured text, stay clear of an arriving arrow, and reserve room so they never run into a neighbor or out of their group. `constraint: false` edges no longer share a trunk, and their labels sit beside the line, inside the canvas.
- SVG ids are prefixed with the diagram name and theme, so several diagrams (or the light and dark file) can be inlined in one page. Repeated icons are written once as a `<symbol>` and reused. Edge labels are drawn after every edge line, so a later edge never paints over a label.
- HTML viewer: the PNG button exports a still frame at 3x, the SVG download is named per theme, and the buttons are 44 px tall.
- README gallery is one column, so the diagrams render at the full column width on GitHub.
- `gitops-kubernetes` went through the review loop first: the 0.2 version scores 85.3 and fails (node labels at 5.8 px in the README column); the shipped one scores 98.5 and passes. It now runs top to bottom, monitoring and Deployment-created pods have their own line styles, and both clusters pull from the registry.
- **Every example reviewed and fixed.** Four reviewers checked all 28 diagrams (the 26 examples, the hero and how-it-works) against vendor documentation and found 182 mistakes. Every one is fixed or, for 3 inherent crossings and long edges, reduced to a minor, and all 28 now pass `stackdraw review` at the 880 px README width (16 failed it before). Among them:
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
