// Icon sets that are published as npm libraries are not copied into the skill. They load at render
// time from the library itself, at the version pinned in index.json: a matching node_modules copy
// next to the tool when there is one, else the user cache, else jsDelivr (unpkg as a fallback).
// Every file is checked against its pinned sha256 before it is used.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { luminance } from "./color.ts";

export interface LibrarySource {
  npm: string;
  version: string;
  file: string;
  sha256: string;
  bytes: number;
  /** File layout: an Iconify JSON set (default) or Primer's build/data.json. */
  format?: "iconify" | "octicons";
  /** Monochrome set, painted with the brand color or the theme ink. */
  mono?: boolean;
  /** Appended to a slug to get the library's own icon name (Octicons: "-24"). */
  suffix?: string;
}

interface IconifyIcon {
  body: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

export interface IconifySet {
  prefix: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  icons: Record<string, IconifyIcon>;
  aliases?: Record<string, { parent: string }>;
}

export class LibraryError extends Error {
  fixes: string[];
  constructor(message: string, fixes: string[]) {
    super(message);
    this.fixes = fixes;
  }
}

const loaded = new Map<string, IconifySet>();

export function cacheDir(): string {
  if (process.env.DIAGRAMIFY_CACHE) return process.env.DIAGRAMIFY_CACHE;
  const base =
    process.platform === "win32"
      ? (process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"))
      : (process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"));
  return join(base, "diagramify");
}

export const cachePath = (src: LibrarySource) =>
  join(cacheDir(), `${src.npm.replace("/", "+")}@${src.version}`, src.file);

export const libraryUrls = (src: LibrarySource) => [
  `https://cdn.jsdelivr.net/npm/${src.npm}@${src.version}/${src.file}`,
  `https://unpkg.com/${src.npm}@${src.version}/${src.file}`,
];

const sha256 = (buf: Uint8Array) => createHash("sha256").update(buf).digest("hex");

/** The library file from a node_modules folder above the tool, when it is the pinned version. */
function fromNodeModules(src: LibrarySource): Buffer | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const pkgDir = join(dir, "node_modules", src.npm);
    const pkg = join(pkgDir, "package.json");
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, "utf8")).version === src.version) {
          const buf = readFileSync(join(pkgDir, src.file));
          if (sha256(buf) === src.sha256) return buf;
        }
      } catch {}
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return undefined;
}

function fromCache(src: LibrarySource): Buffer | undefined {
  const path = cachePath(src);
  if (!existsSync(path)) return undefined;
  const buf = readFileSync(path);
  return sha256(buf) === src.sha256 ? buf : undefined;
}

async function download(src: LibrarySource): Promise<Buffer> {
  const problems: string[] = [];
  for (const url of libraryUrls(src)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) {
        problems.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (sha256(buf) !== src.sha256) {
        problems.push(`${url}: checksum mismatch`);
        continue;
      }
      const path = cachePath(src);
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, buf);
      renameSync(tmp, path);
      return buf;
    } catch (e) {
      problems.push(`${url}: ${(e as Error).message}`);
    }
  }
  throw new LibraryError(
    `icon library ${src.npm}@${src.version} could not be downloaded (${problems.join("; ")})`,
    [
      "connect to the internet once; the library is cached after the first download",
      `prefetch where there is network: diagramify icons fetch, then copy ${cacheDir()} (or set DIAGRAMIFY_CACHE)`,
      "use icons from the bundled official packs (aws, azure, gcp, k8s) instead",
    ],
  );
}

/** Where a library would load from right now, without downloading it. */
export function librarySource(src: LibrarySource): "node_modules" | "cache" | undefined {
  if (fromNodeModules(src)) return "node_modules";
  if (fromCache(src)) return "cache";
  return undefined;
}

export async function loadLibrary(pack: string, src: LibrarySource): Promise<IconifySet> {
  const done = loaded.get(pack);
  if (done) return done;
  const buf = fromNodeModules(src) ?? fromCache(src) ?? (await download(src));
  const json = JSON.parse(buf.toString("utf8"));
  const set = src.format === "octicons" ? fromOcticons(json) : (json as IconifySet);
  loaded.set(pack, set);
  return set;
}

type OcticonsData = Record<string, { heights: Record<string, { width: number; path: string }> }>;

/** Primer's data.json as an Iconify set, one icon per size ("repo-24"). */
function fromOcticons(data: OcticonsData): IconifySet {
  const icons: Record<string, IconifyIcon> = {};
  for (const [name, icon] of Object.entries(data))
    for (const [h, { width, path }] of Object.entries(icon.heights))
      icons[`${name}-${h}`] = { body: path, width, height: Number(h) };
  return { prefix: "octicon", icons };
}

export const loadedLibrary = (pack: string) => loaded.get(pack);

/**
 * One icon from an Iconify set, in the catalog's form: ids start with the token the renderer swaps
 * for a per-instance prefix, and monochrome sets carry the color placeholder.
 */
export function libraryIcon(
  set: IconifySet,
  name: string,
  mono = false,
): { v: string; b: string } | undefined {
  const icon = set.icons[name] ?? set.icons[set.aliases?.[name]?.parent ?? ""];
  if (!icon) return undefined;
  let body = icon.body;
  for (const id of new Set([...body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1] ?? ""))) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    body = body.replace(
      new RegExp(`(\\bid="|url\\(#|href="#)${esc}(?=["')])`, "g"),
      `$1dfyid_${id}`,
    );
  }
  if (mono) {
    body = body.replaceAll("currentColor", "{{c}}");
    if (!/\bfill="/.test(body) || !body.includes("{{c}}")) body = `<g fill="{{c}}">${body}</g>`;
  }
  const v = [
    icon.left ?? set.left ?? 0,
    icon.top ?? set.top ?? 0,
    icon.width ?? set.width ?? 16,
    icon.height ?? set.height ?? 16,
  ].join(" ");
  return { v, b: body };
}

/** True when every painted color in an icon is near black, so a dark theme must recolor it. */
export function allDark(body: string): boolean {
  if (/Gradient|<image/.test(body)) return false;
  const colors = [...body.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-fA-F]{3,6})"/g)].map(
    (m) => m[1] ?? "",
  );
  return colors.length > 0 && colors.every((c) => luminance(c) < 0.06);
}
