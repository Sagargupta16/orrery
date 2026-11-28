import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderModel } from "../src/render/index.ts";
import { pngBackend, renderPng } from "../src/render/png.ts";
import { parseSpec } from "../src/spec/index.ts";

const examples = join(import.meta.dirname, "../skills/orrery/examples");
const names = ["aws-data-lake", "aws-serverless-api", "aws-hybrid-landing-zone"];

let hasNative = true;
try {
  createRequire(import.meta.url).resolve("@resvg/resvg-js");
} catch {
  hasNative = false;
}

async function svgOf(name: string): Promise<string> {
  const file = join(examples, `${name}.yaml`);
  const { model } = parseSpec(readFileSync(file, "utf8"), file);
  if (!model) throw new Error(`${name} does not parse`);
  const out = await renderModel({ model, name, formats: ["svg"], themes: ["light"] });
  const svg = out.artifacts.find((a) => a.format === "svg");
  return svg?.data as string;
}

afterEach(() => {
  delete process.env.ORRERY_RESVG;
});

describe("png backend", () => {
  it("ORRERY_RESVG=wasm forces the wasm backend", async () => {
    process.env.ORRERY_RESVG = "wasm";
    expect(await pngBackend()).toBe("wasm");
  });

  it.skipIf(!hasNative)("native output equals wasm output byte for byte", async () => {
    for (const name of names) {
      const svg = await svgOf(name);
      delete process.env.ORRERY_RESVG;
      expect(await pngBackend()).toBe("native");
      const a = await renderPng(svg, { scale: 2 });
      process.env.ORRERY_RESVG = "wasm";
      const b = await renderPng(svg, { scale: 2 });
      expect(Buffer.from(a).equals(Buffer.from(b)), name).toBe(true);
    }
  });
});
