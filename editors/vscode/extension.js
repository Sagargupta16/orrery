// The orrery extension: starts `orrery lsp` for YAML files, and the server answers for the ones
// that are orrery specs (a top-level `nodes:` key). CommonJS, which every extension host loads.
const { isAbsolute, resolve } = require("node:path");
const { workspace } = require("vscode");
const { LanguageClient } = require("vscode-languageclient/node");

/** @type {LanguageClient | undefined} */
let client;

/** The server command: the configured CLI, else the published package through npx. */
function serverCommand() {
  const windows = process.platform === "win32";
  let path = workspace.getConfiguration("orrery").get("server.path", "").trim();
  // npx is npx.cmd on Windows, which Node only starts through a shell.
  if (!path)
    return {
      command: "npx",
      args: ["-y", "@sagargupta1610/orrery", "lsp"],
      options: { shell: windows },
    };
  const folder = workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!isAbsolute(path) && folder) path = resolve(folder, path);
  if (/\.[cm]?js$/i.test(path)) return { command: "node", args: [path, "lsp"] };
  const shell = windows && /\.(cmd|bat)$/i.test(path);
  return { command: shell ? `"${path}"` : path, args: ["lsp"], options: { shell } };
}

function activate() {
  client = new LanguageClient("orrery", "orrery", serverCommand(), {
    documentSelector: [
      { scheme: "file", language: "yaml" },
      { scheme: "untitled", language: "yaml" },
    ],
  });
  return client.start();
}

function deactivate() {
  return client?.stop();
}

module.exports = { activate, deactivate };
