# Changelog

All notable changes to this project are documented here. Follows [Semantic Versioning](https://semver.org/).

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
