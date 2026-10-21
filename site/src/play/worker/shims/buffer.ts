// The slice of Node's Buffer the renderer uses (from, toString, byteLength, concat), on top of
// Uint8Array. scripts/build-browser.mjs injects it wherever the bundled code names `Buffer`.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/[^A-Za-z0-9+/=]/g, ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

type Source = string | ArrayBuffer | ArrayLike<number> | Iterable<number>;

// @ts-expect-error: Node's Buffer.from(value, encoding) is not TypedArray.from's signature.
export class Buffer extends Uint8Array {
  static wrap(bytes: Uint8Array): Buffer {
    return new Buffer(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  }

  static override from(value: Source, encoding?: string): Buffer {
    if (typeof value === "string") {
      if (encoding === "base64" || encoding === "base64url")
        return Buffer.wrap(fromBase64(value.replace(/-/g, "+").replace(/_/g, "/")));
      if (encoding === "latin1" || encoding === "binary" || encoding === "ascii") {
        const out = new Buffer(value.length);
        for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xff;
        return out;
      }
      if (encoding === "hex") {
        const out = new Buffer(value.length >> 1);
        for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
        return out;
      }
      return Buffer.wrap(encoder.encode(value));
    }
    if (value instanceof ArrayBuffer) return new Buffer(value);
    return Buffer.wrap(Uint8Array.from(value as ArrayLike<number>));
  }

  static alloc(size: number): Buffer {
    return new Buffer(size);
  }

  static isBuffer(value: unknown): value is Buffer {
    return value instanceof Buffer;
  }

  static byteLength(value: string | Uint8Array): number {
    return typeof value === "string" ? encoder.encode(value).length : value.byteLength;
  }

  static concat(parts: Uint8Array[]): Buffer {
    const out = new Buffer(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }

  override toString(encoding = "utf8"): string {
    if (encoding === "base64") return toBase64(this);
    if (encoding === "base64url")
      return toBase64(this).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (encoding === "hex") return [...this].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (encoding === "latin1" || encoding === "binary" || encoding === "ascii") {
      let out = "";
      for (let i = 0; i < this.length; i += 0x8000)
        out += String.fromCharCode(...this.subarray(i, i + 0x8000));
      return out;
    }
    return decoder.decode(this);
  }

  equals(other: Uint8Array): boolean {
    return this.length === other.length && this.every((b, i) => b === other[i]);
  }
}
