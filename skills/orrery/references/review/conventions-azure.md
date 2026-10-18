# Conventions rubric: Azure

Sources, quoted verbatim:

- Azure Well-Architected Framework, *Create architecture design diagrams*: <https://learn.microsoft.com/en-us/azure/well-architected/architect-role/design-diagrams> (WAF below).
- Azure Architecture Center, *Azure icons*, General guidelines: <https://learn.microsoft.com/en-us/azure/architecture/icons/> (Icons below).

**[measured]** rules are checked by `orrery review` (finding id given); do not re-report them. **[judged]** rules are yours: report a violation with the rule id, its quote and the spec ids. **[renderer]** rules are applied by orrery and cannot be fixed from the spec; do not report them.

## Lines and arrows

### AZ-01 Standard notation [judged]

> "Use widely recognized symbols, icons, and presentation conventions to ensure good readability and consistent interpretation across different audiences." (WAF)

### AZ-02 Consistent lines [judged]

> "Be consistent in how you represent these relationships throughout your diagrams." (WAF, Avoid ambiguous lines)

The same kind of relationship uses the same line style everywhere in the diagram: a dashed line that means "asynchronous" in one place must not mean "optional" in another.

### AZ-03 Always use arrows [measured: `flow.undirected`]

> "Lines without arrows make relationships unclear. Always use arrows, and when bi-directional communication exists, either show two separate flows (preferred) or annotate a single arrow with request/response notes." (WAF)

Judge what the measurement cannot: an undirected line is acceptable only when the legend says what the plain line means (for example VNet peering, which is symmetric).

### AZ-04 Avoid bidirectional arrows [measured: `flow.bidirectional`]

> "Use single-ended arrows to represent the flow from the initiating component (client) to the dependency (server)." (WAF)

Judge the direction: an arrow drawn from the dependency to the caller (the database pointing at the API) breaks this even with one head. Patch: rewrite the edge from the initiator, `{ "op": "edge", "match": "db -> api", "value": "api -> db: <action>" }`.

### AZ-05 Label lines that are not obvious [judged]

> "Label lines when relationships aren't immediately obvious from context." (WAF, Label everything clearly)

`flow.unlabelled-boundary` lists unlabelled edges that cross a boundary; decide which of them need a label (private endpoint, peering, VPN, ExpressRoute, VNet integration) and propose it.

## Icons and names

### AZ-06 Official icons and names, never recolored [measured: `conventions.icon-recolored`]

> "When representing specific technologies, always use the latest official icons and naming conventions. Don't stretch or recolor brand shapes arbitrarily." (WAF)

Judge names: a label with a retired or informal product name (for example "Azure AD" for Microsoft Entra ID, "Azure Cognitive Search" for Azure AI Search) when the catalog name differs (`orrery icons search <words> --pack azure` shows the current name).

### AZ-07 Product name next to the icon [judged]

> "In diagrams, we recommend including the product name somewhere close to the icon." (Icons, Do's)

A custom label ("Orders API") on a product icon needs the product in `note` or `label` somewhere on that node ("App Service").

### AZ-08 Icons are not cropped, flipped or distorted [renderer]

> "Don't crop, flip, or rotate icons." / "Don't distort or change icon shape in any way." (Icons, Don'ts)

### AZ-09 Microsoft icons only for Microsoft products [judged]

> "Don't use Microsoft product icons to represent your product or service." (Icons, Don'ts)

Your own service is a generic shape or glyph with its own name, not an Azure product icon.

### AZ-10 No logos for generic blocks [judged]

> "Don't substitute marketing logos for conceptual elements for example, using vendor logos for generic *API gateway* blocks." (WAF)

## Accuracy and scope

### AZ-11 Draw what is deployed [judged]

> "For example, don't depict a PaaS service inside a subnet if it's actually accessed over a private endpoint." (WAF, Be accurate)

A PaaS service (App Service, Azure SQL Database, Key Vault, Storage) reached over a private endpoint sits outside the VNet; only its private endpoint (and, for App Service, the integration interface) sits in the subnet. Patch: `set nodes.<paas>.in` to the resource group or region group, and `add` a private endpoint node in the subnet.

### AZ-12 An explicit boundary [judged]

> "always include an explicit boundary so readers don't have to infer scope." (WAF, Context diagram)

## Legend, metadata, accessibility

### AZ-13 A legend for line semantics [measured: `conventions.legend-missing`]

> "If you introduce border or line semantics, for example, solid is a synchronous call while dash is asynchronous, include a compact legend." (WAF)

### AZ-14 A title [measured: `conventions.title-missing`]

> "Include elements such as title, description, last updated date, author, version, and external references." (WAF, Include metadata)

orrery draws `title` and `subtitle`; judge whether they state purpose and scope.

### AZ-15 Contrast, and not color alone [measured: `quality.contrast`]

> "Ensure sufficient color contrast. Avoid relying solely on color to distinguish types, instead consistently pair color with pattern." (WAF, Design for accessibility)

Judge the second half: if `color:` alone separates two kinds of edges or nodes, propose a line style plus a legend entry instead.

### AZ-16 Layer, do not overload [measured: `quality.node-count`]

> "Resist the urge to encode every subsystem, data classification, and runtime path in a single diagram." (WAF, Layer, don't overload)
