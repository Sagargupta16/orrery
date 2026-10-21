// orrery mcp install <client> [project|user]: writes the orrery MCP server entry into a client's
// own config file (Claude Code, Claude Desktop, Cursor, VS Code, Gemini CLI, Codex, Kiro), keeping
// every other server and setting there. An orrery entry that differs is replaced only with --force.
//
// The entry runs `npx -y @sagargupta1610/orrery mcp`. None of these clients needs the Windows
// `cmd /c npx` wrapper any more: Claude Code dropped that warning as a false positive (2.1.119),
// Codex resolves npx.cmd through PATHEXT, and the rest spawn through the MCP SDK's cross-spawn.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Args } from "../cli/args.ts";
import { usage, writeAtomic } from "../cli/io.ts";

export const PACKAGE = "@sagargupta1610/orrery";
const SERVER = "orrery";
const RUN = { command: "npx", args: ["-y", PACKAGE, "mcp"] };
const BOM = "\uFEFF";

export type Scope = "project" | "user";
const SCOPES: readonly Scope[] = ["project", "user"];

/** The machine a config path is resolved for: tests pass their own. */
export interface Place {
  home: string;
  cwd: string;
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
}

interface Client {
  title: string;
  /** The scope used when the command names none. */
  scope: Scope;
  /** The config file for each scope the client reads. */
  files(p: Place): Partial<Record<Scope, string>>;
  /** The object the servers live under: a JSON key, or the TOML table prefix. */
  key: string;
  entry: Record<string, unknown>;
  toml?: boolean;
}

/** An Electron app's per-user folder: %APPDATA%, Application Support, or the XDG config. */
function appDir(p: Place, app: string): string {
  if (p.platform === "win32") return join(p.env.APPDATA ?? join(p.home, "AppData", "Roaming"), app);
  if (p.platform === "darwin") return join(p.home, "Library", "Application Support", app);
  return join(p.env.XDG_CONFIG_HOME ?? join(p.home, ".config"), app);
}

export const CLIENTS: Record<string, Client> = {
  // https://code.claude.com/docs/en/mcp: .mcp.json at the project root; user scope is the
  // top-level mcpServers of ~/.claude.json.
  "claude-code": {
    title: "Claude Code",
    scope: "project",
    files: (p) => ({ project: join(p.cwd, ".mcp.json"), user: join(p.home, ".claude.json") }),
    key: "mcpServers",
    entry: { type: "stdio", ...RUN },
  },
  // https://modelcontextprotocol.io/docs/develop/connect-local-servers
  "claude-desktop": {
    title: "Claude Desktop",
    scope: "user",
    files: (p) => ({ user: join(appDir(p, "Claude"), "claude_desktop_config.json") }),
    key: "mcpServers",
    entry: RUN,
  },
  // https://cursor.com/docs/context/mcp
  cursor: {
    title: "Cursor",
    scope: "project",
    files: (p) => ({
      project: join(p.cwd, ".cursor", "mcp.json"),
      user: join(p.home, ".cursor", "mcp.json"),
    }),
    key: "mcpServers",
    entry: { type: "stdio", ...RUN },
  },
  // https://code.visualstudio.com/docs/copilot/reference/mcp-configuration: the user file sits
  // beside settings.json in the default profile.
  vscode: {
    title: "VS Code",
    scope: "project",
    files: (p) => ({
      project: join(p.cwd, ".vscode", "mcp.json"),
      user: join(appDir(p, "Code"), "User", "mcp.json"),
    }),
    key: "servers",
    entry: { type: "stdio", ...RUN },
  },
  // https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
  gemini: {
    title: "Gemini CLI",
    scope: "project",
    files: (p) => ({
      project: join(p.cwd, ".gemini", "settings.json"),
      user: join(p.home, ".gemini", "settings.json"),
    }),
    key: "mcpServers",
    entry: RUN,
  },
  // https://developers.openai.com/codex/mcp: a project .codex/config.toml is read only in
  // trusted projects, so the user file is the default. The first npx run downloads the package,
  // which can take longer than the 10 second default start timeout.
  codex: {
    title: "Codex",
    scope: "user",
    files: (p) => ({
      project: join(p.cwd, ".codex", "config.toml"),
      user: join(p.home, ".codex", "config.toml"),
    }),
    key: "mcp_servers",
    entry: { ...RUN, startup_timeout_sec: 60 },
    toml: true,
  },
  // https://kiro.dev/docs/mcp/configuration/
  kiro: {
    title: "Kiro",
    scope: "project",
    files: (p) => ({
      project: join(p.cwd, ".kiro", "settings", "mcp.json"),
      user: join(p.home, ".kiro", "settings", "mcp.json"),
    }),
    key: "mcpServers",
    entry: RUN,
  },
};

