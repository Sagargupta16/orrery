// The playground's renderer: orrery's own parser, layout, renderers and review, bundled for a Web
// Worker by scripts/build-browser.mjs. Node's fs, path and friends are shims over an in-memory file
// system (shims/fs.ts) that this file fills from the site: the icon catalogs, the font metrics and
// the example icons come from play/skill/, the npm icon libraries from jsDelivr (unpkg as a
// fallback), each checked against its pinned sha256 with SubtleCrypto before it is used.
import { iconInfo, packInfo } from "../../../../src/icons/index.ts";
import { cachePath, LibraryError, type LibrarySource, libraryUrls } from "../../../../src/icons/libraries.ts";
import { LocalIconError } from "../../../../src/icons/local/index.ts";
import { embedPngSpec } from "../../../../src/render/embed.ts";
import { renderModel } from "../../../../src/render/index.ts";
import { renderSvg } from "../../../../src/render/svg.ts";
import { reviewModel } from "../../../../src/review/index.ts";
import { parseSpec } from "../../../../src/spec/index.ts";
import type { Diagnostic, Model, Skin, ThemeName } from "../../../../src/types.ts";
import { fetchable, isKnown, provide, provided, takeMisses } from "./shims/fs.ts";
import { recordDigest } from "./shims/node.ts";

declare const __ORRERY_VERSION__: string;

export interface RenderJob {
  id: number;
  kind: "render";
  spec: string;
  name: string;
  theme?: ThemeName;
  skin?: Skin;
  /** Review width in CSS px. */
  width: number;
}
interface StillJob {
  id: number;
  kind: "still";
  spec: string;
  name: string;
  theme?: ThemeName;
  skin?: Skin;
}
interface EmbedJob {
  id: number;
  kind: "embed";
  spec: string;
  png: Uint8Array;
}
interface ReviewJob {
  id: number;
  kind: "review";
  model: Model;
  diagnostics: Diagnostic[];
  name: string;
  theme: ThemeName;
  skin?: Skin;
  width: number;
}
type Job = RenderJob | StillJob | EmbedJob | ReviewJob;

const scope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<Job>) => void) | null;
  location: Location;
};
const base = new URL(".", scope.location.href);
const post = (message: Record<string, unknown>, transfer: Transferable[] = []) =>
  scope.postMessage(message, transfer);

// The icon libraries the catalog pins, by the cache path the renderer reads them from.
const libraries = new Map<string, LibrarySource>();
const inflight = new Map<string, Promise<void>>();

