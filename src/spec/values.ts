// Readers for raw spec values that report what they reject: keys, enums, strings and colors,
// and the spec text itself (its encoding and its YAML).
import { readFileSync } from "node:fs";
import { isMap, isPair, isScalar, isSeq, parseDocument, visit } from "yaml";
import { isHex } from "../color.ts";
import type { Diagnostic } from "../types.ts";
import { closest } from "./suggest.ts";

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * A spec file's text, read by its byte order mark: UTF-16 (Windows PowerShell 5.1 writes it for
 * `>`), or UTF-8 with any mark dropped. A path or a file descriptor (0 is stdin).
 */
export function readText(file: string | number): string {
  const bytes = readFileSync(file);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.toString("utf16le", 2);
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return Buffer.from(bytes.subarray(2, bytes.length - (bytes.length % 2)))
      .swap16()
      .toString("utf16le");
  return bytes.toString("utf8").replace(/^\uFEFF/, "");
}

/** Keys whose values are text, wherever they sit: a node's, group's, view's or tag's. */
const TEXT_KEYS = new Set(["title", "subtitle", "label", "note", "badge"]);

/**
 * A spec's YAML or JSON as plain data. YAML reads 3.10, 16.0 and 0x10 as numbers; as text (a
 * title, label, note, badge, legend meaning, or a node's or an edge's short form label) the value
 * keeps the characters written, so a version stays 3.10. Numbers elsewhere (size, step, a year)
 * stay numbers.
 */
export function parseText(source: string, filename: string): unknown {
  const text = source.replace(/^\uFEFF/, "");
  if (/\.json$/i.test(filename)) return JSON.parse(text);
  const doc = parseDocument(text);
  if (doc.errors[0]) throw doc.errors[0];
  const keyOf = (n: unknown) => (isPair(n) && isScalar(n.key) ? String(n.key.value) : undefined);
  visit(doc, {
    Pair(_, pair, path) {
      const v = pair.value;
      if (!isScalar(v) || typeof v.value !== "number" || v.source === undefined) return;
      if (v.source === String(v.value)) return;
      const map = path.at(-1);
      // The pair that holds this mapping, directly or as a list item ({ id: label } items).
      const inList = isSeq(path.at(-2));
      const holder = keyOf(path.at(inList ? -3 : -2));
      const short =
        isMap(map) &&
        (holder === "nodes" || holder === "edges") &&
        (!inList || map.items.length === 1);
      if (TEXT_KEYS.has(keyOf(pair) ?? "") || (!inList && holder === "legend") || short)
        v.value = v.source;
    },
  });
  return doc.toJS();
}

export type Report = (code: string, message: string, extra?: Partial<Diagnostic>) => void;
/** Where every step sends its findings; the parse context is one. */
export interface Reporter {
  err: Report;
  warn: Report;
}

/** An error and a warning reporter that append to `diagnostics`. */
export function reporter(diagnostics: Diagnostic[]): Reporter {
  return {
    err: (code, message, extra = {}) =>
      diagnostics.push({ code, severity: "error", message, ...extra }),
    warn: (code, message, extra = {}) =>
      diagnostics.push({ code, severity: "warning", message, ...extra }),
  };
}

export function unknownKeys(
  r: Reporter,
  obj: Obj,
  allowed: string[],
  synonyms: Record<string, string>,
  where: string,
) {
  for (const key of Object.keys(obj)) {
    if (allowed.includes(key) || Object.hasOwn(synonyms, key)) continue;
    const near = closest(key, allowed);
    let fixes = near
      ? [`rename "${key}" to "${near}"`]
      : [`remove "${key}"; allowed: ${allowed.join(", ")}`];
    // In a YAML flow mapping {...}, a comma inside an unquoted value starts a new key whose
    // value is null ("note: Python, Node" gives the key "Node").
    if (obj[key] === null) {
      fixes = [
        `a comma inside an unquoted value split it; quote that value, e.g. note: "..., ${key.trim()}"`,
      ];
    }
    r.err("DG108", `unknown key "${key}" in ${where}`, { subject: { where, key }, fixes });
  }
}

export const pick = (obj: Obj, key: string, synonyms: Record<string, string>): unknown => {
  if (key in obj) return obj[key];
  for (const [syn, target] of Object.entries(synonyms))
    if (target === key && syn in obj) return obj[syn];
  return undefined;
};

export function oneOf<T extends string>(
  r: Reporter,
  value: unknown,
  options: readonly T[],
  fallback: T,
  where: string,
): T {
  if (value === undefined || value === null || value === "") return fallback;
  const v = String(value).toLowerCase() as T;
  if (options.includes(v)) return v;
  const near = closest(String(value), options);
  r.err("DG107", `${where} must be one of ${options.join(", ")}; got "${String(value)}"`, {
    subject: { where, value },
    fixes: near ? [`use "${near}"`] : [`use one of ${options.join(", ")}`],
  });
  return fallback;
}

export const str = (v: unknown): string | undefined =>
  v === undefined || v === null ? undefined : typeof v === "string" ? v : String(v);

/**
 * Reads a color value: it needs a leading "#", and an unquoted `#fff` is a YAML comment, so
 * the key arrives as null (warned about, then dropped). `extra` lists the words accepted besides
 * a hex color.
 */
export function hexColor(
  r: Reporter,
  value: unknown,
  key: string,
  where: string,
  subject: Obj,
  extra: readonly string[] = [],
): string | undefined {
  const name = where ? `${where} ${key}` : key;
  // A warning, not an error: the color is dropped and the diagram still renders in its theme.
  if (value === null) {
    r.warn("DG107", `${name} is empty; an unquoted # starts a YAML comment`, {
      subject: { ...subject, [key]: null },
      fixes: [`write ${key}: "#2563eb" (the quotes keep the # from starting a comment)`],
    });
    return undefined;
  }
  const c = str(value);
  if (c === undefined || extra.includes(c) || isHex(c)) return c;
  const or = extra.map((w) => ` or "${w}"`).join("");
  r.err("DG107", `${name} must be a hex color with a leading #${or}; got "${c}"`, {
    subject: { ...subject, [key]: c },
    fixes: [`use a quoted hex color such as "#2563eb"${or}`],
  });
  return c;
}
