// orrery mcp install: the server entry merged into each client's config file in temporary home and
// project folders, --force, the files it must leave alone, the command line run from src/, and the
// distribution manifests (server.json for the MCP Registry, mcpb/manifest.json for the MCP Bundle)
// kept in step with the package version and the MCP tools.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CLIENTS,
  InstallError,
  install,
  listClients,
  type Place,
  type Scope,
  snippet,
} from "../src/mcp/install.ts";
import { TOOLS } from "../src/mcp/tools/index.ts";
import { ROOT, SKILL_DIR } from "./helpers.ts";

const RUN = { command: "npx", args: ["-y", "@sagargupta1610/orrery", "mcp"] };

// Where each client keeps its servers, from its own docs: the file under the project (cwd) or
// the home folder, the key the servers live under, and the entry orrery adds there.
const EXPECT: Record<
  string,
  { project?: string[]; user: string[]; key: string; entry: Record<string, unknown> }
> = {
  "claude-code": {
    project: [".mcp.json"],
    user: [".claude.json"],
    key: "mcpServers",
    entry: { type: "stdio", ...RUN },
  },
  "claude-desktop": {
    user: ["AppData", "Roaming", "Claude", "claude_desktop_config.json"],
    key: "mcpServers",
    entry: RUN,
  },
  cursor: {
    project: [".cursor", "mcp.json"],
    user: [".cursor", "mcp.json"],
    key: "mcpServers",
    entry: { type: "stdio", ...RUN },
  },
  vscode: {
    project: [".vscode", "mcp.json"],
    user: ["AppData", "Roaming", "Code", "User", "mcp.json"],
    key: "servers",
    entry: { type: "stdio", ...RUN },
  },
  gemini: {
    project: [".gemini", "settings.json"],
    user: [".gemini", "settings.json"],
    key: "mcpServers",
    entry: RUN,
  },
  codex: {
    project: [".codex", "config.toml"],
    user: [".codex", "config.toml"],
    key: "mcp_servers",
    entry: { ...RUN, startup_timeout_sec: 60 },
  },
  kiro: {
    project: [".kiro", "settings", "mcp.json"],
    user: [".kiro", "settings", "mcp.json"],
    key: "mcpServers",
    entry: RUN,
  },
};

