# Legibility rubric

For the legibility reviewer: can a reader take in the diagram at the width it is shown? The review PNG is the diagram at that width, one pixel per CSS pixel, so judge the PNG as it is, without zooming in. The review JSON gives `width`, `scale` (every length shrinks by it), `display` (the PNG size) and `elements` (each spec id with its box in PNG pixels).

When the display PNG is over 1568 px on a side, view the look PNG (`<base>.review.look.png`) instead. It is smaller than what readers see, so text in it looks smaller than it is: judge hierarchy, density and fit from it, and every size from the JSON (`nodeLabelPx`, `smallestTextPx`, `iconPx`). Its boxes are the `elements` boxes times look width over `display.width`.

Rule ids are LEG-nn. **[measured]** rules are checked by `orrery review`; cite their numbers, do not re-measure. **[judged]** rules are yours; cite an `elements` box for the region you mean.

Never report overlaps, crossings, cut-off content or contrast from the image: vision models get line intersections right 56.84% of the time ([VLMs are blind](https://arxiv.org/html/2407.06581)) and agree with people at 0.428 on visualization quality ([VisJudge-Bench](https://arxiv.org/abs/2510.22373)). Those come from the measurement only.

## Size at the display width

The thresholds are orrery's own, set so a diagram that fits the column keeps its 13px labels at full size; no vendor publishes a minimum.

### LEG-01 Node labels [measured: `quality.label-size`]

Node labels at 10px or more on screen. Under 10px is minor, under 8px major, under 6px a blocker. The metric is `dimensions.quality.metrics.nodeLabelPx` (label font size times `scale`).

### LEG-02 The smallest text [measured: `quality.text-size`]

Notes, edge labels, badges and group labels at 8px or more on screen; under 8px is minor, under 6px major.

### LEG-03 Icons [measured: `quality.icon-size`]

Icons at 20px or more on screen, so readers can tell services apart.

### LEG-04 Text contrast [measured: `quality.contrast`]

> "The visual presentation of text and images of text has a contrast ratio of at least 4.5:1" ([WCAG 2.2, 1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum); 3:1 for large text)

Checked for every text run in both themes against the surface under it.

When LEG-01 to LEG-03 fail, the patch is structural, not cosmetic: `set direction` so the long axis runs down the page, split the diagram into an overview plus detail diagrams, or drop nodes the brief does not need. Font sizes are not a spec field.

## Reading the picture

### LEG-05 The hierarchy reads at a glance [judged]

At the display width the title, the outermost groups and the main path are the first three things the eye finds. Flag a group header that is lost (too small, too close to another header) or a main path that does not stand out from side branches. Patch: `set layout.spacing: loose`, shorter group labels, `line: thick` on the hot path (with a legend entry).

### LEG-06 No dense knots [judged]

A region where many labels, badges and lines meet in a small area reads as noise even when nothing overlaps. Cite the `elements` boxes in that region. Patch: move a branch out (`move` in the nodes list), or shorten the labels there.

### LEG-07 Labels a reader knows, detail in notes [judged]

A label is the name readers know ("Orders queue", "Amazon SQS"); sizes, versions and counts go in `note`. Flag labels that wrap to three lines at this width, and notes that repeat the label.

### LEG-08 Empty space works for the picture [judged]

`dimensions.layout.metrics.holePct` gives the largest empty rectangle. Judge whether it reads as intended white space (between tiers) or as a gap that makes the diagram look unfinished, and propose the reorder that closes it.

### LEG-10 Peers sit side by side [judged]

Siblings go side by side; a stack of peers reads as a hierarchy. Two zones, three workers or replicas, sibling subnets or the services behind one load balancer line up across the flow, never one above another along it. Patches: `align` each peer with the first, `cols:` on their group, or `set direction`.

### LEG-09 Fit the place it is shown [judged]

Compare the PNG with where the brief says it goes: a README column, a slide, a phone. A wide strip in a README or a tall column on a slide fails the brief even when every number passes; propose the direction or split that fits.

## Lines

### LEG-11 Arrows meet what they point at [measured: `flow.arrow-short`, `grid.off-center`]

Every line ends on the face of what it meets, with no gap and not past it: an icon's tile (a line into the bottom of an icon in a vertical flow meets it below its label and note), a card or shape outline, a group border. An end outside an icon's tile, out where its label is, is major; a gap is minor (`gapPx`). Several ends on one face of an icon sit around its center about 14px apart, closer when they do not fit and never under 8px; a lone end sits on the center line (`grid.off-center` with `side` and `pitchMaxPx`). Patches: `move` the node in the nodes list so its edges arrive from fewer sides; `set layout.merge: true` so the edges of one kind share an end.

### LEG-12 Lines take the fewest bends [measured: `grid.avoidable-bend`, `grid.ragged`]

A line bends only where it must: straight when the two faces overlap, one bend into a side face when that route is clear, two at most otherwise. `grid.avoidable-bend` with `clearBends` reports a route with more bends than a clear simpler one between the same faces; layout runs the same search, so treat it as a defect to fix in the spec, not a judgement call. Icons joined by an edge in one row of a vertical flow (one column of a horizontal one) sit on one center line; `grid.ragged` with `offPx` says how far off. Patches: `move` the far end right after its source in the nodes list; give the row's nodes notes of the same number of lines.
