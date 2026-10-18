// Every example spec doubles as an `init` template, so each must validate. Works with any number
// of examples, including none.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderModel } from "../src/render/index.ts";
import { parseSpec } from "../src/spec.ts";
import type { Diagnostic } from "../src/types.ts";
import { EXAMPLES_DIR, listDiagnostics } from "./helpers.ts";

const files = existsSync(EXAMPLES_DIR)
  ? readdirSync(EXAMPLES_DIR)
      .filter((f) => /\.ya?ml$/i.test(f))
      .sort()
  : [];

/** What `orrery validate` reports: parse diagnostics plus the layout checks. */
async function validate(file: string): Promise<Diagnostic[]> {
  const parsed = parseSpec(readFileSync(join(EXAMPLES_DIR, file), "utf8"), file);
  if (!parsed.model) return parsed.diagnostics;
  const rendered = await renderModel({
    model: parsed.model,
    formats: ["svg"],
    themes: [parsed.model.theme],
    name: file,
  });
  return [...parsed.diagnostics, ...rendered.diagnostics];
}

describe("examples", () => {
  if (!files.length) it.skip("no example specs yet", () => {});

  it.each(files)("%s validates with 0 errors", async (file) => {
    const errors = (await validate(file)).filter((d) => d.severity === "error");
    expect(listDiagnostics(errors)).toBe("");
  });

  // CONTRIBUTING.md: an example "must validate with --strict".
  it.each(files)("%s has no warnings (--strict)", async (file) => {
    expect(listDiagnostics(await validate(file))).toBe("");
  });
});
