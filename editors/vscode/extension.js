// The orrery extension: starts `orrery lsp` for YAML files, and the server answers for the ones
// that are orrery specs (see the README for what counts). CommonJS, which every extension host
// loads.
const { existsSync, mkdirSync } = require("node:fs");
const { delimiter, dirname, isAbsolute, join, relative, resolve } = require("node:path");
const { workspace } = require("vscode");
const { LanguageClient } = require("vscode-languageclient/node");

const WINDOWS = process.platform === "win32";

/** @type {LanguageClient | undefined} */
let client;

/**
 * The first file called `name` (with each PATHEXT ending on Windows) in a PATH folder that is
 * absolute and outside every workspace folder, so a repository cannot supply what runs.
 */
function onPath(name) {
  const folders = (workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const endings = WINDOWS ? ["", ...(process.env.PATHEXT ?? ".EXE;.CMD").split(";")] : [""];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir || !isAbsolute(dir)) continue;
    if (folders.some((f) => !relative(f, dir).startsWith(".."))) continue;
    for (const ending of endings) {
      const file = join(dir, name + ending);
      if (existsSync(file)) return file;
    }
  }
  return undefined;
}

/** A command that needs cmd.exe on Windows (a .cmd or .bat shim), as the client wants it. */
function shimmed(file, args, options) {
  return { command: `"${file}"`, args, options: { ...options, shell: true } };
}

/** The server command: the configured CLI, else the published package through npx. */
function serverCommand(cwd) {
  const options = { cwd };
  let path = workspace.getConfiguration("orrery").get("server.path", "").trim();
  if (!path) {
    const args = ["-y", "@sagargupta1610/orrery", "lsp"];
    const npx = onPath("npx");
    if (!WINDOWS) return { command: npx ?? "npx", args, options };
    // npx is npx.cmd on Windows, which Node only starts through cmd.exe; run npm's own script on
    // the node beside it instead, so no shell parses the arguments.
    const bin = npx && dirname(npx);
    const cli = bin && join(bin, "node_modules", "npm", "bin", "npx-cli.js");
    const node = bin && join(bin, "node.exe");
    if (cli && existsSync(cli) && existsSync(node))
      return { command: node, args: [cli, ...args], options };
    return npx ? shimmed(npx, args, options) : { command: "npx", args, options };
  }
  // Only a path with a folder in it (or one starting with a dot) is the workspace's; a bare
  // name such as "orrery" is looked up on PATH.
  const folder = workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (/[\\/]/.test(path) || path.startsWith(".")) {
    if (!isAbsolute(path) && folder) path = resolve(folder, path);
  } else path = onPath(path) ?? path;
  if (/\.[cm]?js$/i.test(path))
    return { command: onPath("node") ?? "node", args: [path, "lsp"], options };
  if (WINDOWS && /\.(cmd|bat)$/i.test(path)) return shimmed(path, ["lsp"], options);
  return { command: path, args: ["lsp"], options };
}

function activate(context) {
  // The server starts here, not in the workspace, so a program a repository ships under the
  // name npx or node is never the one found first.
  const cwd = context.globalStorageUri.fsPath;
  mkdirSync(cwd, { recursive: true });
  client = new LanguageClient("orrery", "orrery", serverCommand(cwd), {
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
