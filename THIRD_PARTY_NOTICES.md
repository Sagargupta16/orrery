# Third-party notices

stackdraw's own code and documentation are MIT licensed ([LICENSE](LICENSE)). The icons, fonts and two runtime engines it ships belong to their owners and keep their own terms, listed here. Product names, logos and icons are trademarks of their owners; their inclusion does not imply endorsement of, or affiliation with, this project.

## Icon packs

The `aws`, `azure`, `gcp` and `k8s` packs live in `skills/stackdraw/assets/icons/` and are rebuilt from the sources below by `scripts/sync-icons.mjs` (download URLs and SHA-256 checksums are pinned in `scripts/icon-sources.json`). Their SVGs are normalized (inlined styles, prefixed ids); shapes and colors are not changed. The `github`, `ibm`, `logos`, `si` and `tabler` sets are not redistributed by this repository: only their names and search keywords are in `assets/icons/index.json`, and the renderer loads the icons from each set's own npm package at the pinned version, at render time (ids prefixed and monochrome glyphs colored as they are drawn).

| Pack | Source | Terms |
| --- | --- | --- |
| `aws` | [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/), Q3 2026 package (2026-07-31) | "We allow customers and partners to use these toolkits and assets to create architecture diagrams." AWS site terms apply. |
| `azure` | [Azure Architecture Icons](https://learn.microsoft.com/en-us/azure/architecture/icons/), V24 | "Microsoft permits the use of these icons in architectural diagrams, training materials, or documentation. You can copy, distribute, and display the icons only for the permitted use unless granted explicit permission by Microsoft. Microsoft reserves all other rights." |
| `gcp` | [Google Cloud icons](https://cloud.google.com/icons): core product icons and category icons, with products mapped to them as in Google's icon guide (the legacy console icons are not included) | The official library of Google Cloud product icons "for your diagrams, technical documentation, and more". Google brand guidelines apply. |
| `k8s` | [kubernetes/community icons](https://github.com/kubernetes/community/tree/master/icons) at 70a4bb2, and the [Kubernetes logo](https://github.com/kubernetes/kubernetes/tree/master/logo) | Apache License 2.0. Kubernetes is a registered trademark of The Linux Foundation. |
| `github` | [Primer Octicons](https://github.com/primer/octicons) 19.40.0, loaded from npm `@primer/octicons` | MIT License, Copyright (c) GitHub Inc. GitHub's [logo policy](https://github.com/logos) applies to the GitHub marks. |
| `ibm` | [IBM Carbon icons](https://github.com/carbon-design-system/carbon/tree/main/packages/icons) 11.89.0, loaded from npm `@iconify-json/carbon` 1.2.28 | Apache License 2.0, Copyright IBM Corp. IBM and watsonx are trademarks of IBM; the license grants no trademark rights. |
| `logos` | [SVG Logos](https://github.com/gilbarbara/logos) by Gil Barbara, loaded from npm `@iconify-json/logos` 1.2.15 | CC0 1.0 for the collection. Every logo remains its owner's trademark. |
| `si` | [Simple Icons](https://github.com/simple-icons/simple-icons) 16.34.0, loaded from npm `@iconify-json/simple-icons` 1.2.99 | CC0 1.0 for the collection ([disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)). Entries whose own recorded license is non-commercial, no-derivatives, share-alike, GPL, AGPL, MPL or custom are excluded. Kept entries with a recorded attribution license (CC-BY, Apache-2.0, MIT, BSD) are listed with their source in `skills/stackdraw/assets/icons/simple-icons-licenses.json` under `attributed`; the excluded ones under `skipped`. |
| `tabler` | [Tabler Icons](https://github.com/tabler/tabler-icons) 3.49.0, loaded from npm `@iconify-json/tabler` 1.2.42 | MIT License, Copyright (c) 2020-2024 Pawel Kuna. |

## Fonts

| File | Source | License |
| --- | --- | --- |
| `skills/stackdraw/assets/fonts/Inter-Regular.ttf`, `Inter-SemiBold.ttf` | [Inter 4.1](https://github.com/rsms/inter) by Rasmus Andersson | SIL Open Font License 1.1, full text in `skills/stackdraw/assets/fonts/Inter-OFL.txt`. |

## Runtime engines

Both are copied unmodified into `skills/stackdraw/scripts/vendor/` by `scripts/build.mjs`.

| File | Source | License |
| --- | --- | --- |
| `elk.bundled.cjs` | [elkjs](https://github.com/kieler/elkjs) 0.12.0, the Eclipse Layout Kernel compiled to JavaScript | Eclipse Public License 2.0 (`elk.LICENSE.md`). Source code: https://github.com/kieler/elkjs and https://github.com/eclipse-elk/elk |
| `resvg/index.mjs`, `resvg/index_bg.wasm` | [@resvg/resvg-wasm](https://github.com/thx/resvg-js) 2.6.2, built from [resvg](https://github.com/linebender/resvg) | Mozilla Public License 2.0, https://www.mozilla.org/MPL/2.0/. Source code: https://github.com/thx/resvg-js |

## Bundled into the CLI

`skills/stackdraw/scripts/stackdraw.mjs` includes [yaml](https://github.com/eemeli/yaml) 2.9.1 (ISC License, Copyright Eemeli Aro).
