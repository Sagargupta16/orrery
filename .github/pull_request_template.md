## Summary

<!-- 1-3 sentences: what this PR changes and why. -->

## Change type

- [ ] Renderer or layout
- [ ] Spec format or validator
- [ ] Icons (sync, aliases, group styles)
- [ ] Example or skill content
- [ ] Bug fix
- [ ] Docs / CI / tooling

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass
- [ ] `pnpm build` ran and the bundle is committed (`node scripts/build.mjs --check` passes)
- [ ] `pnpm gallery` ran if rendering changed, and the new PNGs were looked at
- [ ] `node scripts/check-repo.mjs` passes
- [ ] CHANGELOG.md entry under a concrete version; version bumped in package.json, both `.claude-plugin/*.json` files and SKILL.md when releasing
- [ ] No en or em dashes, no absolute home paths, no secrets
