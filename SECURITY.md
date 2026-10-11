# Security Policy

## What this project is

stackdraw ships a Markdown skill, a bundled Node.js CLI, icon catalogs, fonts and two vendored engines (ELK layout in JavaScript, resvg in WebAssembly). It has no server. The CLI reads a local spec file and writes local files; it makes no network requests. `scripts/sync-icons.mjs`, a development script, downloads the official icon packages and checks them against pinned SHA-256 checksums.

Realistic concerns:

1. **SVG is code-adjacent.** A diagram could carry script, event handlers or external references. The renderer escapes every label and attribute, inlines icons that were normalized at build time, and tests assert that no icon body contains script, `on*=` handlers, `<foreignObject>` or remote URLs.
2. **Specs are untrusted input.** A spec could try to break out of an attribute or text node, or point a node `url:` at a `javascript:` link. Labels and attributes are XML-escaped.
3. **Supply chain.** Icon packages come from the vendors' own URLs with pinned checksums; the vendored engines are unmodified copies of the published npm packages, and CI fails when the committed bundle differs from a fresh build.
4. **Skill content** can instruct an agent to run commands. A tampered skill could steer an agent toward harmful actions.

## Reporting a vulnerability

Do not open a public Issue or PR. Email **sg85207@gmail.com** with the subject `[stackdraw security]`: what you found, how to reproduce it, the impact, and any suggested fix. Expect a first response within 7 days.

## In scope

- A spec that makes the SVG, HTML or TSX output execute script or load a remote resource when viewed.
- A spec value that escapes its attribute or text node (XML or HTML injection).
- A way to make the CLI read or write files outside the paths given on the command line.
- An icon body in the catalogs that contains active content.
- Secrets committed to the repo.
