# Security Policy

## What this project is

orrery ships a Markdown skill, a bundled Node.js CLI, icon catalogs, fonts and two vendored engines (ELK layout in JavaScript, resvg in WebAssembly). The CLI reads local spec files and writes local files. Its only network requests download the npm-published icon libraries (from jsDelivr or unpkg, each checked against a pinned SHA-256) the first time a diagram uses one. `orrery mcp --port` serves the commands over HTTP on 127.0.0.1 only, where specs are passed as text and nothing is read from or written to disk; a request body over 16 MB gets 413, more than 4 waiting calls get 503, and a spec is capped at 1 MB and 2000 nodes and edges. `scripts/sync-icons.mjs`, a development script, downloads the official icon packages and checks them against pinned SHA-256 checksums.

Realistic concerns:

1. **SVG is code-adjacent.** A diagram could carry script, event handlers or external references. The renderer escapes every label and attribute, inlines icons that were normalized at build time, and tests assert that no icon body contains script, `on*=` handlers, `<foreignObject>` or remote URLs.
2. **Specs are untrusted input.** A spec could try to break out of an attribute or text node, or point a node `url:` at a `javascript:` link. Labels and attributes are XML-escaped.
3. **Supply chain.** Icon packages come from the vendors' own URLs with pinned checksums; the vendored engines are unmodified copies of the published npm packages, and CI fails when the committed bundle differs from a fresh build. Workflow actions are pinned by commit SHA. The release and icon-refresh workflows run dependency code only in a job with a read-only token; the job that holds the OIDC or write token checks out and installs nothing. Renovate waits 3 days before it proposes a new release.
4. **Skill content** can instruct an agent to run commands. A tampered skill could steer an agent toward harmful actions.
5. **Files next to the input.** `orrery doc` reads specs and images only inside the git repository that holds the document (else its folder), and `orrery verify` reads evidence only inside the repository (else the spec's folder), without saying whether a file outside exists. Outputs are written through a random, exclusively created temporary file and renamed into place; a replaced file keeps its mode on POSIX, but on Windows only its read-only bit: it takes its folder's ACL, so an owner-only ACL is not kept.

## Reporting a vulnerability

Do not open a public Issue or PR. Email **sg85207@gmail.com** with the subject `[orrery security]`: what you found, how to reproduce it, the impact, and any suggested fix. Expect a first response within 7 days.

## In scope

- A spec that makes the SVG, HTML or TSX output execute script or load a remote resource when viewed.
- A spec value that escapes its attribute or text node (XML or HTML injection).
- A way to make the CLI read or write files outside the paths given on the command line.
- An icon body in the catalogs that contains active content.
- Secrets committed to the repo.
