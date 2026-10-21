// node:path for the playground's in-memory file system: POSIX rules, rooted at "/".
import process from "./process.ts";

export const sep = "/";
export const delimiter = ":";

export function normalize(path: string): string {
  const absolute = path.startsWith("/");
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length && parts[parts.length - 1] !== "..") parts.pop();
      else if (!absolute) parts.push("..");
    } else parts.push(part);
  }
  const out = (absolute ? "/" : "") + parts.join("/");
  return out || (absolute ? "/" : ".");
}

export const isAbsolute = (path: string) => path.replace(/\\/g, "/").startsWith("/");

export const join = (...parts: string[]) => normalize(parts.filter(Boolean).join("/"));

export function resolve(...parts: string[]): string {
  let out = "";
  for (let i = parts.length - 1; i >= 0 && !isAbsolute(out); i--) {
    const part = parts[i];
    if (part) out = out ? `${part}/${out}` : part;
  }
  return normalize(isAbsolute(out) ? out : `${process.cwd()}/${out}`);
}

export function dirname(path: string): string {
  const p = normalize(path);
  const at = p.lastIndexOf("/");
  if (at < 0) return ".";
  return at === 0 ? "/" : p.slice(0, at);
}

export function basename(path: string, ext?: string): string {
  const name = normalize(path).split("/").pop() ?? "";
  return ext && name.endsWith(ext) && name !== ext ? name.slice(0, -ext.length) : name;
}

export function extname(path: string): string {
  const name = basename(path);
  const at = name.lastIndexOf(".");
  return at > 0 ? name.slice(at) : "";
}

export function relative(from: string, to: string): string {
  const a = resolve(from).split("/").filter(Boolean);
  const b = resolve(to).split("/").filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/");
}

export function parse(path: string) {
  const base = basename(path);
  const ext = extname(path);
  return { root: isAbsolute(path) ? "/" : "", dir: dirname(path), base, ext, name: base.slice(0, base.length - ext.length) };
}

export function format(p: { dir?: string; base?: string; name?: string; ext?: string }): string {
  const base = p.base ?? `${p.name ?? ""}${p.ext ?? ""}`;
  return p.dir ? `${p.dir}/${base}` : base;
}

const path = { sep, delimiter, normalize, isAbsolute, join, resolve, dirname, basename, extname, relative, parse, format };
export const posix = path;
export const win32 = path;
export default { ...path, posix: path, win32: path };