// The CLI ships no TOML parser; Python's tomllib (3.11+) checks that Codex's file still parses.
const PYTHON = ["python3", "python"].find(
  (p) => spawnSync(p, ["-c", "import tomllib"], { stdio: "ignore" }).status === 0,
);
function parseToml(file: string): Record<string, unknown> {
  const code = "import json,sys,tomllib;print(json.dumps(tomllib.load(open(sys.argv[1],'rb'))))";
  const r = spawnSync(PYTHON ?? "python3", ["-I", "-c", code, file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`not valid TOML: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

let base = "";
let count = 0;

/** A fresh home and project folder; APPDATA sits under the home as it does on Windows. */
function place(platform: NodeJS.Platform = "win32"): Place {
  const dir = join(base, String(count++));
  const p: Place = {
    home: join(dir, "home"),
    cwd: join(dir, "project"),
    platform,
    env: platform === "win32" ? { APPDATA: join(dir, "home", "AppData", "Roaming") } : {},
  };
  mkdirSync(p.home, { recursive: true });
  mkdirSync(p.cwd, { recursive: true });
  return p;
}

function seed(file: string, text: string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "orrery-install-"));
});

afterAll(() => {
  if (base) rmSync(base, { recursive: true, force: true });
});

describe("mcp install", () => {
  it("knows the seven clients", () => {
    expect(Object.keys(CLIENTS)).toEqual(Object.keys(EXPECT));
  });

  for (const [name, want] of Object.entries(EXPECT)) {
    const scopes: Scope[] = want.project ? ["project", "user"] : ["user"];
    for (const scope of scopes) {
      it.skipIf(name === "codex" && !PYTHON)(`writes ${name} ${scope} config`, () => {
        const p = place();
        const rel = scope === "project" ? (want.project ?? []) : want.user;
        const file = join(scope === "project" ? p.cwd : p.home, ...rel);
        const r = install(name, scope, p);
        expect(r).toMatchObject({ client: name, scope, path: file, action: "added" });
        const doc = name === "codex" ? parseToml(file) : readJson(file);
        expect(doc).toEqual({ [want.key]: { orrery: want.entry } });
      });
    }
  }

  it("uses each client's default scope", () => {
    const defaults = Object.fromEntries(Object.entries(CLIENTS).map(([n, c]) => [n, c.scope]));
    expect(defaults).toEqual({
      "claude-code": "project",
      "claude-desktop": "user",
      cursor: "project",
      vscode: "project",
      gemini: "project",
      codex: "user",
      kiro: "project",
    });
  });

  it("finds the per-user app folders on macOS and Linux", () => {
    const mac = place("darwin");
    const linux = place("linux");
    const files = (p: Place, n: string) => listClients(p).find((c) => c.client === n)?.files;
    expect(files(mac, "claude-desktop")).toEqual({
      user: join(
        mac.home,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      ),
    });
    expect(files(linux, "claude-desktop")).toEqual({
      user: join(linux.home, ".config", "Claude", "claude_desktop_config.json"),
    });
    expect(files(mac, "vscode")?.user).toBe(
      join(mac.home, "Library", "Application Support", "Code", "User", "mcp.json"),
    );
    expect(files(linux, "vscode")?.user).toBe(
      join(linux.home, ".config", "Code", "User", "mcp.json"),
    );
    const xdg: Place = { ...linux, env: { XDG_CONFIG_HOME: join(linux.home, "xdg") } };
    expect(files(xdg, "vscode")?.user).toBe(join(linux.home, "xdg", "Code", "User", "mcp.json"));
  });

  it("refuses a scope the client does not read", () => {
    expect(() => install("claude-desktop", "project", place())).toThrow(InstallError);
  });

  for (const name of Object.keys(EXPECT).filter((n) => n !== "codex")) {
    it(`keeps the other servers and settings in ${name}'s file`, () => {
      const p = place();
      const { key, entry } = EXPECT[name] ?? { key: "", entry: {} };
      const file = install(name, CLIENTS[name]?.scope ?? "user", p).path;
      const other = { command: "uvx", args: ["other-server"] };
      // Four-space indent, as some editors write it; the merge keeps it.
      seed(file, `${JSON.stringify({ theme: "dark", [key]: { other }, tail: [1, 2] }, null, 4)}\n`);
      expect(install(name, CLIENTS[name]?.scope ?? "user", p).action).toBe("added");
      const text = readFileSync(file, "utf8");
      expect(JSON.parse(text)).toEqual({
        theme: "dark",
        [key]: { other, orrery: entry },
        tail: [1, 2],
      });
      expect(Object.keys(JSON.parse(text)[key])).toEqual(["other", "orrery"]);
      expect(text).toMatch(/^\{\n {4}"theme"/);
    });
  }

  it("changes nothing when the same entry is there", () => {
    const p = place();
    const { path } = install("cursor", "project", p);
    const before = readFileSync(path);
    expect(install("cursor", "project", p).action).toBe("unchanged");
    expect(readFileSync(path).equals(before)).toBe(true);
  });

  it("replaces a different orrery entry only with --force", () => {
    const p = place();
    const file = join(p.cwd, ".mcp.json");
    const old = { command: "node", args: ["old/orrery.mjs", "mcp"] };
    const other = { type: "http", url: "https://example.com/mcp" };
    const text = `${JSON.stringify({ mcpServers: { orrery: old, other } }, null, 2)}\n`;
    seed(file, text);
    expect(() => install("claude-code", "project", p)).toThrow(/--force replaces it/);
    expect(readFileSync(file, "utf8")).toBe(text);
    expect(install("claude-code", "project", p, true).action).toBe("replaced");
    const doc = readJson(file);
    expect(doc.mcpServers.orrery).toEqual(EXPECT["claude-code"]?.entry);
    expect(doc.mcpServers.other).toEqual(other);
    // The replaced entry keeps its place.
    expect(Object.keys(doc.mcpServers)).toEqual(["orrery", "other"]);
  });

  it("leaves a file with comments alone and says what to paste", () => {
    const p = place();
    const file = join(p.cwd, ".vscode", "mcp.json");
    const text = '{\n  // my servers\n  "servers": {}\n}\n';
    seed(file, text);
    expect(() => install("vscode", "project", p)).toThrow(/not plain JSON[\s\S]*"servers"/);
    expect(readFileSync(file, "utf8")).toBe(text);
    expect(JSON.parse(snippet("vscode"))).toEqual({
      servers: { orrery: EXPECT.vscode?.entry },
    });
  });

  it("refuses servers that are not an object, and a file that is not one", () => {
    const p = place();
    const file = join(p.cwd, ".cursor", "mcp.json");
    seed(file, '{ "mcpServers": [] }\n');
    expect(() => install("cursor", "project", p)).toThrow(/not an object/);
    seed(file, "[]\n");
    expect(() => install("cursor", "project", p)).toThrow(/JSON object/);
  });

  it("keeps CRLF line endings and a byte order mark", () => {
    const p = place();
    const file = join(p.home, ".gemini", "settings.json");
    seed(file, '\uFEFF{\r\n  "theme": "dark"\r\n}\r\n');
    install("gemini", "user", p);
    const text = readFileSync(file, "utf8");
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text.replaceAll("\r\n", "")).not.toContain("\n");
    expect(JSON.parse(text.slice(1))).toEqual({ theme: "dark", mcpServers: { orrery: RUN } });
  });
});

