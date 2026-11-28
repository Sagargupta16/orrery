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

/** The most pixels one PNG may have: resvg takes minutes and gigabytes beyond it. */
export const PNG_PIXEL_BUDGET = 40e6;

export interface PngOptions {
  /** Pixel density; the default 3 stays sharp when zoomed or projected. */
  scale?: number;
  /** Lower a scale that is over the pixel budget to fit it (the default scale always does); otherwise it is an error. */
  shrink?: boolean;
  /** Extra .ttf/.otf files for scripts Inter lacks (CJK, Devanagari...). */
  fonts?: string[];
  background?: string;
}

/**
 * The scale a canvas of this size is drawn at. The default scale (and any scale with `shrink`) is
 * lowered to stay inside the pixel budget; a scale that was asked for and does not fit is an error
 * naming the size and a scale that does.
 */
export function pngScale(width: number, height: number, scale?: number, shrink = false): number {
  const wanted = scale ?? 3;
  const area = width * height;
  if (!(area > 0) || area * wanted * wanted <= PNG_PIXEL_BUDGET) return wanted;
  const fits = Math.floor(Math.sqrt(PNG_PIXEL_BUDGET / area) * 100) / 100;
  // Never below 1: a smaller PNG is a choice for the user to make, not something to do silently.
  if ((scale === undefined || shrink) && fits >= 1) return fits;
  // A scale that was not asked for is reported at 1, the smallest it would have tried.
  const at = scale === undefined || shrink ? 1 : wanted;
  const w = Math.round(width * at);
  const h = Math.round(height * at);
  const smaller = fits >= 0.1 ? `use --scale ${fits} or less` : "export the SVG instead";
  throw new Error(
    `the PNG would be ${w}x${h} px (${Math.round((w * h) / 1e6)} MP at scale ${at}, over the ${PNG_PIXEL_BUDGET / 1e6} MP limit); ${smaller}`,
  );
}

/** The size the SVG's root element declares, which is the canvas resvg draws. */
function sizeOf(svg: string): [number, number] {
  const m = /<svg\b[^>]*?\swidth="([\d.]+)"[^>]*?\sheight="([\d.]+)"/.exec(svg.slice(0, 2000));
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

interface NativeModule {
  renderAsync(svg: string, opts: Record<string, unknown>): Promise<{ asPng(): Uint8Array }>;
}

let native: Promise<NativeModule | undefined> | undefined;

/** The native @resvg/resvg-js when it resolves (an install that got the platform binary), else undefined. */
function loadNative(): Promise<NativeModule | undefined> {
  // ORRERY_RESVG=wasm is read on every call; only the import is cached.
  if (process.env.ORRERY_RESVG === "wasm") return Promise.resolve(undefined);
  native ??= (async () => {
    try {
      const require = createRequire(import.meta.url);
      return (await import(pathToFileURL(require.resolve("@resvg/resvg-js")).href)) as NativeModule;
    } catch {
      return undefined;
    }
  })();
  return native;
}

/** Which rasterizer draws PNGs in this process: the native one when installed (about 3x faster), else the bundled wasm. */
export async function pngBackend(): Promise<"native" | "wasm"> {
  return (await loadNative()) ? "native" : "wasm";
}

export async function renderPng(svg: string, opts: PngOptions = {}): Promise<Uint8Array> {
  const scale = pngScale(...sizeOf(svg), opts.scale, opts.shrink);
  const nat = await loadNative();
  if (nat) {
    const files = [
      ...[
        "Inter-Regular.ttf",
        "Inter-SemiBold.ttf",
        "GeistMono-Regular.ttf",
        "GeistMono-Bold.ttf",
      ].map((f) => join(fontsDir, f)),
      ...(opts.fonts ?? []),
    ];
    try {
      const image = await nat.renderAsync(svg, {
        fitTo: { mode: "zoom", value: scale },
        background: opts.background,
        font: { fontFiles: files, defaultFontFamily: "Inter", loadSystemFonts: false },
        shapeRendering: 2,
        textRendering: 1,
        imageRendering: 0,
      });
      return image.asPng();
    } catch {
      // A broken platform binary, or an input the native build rejects: the wasm build draws the
      // same bytes, and when it fails too, its error (the wording callers match) is the one thrown.
    }
  }
  resvg ??= load();
  const { Resvg } = await resvg;
  const r = new Resvg(svg, {
    fitTo: { mode: "zoom", value: scale },
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
