# CLAUDE.md

> This file stacks on top of the workspace root at `C:\Code\GitHub\`:
> - Root [`CLAUDE.md`](../../CLAUDE.md) -- voice, rules, routing map, references, skills, slash commands, conventions.
> - Root [`MEMORY.md`](../../MEMORY.md) -- live facts across repos.
> - Root [`STATUS.md`](../../STATUS.md) -- live PR/CI/security dashboard.
> - [`.claude/resources/`](../../.claude/resources/README.md) -- deep reference for collaboration, workflow, git, OSS, debugging, voice.
>
> Read those first. The guidance below only adds **repo-specific context** -- it does not override anything in the root.

## Project

Public Agent Skill and Claude Code plugin (`orrery`) that turns a YAML spec into professional, animated architecture and system design diagrams with official AWS, Azure, Google Cloud, Kubernetes, GitHub and IBM icons (plus logo and generic sets), laid out by ELK and rendered to SVG, PNG, draw.io, TSX and HTML. The CLI is bundled into the skill so it runs with no install. `orrery review` plus three reviewer agents form a measured review loop (`/orrery:review`).

Installed with `/plugin marketplace add Sagargupta16/orrery` then `/plugin install orrery@orrery`, or `npx skills add Sagargupta16/orrery`; the CLI alone is `npx @sagargupta1610/orrery`.

## Stack

- **Language**: TypeScript (ESM, Node 22+), bundled by esbuild into one `.mjs`
- **Framework**: none; ELK (elkjs, vendored) for layout, resvg (wasm, vendored) for PNG, `yaml` for parsing
- **Database**: none
- **Package manager**: pnpm (dev only; the shipped skill needs no install)
- **Deploy target**: GitHub repo + self-hosted plugin marketplace (`.claude-plugin/marketplace.json`, `source: "./"`) + npm `@sagargupta1610/orrery` (published from a GitHub release by `publish.yml`)

## Run

```
pnpm install
node skills/orrery/scripts/orrery.mjs render skills/orrery/examples/aws-serverless-api.yaml -o out/demo -f all --theme both
node skills/orrery/scripts/orrery.mjs icons search load balancer
pnpm build          # src/ -> skills/orrery/scripts/orrery.mjs + vendor/
pnpm gallery        # re-render examples/ from skills/orrery/examples/
pnpm sync-icons     # rebuild icon catalogs from pinned vendor downloads and the counts the docs quote (--latest re-pins)
node scripts/pack-npm.mjs  # stage @sagargupta1610/orrery in out/npm; a GitHub release runs publish.yml
```

## Test

```
pnpm lint
pnpm typecheck
pnpm test
node scripts/build.mjs --check
node scripts/check-repo.mjs
npx -y @sagargupta1610/skillcheck lint skills
```

## Entry points

- `skills/orrery/SKILL.md` -- the skill (fast path, authoring rules, outputs)
- `src/cli.ts` -- commands: render, validate, icons, styles, init, doctor, demo
- `src/spec.ts` -- spec parser and DG1xx diagnostics
- `src/layout.ts` -- model -> ELK graph -> Scene (every renderer consumes the Scene)
- `src/render/*.ts` -- svg, png, drawio, tsx, html; `stage.ts` is the stage skin's renderer and story planner
- `src/hooks.ts` -- the extension points layout() calls; each diagram kind lives in its own module: `src/lanes.ts` + `src/render/lanes.ts` (pools and swimlanes), `src/kinds.ts` (tree, mindmap, state), `src/notation.ts` + `src/render/notation.ts` (BPMN and flowchart symbols, flow markers), `src/journey.ts` + `src/render/journey.ts` (journey grids, their own layout)
- `src/local-icons.ts` -- `icons:` SVG files: reader, sanitizer, `icons new|check|adopt` and rules IC01..IC10 (references/icons.md)
- `scripts/sync-icons.mjs` -- official packs -> `skills/orrery/assets/icons/*.json`; npm-published sets get only index rows and a `lib` pin
- `src/review.ts` -- `orrery review`: six scored dimensions at a display width; overlap findings map from `checkScene` diagnostics, so geometry rules live once in `src/check.ts`
- `agents/*.md`, `commands/review.md` -- the three read-only reviewer agents and `/orrery:review`; their rubrics and the loop protocol are in `skills/orrery/references/review/`
- `site/` -- the website at https://sagargupta.online/orrery/ (Astro 7 + Tailwind 4, separate pnpm project with its own lockfile). `site/scripts/prepare.mjs` renders every example with the built CLI into git-ignored `public/gallery/` and reads captions from `examples/README.md`, so a new example needs an entry there; `pages.yml` deploys `main`
- `src/libraries.ts` -- loads the npm-published sets (octicons, carbon, logos, simple-icons, tabler) at render time: node_modules, then the user cache, then jsDelivr/unpkg, sha256-checked

## Key files

- `scripts/icon-sources.json` -- pinned vendor URLs + SHA-256; `scripts/icon-aliases.json` -- short names; `scripts/gcp-products.json` -- Google's product -> core/category icon list (May 2026 guide)
- `src/styles.ts` -- group styles (AWS colors read from the official group tiles)
- `skills/orrery/references/spec.md` -- the spec contract; keep it in sync with `src/spec.ts`
- `.claude-plugin/plugin.json` + `marketplace.json` -- versions must match `package.json` and SKILL.md; so must the root `plugin.json` (Agent Plugins manifest for Copilot CLI and Cursor, schema allows only its listed keys) and `gemini-extension.json`

## Gotchas

- ELK layout options do not cascade: every compound node (group) needs the full option set, or its children ignore layering/placement.
- `elk.layered.considerModelOrder.strategy` crashes elkjs 0.12 inside groups: its tie-break reads the internal `modelOrder.maximum`, which nested graphs never get, so any two tied siblings throw. Spec order comes from semi-interactive crossing minimization with `elk.position` hints instead; when that layout crosses edges, the nodes on those edges are unpinned and the layout with fewer crossings wins. `runElk` caches by graph, so themes share one ELK run. `runElk` still retries simpler strategies on any throw and records the one it used in `scene.layoutFallback` (DG218).
- ELK ignores node and edge labels that have no `text`; always pass text even though ELK only uses the size.
- The vendored ELK file must stay `.cjs`: the repo root `package.json` is `"type": "module"`, and Node would load a `.js` copy as ESM.
- The ESM bundle needs the `createRequire` banner in `scripts/build.mjs` because `yaml` is CommonJS and requires node builtins.
- YAML flow mappings split on commas: `note: Sharp, 512 MB` inside `{...}` becomes a key; DG108 says to quote it.
- AWS `_Light`/`_Dark` resource files are named for the background they suit: `_Dark` is the white glyph for dark themes.
- `python -I` ignores `PYTHONIOENCODING`; use `sys.stdout.reconfigure(encoding="utf-8")` when printing vendor text on Windows.
- Library packs (`github`, `ibm`, `logos`, `si`, `tabler`, `ph`) have no `<pack>.json`; `ph` indexes only the regular weight, and `-bold`, `-duotone`, `-fill`, `-light`, `-thin` resolve in `weightOf` (src/icons.ts) from `lib.variants`; `renderIcon` throws unless `loadIconLibraries` ran first (renderModel and `icons show` do it). Bumping one of those npm dev dependencies changes its sha256 pin, so re-run `pnpm sync-icons` with it. On Renovate branches `.github/workflows/icons.yml` does that (plus `build` and `gallery`) and commits as github-actions[bot], which `renovate.json` lists in `gitIgnoredAuthors`; Renovate's hosted app cannot run build scripts itself.
- Overlay groups (`around:`) are never in the ELK graph, so an edge with an overlay end would crash ELK ("Referenced shape does not exist"). `layout()` treats such an edge as free (routed after layout, like `constraint: false`) and gives ELK hidden `<edge>__via<n>` copies to the overlay's members so it still orders the layers; `steer()` keeps the end off the overlay's header.
- `layout()` can run twice: when a group's header label cannot slide clear of the edges in a vertical flow, the second pass (`opts.widen`) lays those groups out wider, and when an overlay's header lands on a group header, the same pass (`opts.room`) gives the members' groups more top padding; the trim after ELK must keep that padding. Both go into one recursion. Keep it single-recursion.
- SVG ids carry a `<name>-<theme>` prefix and repeated icons are `<symbol>`/`<use>` pairs; TSX swaps the prefix for `useId()`, so any new id must go through the prefix.
- `skin: stage` never moves anything: `layout()` lays out as classic, `stageColors()` (`src/skins.ts`) recolors the scene so review and draw.io agree, and `renderSvg` hands the scene to `src/render/stage.ts`, which draws from the `StageInk` kit in `themes.ts`. Classic output must stay byte-identical (`gallery --check`). Vendor icons go monochrome through SVG filters picked by `iconTone()` (`glyph` keeps white artwork, `inverse` dark artwork on a white tile, `two` and `shape` are silhouettes, `mono` icons are painted directly); the luminance cutoff must stay loose enough that Chrome keeps the anti-aliased edges of thin strokes. Lit dashed lines reveal through masks with `maskUnits="userSpaceOnUse"`: a straight line has a zero-height box, which hides an objectBoundingBox mask. Biome reads a call to a function named `fit` as a focused test.
- `local:<name>` icons exist only after `loadLocalIcons(model)`, which renderModel runs before layout; parseSpec resolves `icons:` paths against the spec file's folder, so pass it the real path.
- Hooks run in `HOOKS` order: lanes, then kinds, then notation (`fitNotationEnds` moves edge ends from a box onto the drawn outline, so it must run after anything that reroutes). Pool and lane groups are hidden from ELK (`hiddenGroups`) and placed as bands in `after`; a hook that redraws edges as curves sets `AfterLayout.routing`, never `model.routing` (the model is shared by both themes).
- ELK `mrtree` throws on the free ports layout() makes when `merge` is on ("Label and node size calculator can only be used with ports that have port sides assigned"), and `fixed` needs edge sections: trees and mind maps keep `layered` with `elk.nodeSize.fixedGraphSize` and kinds.ts places every node itself.
- SVGs animate by default (`animate: packets` for classic, `relay` for stage, SMIL). PNG and draw.io always get a still scene (`animate: "none"`); keep it that way, resvg would draw packets at the origin.

## Repo-specific rules

- Everything here is public: no personal names in skill bodies (say "the user"), no home paths, no private project names. Author/owner fields are the exception.
- Never hand-edit generated files: `skills/orrery/scripts/orrery.mjs`, `scripts/vendor/`, `assets/icons/*.json`, `assets/fonts/metrics.json`, `examples/*.svg|png`. Change the source and regenerate.
- Every PR updates CHANGELOG.md under a concrete version and bumps package.json, both `.claude-plugin` manifests, `plugin.json`, `gemini-extension.json` and SKILL.md metadata when it releases.
- No en or em dashes anywhere; `scripts/check-repo.mjs` fails on them.
