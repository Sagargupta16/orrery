import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers.ts";

const HOOK = join(ROOT, "hooks", "validate-spec.mjs");
const dir = mkdtempSync(join(tmpdir(), "orrery-hook-"));

/** Runs the PostToolUse hook as Claude Code does: the tool call as JSON on stdin. */
function hook(name: string, text: string) {
  const file = join(dir, name);
  writeFileSync(file, text);
  const stdin = JSON.stringify({
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    tool_input: { file_path: file, content: text },
  });
  return spawnSync(process.execPath, [HOOK], { input: stdin, encoding: "utf8" });
}

describe("validate-spec hook", () => {
  it("stays silent on a clean spec", () => {
    const r = hook("ok.yaml", "nodes:\n  a: { label: A }\n  b: { label: B }\nedges:\n  - a -> b\n");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
  });

  it("feeds errors back with exit 2 and their fixes", () => {
    const r = hook("bad.yaml", "layout: { aspect: wide }\nnodes:\n  a: { label: A, rank: 0 }\n");
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/error DG116/);
    expect(r.stderr).toMatch(/error DG114/);
    expect(r.stderr).toMatch(/fix: /);
  });

  it("returns warnings as additional context", () => {
    // A dashed line with no legend entry is a warning (DG217), not an error.
    const r = hook(
      "warn.yaml",
      "nodes:\n  a: { label: A }\n  b: { label: B }\nedges:\n  - a --> b\n",
    );
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(out.hookSpecificOutput.additionalContext).toMatch(/warning DG217/);
  });

  it("ignores YAML that is not an orrery spec and files that are not YAML", () => {
    expect(hook("deploy.yaml", "apiVersion: apps/v1\nkind: Deployment\nnodes: 3\n").status).toBe(0);
    expect(hook("ci.yml", "on: push\njobs:\n  nodes:\n    runs-on: x\n").stdout).toBe("");
    expect(hook("notes.md", "nodes:\n  a: A\n").stdout).toBe("");
  });
});
