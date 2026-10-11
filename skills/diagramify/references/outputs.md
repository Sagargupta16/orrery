# Outputs

`diagramify render <spec> -o <base> -f <formats>` writes `<base>.<format>`. With `--theme both` every format except HTML gets `-light` and `-dark` files; the HTML file holds both. Without `-o` the files land next to the spec; `-o some/dir/` uses the spec's name inside that folder; `-o docs/arch.png` infers the format from the extension.

Files are written atomically (temporary file, then rename), so a failed render never leaves a half-written diagram, and an error in the spec writes nothing.

## SVG

- Self-contained: icons are inlined vector paths, no external fonts, images or scripts.
- Ids are unique within the file, and `render` gives every icon instance its own id prefix, so gradients and clip paths never collide.
- Accessible: `role="img"` with `<title>` (the diagram title) and `<desc>` (a generated summary of components and connections).
- Text uses Inter when the viewer has it and falls back to Segoe UI, the system UI font, Roboto, Helvetica or Arial. Layout measures with Inter's metrics; those fallbacks are slightly narrower than Inter, so text still fits its space.
- Node, group and edge elements carry ids (`n-<id>`, `g-<id>`, `e-<n>`), so the SVG can be styled or animated afterwards.
- Animated by default. With `animate: packets` (the default) a small dot travels every directed edge from source to target at one speed, so long edges take longer; `<->` edges carry one each way and undirected `--` lines stay still. When edges carry `step:` numbers, those run one after another in step order and the badge of each step ripples as its packet leaves, so the diagram plays the walkthrough on a loop; the other edges keep their own staggered loops. Line styles are untouched: a dashed edge stays dashed. It is SMIL (`<animateMotion>`), with no CSS and no script, and GitHub keeps it in SVGs shown as images.
- `animate: flow` draws marching dashes along every edge instead (a small CSS keyframe block); solid edges become dashed while they move. `animate: none`, or `render --static`, writes a still SVG.

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

- Rendered by resvg (WebAssembly) with the bundled Inter Regular and SemiBold, so the picture is identical on every machine.
- `--scale` sets the pixel density (default 3, so a 1200 x 600 diagram becomes a 3600 x 1800 PNG that stays sharp when zoomed or projected). Use 1 or 2 for small chat previews, 4 or more for print. For pictures people will zoom into, prefer the SVG: it is vector and sharp at any zoom.
- Animation is dropped; the PNG shows the static diagram.
- Inter covers Latin, Greek and Cyrillic. For other scripts pass a font: `--font NotoSansJP-Regular.ttf` (repeatable).

## draw.io

- Opens in [diagrams.net](https://app.diagrams.net), the desktop app and the VS Code Draw.io extension.
- Groups are containers (moving a VPC moves its contents), nodes are image cells with the official icon embedded as SVG data, edges keep the computed route as waypoints and the exact attachment points, labels stay editable.
- Card nodes use draw.io's label shape (icon plus text in one cell); shape nodes map to draw.io's own shapes (cylinder, document, note, actor, hexagon, cloud...).
- Works offline: nothing in the file points to the network.

## TSX

```tsx
import Architecture from "./architecture-light";

<Architecture width="100%" height="auto" aria-label="Orders API on AWS" />
```

- A React function component; props are spread onto the root `<svg>`, so `className`, `width`, `style` and event handlers work.
- Ids come from `useId()`, so the component can appear twice on a page (for example a light and a dark copy) without id clashes.
- No runtime dependencies besides React.

## HTML

A single file with no network requests: header with the title, Theme (light/dark), zoom out, zoom in, Fit, SVG download and PNG download (2x, drawn by the browser). Drag to pan, wheel or pinch to zoom. Works from `file://` and on phones.

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
