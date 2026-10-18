# CLAUDE.md

> This file stacks on top of the workspace root at `C:\Code\GitHub\`:
> - Root [`CLAUDE.md`](../../CLAUDE.md) -- voice, rules, routing map, references, skills, slash commands, conventions.
> - Root [`MEMORY.md`](../../MEMORY.md) -- live facts across repos.
> - Root [`STATUS.md`](../../STATUS.md) -- live PR/CI/security dashboard.
> - [`.claude/resources/`](../../.claude/resources/README.md) -- deep reference for collaboration, workflow, git, OSS, debugging, voice.
>
> Read those first. The guidance below only adds **repo-specific context** -- it does not override anything in the root.

## Project

Public Agent Skill and Claude Code plugin (`stackdraw`) that turns a YAML spec into professional, animated architecture and system design diagrams with official AWS, Azure, Google Cloud, Kubernetes, GitHub and IBM icons (plus logo and generic sets), laid out by ELK and rendered to SVG, PNG, draw.io, TSX and HTML. The CLI is bundled into the skill so it runs with no install. `stackdraw review` plus three reviewer agents form a measured review loop (`/stackdraw:review`).

Installed with `/plugin marketplace add Sagargupta16/stackdraw` then `/plugin install stackdraw@stackdraw`, or `npx skills add Sagargupta16/stackdraw`.

## Stack

- **Language**: TypeScript (ESM, Node 22+), bundled by esbuild into one `.mjs`
- **Framework**: none; ELK (elkjs, vendored) for layout, resvg (wasm, vendored) for PNG, `yaml` for parsing
- **Database**: none
- **Package manager**: pnpm (dev only; the shipped skill needs no install)
- **Deploy target**: GitHub repo + self-hosted plugin marketplace (`.claude-plugin/marketplace.json`, `source: "./"`)

## Run

```
pnpm install
node skills/stackdraw/scripts/stackdraw.mjs render skills/stackdraw/examples/aws-serverless-api.yaml -o out/demo -f all --theme both
node skills/stackdraw/scripts/stackdraw.mjs icons search load balancer
pnpm build          # src/ -> skills/stackdraw/scripts/stackdraw.mjs + vendor/
pnpm gallery        # re-render examples/ from skills/stackdraw/examples/
pnpm sync-icons     # rebuild icon catalogs from pinned vendor downloads (--latest re-pins)
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

- `skills/stackdraw/SKILL.md` -- the skill (fast path, authoring rules, outputs)
- `src/cli.ts` -- commands: render, validate, icons, styles, init, doctor, demo
- `src/spec.ts` -- spec parser and DG1xx diagnostics
- `src/layout.ts` -- model -> ELK graph -> Scene (every renderer consumes the Scene)
- `src/render/*.ts` -- svg, png, drawio, tsx, html
- `scripts/sync-icons.mjs` -- official packs -> `skills/stackdraw/assets/icons/*.json`; npm-published sets get only index rows and a `lib` pin
- `src/review.ts` -- `stackdraw review`: six scored dimensions at a display width; overlap findings map from `checkScene` diagnostics, so geometry rules live once in `src/check.ts`
- `agents/*.md`, `commands/review.md` -- the three read-only reviewer agents and `/stackdraw:review`; their rubrics and the loop protocol are in `skills/stackdraw/references/review/`
- `src/libraries.ts` -- loads the npm-published sets (octicons, carbon, logos, simple-icons, tabler) at render time: node_modules, then the user cache, then jsDelivr/unpkg, sha256-checked

## Key files

- `scripts/icon-sources.json` -- pinned vendor URLs + SHA-256; `scripts/icon-aliases.json` -- short names; `scripts/gcp-products.json` -- Google's product -> core/category icon list (May 2026 guide)
- `src/styles.ts` -- group styles (AWS colors read from the official group tiles)
- `skills/stackdraw/references/spec.md` -- the spec contract; keep it in sync with `src/spec.ts`
- `.claude-plugin/plugin.json` + `marketplace.json` -- versions must match `package.json` and SKILL.md

## Gotchas

- ELK layout options do not cascade: every compound node (group) needs the full option set, or its children ignore layering/placement.
- `elk.layered.considerModelOrder.strategy` crashes elkjs 0.12 inside groups: its tie-break reads the internal `modelOrder.maximum`, which nested graphs never get, so any two tied siblings throw. Spec order comes from semi-interactive crossing minimization with `elk.position` hints instead; when that layout crosses edges, the nodes on those edges are unpinned and the layout with fewer crossings wins. `runElk` caches by graph, so themes share one ELK run. `runElk` still retries simpler strategies on any throw and records the one it used in `scene.layoutFallback` (DG218).
- ELK ignores node and edge labels that have no `text`; always pass text even though ELK only uses the size.
- The vendored ELK file must stay `.cjs`: the repo root `package.json` is `"type": "module"`, and Node would load a `.js` copy as ESM.
- The ESM bundle needs the `createRequire` banner in `scripts/build.mjs` because `yaml` is CommonJS and requires node builtins.
- YAML flow mappings split on commas: `note: Sharp, 512 MB` inside `{...}` becomes a key; DG108 says to quote it.
- AWS `_Light`/`_Dark` resource files are named for the background they suit: `_Dark` is the white glyph for dark themes.
- `python -I` ignores `PYTHONIOENCODING`; use `sys.stdout.reconfigure(encoding="utf-8")` when printing vendor text on Windows.
- Library packs (`github`, `ibm`, `logos`, `si`, `tabler`) have no `<pack>.json`; `renderIcon` throws unless `loadIconLibraries` ran first (renderModel and `icons show` do it). Bumping one of those npm dev dependencies changes its sha256 pin, so re-run `pnpm sync-icons` with it.
- `layout()` can run twice: when a group's header label cannot slide clear of the edges in a vertical flow, the second pass (`opts.widen`) lays those groups out wider. Keep it single-recursion.
- SVG ids carry a `<name>-<theme>` prefix and repeated icons are `<symbol>`/`<use>` pairs; TSX swaps the prefix for `useId()`, so any new id must go through the prefix.
- SVGs animate by default (`animate: packets`, SMIL). PNG and draw.io always get a still scene (`animate: "none"`); keep it that way, resvg would draw packets at the origin.

## Repo-specific rules

- Everything here is public: no personal names in skill bodies (say "the user"), no home paths, no private project names. Author/owner fields are the exception.
- Never hand-edit generated files: `skills/stackdraw/scripts/stackdraw.mjs`, `scripts/vendor/`, `assets/icons/*.json`, `assets/fonts/metrics.json`, `examples/*.svg|png`. Change the source and regenerate.
- Every PR updates CHANGELOG.md under a concrete version and bumps package.json, both manifests and SKILL.md metadata when it releases.
- No en or em dashes anywhere; `scripts/check-repo.mjs` fails on them.