describe.skipIf(!PYTHON)("mcp install codex (TOML)", () => {
  const entry = EXPECT.codex?.entry;
  const context7 = { command: "npx", args: ["-y", "@upstash/context7-mcp"] };

  it("appends the table and keeps the rest of config.toml", () => {
    const p = place();
    const file = join(p.home, ".codex", "config.toml");
    seed(
      file,
      'model = "gpt-5.5"\n\n[mcp_servers.context7]\ncommand = "npx"\nargs = ["-y", "@upstash/context7-mcp"]\n\n',
    );
    expect(install("codex", "user", p).action).toBe("added");
    expect(parseToml(file)).toEqual({
      model: "gpt-5.5",
      mcp_servers: { context7, orrery: entry },
    });
    const before = readFileSync(file, "utf8");
    expect(install("codex", "user", p).action).toBe("unchanged");
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("replaces an orrery table and its sub-tables only with --force", () => {
    const p = place();
    const file = join(p.home, ".codex", "config.toml");
    const text = [
      'model = "gpt-5.5"',
      "",
      '[mcp_servers."orrery"]',
      'command = "node"',
      'args = ["old.mjs"]',
      "",
      "[mcp_servers.orrery.env]",
      'DEBUG = "1"',
      "",
      "[mcp_servers.context7]",
      'command = "npx"',
      'args = ["-y", "@upstash/context7-mcp"]',
      "",
      "[profiles.fast]",
      'model = "gpt-5.5-mini"',
      "",
    ].join("\r\n");
    seed(file, text);
    expect(() => install("codex", "user", p)).toThrow(/different \[mcp_servers.orrery\]/);
    expect(readFileSync(file, "utf8")).toBe(text);
    expect(install("codex", "user", p, true).action).toBe("replaced");
    const out = readFileSync(file, "utf8");
    expect(out.replaceAll("\r\n", "")).not.toContain("\n");
    expect(parseToml(file)).toEqual({
      model: "gpt-5.5",
      mcp_servers: { context7, orrery: entry },
      profiles: { fast: { model: "gpt-5.5-mini" } },
    });
  });

  it("leaves servers set inline or with dotted keys alone", () => {
    const p = place();
    const file = join(p.home, ".codex", "config.toml");
    for (const text of [
      'mcp_servers = { other = { command = "x" } }\n',
      'mcp_servers.orrery.command = "x"\n',
      '[mcp_servers]\norrery = { command = "x" }\n',
    ]) {
      seed(file, text);
      expect(() => install("codex", "user", p, true)).toThrow(/inline or dotted key/);
      expect(readFileSync(file, "utf8")).toBe(text);
    }
  });
});

describe("mcp install command", () => {
  const MAIN = join(ROOT, "src", "main.ts");
  let p: Place;
  let env: NodeJS.ProcessEnv;
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, [MAIN, "mcp", "install", ...args], {
      cwd: p.cwd,
      env,
      encoding: "utf8",
    });

  beforeAll(() => {
    p = place(process.platform);
    // os.homedir() reads USERPROFILE on Windows and HOME elsewhere.
    env = {
      ...process.env,
      HOME: p.home,
      USERPROFILE: p.home,
      APPDATA: join(p.home, "AppData", "Roaming"),
      XDG_CONFIG_HOME: join(p.home, ".config"),
    };
  });

  it("writes the project config and prints a JSON receipt", () => {
    const r = cli("cursor", "--json");
    expect(r.status).toBe(0);
    const file = join(p.cwd, ".cursor", "mcp.json");
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, action: "added", path: file });
    expect(readJson(file).mcpServers.orrery).toEqual(EXPECT.cursor?.entry);
  });

  it("refuses a different entry without --force and replaces it with --force", () => {
    const file = join(p.cwd, ".cursor", "mcp.json");
    seed(file, '{ "mcpServers": { "orrery": { "command": "orrery", "args": ["mcp"] } } }\n');
    const refused = cli("cursor");
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("--force");
    const failed = cli("cursor", "--json");
    expect(failed.status).toBe(1);
    expect(JSON.parse(failed.stdout)).toMatchObject({ ok: false, client: "cursor" });
    const forced = cli("cursor", "--force");
    expect(forced.status).toBe(0);
    expect(forced.stdout).toContain(`replaced orrery in ${file}`);
    expect(readJson(file).mcpServers.orrery).toEqual(EXPECT.cursor?.entry);
  });

  it("writes the user config when asked", () => {
    const r = cli("gemini", "user", "--json");
    expect(r.status).toBe(0);
    const file = join(p.home, ".gemini", "settings.json");
    expect(JSON.parse(r.stdout).path).toBe(file);
    expect(existsSync(file)).toBe(true);
  });

  it("lists every client with its files", () => {
    const r = cli("--list", "--json");
    expect(r.status).toBe(0);
    const list = JSON.parse(r.stdout) as { client: string; files: Record<string, string> }[];
    expect(list.map((c) => c.client)).toEqual(Object.keys(EXPECT));
    expect(list.find((c) => c.client === "claude-code")?.files).toEqual({
      project: join(p.cwd, ".mcp.json"),
      user: join(p.home, ".claude.json"),
    });
    const text = cli("--list");
    expect(text.stdout).toMatch(/^claude-code {5}project \(default\)/);
  });

  it("rejects an unknown client and a scope the client lacks", () => {
    expect(cli("notepad").status).toBe(2);
    expect(cli().status).toBe(2);
    expect(cli("claude-desktop", "project").status).toBe(2);
    expect(cli("cursor", "global").status).toBe(2);
  });
});

