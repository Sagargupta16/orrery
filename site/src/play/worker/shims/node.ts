// Small node: builtins for the playground bundle: url, os, module, crypto and zlib. The build maps
// each `node:<name>` import here (fs, path and process have their own files).
import { Buffer } from "./buffer.ts";

// node:url
export function fileURLToPath(url: string | URL | undefined): string {
  const href = String(url ?? "file:///skill/scripts/orrery.mjs");
  return decodeURIComponent(href.replace(/^file:\/\//, ""));
}
export const pathToFileURL = (path: string) => new URL(`file://${path}`);
const GlobalURL = URL;
export { GlobalURL as URL };

// node:os
export const homedir = () => "/workspace";
export const tmpdir = () => "/tmp";
export const platform = () => "linux";
export const availableParallelism = () => 1;
export const cpus = () => [];
export const EOL = "\n";

// node:module: elkjs is the one CommonJS file the renderer requires, see elk.ts.
declare const require: (id: string) => unknown;
type ElkClass = new (options?: Record<string, unknown>) => object;
let elk: ElkClass | undefined;

function loadElk(): ElkClass {
  if (elk) return elk;
  const Elk = require("orrery-elk") as ElkClass;
  // elk.bundled.js takes over the worker's onmessage when it sees no document (it thinks it is the
  // ELK worker itself). A stand-in document while ELK builds its in-thread worker keeps it a library.
  elk = class extends Elk {
    constructor(options?: Record<string, unknown>) {
      const scope = globalThis as { document?: unknown };
      const had = "document" in scope;
      if (!had) scope.document = {};
      try {
        super(options);
      } finally {
        if (!had) delete scope.document;
      }
    }
  };
  return elk;
}

export function createRequire() {
  const req = (id: string) => {
    if (/elk/.test(id)) return loadElk();
    throw new Error(`${id} cannot be loaded in the playground`);
  };
  req.resolve = (id: string) => {
    throw new Error(`${id} cannot be resolved in the playground`);
  };
  return req;
}

// node:crypto. Library files are checked with SubtleCrypto when the worker fetches them; the
// renderer's own sync sha256 check reads the digest recorded then (by the memory the bytes live
// in), so bytes that were never checked never match a pin.
const digests = new WeakMap<ArrayBufferLike, string>();

/** Records the SubtleCrypto digest of a whole-buffer view. */
export function recordDigest(data: Uint8Array, hex: string): void {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength)
    digests.set(data.buffer, hex);
}

export function createHash(algorithm: string) {
  let data: Uint8Array | undefined;
  const hash = {
    update(chunk: Uint8Array | string) {
      data = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      return hash;
    },
    digest(_encoding?: string) {
      const whole = data && data.byteOffset === 0 && data.byteLength === data.buffer.byteLength;
      return (algorithm === "sha256" && whole && data && digests.get(data.buffer)) || "unverified";
    },
  };
  return hash;
}

export const randomUUID = () => crypto.randomUUID();

// node:zlib. Only deflate is used (the PNG's embedded spec); stored blocks keep it synchronous and
// any inflater reads them.
function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + (data[i] ?? 0)) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

export function deflateSync(input: Uint8Array | string): Buffer {
  const data = typeof input === "string" ? Buffer.from(input) : input;
  const blocks = Math.max(1, Math.ceil(data.length / 0xffff));
  const out = new Buffer(2 + blocks * 5 + data.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let at = 2;
  for (let i = 0; i < blocks; i++) {
    const start = i * 0xffff;
    const len = Math.min(0xffff, data.length - start);
    out[at++] = i === blocks - 1 ? 1 : 0;
    out[at++] = len & 0xff;
    out[at++] = len >>> 8;
    out[at++] = ~len & 0xff;
    out[at++] = (~len >>> 8) & 0xff;
    out.set(data.subarray(start, start + len), at);
    at += len;
  }
  new DataView(out.buffer).setUint32(at, adler32(data));
  return out;
}

export function inflateSync(): never {
  throw new Error("inflate is not available in the playground");
}
export const deflateRawSync = deflateSync;
export const gzipSync = deflateSync;
