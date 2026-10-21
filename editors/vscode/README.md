# orrery for VS Code

Shows orrery's diagnostics while you type a diagram spec, with the fix each one suggests, and
completes what you are typing. It is a thin client for `orrery lsp`, the language server built
into the [orrery](../../README.md) CLI; any editor that speaks the Language Server Protocol can
use the same server (see below).

A YAML file counts as a spec when it has a top-level `nodes:` key. Other YAML files (workflows,
Kubernetes manifests) get nothing from it.

## What it does

- **Diagnostics as you type.** Every finding of `orrery validate`, on the characters it is
  about: an unknown icon on its id, an unknown key on the key, a bad edge endpoint on that id
  inside the edge line. Spec errors show at once; layout warnings (edges through nodes, empty
  groups, lone nodes) follow when typing stops for 300 ms. Each message lists its fixes.
- **Quick fixes.** The fixes that are one mechanical edit become code actions (Ctrl+. or the
  light bulb): `use icon "aws:lambda"`, `rename "lable" to "label"`, `use "down"`,
  `use direction: down`, `use layout: { spacing: loose }`. A value or key fix replaces just
  that text, a setting fix writes one setting the way `orrery patch` does; comments and
  formatting stay.
- **Completion.** Icon ids after `icon:` (and in the short form `db: aws:rds`), ranked by the
  same search as `orrery icons search`; group types after `type:`; group ids after `in:` and
  `on:`, node ids after `align:`, node and group ids in edge lines; and the top-level keys.
- **Hover** on an icon id: its official name, its pack and its category.
- **Outline**: the groups and nodes of the spec.

## Install

The extension is not on the Marketplace. To try it from a checkout:

```sh
pnpm --dir editors/vscode install
code --extensionDevelopmentPath="$PWD/editors/vscode"
```

To install it for good, package it and install the `.vsix`:

```sh
cd editors/vscode
pnpm dlx @vscode/vsce package --skip-license
code --install-extension orrery-vscode-0.1.0.vsix
```

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `orrery.server.path` | empty | The CLI to run: a `.mjs` or `.js` file (run with `node`, such as `skills/orrery/scripts/orrery.mjs`) or an `orrery` executable. A relative path is read from the first workspace folder. Empty runs `npx -y @sagargupta1610/orrery lsp`, which needs Node 22 or later. |
| `orrery.trace.server` | `off` | `messages` or `verbose` logs the protocol in the orrery output channel. |

Reload the window after changing `orrery.server.path`. The extension also turns on quick
suggestions inside YAML strings (`editor.quickSuggestions`), because VS Code reads plain YAML
values as strings and would otherwise not offer completions there.

## Other editors

`orrery lsp` speaks LSP on stdin and stdout and takes no flags. Neovim 0.11:

```lua
vim.lsp.config("orrery", {
  cmd = { "npx", "-y", "@sagargupta1610/orrery", "lsp" },
  filetypes = { "yaml" },
})
vim.lsp.enable("orrery")
```

Helix (`languages.toml`):

```toml
[language-server.orrery]
command = "npx"
args = ["-y", "@sagargupta1610/orrery", "lsp"]

[[language]]
name = "yaml"
language-servers = ["yaml-language-server", "orrery"]
```
