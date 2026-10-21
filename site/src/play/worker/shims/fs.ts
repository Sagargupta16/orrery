// node:fs over an in-memory file system. The renderer reads its catalogs synchronously, so the
// worker fetches files before a render and puts them here. A file that is known (in the build's
// manifest, or an icon library the worker can download) but not fetched yet exists, and reading
// it throws MissingFile: the worker fetches it and runs the render again.
import { Buffer } from "./buffer.ts";
import { normalize } from "./path.ts";

const files = new Map<string, Uint8Array>();
/** Path to byte size of every file the worker can fetch on demand. */
const known = new Map<string, number>();
/** Known files a read asked for before they were fetched; the worker fetches them. */
const misses = new Set<string>();

/** Path under /skill to byte size of every file the build copied to play/skill/. */
declare const __PLAY_FILES__: Record<string, number>;
// Registered as this module loads: src/paths.ts looks for the skill folder when it loads.
for (const [path, bytes] of Object.entries(__PLAY_FILES__)) known.set(path, bytes);

export class MissingFile extends Error {
  code = "ENOENT";
  constructor(readonly path: string) {
    super(`ENOENT: no such file, open '${path}'`);
  }
}

export function provide(path: string, data: Uint8Array | string): void {
  files.set(normalize(path), typeof data === "string" ? Buffer.from(data) : data);
}

export function provided(path: string): Uint8Array | undefined {
  return files.get(normalize(path));
}

export function fetchable(path: string, bytes: number): void {
  known.set(normalize(path), bytes);
}

export function isKnown(path: string): boolean {
  return known.has(normalize(path)) || files.has(normalize(path));
}

/** The known files read since the last call that were not loaded, and forgets them. */
export function takeMisses(): Set<string> {
  const out = new Set(misses);
  misses.clear();
  return out;
}

const isDir = (path: string) => {
  const prefix = path.endsWith("/") ? path : `${path}/`;
  for (const p of [...files.keys(), ...known.keys()]) if (p.startsWith(prefix)) return true;
  return false;
};

export function existsSync(path: string): boolean {
  const p = normalize(String(path));
  return files.has(p) || known.has(p) || isDir(p);
}

export function readFileSync(path: string | number, options?: string | { encoding?: string }) {
  const p = normalize(String(path));
  const data = files.get(p);
  if (!data) {
    if (known.has(p)) misses.add(p);
    throw new MissingFile(p);
  }
  const encoding = typeof options === "string" ? options : options?.encoding;
  const buf = Buffer.wrap(data);
  return encoding ? buf.toString(encoding) : buf;
}

export function statSync(path: string) {
  const p = normalize(String(path));
  const size = files.get(p)?.byteLength ?? known.get(p);
  const dir = size === undefined && isDir(p);
  if (size === undefined && !dir) throw new MissingFile(p);
  return {
    size: size ?? 0,
    isFile: () => !dir,
    isDirectory: () => dir,
    mtimeMs: 0,
  };
}

export const lstatSync = statSync;

export function writeFileSync(path: string, data: Uint8Array | string): void {
  provide(path, data);
}

export function renameSync(from: string, to: string): void {
  const data = files.get(normalize(from));
  if (data) files.set(normalize(to), data);
  files.delete(normalize(from));
}

export function copyFileSync(from: string, to: string): void {
  const data = files.get(normalize(from));
  if (!data) throw new MissingFile(normalize(from));
  files.set(normalize(to), data);
}

export function readdirSync(path: string): string[] {
  const prefix = `${normalize(path).replace(/\/$/, "")}/`;
  const names = new Set<string>();
  for (const p of [...files.keys(), ...known.keys()])
    if (p.startsWith(prefix)) names.add(p.slice(prefix.length).split("/")[0] ?? "");
  return [...names].filter(Boolean).sort();
}

export function mkdirSync(): void {}
export function rmSync(path: string): void {
  files.delete(normalize(path));
}
export const unlinkSync = rmSync;
export function realpathSync(path: string): string {
  return normalize(path);
}
export function accessSync(path: string): void {
  if (!existsSync(path)) throw new MissingFile(normalize(path));
}
export function watch(): never {
  throw new Error("watching files is not available in the playground");
}

export const promises = {
  readFile: async (path: string, options?: string | { encoding?: string }) =>
    readFileSync(path, options),
  writeFile: async (path: string, data: Uint8Array | string) => writeFileSync(path, data),
  mkdir: async () => {},
  stat: async (path: string) => statSync(path),
};

export default {
  existsSync,
  readFileSync,
  statSync,
  lstatSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  readdirSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  realpathSync,
  accessSync,
  watch,
  promises,
};
