// Readers for raw spec values that report what they reject: keys, enums, strings and colors.
import { isHex } from "../color.ts";
import type { Diagnostic } from "../types.ts";
import { closest } from "./suggest.ts";

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);

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
    if (allowed.includes(key) || key in synonyms) continue;
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
