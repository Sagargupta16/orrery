<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/hero-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/hero-light.svg">
  <img alt="GitOps delivery drawn by stackdraw: GitHub Actions and Argo CD deploy to GKE, AKS and EKS behind Cloudflare, with Grafana watching, in each vendor's official icons and frames" src="docs/hero-light.svg" width="100%">
</picture>

# stackdraw

**Animated architecture and system design diagrams with official AWS, Azure, Google Cloud, Kubernetes, GitHub and IBM icons.**<br>
One YAML spec in; SVG, PNG, editable draw.io, a React component and an HTML viewer out.

[![CI](https://github.com/Sagargupta16/stackdraw/actions/workflows/ci.yml/badge.svg)](https://github.com/Sagargupta16/stackdraw/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-0.2.1-2563eb)
![Icons](https://img.shields.io/badge/official_icons-16%2C652-2563eb)
![License](https://img.shields.io/badge/license-MIT-2563eb)

</div>

The diagram above is [docs/hero.yaml](docs/hero.yaml): 33 lines of YAML, laid out and rendered by stackdraw. It moves because every SVG is animated by default: a packet travels each edge, and the numbered steps play in order, on a loop. GitHub keeps the animation; the PNG of the same spec is a still frame.

## What you get

- **Official, current icons only.** 16,652 icons: AWS (810), Azure (636), Google Cloud (233), Kubernetes (40), GitHub Octicons (399) and IBM Carbon (2,776), plus 5,472 tech logos and 6,286 neutral symbols for system design. The cloud packs are rebuilt from each vendor's own download, pinned by checksum. Google Cloud products get the icon Google's 2026 guide assigns them; deprecated sets and unofficial redraws of cloud icons are left out.
- **Official conventions.** AWS groups follow the AWS Architecture Icons deck (borders, dashes, corner tiles, label placement, open arrowheads, numbered callouts); Google Cloud and Azure groups are measured from their own reference diagrams. Every value cites its source in [styles.md](skills/stackdraw/references/styles.md).
- **Automatic layout.** The Eclipse Layout Kernel places nested boundaries, routes edges at right angles, joins fan-in and fan-out into trunks and keeps your order where it can. No coordinates to write.
- **Diagrams that move.** Animated SVG by default: packets travel every edge at one speed, numbered steps play as a story, line styles stay as drawn. `animate: flow` for marching dashes, `--static` for a still file.
- **Five outputs from one spec.** SVG for READMEs and docs, PNG for slides and chat (3x by default, sharp when zoomed), `.drawio` you can keep editing, a TSX component for React sites, and a standalone HTML viewer with dark mode, pan and pinch zoom.
- **Made for agents.** A skill with a fast path and authoring rules, a JSON Schema, 392 short aliases (`aws:s3`, `azure:aks`, `k8s:deploy`), ranked icon search, and a validator whose every finding names the subject and the fix.
- **No install.** The CLI, layout engine, PNG renderer, fonts and the official cloud packs ship in the skill folder (9 MB). Logo and glyph sets are not copied in: they load from their own npm libraries the first time a diagram uses them, verified by checksum and cached. Node.js 22 or newer is all it needs.

## Install

Claude Code plugin:

```
/plugin marketplace add Sagargupta16/stackdraw
/plugin install stackdraw@stackdraw
```

Any agent that reads [Agent Skills](https://agentskills.io) (Codex, Cursor, Gemini CLI, Kiro and others):

```bash
npx skills add Sagargupta16/stackdraw
```

Only the CLI:

```bash
git clone https://github.com/Sagargupta16/stackdraw
node stackdraw/skills/stackdraw/scripts/stackdraw.mjs doctor
```

## Quick start

Ask your agent for a diagram ("draw the architecture of this repo", "a three-tier web app on AWS across two Availability Zones", "turn this Mermaid flowchart into a Google Cloud diagram"). It writes a spec, validates it, renders it and checks the picture. Or write one yourself:

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

```bash
node skills/stackdraw/scripts/stackdraw.mjs render orders.yaml -f svg,png
```

Labels default to the official service names, so `{ icon: aws:lambda }` reads "AWS Lambda". Edges use arrows: `->` solid, `-->` dashed, `..>` dotted, `==>` thick, `<->` both ways, `a -> b, c` to fan out. The full format is in [spec.md](skills/stackdraw/references/spec.md).

## Gallery

Every picture below is the animated SVG rendered from a spec in [skills/stackdraw/examples](skills/stackdraw/examples), checked against the renderer by CI; `stackdraw init <name>` copies any of them as a starting point. All 26, with commands, in [examples/README.md](examples/README.md).

| | |
| --- | --- |
| <a href="examples/modern-web-stack.svg"><img src="examples/modern-web-stack.svg" alt="Modern SaaS stack with Cloudflare, Next.js on Vercel, Neon, Upstash, Stripe, Clerk and Resend"></a> | <a href="examples/gitops-kubernetes.svg"><img src="examples/gitops-kubernetes.svg" alt="GitOps with GitHub Actions and Argo CD syncing staging and production Kubernetes clusters"></a> |
| [`modern-web-stack`](skills/stackdraw/examples/modern-web-stack.yaml): Cloudflare, Next.js on Vercel, Neon, Upstash, Stripe, Clerk, Resend, Sentry and PostHog, drawn as cards | [`gitops-kubernetes`](skills/stackdraw/examples/gitops-kubernetes.yaml): GitHub Actions and Argo CD with the official Kubernetes icons, numbered steps from pull request to production |
| <a href="examples/gcp-gke-platform.svg"><img src="examples/gcp-gke-platform.svg" alt="GKE application platform on Google Cloud with Cloud Build, Artifact Registry and Cloud Deploy"></a> | <a href="examples/azure-hub-spoke.svg"><img src="examples/azure-hub-spoke.svg" alt="Hub-spoke network on Azure with ExpressRoute, VPN, Azure Firewall and two peered spokes"></a> |
| [`gcp-gke-platform`](skills/stackdraw/examples/gcp-gke-platform.yaml): Google Cloud's own frames and 2026 product icons around a GKE cluster and its delivery pipeline | [`azure-hub-spoke`](skills/stackdraw/examples/azure-hub-spoke.yaml): an Azure hub-spoke network with ExpressRoute, a VPN backup, Azure Firewall, Bastion and private endpoints |
| <a href="examples/data-platform-oss.svg"><img src="examples/data-platform-oss.svg" alt="Open-source data platform with Debezium, Kafka, Flink, Iceberg on MinIO, dbt, Trino and Superset"></a> | <a href="examples/rag-open-source.svg"><img src="examples/rag-open-source.svg" alt="Retrieval augmented generation with Qdrant, LangChain, FastAPI and Ollama"></a> |
| [`data-platform-oss`](skills/stackdraw/examples/data-platform-oss.yaml): an open-source lakehouse from change data capture to dashboards | [`rag-open-source`](skills/stackdraw/examples/rag-open-source.yaml): RAG with open components: an ingestion lane and a query lane meeting at Qdrant |
| <a href="examples/multi-cloud.svg"><img src="examples/multi-cloud.svg" alt="AWS, Google Cloud and Azure joined by private interconnects with one identity provider"></a> | <a href="examples/system-design-url-shortener.svg"><img src="examples/system-design-url-shortener.svg" alt="URL shortener system design with cache, database and analytics stream"></a> |
| [`multi-cloud`](skills/stackdraw/examples/multi-cloud.yaml): each vendor's own group style side by side, joined at a colocation router | [`system-design-url-shortener`](skills/stackdraw/examples/system-design-url-shortener.yaml): vendor-neutral system design with product logos |
| <a href="examples/aws-three-tier.svg"><img src="examples/aws-three-tier.svg" alt="Three-tier web application on AWS across two Availability Zones"></a> | <a href="examples/c4-container.svg"><img src="examples/c4-container.svg" alt="C4 container diagram for an online store"></a> |
| [`aws-three-tier`](skills/stackdraw/examples/aws-three-tier.yaml): VPC, two Availability Zones, public, app and data subnets, an Auto Scaling group drawn across both zones | [`c4-container`](skills/stackdraw/examples/c4-container.yaml): a C4 container view built from shapes |

## How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/how-it-works-dark.svg">
  <img alt="A YAML spec is validated, laid out by ELK with the official icon packs and rendered to SVG, PNG, draw.io, TSX and HTML" src="docs/how-it-works-light.svg" width="100%">
</picture>

## Validation that tells you the fix

```text
$ stackdraw validate orders.yaml
error DG101 node "fn" uses unknown icon "aws:lamda" {"node":"fn","icon":"aws:lamda"}
      fix: use icon "aws:lambda"
      fix: run `stackdraw icons search lamda`
error DG108 unknown key "lable" in node "db" {"where":"node \"db\"","key":"lable"}
      fix: rename "lable" to "label"
failed: 2 error(s), 0 warning(s)
```

Spec errors (DG1xx) stop the render; composition warnings (DG2xx: an edge through a node, colliding labels, a diagram too wide to read) keep it going unless `--strict` is set. `render --json` writes every file atomically and prints a receipt with the size and SHA-256 of each output.

## Commands

| Command | Does |
| --- | --- |
| `render <spec> [-o base] [-f svg,png,drawio,tsx,html\|all] [--theme light\|dark\|both] [--animate packets\|flow\|none] [--static]` | Validate, lay out, render. |
| `validate <spec> [--strict] [--json]` | Spec errors and composition warnings, each with fixes. |
| `icons search <words> [--pack aws]` | Ranked icon ids with official names. |
| `icons show <id>`, `icons list`, `icons packs` | Browse the catalog and its sources. |
| `icons fetch` | Download and cache the logo and glyph libraries for offline renders. |
| `styles` | Every group type and node shape. |
| `init [template]` | Start from one of the examples. |
| `import mermaid <flowchart.mmd>` | Turn an existing Mermaid flowchart into a spec, with official icons where the labels name real products. |
| `doctor`, `demo` | Check the install; render every example. |

## Icon packs

| Pack | Icons | Source | Ships |
| --- | ---: | --- | --- |
| `aws` | 810 | [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/), 2026-07-31 package | bundled |
| `azure` | 636 | [Azure Architecture Icons](https://learn.microsoft.com/en-us/azure/architecture/icons/) V24 | bundled |
| `gcp` | 233 | [Google Cloud icons](https://cloud.google.com/icons), core and category icons mapped to products as in Google's May 2026 guide | bundled |
| `k8s` | 40 | [Kubernetes community icons](https://github.com/kubernetes/community/tree/master/icons) | bundled |
| `github` | 399 | [GitHub Octicons](https://primer.style/octicons) | npm `@primer/octicons` |
| `ibm` | 2,776 | [IBM Carbon icons](https://carbondesignsystem.com/elements/icons/library/), IBM's diagram node icons and product glyphs | npm `@iconify-json/carbon` |
| `logos` | 2,123 | [SVG Logos](https://github.com/gilbarbara/logos) | npm `@iconify-json/logos` |
| `si` | 3,349 | [Simple Icons](https://simpleicons.org) | npm `@iconify-json/simple-icons` |
| `tabler` | 6,286 | [Tabler Icons](https://tabler.io/icons) | npm `@iconify-json/tabler` |

Bundled packs exist only as vendor downloads, so they ship with the skill and work offline. The npm sets load at render time from a local `node_modules`, the user cache or jsDelivr, checked against a pinned SHA-256; `stackdraw icons fetch` caches them ahead of time, and [icons.md](skills/stackdraw/references/icons.md#where-icons-load-from) has the details. A monthly workflow checks the vendors' pages for new releases and opens a PR with the updated packs. Icons, logos and trademarks belong to their owners and are used under the terms listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); the AWS, Microsoft and Google terms allow them in architecture diagrams.

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build                       # src/ -> skills/stackdraw/scripts/stackdraw.mjs
pnpm gallery                     # re-render examples/ and docs/
node scripts/check-repo.mjs      # dashes, links, counts, doc snippets, gallery freshness
pnpm sync-icons                  # rebuild icon catalogs (--latest re-pins new vendor releases)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the pieces fit and [SECURITY.md](SECURITY.md) for reporting issues.

## License

Code and docs: [MIT](LICENSE). Icons, fonts and the vendored engines keep their own licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
