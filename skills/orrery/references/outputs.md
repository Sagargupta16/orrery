# Outputs

`orrery render <spec> -o <base> -f <formats>` writes `<base>.<format>`. With `--theme both` every format except HTML gets `-light` and `-dark` files; the HTML file holds both. Without `-o` the files land next to the spec; `-o some/dir/` uses the spec's name inside that folder; `-o docs/arch.png` infers the format from the extension.

Files are written atomically (temporary file, then rename), so a failed render never leaves a half-written diagram, and an error in the spec writes nothing.

A `legend:` in the spec appears in every format: a box at the bottom right with one sample line per line style, in the edge color with that style's dash and width.

## SVG

- Self-contained: icons are inlined vector paths, no external fonts, images or scripts.
- Ids are unique within the file and prefixed with the diagram name and theme (`<name>-<theme>-`), so several diagrams, or a light and a dark copy, can be inlined in one page without clashes. Gradients and clip paths inside icons are prefixed too.
- An icon that appears more than once is written once as a `<symbol>` in `<defs>` and reused with `<use>`, so a diagram with six Lambdas carries one copy of the artwork.
- Accessible: `role="img"` with `<title>` (the diagram title) and `<desc>` (a generated summary of components and connections).
- Text uses Inter when the viewer has it and falls back to Segoe UI, the system UI font, Roboto, Helvetica or Arial. Layout measures with Inter's metrics; those fallbacks are slightly narrower than Inter, so text still fits its space.
- Node, group and edge elements carry ids (`n-<id>`, `g-<id>`, `e-<n>`, after the prefix above), so the SVG can be styled or animated afterwards. Edge labels and step badges sit in their own `el-<n>` groups, drawn after every edge line so a line never paints over a label.
- Animated by default. With `animate: packets` (the default of `skin: classic`) a small dot travels every directed edge from source to target at one speed, so long edges take longer; `<->` edges carry one each way and undirected `--` lines stay still. When edges carry `step:` numbers, those run one after another in step order and the badge of each step ripples as its packet leaves, so the diagram plays the walkthrough on a loop; the other edges keep their own staggered loops. Line styles are untouched: a dashed edge stays dashed. It is SMIL (`<animateMotion>`), with no CSS and no script, and GitHub keeps it in SVGs shown as images.
- `animate: flow` draws marching dashes along every edge instead (a small CSS keyframe block); solid edges become dashed while they move. `animate: none`, or `render --static`, writes a still SVG.
- `animate: relay` (the default of `skin: stage`) runs every line on one clock: each one draws itself in turn behind a dot (a mask reveals it, so a dashed line stays dashed), its arrowhead lights when it arrives, and the node it reaches lights up on a flat tint plate; everything holds until 92% of the loop and resets by 95%. Beats follow the `step:` numbers when there are any, else the distance from the nodes nothing points at, at most eight of them, so a loop lasts about three to six seconds. The base diagram is always drawn in full underneath, so a paused or still frame shows every line.
- `skin: stage` draws its own scene for `relay` (its default) and `packets`: on one clock the groups light, then the tiles, then a packet with a comet tail runs the story (the spec's `story:` path, else a process's BPMN token or a tree's growth from its root, else the numbered edges in step order, else the longest chain of directed edges), easing in and out of every hop and pausing at each node, while the wire it travels lights up behind it; each step badge pops as its packet leaves; at most two other edges run a small packet of their own; everything holds until 90% of the loop and is gone by 94%. A still stage frame (PNG, draw.io, `animate: none`) is the held frame: everything lit, no packets.
- Stage text is Geist Mono when the viewer has it, else the system monospace font (SF Mono, Menlo, Consolas). Hairlines are one pixel wide at 880 px, the README column, and scale up for wider diagrams so they still read when the picture is shrunk to fit.

### In a README

GitHub shows SVG referenced as an image. Inline `<svg>` in Markdown is stripped, so always reference the file. For light and dark readers:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture-dark.svg">
  <img alt="Short description of the architecture" src="docs/architecture-light.svg">
</picture>
```

Plain Markdown works too: `![Architecture](docs/architecture-light.svg)`.

## PNG

- Rendered by resvg (WebAssembly) with the bundled Inter Regular and SemiBold (and Geist Mono Regular and Bold for the stage skin), so the picture is identical on every machine.
- `--scale` sets the pixel density (default 3, so a 1200 x 600 diagram becomes a 3600 x 1800 PNG that stays sharp when zoomed or projected). Use 1 or 2 for small chat previews, 4 or more for print. For pictures people will zoom into, prefer the SVG: it is vector and sharp at any zoom.
- Animation is dropped; the PNG shows the static diagram.
- Inter covers Latin, Greek and Cyrillic. For other scripts pass a font: `--font NotoSansJP-Regular.ttf` (repeatable).

## draw.io

- Opens in [diagrams.net](https://app.diagrams.net), the desktop app and the VS Code Draw.io extension.
- Groups are containers (moving a VPC moves its contents), nodes are image cells with the official icon embedded as SVG data, edges keep the computed route as waypoints and the exact attachment points, labels stay editable.
- Card nodes use draw.io's label shape (icon plus text in one cell); shape nodes map to draw.io's own shapes (cylinder, document, note, actor, hexagon, cloud...).
- Icon labels keep the line breaks the layout chose and are not wrapped again to the icon's width, so a long service name (in a left-to-right flow, say) does not stack three lines deep or run into the next icon.
- A `legend:` becomes one group cell with a line cell and a text cell per style.
- Works offline: nothing in the file points to the network.

### drawio.svg

`-f drawio.svg` writes one file that is both: the same SVG picture as `svg` (animated, embeddable in a README), with the whole draw.io model in the root element's `content` attribute and draw.io's own header, the way draw.io saves `.drawio.svg` files. Any viewer shows the picture; draw.io and the VS Code Draw.io extension open the file as the editable diagram. `-o docs/arch.drawio.svg` picks the format from the name.

## TSX

```tsx
import Architecture from "./architecture-light";

<Architecture width="100%" height="auto" aria-label="Orders API on AWS" />
```

- A React function component; props are spread onto the root `<svg>`, so `className`, `width`, `style` and event handlers work.
- Ids come from `useId()`, so the component can appear twice on a page (for example a light and a dark copy) without id clashes.
- No runtime dependencies besides React.

## HTML

A single file with no network requests: header with the title, Theme (light/dark), zoom out, zoom in, Fit, SVG download and PNG download. Drag to pan, wheel or pinch to zoom. Works from `file://` and on phones, where the buttons are 44 px tap targets. It opens in the spec's theme: dark, unless the spec sets `theme: light`.

- The SVG download is named for the theme on screen (`<name>-light.svg`, `<name>-dark.svg`) and follows the Theme button.
- The PNG download is drawn by the browser from a still copy of the diagram at 3x, so it never shows a packet frozen mid-edge, as the animated view would.

## Mermaid

`-f mmd` writes the diagram as Mermaid text, for places that draw Mermaid and nothing else (GitHub and GitLab Markdown, Notion, Obsidian, many wikis):

- An architecture becomes `architecture-beta`: groups and services, each with a `logos:` icon when Mermaid's logo pack has one for the product (otherwise a built-in icon by category or shape), edges on the sides the layout drew them, labels as `-["..."]-`.
- `kind: er` becomes `erDiagram` (attributes with PK, FK and UK, crow's foot cardinality), `kind: sequence` a `sequenceDiagram` (participants, `->>` and `-->>`, loop, alt, opt, par, break and critical blocks) and `kind: timeline` a `gantt` (a section per lane, done, active and crit tags, milestones, `after` dependencies).
- `kind: state` becomes `stateDiagram-v2` (with `[*]`, composite states and `<<choice>>`), `mindmap` a `mindmap`, `journey` a `journey` (scores -2 to 2 become 1 to 5), and flowcharts, processes and trees a `flowchart` with subgraphs, the shapes mapped and dashed, dotted and thick lines kept.
- Mermaid lays it out again with its own engine, so the picture differs from orrery's; dashed styles on architecture edges and state notes do not carry over.

## Sequence

`-f sequence.svg` draws the main path as a sequence diagram: one lifeline per node the path visits, left to right in the order it first reaches them, each with its icon, and one message per hop, in the spec's theme and skin. The path is the edges' `step:` order when they carry steps, else the longest chain of directed edges. Arrows that point back are dashed; self-loops and two-way edges are drawn as such. The file is still, with no animation.

## The spec inside the picture

Every SVG and PNG carries the spec that drew it: the SVG in `<metadata>` as escaped text (readable, and a one-line spec edit is a one-line diff), the PNG in an `iTXt` chunk named `orrery-spec`. Viewers draw neither, so the pixels are unchanged. `orrery import picture <file>` gives the spec back byte for byte, so a diagram pasted in a wiki or a slide can be edited again. `embed: false` in the spec leaves it out, for pictures that travel outside the team (notes and evidence paths stay private).

## Design documents

`orrery doc <design.md> [-o out] [-f html,md,docx] [--theme light|dark] [--skin classic|stage]` builds a document from Markdown. A line `<!-- orrery: diagrams/overview.yaml | The request path from the browser to the database -->` (path relative to the document) becomes Figure N with that caption, numbered in document order; the caption is also the alt text, and the spec's title stands in when there is none. Documents default to the light theme.

- `html`: one self-contained page, the Markdown (headings, lists, tables, code, quotes, links) converted with every text escaped, figures as inline SVG in `<figure>` with unique ids, and a print stylesheet.
- `md`: the Markdown with each marker replaced by the figure image and an italic caption line; the SVGs and 2x PNGs go to a `figures/` folder next to it. It never overwrites its own source.
- `docx`: a Word file with real headings, lists, tables, code paragraphs and the figures as inline pictures with alt text and numbered captions.
- Nothing is written unless every output is complete: a missing spec (DG401), a spec with errors, or a marker that is not on its own line (DG402) fails with exit 1.

## Receipt

`render --json` prints what was written:

```json
{
  "ok": true,
  "spec": { "path": "docs/architecture.yaml", "sha256": "..." },
  "outputs": [
    { "path": "docs/architecture.svg", "format": "svg", "theme": "light", "bytes": 21810, "sha256": "...", "width": 1716, "height": 460 },
    { "path": "docs/architecture.png", "format": "png", "theme": "light", "bytes": 113970, "sha256": "...", "width": 5148, "height": 1380 }
  ],
  "diagnostics": [],
  "stats": { "nodes": 9, "groups": 2, "edges": 9, "icons": { "aws": 9 }, "width": 1716, "height": 460 }
}
```

Exit status: 0 when the files were written, 1 when the spec has errors (or warnings with `--strict`; add `--force` to write anyway), 2 for a bad command line.
