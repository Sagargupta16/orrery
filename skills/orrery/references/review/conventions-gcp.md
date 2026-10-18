# Conventions rubric: Google Cloud

Sources:

- *Google Cloud product icons* guide (PDF, updated May 2026): <https://services.google.com/fh/files/misc/google-cloud-product-icons.pdf> (Guide below). Quotes are verbatim.
- Google Cloud Architecture Center reference diagrams (the 2025 deployment archetypes), from which orrery measured its Google Cloud frame style; see `references/styles.md`.

**[measured]** rules are checked by `orrery review` (finding id given); do not re-report them. **[judged]** rules are yours: report a violation with the rule id, its quote and the spec ids. **[renderer]** rules are applied by orrery and cannot be fixed from the spec; do not report them.

## Icons

### GCP-01 Core products use their own icon [measured: `conventions.gcp-product-icon`]

> "Core products carry their own unique icons" (Guide, Core product icons)

Core products in the guide include AlloyDB, Apigee, BigQuery, Cloud Run, Cloud SQL, Cloud Storage, Compute Engine, GKE, Looker, Spanner and Hyperdisk. The measurement catches a node labelled exactly with a product name and drawn with another icon; judge the rest (a label that names a core product among other words, such as "Orders on Cloud Run", drawn with a category icon).

### GCP-02 General products use their category icon [measured: `conventions.gcp-product-icon`]

> "The same category icon will be used for multiple products across our Google Cloud portfolio" (Guide, Category product icons)
>
> "Each general product is listed under a single category." (Guide, General categories)

`orrery icons search <product> --pack gcp` returns the product entry, which already draws its category icon (Pub/Sub draws the Data Analytics icon). Flag a general product drawn with a core product's icon or with the wrong category.

### GCP-03 No legacy icons [judged]

> "Please note, these icons should not be used as of 2026." (Guide, Legacy Google Cloud)

orrery ships only the current system. Flag a Google Cloud product drawn with a third-party logo set (`logos:`, `si:`) instead of its `gcp:` icon.

### GCP-04 Current product names [judged]

> "Hyperdisk (previously Persistent Disk)" (Guide, Core product icons)

Label products with the names the guide lists (Spanner, Hyperdisk, Google Kubernetes Engine or GKE, Pub/Sub), not retired ones.

## Frames

### GCP-05 The Google Cloud frame [renderer]

Measured by orrery from Google's own archetype diagrams: the frame is filled #1a73e8 with a #1f2124 2px stroke in 6 of 6 SVGs. `gcp:cloud` draws it; do not ask for another color.

### GCP-06 Nesting [judged]

Boundaries nest as the deployment does: `gcp:cloud` > `gcp:project` > `gcp:region` > `gcp:zone`, with VPC networks and subnets inside the project. There is no vendor quote for this rule; cite it as GCP-06 with the spec ids of the groups out of order.