async function fetchBytes(url: string | URL): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function fetchLibrary(path: string, src: LibrarySource): Promise<void> {
  post({ kind: "status", text: `Loading ${src.npm} (${(src.bytes / 1e6).toFixed(1)} MB) from jsDelivr` });
  const problems: string[] = [];
  for (const url of libraryUrls(src)) {
    try {
      const bytes = await fetchBytes(url);
      const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
      if (digest !== src.sha256) {
        problems.push(`${url}: checksum mismatch`);
        continue;
      }
      recordDigest(bytes, digest);
      provide(path, bytes);
      post({ kind: "status", text: "" });
      return;
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  post({ kind: "status", text: "" });
  throw new LibraryError(
    `icon library ${src.npm}@${src.version} could not be downloaded (${problems.join("; ")})`,
    [
      "check the connection: the playground loads this icon set from jsDelivr, or unpkg",
      "use icons from the bundled official packs (aws, azure, gcp, k8s) instead",
    ],
  );
}

/** Fetches one known file into the in-memory file system, once. */
function fetchFile(path: string): Promise<void> {
  if (provided(path)) return Promise.resolve();
  let pending = inflight.get(path);
  if (!pending) {
    const lib = libraries.get(path);
    pending = lib
      ? fetchLibrary(path, lib)
      : fetchBytes(new URL(path.slice(1), base)).then((bytes) => provide(path, bytes));
    pending = pending.finally(() => inflight.delete(path));
    inflight.set(path, pending);
  }
  return pending;
}

/**
 * Runs a step of the renderer, fetching each file it reaches for that is not loaded yet and
 * running it again, until it needs nothing new. Most files are prefetched, so this rarely loops.
 */
async function withFiles<T>(step: () => T | Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    takeMisses();
    let result: T;
    try {
      result = await step();
    } catch (e) {
      const misses = takeMisses();
      if (!misses.size || attempt > 12) throw e;
      await Promise.all([...misses].map(fetchFile));
      continue;
    }
    // A step that caught the read error itself still ran without the file: fetch it and run again.
    const misses = takeMisses();
    if (!misses.size || attempt > 12) return result;
    await Promise.all([...misses].map(fetchFile));
  }
}

const ready = (async () => {
  await Promise.all(
    ["/skill/assets/icons/index.json", "/skill/assets/fonts/metrics.json"].map(fetchFile),
  );
  for (const pack of Object.values(packInfo())) {
    if (!pack.lib) continue;
    const path = cachePath(pack.lib);
    libraries.set(path, pack.lib);
    fetchable(path, pack.lib.bytes);
  }
  post({ kind: "ready", version: __ORRERY_VERSION__ });
})();

/** The catalog files a model's icons live in, fetched before layout asks for them. */
async function prefetch(model: Model): Promise<void> {
  const ids = new Set<string>();
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      if (/^[a-z][a-z0-9-]*:[a-z0-9]/i.test(value)) ids.add(value);
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(model);
  const files = new Set<string>();
  for (const id of ids) {
    const info = iconInfo(id);
    if (!info) continue;
    const lib = packInfo()[info.pack]?.lib;
    files.add(lib ? cachePath(lib) : `/skill/assets/icons/${info.pack}.json`);
  }
  // A failure here shows up again, with its message, when the render reaches for the file.
  await Promise.all([...files].filter(isKnown).map((f) => fetchFile(f).catch(() => {})));
}

function failure(e: unknown): Diagnostic {
  if (e instanceof LibraryError)
    return { severity: "error", code: "DG301", message: e.message, fixes: e.fixes };
  if (e instanceof LocalIconError)
    return {
      severity: "error",
      code: "DG111",
      message: `icon file ${e.file} ${e.problem}`,
      subject: { where: "icons", file: e.file },
      fixes: [e.fix],
    };
  return {
    severity: "error",
    code: "crash",
    message: `orrery could not draw this spec: ${(e as Error)?.message ?? e}`,
    fixes: ["open an issue on github.com/Sagargupta16/orrery with the share link"],
  };
}

let queue: Job[] = [];
let busy = false;

async function handleRender(job: RenderJob) {
  const started = performance.now();
  const parsed = await withFiles(() => parseSpec(job.spec, "diagram.yaml"));
  if (!parsed.model) {
    post({ id: job.id, kind: "render", ok: false, diagnostics: parsed.diagnostics, ms: performance.now() - started });
    return;
  }
  const model = parsed.model;
  const theme = job.theme ?? model.theme;
  await prefetch(model);
  try {
    const result = await withFiles(() =>
      renderModel({
        model,
        formats: ["svg", "drawio", "mmd"],
        themes: [theme],
        name: job.name,
        skin: job.skin,
        source: job.spec,
      }),
    );
    const scene = result.scenes[theme];
    const of = (format: string) => result.artifacts.find((a) => a.format === format)?.data;
    const diagnostics = [...parsed.diagnostics, ...result.diagnostics];
    post({
      id: job.id,
      kind: "render",
      ok: !diagnostics.some((d) => d.severity === "error"),
      diagnostics,
      svg: of("svg"),
      drawio: of("drawio"),
      mmd: of("mmd"),
      width: scene?.width,
      height: scene?.height,
      theme,
      skin: scene?.skin,
      title: model.title,
      counts: { nodes: model.nodes.length, groups: model.groups.length, edges: model.edges.length },
      ms: performance.now() - started,
    });
    // The review runs next unless a newer spec is already waiting.
    if (!queue.some((j) => j.kind === "render"))
      queue.unshift({
        id: job.id,
        kind: "review",
        model,
        diagnostics: parsed.diagnostics,
        name: job.name,
        theme,
        skin: job.skin,
        width: job.width,
      });
  } catch (e) {
    post({
      id: job.id,
      kind: "render",
      ok: false,
      diagnostics: [...parsed.diagnostics, failure(e)],
      ms: performance.now() - started,
    });
  }
}

async function handleReview(job: ReviewJob) {
  try {
    const run = await withFiles(() =>
      reviewModel({
        model: job.skin ? { ...job.model, skin: job.skin } : job.model,
        name: job.name,
        width: job.width,
        theme: job.theme,
        diagnostics: job.diagnostics,
        png: false,
      }),
    );
    post({ id: job.id, kind: "review", report: run.report });
  } catch (e) {
    post({ id: job.id, kind: "review", error: failure(e).message });
  }
}

/** The still frame a PNG is drawn from: the same scene with no packets or flow dashes. */
async function handleStill(job: StillJob) {
  const parsed = await withFiles(() => parseSpec(job.spec, "diagram.yaml"));
  if (!parsed.model) throw new Error("the spec has errors");
  const model = parsed.model;
  const theme = job.theme ?? model.theme;
  await prefetch(model);
  const result = await withFiles(() =>
    renderModel({ model, formats: ["svg"], themes: [theme], name: job.name, skin: job.skin }),
  );
  const scene = result.scenes[theme];
  if (!scene) throw new Error(`no ${theme} scene`);
  const svg = renderSvg({ ...scene, animate: "none" }, { idPrefix: `${job.name}-${theme}-still` });
  post({ id: job.id, kind: "still", svg, width: scene.width, height: scene.height });
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    await ready;
  } catch (e) {
    // Without the icon index nothing can render; the page says so and offers a reload.
    post({ kind: "fatal", message: (e as Error).message });
    busy = false;
    return;
  }
  while (queue.length) {
    const job = queue.shift() as Job;
    try {
      if (job.kind === "render") await handleRender(job);
      else if (job.kind === "review") await handleReview(job);
      else if (job.kind === "still") await handleStill(job);
      else {
        const png = embedPngSpec(job.png, job.spec);
        post({ id: job.id, kind: "embed", png }, [png.buffer as ArrayBuffer]);
      }
    } catch (e) {
      post({ id: job.id, kind: "error", job: job.kind, message: failure(e).message });
    }
  }
  busy = false;
}

scope.onmessage = (e) => {
  const job = e.data;
  // Only the newest spec matters: a waiting render or review of an older one is dropped.
  if (job.kind === "render") queue = queue.filter((j) => j.kind !== "render" && j.kind !== "review");
  queue.push(job);
  void pump();
};
