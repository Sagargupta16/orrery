// `orrery watch`, run from source as a child process: saves, rename-style saves, icon edits and a
// broken spec, watched through the output file it keeps rewriting.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { starterIcon } from "../src/icons/local/index.ts";
import { ROOT } from "./helpers.ts";

const spec = (label: string) =>
  `icons: { box: ./box.svg }\nnodes:\n  a: { icon: "local:box", label: ${label} }\n  b: Store\nedges:\n  - a -> b\n`;

let dir = "";
let file = "";
let out = "";
let child: ChildProcess;
let stdout = "";
let stderr = "";

const output = () => (existsSync(out) ? readFileSync(out, "utf8") : "");
const runs = () => stdout.split("\n").filter((l) => / (wrote|failed) /.test(l)).length;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(what: string, check: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end || child.exitCode !== null)
      throw new Error(`gave up waiting for ${what}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    await sleep(25);
  }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "orrery-watch-"));
  file = join(dir, "flow.yaml");
  // `-o <dir>/out` names the files out.*, next to the spec, so the watch must ignore its own writes.
  out = join(dir, "out.svg");
  writeFileSync(join(dir, "box.svg"), starterIcon("box"));
  writeFileSync(file, spec("First"));
  child = spawn(
    process.execPath,
    [join(ROOT, "src", "main.ts"), "watch", file, "-o", join(dir, "out"), "-f", "svg"],
    { cwd: dir, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout?.setEncoding("utf8").on("data", (s: string) => {
    stdout += s;
  });
  child.stderr?.setEncoding("utf8").on("data", (s: string) => {
    stderr += s;
  });
  await until("the first render", () => runs() === 1 && output().includes("First"));
});

afterAll(async () => {
  // Windows keeps the folder locked until the process is gone.
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((r) => child.once("exit", r));
    child.kill();
    await exited;
  }
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
});

describe("orrery watch", () => {
  it("renders once at start and not again for its own writes", async () => {
    expect(stdout).toMatch(/^watching .*flow\.yaml; Ctrl-C to stop\n\d\d:\d\d:\d\d wrote /);
    expect(stdout).toMatch(/wrote .*out\.svg \(\d+\.\d KB\) in \d+ ms; 0 error\(s\), 0 warning/);
    await sleep(600);
    expect(runs()).toBe(1);
  });

  it("re-renders on a save, a rename-style save, the save after it and an icon edit", async () => {
    writeFileSync(file, spec("Second"));
    await until("the saved label", () => output().includes("Second"));
    // Editors that save atomically write a temp file and rename it over the spec.
    writeFileSync(`${file}.tmp`, spec("Third"));
    renameSync(`${file}.tmp`, file);
    await until("the renamed-in label", () => output().includes("Third"));
    // The rename replaced the watched file; the re-armed watch still sees plain saves.
    writeFileSync(file, spec("Fourth"));
    await until("the label saved after the rename", () => output().includes("Fourth"));
    const before = output();
    writeFileSync(
      join(dir, "box.svg"),
      starterIcon("box").replace(/<rect [^>]*\/>/, '<circle cx="12" cy="12" r="8"/>'),
    );
    await until("the edited icon", () => output() !== before && output().includes("Fourth"));
  });

  it("prints a broken spec's error and keeps watching", async () => {
    const before = runs();
    writeFileSync(file, "nodes: [unclosed\n");
    await until("the parse error", () => runs() > before && /error DG100 /.test(stderr));
    expect(stdout).toMatch(/failed in \d+ ms: 1 error\(s\), 0 warning\(s\); still watching\n$/);
    expect(child.exitCode).toBeNull();
    writeFileSync(file, spec("Fixed"));
    await until("the fixed spec", () => output().includes("Fixed"));
  });

  it.skipIf(process.platform === "win32")("exits 0 on Ctrl-C", async () => {
    const code = new Promise((r) => child.once("exit", r));
    child.kill("SIGINT");
    expect(await code).toBe(0);
  });
});
