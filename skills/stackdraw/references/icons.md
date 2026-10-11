# Icons

16,652 icons in 9 packs, all current official artwork. The four cloud packs are built from each vendor's own download by `scripts/sync-icons.mjs` (pinned by URL and SHA-256 in `scripts/icon-sources.json`; a monthly workflow re-pins newer releases) and ship inside the skill. The five sets that are published as npm libraries are not copied into the skill: they load from the library itself at render time (see [Where icons load from](#where-icons-load-from)). Every icon is drawn the same way either way: ids made unique per use, monochrome glyphs colored for the theme.

| Pack | Icons | Source | Version | What it covers | Ships |
| --- | ---: | --- | --- | --- | --- |
| `aws` | 810 | [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) | 2026-07-31 package | 305 services, 466 resources (light and dark variants), 13 group tiles, 26 categories | bundled |
| `azure` | 636 | [Azure Architecture Icons](https://learn.microsoft.com/en-us/azure/architecture/icons/) | V24 | Azure services and resources | bundled |
| `gcp` | 233 | [Google Cloud icons](https://cloud.google.com/icons) | May 2026 icon guide | 19 core product icons, 26 category icons, 188 products mapped to the icon Google assigns them | bundled |
| `k8s` | 40 | [Kubernetes icons](https://github.com/kubernetes/community/tree/master/icons) | kubernetes/community@70a4bb2 | resource kinds, control plane, infrastructure, the Kubernetes logo | bundled |
| `github` | 399 | [GitHub Octicons](https://primer.style/octicons) | @primer/octicons 19.40.0 | GitHub's own icon set | npm `@primer/octicons` |
| `ibm` | 2,776 | [IBM Carbon icons](https://carbondesignsystem.com/elements/icons/library/) | Carbon 11.89.0 | IBM's UI icons, which IBM's technical diagram guide puts in diagram nodes, including 204 IBM product glyphs (`ibm:ibm-cloud-kubernetes-service`, `ibm:watsonx-ai`) | npm `@iconify-json/carbon` |
| `logos` | 2,123 | [SVG Logos](https://github.com/gilbarbara/logos) | 1.2.15 | full-color logos of tools, languages, databases, SaaS | npm `@iconify-json/logos` |
| `si` | 3,349 | [Simple Icons](https://simpleicons.org) | 16.34.0 | one-color brand marks in the brand's color | npm `@iconify-json/simple-icons` |
| `tabler` | 6,286 | [Tabler Icons](https://tabler.io/icons) | 3.49.0 | neutral outline and filled glyphs | npm `@iconify-json/tabler` |

Only current artwork is in the catalog:

- Google's legacy console icons are left out; Google's guide says they should not be used as of 2026. Google now gives each core product its own icon and every other product its category's icon, and the `gcp` pack follows that list (`scripts/gcp-products.json`): `gcp:pubsub` and `gcp:dataflow` draw the Data Analytics icon, `gcp:cloud-armor` and `gcp:cloud-cdn` the Networking icon, `gcp:looker-studio` the Looker icon.
- The logo sets' unofficial redraws of cloud service icons (`logos:aws-lambda`, `si:googlebigquery` and the like) are left out; the vendors' own packs cover every one. The vendors' brand marks stay (`logos:aws`, `logos:google-cloud`, `si:googlecloud`).
- Where SVG Logos keeps a mark and its newer redesign side by side, the plain name draws the current one (`logos:google-drive` is the 2020 mark).

## Where icons load from

The bundled packs need nothing. A library pack loads the first time a diagram uses one of its icons, from the first of these that has the pinned version:

1. a `node_modules` folder above the skill (a development checkout),
2. the user cache (`%LOCALAPPDATA%\stackdraw` on Windows, `~/.cache/stackdraw` elsewhere, or `STACKDRAW_CACHE`),
3. jsDelivr (`https://cdn.jsdelivr.net/npm/<package>@<version>/<file>`), then unpkg; the file is cached after the first download.

Every file is checked against the SHA-256 pinned in `assets/icons/index.json`, so a render is the same everywhere. Searching and validating never download anything. Without network and without a cached copy, a render that needs a library icon fails with DG301; run `stackdraw icons fetch` once where there is network (and copy the cache folder, or point `STACKDRAW_CACHE` at it), or use an icon from a bundled pack. `stackdraw doctor` shows how many libraries are available offline.

## Ids

An icon id is `<pack>:<slug>`. Slugs come from the official file names, lowercased, with the vendor prefix dropped:

- AWS services: `Arch_AWS-Lambda_64.svg` -> `aws:lambda`, `Arch_Amazon-Simple-Storage-Service_64.svg` -> `aws:simple-storage-service`.
- AWS resources: `<service>-<resource>`, for example `aws:simple-storage-service-bucket`, `aws:elastic-load-balancing-application-load-balancer`, `aws:vpc-nat-gateway`. General resources keep their own names: `aws:user`, `aws:users`, `aws:client`, `aws:mobile-client`, `aws:internet`, `aws:server`, `aws:database`, `aws:office-building`.
- AWS group tiles and category icons: `aws:group-*`, `aws:category-*` (the group styles use the tiles for you).
- Azure: the service name, `azure:virtual-machine`, `azure:kubernetes-services`, `azure:azure-cosmos-db`.
- Google Cloud: the product name, `gcp:cloud-run`, `gcp:bigquery`, `gcp:gke`, `gcp:pubsub`, `gcp:cloud-load-balancing`, `gcp:secret-manager`. Category icons are `gcp:category-*`; a product that uses its category's icon is still named for the product, so the label and alt text say what it is.
- Kubernetes: the kind, `k8s:deployment`, `k8s:statefulset`, `k8s:persistentvolumeclaim`, `k8s:kube-apiserver`.
- Logo packs use their upstream names: `logos:postgresql`, `logos:redis`, `logos:kafka`, `si:apachekafka`, `logos:github-actions`.

Ids are case-insensitive and `aws/lambda` or `aws.lambda` also work. When an id does not exist, validation (DG101) lists the closest real ones.

## Aliases

392 short names map to the official icons, for example:

| Alias | Icon |
| --- | --- |
| `aws:s3`, `aws:sqs`, `aws:sns`, `aws:ecs`, `aws:eks`, `aws:ecr` | the matching Amazon service |
| `aws:alb`, `aws:nlb`, `aws:nat`, `aws:igw`, `aws:tgw` | ELB load balancers and VPC gateways |
| `aws:iam`, `aws:kms`, `aws:acm`, `aws:sfn`, `aws:msk`, `aws:mwaa` | IAM, KMS, Certificate Manager, Step Functions, MSK, MWAA |
| `azure:vm`, `azure:aks`, `azure:acr`, `azure:apim`, `azure:vnet`, `azure:key-vault`, `azure:cosmos` | the matching Azure service |
| `gcp:gce`, `gcp:gcs`, `gcp:bq`, `gcp:pubsub`, `gcp:functions`, `gcp:lb` | the matching Google Cloud product |
| `k8s:deploy`, `k8s:svc`, `k8s:ing`, `k8s:cm`, `k8s:pvc`, `k8s:hpa`, `k8s:sts` | kubectl short names |
| `github:actions`, `github:copilot-logo`, `github:octocat`, `github:pr` | GitHub product marks and Octicons |

`stackdraw icons search` matches aliases too, so searching "s3" finds `aws:simple-storage-service`.

## The `generic:` vocabulary

Vendor-neutral names for system design, mapped to Tabler glyphs: `user`, `users`, `admin`, `client`, `browser`, `mobile`, `desktop`, `laptop`, `tablet`, `iot`, `internet`, `dns`, `cdn`, `cloud`, `server`, `servers`, `vm`, `container`, `pod`, `function`, `serverless`, `api`, `gateway`, `load-balancer` (`lb`), `router`, `switch`, `network`, `firewall`, `vpn`, `database` (`db`), `cache`, `queue`, `topic`, `stream`, `event`, `storage`, `bucket`, `file`, `files`, `document`, `search`, `analytics`, `dashboard`, `monitoring`, `logs`, `metrics`, `alert`, `notification`, `email`, `sms`, `chat`, `ai`, `ml`, `model`, `agent`, `llm`, `vector-db`, `etl`, `pipeline`, `scheduler`, `cron`, `worker`, `job`, `webhook`, `auth`, `identity`, `key`, `secret`, `certificate`, `shield`, `security`, `payment`, `git`, `repo`, `ci`, `build`, `deploy`, `registry`, `package`, `code`, `terminal`, `config`, `settings`, `office`, `datacenter`, `warehouse`, `satellite`, `wifi`, `map`.

Glyph icons (`tabler:`, `github:`, `generic:`) take the theme's text color, or `color:` on the node. Simple Icons use the brand color, switched to the text color when the brand color would not show on the background (for example a black mark on the dark theme).

## Choosing icons

- A vendor service always gets the vendor's icon, even in a mostly generic diagram.
- AWS diagrams: services for the main components, resource icons (bucket, table, instance, queue) when the diagram is about the resources themselves.
- IBM Cloud diagrams: `ibm:` product glyphs for IBM services and Carbon glyphs for the rest; IBM's guide asks for one icon color per diagram (black or white).
- Third-party products: `logos:` first (full color), `si:` when `logos:` lacks it.
- Concepts with no product behind them: `generic:`.
- Do not mix two icons for one component, and do not use one vendor's icon for another vendor's service.

## Licenses and trademarks

The icons are not covered by this project's MIT license. Each pack keeps its owner's terms; see [THIRD_PARTY_NOTICES.md](../../../THIRD_PARTY_NOTICES.md) in the repository.

- AWS: "We allow customers and partners to use these toolkits and assets to create architecture diagrams" ([AWS Architecture Icons](https://aws.amazon.com/architecture/icons/)).
- Microsoft: "Microsoft permits the use of these icons in architectural diagrams, training materials, or documentation. You can copy, distribute, and display the icons only for the permitted use unless granted explicit permission by Microsoft. Microsoft reserves all other rights." Their guidelines also ask not to crop, flip, rotate or distort the icons, and not to use them to represent your own product ([Azure icons](https://learn.microsoft.com/en-us/azure/architecture/icons/)).
- Google Cloud: the official library "for your diagrams, technical documentation, and more" ([Google Cloud icons](https://cloud.google.com/icons)).
- Kubernetes icons and IBM Carbon: Apache-2.0. Octicons and Tabler: MIT. SVG Logos and Simple Icons: CC0 for the collections, while each logo stays its owner's trademark. The five npm sets are not redistributed by this repository; they load from their own npm packages. Simple Icons entries whose own license is non-commercial, no-derivatives, share-alike or GPL are left out of the `si` pack; the skipped list and the attributed ones are in `assets/icons/simple-icons-licenses.json`.

Use vendor and brand icons to refer to those products in diagrams, which is what the vendors allow; do not use them as your own logo.
