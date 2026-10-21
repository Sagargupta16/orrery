// Share links: the spec, deflated (deflate-raw) and base64url-encoded, rides in the URL fragment.
// Browsers never send the fragment to a server, so a shared diagram stays between the people who
// have the link. A gallery example is just its name: #example=starter.

export interface Shared {
  spec?: string;
  example?: string;
  name?: string;
  theme?: "light" | "dark";
  skin?: "stage" | "classic";
  width?: number;
}

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function packSpec(spec: string): Promise<string> {
  return toBase64url(await through(new TextEncoder().encode(spec), new CompressionStream("deflate-raw")));
}

export async function unpackSpec(packed: string): Promise<string> {
  return new TextDecoder().decode(await through(fromBase64url(packed), new DecompressionStream("deflate-raw")));
}

/** The fragment for a state: the example's name while it is unedited, else the packed spec. */
export async function fragmentOf(state: Shared): Promise<string> {
  const params = new URLSearchParams();
  if (state.example && state.spec === undefined) params.set("example", state.example);
  else if (state.name) params.set("name", state.name);
  if (state.theme) params.set("theme", state.theme);
  if (state.skin) params.set("skin", state.skin);
  if (state.width && state.width !== 880) params.set("width", String(state.width));
  if (state.spec !== undefined) params.set("spec", await packSpec(state.spec));
  return params.toString();
}

/** Reads a fragment back; a spec that does not unpack is reported, not thrown. */
export async function readFragment(hash: string): Promise<Shared & { broken?: boolean }> {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const out: Shared & { broken?: boolean } = {};
  const example = params.get("example");
  if (example && /^[\w-]+$/.test(example)) out.example = example;
  const name = params.get("name");
  if (name && /^[\w.-]{1,80}$/.test(name)) out.name = name;
  const theme = params.get("theme");
  if (theme === "light" || theme === "dark") out.theme = theme;
  const skin = params.get("skin");
  if (skin === "stage" || skin === "classic") out.skin = skin;
  const width = Number(params.get("width"));
  if (width >= 200 && width <= 4000) out.width = Math.round(width);
  const spec = params.get("spec");
  if (spec) {
    try {
      out.spec = await unpackSpec(spec);
    } catch {
      out.broken = true;
    }
  }
  return out;
}
