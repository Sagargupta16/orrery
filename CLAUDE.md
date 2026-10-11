# CLAUDE.md

> This file stacks on top of the workspace root at `C:\Code\GitHub\`:
> - Root [`CLAUDE.md`](../../CLAUDE.md) -- voice, rules, routing map, references, skills, slash commands, conventions.
> - Root [`MEMORY.md`](../../MEMORY.md) -- live facts across repos.
> - Root [`STATUS.md`](../../STATUS.md) -- live PR/CI/security dashboard.
> - [`.claude/resources/`](../../.claude/resources/README.md) -- deep reference for collaboration, workflow, git, OSS, debugging, voice.
>
> Read those first. The guidance below only adds **repo-specific context** -- it does not override anything in the root.

## Project

Public Agent Skill and Claude Code plugin (`diagramify`) that turns a YAML spec into professional architecture and system design diagrams with official AWS, Azure, Google Cloud, Kubernetes and GitHub icons (plus logo and generic sets), laid out by ELK and rendered to SVG, PNG, draw.io, TSX and HTML. The CLI is bundled into the skill so it runs with no install.

Installed with `/plugin marketplace add Sagargupta16/diagramify` then `/plugin install diagramify@diagramify`, or `npx skills add Sagargupta16/diagramify`.

## Stack

- **Language**: TypeScript (ESM, Node 22+), bundled by esbuild into one `.mjs`
- **Framework**: none; ELK (elkjs, vendored) for layout, resvg (wasm, vendored) for PNG, `yaml` for parsing
- **Database**: none
- **Package manager**: pnpm (dev only; the shipped skill needs no install)
- **Deploy target**: GitHub repo + self-hosted plugin marketplace (`.claude-plugin/marketplace.json`, `source: "./"`)

## Run

```
pnpm install
node skills/diagramify/scripts/diagramify.mjs render skills/diagramify/examples/aws-serverless-api.yaml -o out/demo -f all --theme both
node skills/diagramify/scripts/diagramify.mjs icons search load balancer
pnpm build          # src/ -> skills/diagramify/scripts/diagramify.mjs + vendor/
pnpm gallery        # re-render examples/ from skills/diagramify/examples/
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

- `skills/diagramify/SKILL.md` -- the skill (fast path, authoring rules, outputs)
- `src/cli.ts` -- commands: render, validate, icons, styles, init, doctor, demo
- `src/spec.ts` -- spec parser and DG1xx diagnostics
- `src/layout.ts` -- model -> ELK graph -> Scene (every renderer consumes the Scene)
- `src/render/*.ts` -- svg, png, drawio, tsx, html
- `scripts/sync-icons.mjs` -- official packs -> `skills/diagramify/assets/icons/*.json`

## Key files

- `scripts/icon-sources.json` -- pinned vendor URLs + SHA-256; `scripts/icon-aliases.json` -- short names
- `src/styles.ts` -- group styles (AWS colors read from the official group tiles)
- `skills/diagramify/references/spec.md` -- the spec contract; keep it in sync with `src/spec.ts`
- `.claude-plugin/plugin.json` + `marketplace.json` -- versions must match `package.json` and SKILL.md

## Gotchas

- ELK layout options do not cascade: every compound node (group) needs the full option set, or its children ignore layering/placement.
- `elk.layered.considerModelOrder.strategy` crashes elkjs 0.12 with hierarchy; do not set it. `runElk` retries with simpler strategies on any throw.
- ELK ignores node and edge labels that have no `text`; always pass text even though ELK only uses the size.
- The vendored ELK file must stay `.cjs`: the repo root `package.json` is `"type": "module"`, and Node would load a `.js` copy as ESM.
- The ESM bundle needs the `createRequire` banner in `scripts/build.mjs` because `yaml` is CommonJS and requires node builtins.
- YAML flow mappings split on commas: `note: Sharp, 512 MB` inside `{...}` becomes a key; DG108 says to quote it.
- AWS `_Light`/`_Dark` resource files are named for the background they suit: `_Dark` is the white glyph for dark themes.
- `python -I` ignores `PYTHONIOENCODING`; use `sys.stdout.reconfigure(encoding="utf-8")` when printing vendor text on Windows.

## Repo-specific rules

- Everything here is public: no personal names in skill bodies (say "the user"), no home paths, no private project names. Author/owner fields are the exception.
- Never hand-edit generated files: `skills/diagramify/scripts/diagramify.mjs`, `scripts/vendor/`, `assets/icons/*.json`, `assets/fonts/metrics.json`, `examples/*.svg|png`. Change the source and regenerate.
- Every PR updates CHANGELOG.md under a concrete version and bumps package.json, both manifests and SKILL.md metadata when it releases.
- No en or em dashes anywhere; `scripts/check-repo.mjs` fails on them.
