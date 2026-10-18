# Icons

18,209 icons in 10 packs, all current official artwork. The four cloud packs are built from each vendor's own download by `scripts/sync-icons.mjs` (pinned by URL and SHA-256 in `scripts/icon-sources.json`; a monthly workflow re-pins newer releases) and ship inside the skill. The six sets that are published as npm libraries are not copied into the skill: they load from the library itself at render time (see [Where icons load from](#where-icons-load-from)). Every icon is drawn the same way either way: ids made unique per use, monochrome glyphs colored for the theme.

| Pack | Icons | Source | Version | What it covers | Ships |
| --- | ---: | --- | --- | --- | --- |
| `aws` | 810 | [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) | 2026-07-31 package | 305 services, 466 resources (light and dark variants), 13 group tiles, 26 categories | bundled |
| `azure` | 636 | [Azure Architecture Icons](https://learn.microsoft.com/en-us/azure/architecture/icons/) | V24 | Azure services and resources | bundled |
| `gcp` | 233 | [Google Cloud icons](https://cloud.google.com/icons) | May 2026 icon guide | 19 core product icons, 26 category icons, 188 products mapped to the icon Google assigns them | bundled |
| `k8s` | 40 | [Kubernetes icons](https://github.com/kubernetes/community/tree/master/icons) | kubernetes/community@70a4bb2 | resource kinds, control plane, infrastructure, the Kubernetes logo | bundled |
| `github` | 399 | [GitHub Octicons](https://primer.style/octicons) | @primer/octicons 19.40.0 | GitHub's own icon set | npm `@primer/octicons` |
| `ibm` | 2,776 | [IBM Carbon icons](https://carbondesignsystem.com/elements/icons/library/) | Carbon 11.89.0 | IBM's UI icons, which IBM's technical diagram guide puts in diagram nodes, including 204 IBM product glyphs (`ibm:ibm-cloud-kubernetes-service`, `ibm:watsonx-ai`) | npm `@iconify-json/carbon` |
| `logos` | 2,151 | [SVG Logos](https://github.com/gilbarbara/logos) | 1.2.16 | full-color logos of tools, languages, databases, SaaS | npm `@iconify-json/logos` |
| `si` | 3,351 | [Simple Icons](https://simpleicons.org) | 16.35.0 | one-color brand marks in the brand's color | npm `@iconify-json/simple-icons` |
| `tabler` | 6,286 | [Tabler Icons](https://tabler.io/icons) | 3.49.0 | neutral outline and filled glyphs | npm `@iconify-json/tabler` |
| `ph` | 1,527 | [Phosphor Icons](https://phosphoricons.com) | 2.1.1 | neutral glyphs with a strong business and commerce range, in six weights: the regular weight is indexed, and `-thin`, `-light`, `-bold`, `-fill` and `-duotone` resolve by suffix (`ph:handshake-duotone`) | npm `@iconify-json/ph` |

Only current artwork is in the catalog:

- Google's legacy console icons are left out; Google's guide says they should not be used as of 2026. Google now gives each core product its own icon and every other product its category's icon, and the `gcp` pack follows that list (`scripts/gcp-products.json`): `gcp:pubsub` and `gcp:dataflow` draw the Data Analytics icon, `gcp:cloud-armor` and `gcp:cloud-cdn` the Networking icon, `gcp:looker-studio` the Looker icon.
- The logo sets' unofficial redraws of cloud service icons (`logos:aws-lambda`, `si:googlebigquery` and the like) are left out; the vendors' own packs cover every one. The vendors' brand marks stay (`logos:aws`, `logos:google-cloud`, `si:googlecloud`).
- Where SVG Logos keeps a mark and its newer redesign side by side, the plain name draws the current one (`logos:google-drive` is the 2020 mark).

## Where icons load from

The bundled packs need nothing. A library pack loads the first time a diagram uses one of its icons, from the first of these that has the pinned version:

1. a `node_modules` folder above the skill (a development checkout),
2. the user cache (`%LOCALAPPDATA%\orrery` on Windows, `~/.cache/orrery` elsewhere, or `ORRERY_CACHE`),
3. jsDelivr (`https://cdn.jsdelivr.net/npm/<package>@<version>/<file>`), then unpkg; the file is cached after the first download.

Every file is checked against the SHA-256 pinned in `assets/icons/index.json`, so a render is the same everywhere. Searching and validating never download anything. Without network and without a cached copy, a render that needs a library icon fails with DG301; run `orrery icons fetch` once where there is network (and copy the cache folder, or point `ORRERY_CACHE` at it), or use an icon from a bundled pack. `orrery doctor` shows how many libraries are available offline.

## Ids

An icon id is `<pack>:<slug>`. Slugs come from the official file names, lowercased, with the vendor prefix dropped:

- AWS services: `Arch_AWS-Lambda_64.svg` -> `aws:lambda`, `Arch_Amazon-Simple-Storage-Service_64.svg` -> `aws:simple-storage-service`.
- AWS resources: `<service>-<resource>`, for example `aws:simple-storage-service-bucket`, `aws:elastic-load-balancing-application-load-balancer`, `aws:vpc-nat-gateway`. General resources keep their own names: `aws:user`, `aws:users`, `aws:client`, `aws:mobile-client`, `aws:internet`, `aws:server`, `aws:database`, `aws:office-building`.
- AWS group tiles and category icons: `aws:group-*`, `aws:category-*` (the group styles use the tiles for you).
- Azure: the service name, `azure:virtual-machine`, `azure:kubernetes-services`, `azure:azure-cosmos-db`.
- Google Cloud: the product name, `gcp:cloud-run`, `gcp:bigquery`, `gcp:gke`, `gcp:pubsub`, `gcp:cloud-load-balancing`, `gcp:secret-manager`. Category icons are `gcp:category-*`; a product that uses its category's icon is still named for the product, so the label and alt text say what it is.
- Kubernetes: the kind, `k8s:deployment`, `k8s:statefulset`, `k8s:persistentvolumeclaim`, `k8s:kube-apiserver`.
- Logo packs use their upstream names: `logos:postgresql`, `logos:redis`, `logos:kafka`, `si:apachekafka`, `logos:github-actions`.
- Phosphor: the upstream name of the regular weight, `ph:handshake`, `ph:receipt`, `ph:storefront`; add a weight to the name for the others, `ph:handshake-bold`, `ph:receipt-duotone`, `ph:storefront-fill`. Only the regular weight shows up in search.
- The spec's own SVG files: `local:<name>`, for each name under `icons:` (see [Your own icons](#your-own-icons)).

Ids are case-insensitive and `aws/lambda` or `aws.lambda` also work. When an id does not exist, validation (DG101) lists the closest real ones.

## Aliases

482 short names map to the official icons, for example:

| Alias | Icon |
| --- | --- |
| `aws:s3`, `aws:sqs`, `aws:sns`, `aws:ecs`, `aws:eks`, `aws:ecr` | the matching Amazon service |
| `aws:alb`, `aws:nlb`, `aws:nat`, `aws:igw`, `aws:tgw` | ELB load balancers and VPC gateways |
| `aws:iam`, `aws:kms`, `aws:acm`, `aws:sfn`, `aws:msk`, `aws:mwaa` | IAM, KMS, Certificate Manager, Step Functions, MSK, MWAA |
| `azure:vm`, `azure:aks`, `azure:acr`, `azure:apim`, `azure:vnet`, `azure:key-vault`, `azure:cosmos` | the matching Azure service |
| `gcp:gce`, `gcp:gcs`, `gcp:bq`, `gcp:pubsub`, `gcp:functions`, `gcp:lb` | the matching Google Cloud product |
| `k8s:deploy`, `k8s:svc`, `k8s:ing`, `k8s:cm`, `k8s:pvc`, `k8s:hpa`, `k8s:sts` | kubectl short names |
| `github:actions`, `github:copilot-logo`, `github:octocat`, `github:pr` | GitHub product marks and Octicons |

`orrery icons search` matches aliases too, so searching "s3" finds `aws:simple-storage-service`.

## The `generic:` vocabulary

Vendor-neutral names for system design, mapped to Tabler glyphs: `user`, `users`, `admin`, `client`, `browser`, `mobile`, `desktop`, `laptop`, `tablet`, `iot`, `internet`, `dns`, `cdn`, `cloud`, `server`, `servers`, `vm`, `container`, `pod`, `function`, `serverless`, `api`, `gateway`, `load-balancer` (`lb`), `router`, `switch`, `network`, `firewall`, `vpn`, `database` (`db`), `cache`, `queue`, `topic`, `stream`, `event`, `storage`, `bucket`, `file`, `files`, `document`, `search`, `analytics`, `dashboard`, `monitoring`, `logs`, `metrics`, `alert`, `notification`, `email`, `sms`, `chat`, `ai`, `ml`, `model`, `agent`, `llm`, `vector-db`, `etl`, `pipeline`, `scheduler`, `cron`, `worker`, `job`, `webhook`, `auth`, `identity`, `key`, `secret`, `certificate`, `shield`, `security`, `payment`, `git`, `repo`, `ci`, `build`, `deploy`, `registry`, `package`, `code`, `terminal`, `config`, `settings`, `office`, `datacenter`, `warehouse`, `satellite`, `wifi`, `map`.

Business and process names for flows, also Tabler glyphs:

- Orders and money: `order`, `cart`, `checkout`, `invoice`, `receipt`, `refund`, `quote`, `discount`, `tax`, `money`, `cash`, `wallet`, `budget`, `bank`, `credit-card`, `store`, `shop`.
- Goods: `inventory`, `stock`, `supplier`, `factory`, `shipping`, `delivery`, `truck`, `return`.
- People: `customer`, `lead`, `prospect`, `contact`, `deal`, `team`, `employee`, `manager`, `hr`, `recruiting`, `onboarding`, `training`.
- Sales and support: `sales`, `marketing`, `campaign`, `ticket`, `support`, `helpdesk`, `form`, `survey`, `feedback`, `rating`.
- Control: `approval`, `approve`, `reject`, `review`, `audit`, `compliance`, `legal`, `policy`, `risk`, `contract`, `signature`, `sign`, `escalation`, `handoff`, `decision`.
- Work and time: `task`, `todo`, `checklist`, `meeting`, `calendar`, `schedule`, `deadline`, `timer`, `clock`, `milestone`, `flag`, `start`, `finish`, `success`, `failure`, `warning`.
- Reporting and the rest: `report`, `chart`, `kpi`, `target`, `goal`, `idea`, `rocket`, `building`, `archive`, `print`, `mail`, `letter`.

Glyph icons (`tabler:`, `ph:`, `github:`, `generic:`, one-color `local:`) take the theme's text color, or `color:` on the node. The exception is GitHub's own mark, `github:mark-github`: GitHub's brand rules allow only black or white, so it draws black in the light theme and white in the dark one, never the grey text color. Simple Icons use the brand color, switched to the text color when the brand color would not show on the background (for example a black mark on the dark theme). A full-color logo that is black and sets no color of its own (`logos:okta-icon`, `logos:langchain-icon`) is repainted light in the dark theme, so it does not vanish.

## Choosing icons

- A vendor service always gets the vendor's icon, even in a mostly generic diagram.
- AWS diagrams: services for the main components, resource icons (bucket, table, instance, queue) when the diagram is about the resources themselves.
- IBM Cloud diagrams: `ibm:` product glyphs for IBM services and Carbon glyphs for the rest; IBM's guide asks for one icon color per diagram (black or white).
- Third-party products: `logos:` first (full color), `si:` when `logos:` lacks it.
- Concepts with no product behind them: `generic:`. Business flows: the business names above, then `ph:` or `tabler:` from `orrery icons search`.
- A step or thing only this team has (its own desk, form, machine or product): a local icon drawn to the rules below.
- Do not mix two icons for one component, and do not use one vendor's icon for another vendor's service.

## Your own icons

A spec can bring its own SVG files. Name each one under `icons:` (the path is read relative to the spec) and use it as `local:<name>`, on a node or a group header, like any pack icon:

```yaml
icons:
  order-desk: ./icons/order-desk.svg
  credit-check: ./icons/credit-check.svg
```

Then `icon: local:order-desk` on a node. [examples/local-icons-order-desk.yaml](../examples/local-icons-order-desk.yaml) is a business flow built this way; its icons are in [examples/icons/](../examples/icons/order-desk.svg).

Each file is read when the diagram renders (and when it validates):

- Refused, with the file, the problem and the fix: scripts, `<foreignObject>`, `on*` event handlers, `<style>` elements (their rules would restyle the whole diagram), links and references that leave the file (`href` that is not `#id`, `url()` that is not `url(#id)`, `javascript:`), embedded images, animation, DOCTYPE entity declarations, files over 512 KB. A diagram with such a file fails with DG111.
- Dropped: comments, metadata, title, editor namespaces (Inkscape, Sodipodi), classes, `data-` attributes. Inline `style=""` declarations become attributes.
- The viewBox is kept (or `0 0 width height` when there is none), and every id is made unique per use, so one icon can appear many times and two files can share id names.
- One-color artwork (one paint, `currentColor` included, no gradient) becomes a monochrome glyph: it takes the theme's text color or the node's `color:`, and the stage skin paints it like a Tabler glyph. Artwork in several colors keeps them; its `currentColor` parts follow the text color.

Three commands make and check them:

| Command | What it does |
| --- | --- |
| `orrery icons new <name> [--dir icons]` | writes `<dir>/<name>.svg`, a starter on the 24 grid (stroke 1.5, round caps and joins, `currentColor`) that already passes, and prints the rules and the next steps |
| `orrery icons check <file.svg> [-o sheet.png]` | measures the file against IC01 to IC10, prints every failure with its rule and fix, exits 1 when one fails, and writes a contact sheet: the icon at 48 and 24 px in classic light, classic dark, stage light and stage dark, drawn by the real renderers (`<name>.sheet.png` next to the file by default) |
| `orrery icons adopt <file.svg> --name <name> [--dir icons]` | turns an SVG from elsewhere into a clean local icon: metadata, comments, editor attributes and `<style>` rules gone, every shape a path on the 24 grid fitted into the 2 px safe area, one-color art painted with `currentColor`; then runs check. It always prints a reminder: a mark owned by someone else is theirs to publish |

## Drawing rules

Our own rules for drawing a local icon, written so an agent can follow them and `orrery icons check` can measure them. Units are on the 24 grid; the check scales other grids to it. Tabler's outline icons were measured to set the numbers.

**IC01. 24 grid with a 2 px safe area.**
- Keep it: `viewBox="0 0 24 24"`; every edge, half the stroke included, between 2 and 22.
- Rejected when: the viewBox is anything else, or a painted edge crosses 2 or 22. `icons adopt` refits a drawing.

**IC02. One stroke weight.**
- Keep it: `stroke-width="1.5"` once on the root (1.25 to 2 passes; Tabler draws at 2).
- Rejected when: two strokes have different widths, or the one width is outside 1.25 to 2. Filled artwork has no stroke and passes.

**IC03. Round caps and joins.**
- Keep it: `stroke-linecap="round" stroke-linejoin="round"` on the root.
- Rejected when: any stroke ends butt or square, or joins miter or bevel.

**IC04. currentColor only.**
- Keep it: paint with `currentColor` and `none`; set `fill="none"` (line art) or `fill="currentColor"` on the root so nothing falls back to black.
- Rejected when: a shape uses a fixed color, a gradient or a pattern, or sets no fill at all (it draws black and vanishes on the dark theme).

**IC05. No text or letters; identity by geometry.**
- Keep it: say what the thing is with its shape: a counter bell for a desk, a carton with an item dropping in for packing, a card with a check for a credit check.
- Rejected when: the file has `<text>`, or the drawing spells a letter, initials or a word (the check finds `<text>`; the sheet shows outlined letters).

**IC06. Two to six parts, silhouette first.**
- Keep it: one silhouette that reads alone, then one to five details. A part is one path, shape or subpath; a hole counts.
- Rejected when: there is one part (too bare to tell apart) or more than six (it clots at 24 px).

**IC07. Optical size matches Tabler.**
- Keep it: the larger side, stroke included, spans 16 to 20 units and the drawing's center sits within 1.5 units of 12,12, so it stands as tall as the Tabler glyphs beside it.
- Rejected when: the larger side is under 16 or over 20, or the drawing is off center.

**IC08. No detail under 1 px at 24.**
- Keep it: every stroke and every filled part at least 1 unit; a dot is a zero-length stroke with round caps.
- Rejected when: a stroke is thinner than 1, or a part is shorter or smaller than 1 unit; it disappears at 24 px.

**IC09. Adopt by rebuilding, never tracing.**
- Keep it: an icon from elsewhere is a reference; redraw it from two to six simple paths, or adopt a clean vector and fix what check reports.
- Rejected when: the file embeds a bitmap, or carries more than 80 drawing commands (traced outlines run to hundreds; Tabler's busiest outline icon has 56).

**IC10. Check passes and the sheet was looked at.**
- Keep it: `orrery icons check` exits 0 and someone opened the contact sheet and looked at all four tiles, at both sizes.
- Rejected when: any rule above fails, or the icon is handed over without its sheet being seen.

### Workflow

1. Offer two or three concepts, one line each, the object and the parts it is built from ("a counter bell: dome, base, plunger"). Wait for the pick; when there is no one to ask, pick the strongest and say which and why.
2. Draw: `orrery icons new <name>`, then replace the placeholder parts.
3. Run `orrery icons check <file>` and fix every failure it prints.
4. Look at the sheet: the 24 px tiles must still read, and the stage tiles must show the same object as the classic ones.
5. Hand over with the file path and the sheet path, and use it as `local:<name>` under `icons:`.

## Licenses and trademarks

The icons are not covered by this project's MIT license. Each pack keeps its owner's terms; see [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md) in the repository.

- AWS: "We allow customers and partners to use these toolkits and assets to create architecture diagrams" ([AWS Architecture Icons](https://aws.amazon.com/architecture/icons/)).
- Microsoft: "Microsoft permits the use of these icons in architectural diagrams, training materials, or documentation. You can copy, distribute, and display the icons only for the permitted use unless granted explicit permission by Microsoft. Microsoft reserves all other rights." Their guidelines also ask not to crop, flip, rotate or distort the icons, and not to use them to represent your own product ([Azure icons](https://learn.microsoft.com/en-us/azure/architecture/icons/)).
- Google Cloud: the official library "for your diagrams, technical documentation, and more" ([Google Cloud icons](https://cloud.google.com/icons)).
- Kubernetes icons and IBM Carbon: Apache-2.0. Octicons and Tabler: MIT. SVG Logos and Simple Icons: CC0 for the collections, while each logo stays its owner's trademark. The five npm sets are not redistributed by this repository; they load from their own npm packages. Simple Icons entries whose own license is non-commercial, no-derivatives, share-alike or GPL are left out of the `si` pack; the skipped list and the attributed ones are in `assets/icons/simple-icons-licenses.json`.

Use vendor and brand icons to refer to those products in diagrams, which is what the vendors allow; do not use them as your own logo.
