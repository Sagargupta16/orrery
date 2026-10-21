// Quick fixes: the `fixes` of a diagnostic that are one mechanical edit, as text edits. A value
// fix ("use icon ...", "use ...") replaces the located scalar, a key fix ("rename ... to ...")
// the located key, and a setting fix ("use direction: down") runs a patch op on the whole spec.
import { applyPatches } from "../patch/apply.ts";
import type { Diagnostic } from "../types.ts";
import type { Target } from "./locate.ts";
import type { Edit } from "./text.ts";

export interface Fix {
  title: string;
  edits: Edit[];
}

/** Fixes whose quoted word replaces the located value (or the id inside an edge line). */
const VALUE_FIXES = [
  /^use icon "([^"]+)"$/,
  /^use type "([^"]+)"$/,
  /^use "([^"]+)"$/,
  /^use (?:align|stage|on|in): ([^\s,]+)$/,
];
const KEY_FIX = /^rename "[^"]+" to "([^"]+)"$/;
const SETTING_FIXES: [RegExp, (m: RegExpExecArray) => [string, string]][] = [
  [/^use direction: (right|down|left|up)\b/, (m) => ["direction", m[1] ?? ""]],
  [/^(?:use|try) layout: \{ (\w+): ([\w.-]+) \}$/, (m) => [`layout.${m[1]}`, m[2] ?? ""]],
];

/** The word as YAML in the quotes the spec used; plain when it needs none. */
function quoted(word: string, quote: "" | "'" | '"'): string {
  if (quote === "'") return `'${word.replace(/'/g, "''")}'`;
  if (quote === '"' || !/^[A-Za-z0-9_][\w.:/-]*$/.test(word)) return JSON.stringify(word);
  return word;
}

/** The smallest edit that turns `a` into `b`. */
function difference(a: string, b: string): Edit {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let tail = 0;
  while (
    tail < a.length - start &&
    tail < b.length - start &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail++;
  return { start, end: a.length - tail, text: b.slice(start, b.length - tail) };
}

function setting(text: string, path: string, value: string): Edit[] | undefined {
  let out: string;
  try {
    out = applyPatches(text, [{ op: "set", path, value }]);
  } catch {
    return undefined;
  }
  // applyPatches ends the text with a newline; a spec without one keeps it that way.
  if (!text.endsWith("\n")) out = out.replace(/\r?\n$/, "");
  return [difference(text, out)];
}

function editsFor(text: string, fix: string, t: Target): Edit[] | undefined {
  for (const re of VALUE_FIXES) {
    const word = re.exec(fix)?.[1];
    if (word === undefined) continue;
    if ((t.kind !== "value" && t.kind !== "token") || t.quote === undefined) return undefined;
    return [
      { start: t.start, end: t.end, text: t.kind === "token" ? word : quoted(word, t.quote) },
    ];
  }
  const key = KEY_FIX.exec(fix)?.[1];
  if (key !== undefined)
    return t.kind === "key" && t.quote !== undefined
      ? [{ start: t.start, end: t.end, text: quoted(key, t.quote) }]
      : undefined;
  for (const [re, op] of SETTING_FIXES) {
    const m = re.exec(fix);
    if (m) return setting(text, ...op(m));
  }
  return undefined;
}

/** Each of the diagnostic's fixes that is one edit on this text, titled as the fix reads. */
export function fixesFor(text: string, d: Diagnostic, t: Target): Fix[] {
  const out: Fix[] = [];
  for (const fix of d.fixes ?? []) {
    const edits = editsFor(text, fix, t);
    if (edits) out.push({ title: fix, edits });
  }
  return out;
}