describe("distribution manifests", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
  const server = JSON.parse(readFileSync(join(ROOT, "server.json"), "utf8"));
  const mcpb = JSON.parse(readFileSync(join(ROOT, "mcpb", "manifest.json"), "utf8"));

  it("server.json names the npm package at this version, run as orrery mcp over stdio", () => {
    expect(server.$schema).toBe(
      "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    );
    // GitHub OIDC grants io.github.<owner>/*, matched case-sensitively.
    expect(server.name).toBe("io.github.Sagargupta16/orrery");
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.version).toBe(pkg.version);
    expect(server.packages).toEqual([
      {
        registryType: "npm",
        registryBaseUrl: "https://registry.npmjs.org",
        identifier: RUN.args[1],
        version: pkg.version,
        runtimeHint: "npx",
        transport: { type: "stdio" },
        packageArguments: [{ type: "positional", value: "mcp" }],
      },
    ]);
  });

  it("mcpb/manifest.json runs the bundled CLI and lists the MCP tools", () => {
    expect(mcpb.manifest_version).toBe("0.3");
    expect(mcpb.version).toBe(pkg.version);
    expect(existsSync(join(SKILL_DIR, mcpb.server.entry_point))).toBe(true);
    expect(mcpb.server.mcp_config).toEqual({
      command: "node",
      args: [`\${__dirname}/${mcpb.server.entry_point}`, "mcp"],
    });
    expect(mcpb.tools.map((t: { name: string }) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect(mcpb.user_config).toBeUndefined();
  });
});
