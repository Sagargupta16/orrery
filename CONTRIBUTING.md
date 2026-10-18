# Contributing to orrery

Thanks for helping. orrery is one skill with a bundled CLI: a spec parser and validator, an ELK layout, renderers for SVG, PNG, draw.io, TSX and HTML, and icon catalogs rebuilt from the vendors' own downloads. Contributions that make diagrams read better, cover more real architectures or catch more mistakes are the most welcome.

## Setup

```bash
git clone https://github.com/Sagargupta16/orrery
cd orrery
pnpm install
```

Node.js 22 or newer and pnpm (the version in `package.json` `packageManager`).

## Layout of the repo

| Path | What |
| --- | --- |
| `src/` | TypeScript source: `spec.ts` (parse + validate), `icons.ts` (catalog, aliases, search), `libraries.ts` (logo and glyph sets loaded from npm at render time), `layout.ts` (ELK), `check.ts` (composition warnings), `render/` (one file per format), `cli.ts`. |
| `skills/orrery/` | What ships: `SKILL.md`, `references/`, `examples/` (specs), `assets/` (icons, fonts), `scripts/orrery.mjs` (the built CLI) and `scripts/vendor/` (ELK, resvg). Generated files here are committed so the skill runs without an install. |
| `scripts/` | Development scripts: `build.mjs`, `sync-icons.mjs`, `build-fonts.mjs`, `gallery.mjs`, `check-repo.mjs`, plus `icon-sources.json` (pinned downloads) and `icon-aliases.json`. |
| `examples/` | The gallery: SVG and PNG for every spec in `skills/orrery/examples/`. |
| `tests/` | Vitest suite. |

## Before you open a PR

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm gallery
node scripts/check-repo.mjs
```

CI runs the same commands. `pnpm build` regenerates `skills/orrery/scripts/orrery.mjs`; commit it (CI fails when it is stale). `pnpm gallery` re-renders the examples; look at the PNGs it changed before committing, and commit them (`check-repo.mjs` fails when the gallery does not match the renderer).

## Changing the renderer or layout

1. Change `src/`, then `pnpm build`.
2. Run `pnpm gallery` and open every PNG that changed. A layout change is only an improvement if the gallery reads better.
3. Keep output deterministic: the same spec must give byte-identical SVG, PNG and draw.io output (tests check it).
4. Never put a literal color in a renderer; take it from `src/themes.ts` or the group style.

## Icons

- New vendor release: `node scripts/sync-icons.mjs --latest` finds the newest official packages, re-pins their URLs and checksums in `scripts/icon-sources.json` (the Kubernetes icons move to the newest commit that touched them), rebuilds the catalogs and rewrites the counts and versions the docs quote. Nobody needs to run it by hand: Renovate opens one grouped dependency PR a month, and `.github/workflows/icons.yml` runs on that branch, syncs the icons, rebuilds the CLI and the gallery, commits the result and starts CI, so the PR auto-merges when it is green.
- A short name people type (`aws:sqs`): add it to `scripts/icon-aliases.json` and re-run `node scripts/sync-icons.mjs`; it fails if an alias points nowhere or hides a real icon.
- A new pack: add a builder to `sync-icons.mjs`, its terms to `THIRD_PARTY_NOTICES.md`, and only include it if its license allows use in diagrams. A set that is published on npm becomes a library pack (set `pack.lib` in the builder, add the package as a dev dependency): the catalog keeps names and keywords and the renderer loads the icons from npm. Only vendor packs that exist solely as downloads are bundled.

## Group styles

Group styles live in `src/styles.ts`. Every value needs a source (the vendor's icon package, deck or published diagrams); record it in `skills/orrery/references/styles.md`.

## Examples

An example is a spec in `skills/orrery/examples/<name>.yaml` (it doubles as an `init` template) plus its rendered `examples/<name>.svg` and `.png`. It must validate with `--strict`, which also fails on DG217: every non-solid line style the spec uses (dashed, dotted, thick) needs an entry in `legend:`. It must use only real icon ids, and read like a diagram you would put in official documentation.

## Skill content

- Frontmatter: `name` equals the folder name; `description` is a `>-` folded block with "Use when" triggers and no unquoted `: ` inside. `npx -y @sagargupta1610/skillcheck lint skills` must report 0 errors.
- Keep `SKILL.md` under 500 lines; depth goes in `references/`.
- YAML examples in the docs that have `nodes:` are validated by `check-repo.mjs`, so they must be real specs.
- Write "the user", not a person's name. No absolute home paths.

## Style

- No en or em dash characters anywhere (use `-` or `--`). `check-repo.mjs` fails on them.
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- CHANGELOG entries go under a concrete version (`## [0.2.0] - YYYY-MM-DD`), never "Unreleased". Releases bump the version in `package.json`, both `.claude-plugin/*.json` files, the root `plugin.json` (Agent Plugins, read by Copilot CLI and Cursor), `gemini-extension.json` and `SKILL.md` metadata; `check-repo.mjs` fails when one differs. Publishing a GitHub release `v<version>` runs `.github/workflows/publish.yml`, which stages the skill folder with `scripts/pack-npm.mjs` and publishes it to npm as `@sagargupta1610/orrery`.