/** The config file was left as it is: an orrery entry that differs, or a file we cannot edit. */
export class InstallError extends Error {}

export interface Installed {
  client: string;
  title: string;
  scope: Scope;
  path: string;
  action: "added" | "replaced" | "unchanged";
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function client(name: string): Client {
  const c = CLIENTS[name];
  if (!c) throw new InstallError(`unknown client "${name}"`);
  return c;
}

/** What to paste by hand when the file cannot be edited safely. */
export function snippet(name: string): string {
  return pasteable(client(name));
}

function pasteable(c: Client): string {
  return c.toml ? tomlTable(c) : JSON.stringify({ [c.key]: { [SERVER]: c.entry } }, null, 2);
}

export function install(name: string, scope: Scope, place: Place, force = false): Installed {
  const c = client(name);
  const path = c.files(place)[scope];
  if (!path) throw new InstallError(`${c.title} has no ${scope} config; it reads only ${c.scope}`);
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const merged = c.toml ? mergeToml(c, text, path, force) : mergeJson(c, text, path, force);
  if (merged.action !== "unchanged") writeAtomic(path, merged.text);
  return { client: name, title: c.title, scope, path, action: merged.action };
}

interface Merged {
  text: string;
  action: Installed["action"];
}

function mergeJson(c: Client, raw: string, path: string, force: boolean): Merged {
  const bom = raw.startsWith(BOM) ? BOM : "";
  const text = raw.slice(bom.length);
  let doc: unknown = {};
  if (text.trim()) {
    try {
      doc = JSON.parse(text);
    } catch {
      throw new InstallError(
        `${path} is not plain JSON (comments or a syntax error), so it was left as it is; add this by hand:\n${pasteable(c)}`,
      );
    }
  }
  if (!isObj(doc)) throw new InstallError(`${path} does not hold a JSON object; left as it is`);
  const servers = doc[c.key] ?? {};
  if (!isObj(servers))
    throw new InstallError(`"${c.key}" in ${path} is not an object; left as it is`);
  const before = servers[SERVER];
  let action: Merged["action"] = "added";
  if (before !== undefined) {
    if (JSON.stringify(before) === JSON.stringify(c.entry))
      return { text: raw, action: "unchanged" };
    if (!force)
      throw new InstallError(
        `${path} already has a different "${SERVER}" server: ${JSON.stringify(before)}; --force replaces it`,
      );
    action = "replaced";
  }
  // Spreading keeps an existing key where it was and appends a new one.
  doc[c.key] = { ...servers, [SERVER]: c.entry };
  const indent = text.match(/^\{[^\S\r\n]*\r?\n([ \t]+)\S/)?.[1] ?? 2;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const out = `${JSON.stringify(doc, null, indent)}\n`.replaceAll("\n", eol);
  return { text: bom + out, action };
}

// ---------------------------------------------------------------- TOML (Codex)

const tomlValue = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(tomlValue).join(", ")}]` : JSON.stringify(v);

function tomlTable(c: Client): string {
  const lines = Object.entries(c.entry).map(([k, v]) => `${k} = ${tomlValue(v)}`);
  return [`[${c.key}.${SERVER}]`, ...lines].join("\n");
}

/** A [table] or [[array]] header line; the capture is its key. */
const HEADER = /^\s*\[\[?\s*([^\]#]+?)\s*\]\]?\s*(?:#.*)?$/;
const bareKey = (key: string) => key.replace(/\s*\.\s*/g, ".").replace(/["']/g, "");
const startsKey = (key: string) => new RegExp(`^\\s*["']?${key}["']?\\s*[.=]`);

/**
 * No TOML library ships with the CLI, so the edit is by lines: the orrery table and its
 * sub-tables are found by their headers, and the new table goes at the end. A config that sets
 * the servers inline or with dotted keys is left for the user to edit.
 */
function mergeToml(c: Client, raw: string, path: string, force: boolean): Merged {
  const ours = `${c.key}.${SERVER}`;
  const byHand = `; add this by hand:\n${tomlTable(c)}`;
  const keep: string[] = [];
  const found: string[] = [];
  let table = "";
  for (const line of raw.split(/\r?\n/)) {
    const header = line.match(HEADER)?.[1];
    if (header !== undefined) table = bareKey(header);
    else if (!table && startsKey(c.key).test(line))
      throw new InstallError(`${path} sets ${c.key} with an inline or dotted key${byHand}`);
    else if (table === c.key && startsKey(SERVER).test(line))
      throw new InstallError(`${path} sets ${ours} with an inline or dotted key${byHand}`);
    (table === ours || table.startsWith(`${ours}.`) ? found : keep).push(line);
  }
  const want = tomlTable(c);
  if (found.length) {
    const had = found
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .join("\n");
    if (had === want) return { text: raw, action: "unchanged" };
    if (!force)
      throw new InstallError(
        `${path} already has a different [${ours}] table; --force replaces it:\n${had}`,
      );
  }
  while (keep.length && !keep.at(-1)?.trim()) keep.pop();
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const text = [...keep, ...(keep.length ? [""] : []), ...want.split("\n"), ""].join(eol);
  return { text, action: found.length ? "replaced" : "added" };
}

// ---------------------------------------------------------------- command

export function here(): Place {
  return { home: homedir(), cwd: process.cwd(), platform: process.platform, env: process.env };
}

/** Every client with its config file per scope on this machine, the default scope first. */
export function listClients(place: Place) {
  return Object.entries(CLIENTS).map(([name, c]) => {
    const files = c.files(place);
    const order = [c.scope, ...SCOPES.filter((s) => s !== c.scope)];
    return {
      client: name,
      title: c.title,
      default: c.scope,
      files: Object.fromEntries(order.flatMap((s) => (files[s] ? [[s, files[s]]] : []))),
    };
  });
}

export async function cmdMcpInstall(args: Args): Promise<void> {
  const json = args.flags.json === true;
  const place = here();
  const names = Object.keys(CLIENTS);
  if (args.flags.list === true) {
    const list = listClients(place);
    if (json) return void process.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
    for (const c of list) {
      let first = true;
      for (const [scope, file] of Object.entries(c.files)) {
        const label = first ? `${scope} (default)` : scope;
        process.stdout.write(`${(first ? c.client : "").padEnd(16)}${label.padEnd(19)}${file}\n`);
        first = false;
      }
    }
    return;
  }
  const [name, scopeArg, ...extra] = args._;
  if (!name) usage(`mcp install needs a client: ${names.join(", ")} (or --list)`);
  const c = CLIENTS[name];
  if (!c) usage(`unknown client "${name}"; one of ${names.join(", ")}`);
  if (extra.length) usage(`mcp install takes a client and a scope (got ${args._.join(" ")})`);
  if (scopeArg !== undefined && !SCOPES.includes(scopeArg as Scope))
    usage(`the scope must be project or user (got "${scopeArg}")`);
  const scope = (scopeArg as Scope | undefined) ?? c.scope;
  const path = c.files(place)[scope];
  if (!path) usage(`${c.title} has no ${scope} config; it reads only ${c.scope}`);
  try {
    const r = install(name, scope, place, args.flags.force === true);
    if (json) return void process.stdout.write(`${JSON.stringify({ ok: true, ...r }, null, 2)}\n`);
    const said = {
      added: `added ${SERVER} to`,
      replaced: `replaced ${SERVER} in`,
      unchanged: `${SERVER} is already in`,
    }[r.action];
    process.stdout.write(`${said} ${r.path} (${r.title}, ${scope} config)\n`);
    if (r.action !== "unchanged")
      process.stdout.write(`next: restart ${r.title} or reload its MCP servers\n`);
  } catch (e) {
    if (!(e instanceof InstallError)) throw e;
    if (json) {
      const receipt = { ok: false, client: name, scope, path, error: e.message };
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    } else process.stderr.write(`orrery: ${e.message}\n`);
    process.exitCode = 1;
  }
}
