import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fontsDir, vendorDir } from "../paths.ts";

interface ResvgModule {
  initWasm(input: Uint8Array | ArrayBuffer): Promise<void>;
  Resvg: new (
    svg: string,
    opts: Record<string, unknown>,
  ) => { render(): { asPng(): Uint8Array; width: number; height: number } };
}

let resvg: Promise<ResvgModule> | undefined;

async function load(): Promise<ResvgModule> {
  const vendored = join(vendorDir, "resvg", "index.mjs");
  let mod: ResvgModule;
  let wasm: Buffer;
  if (existsSync(vendored)) {
    mod = (await import(pathToFileURL(vendored).href)) as ResvgModule;
    wasm = readFileSync(join(vendorDir, "resvg", "index_bg.wasm"));
  } else {
    const require = createRequire(import.meta.url);
    const entry = require.resolve("@resvg/resvg-wasm");
    mod = (await import(pathToFileURL(join(entry, "..", "index.mjs")).href)) as ResvgModule;
    wasm = readFileSync(join(entry, "..", "index_bg.wasm"));
  }
  await mod.initWasm(wasm);
  return mod;
}

let fonts: Uint8Array[] | undefined;

function fontBuffers(extra: string[]): Uint8Array[] {
  // Geist Mono is the stage skin's face.
  fonts ??= [
    "Inter-Regular.ttf",
    "Inter-SemiBold.ttf",
    "GeistMono-Regular.ttf",
    "GeistMono-Bold.ttf",
  ].map((f) => new Uint8Array(readFileSync(join(fontsDir, f))));
  return [...fonts, ...extra.map((f) => new Uint8Array(readFileSync(f)))];
}

export interface PngOptions {
  /** Pixel density; the default 3 stays sharp when zoomed or projected. */
  scale?: number;
  /** Extra .ttf/.otf files for scripts Inter lacks (CJK, Devanagari...). */
  fonts?: string[];
  background?: string;
}

export async function renderPng(svg: string, opts: PngOptions = {}): Promise<Uint8Array> {
  resvg ??= load();
  const { Resvg } = await resvg;
  const r = new Resvg(svg, {
    fitTo: { mode: "zoom", value: opts.scale ?? 3 },
    background: opts.background,
    font: {
      fontBuffers: fontBuffers(opts.fonts ?? []),
      defaultFontFamily: "Inter",
      loadSystemFonts: false,
    },
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0,
  });
  return r.render().asPng();
}
