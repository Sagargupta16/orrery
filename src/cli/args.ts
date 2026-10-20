// Command line parsing: the flag tables, value checks and did-you-mean for typos.
import { distance } from "../spec.ts";
import { ANIMATE_MODES, type AnimateMode, SKINS, type Skin } from "../types.ts";
import { usage } from "./io.ts";

export interface Args {
  _: string[];
  flags: Record<string, string | boolean>;
}

const BOOL = new Set(["json", "strict", "force", "static", "list", "help", "version", "review"]);
const KNOWN_FLAGS = new Set([
  ...BOOL,
  "out",
  "format",
  "theme",
  "scale",
  "animate",
  "skin",
  "font",
  "pack",
  "type",
  "limit",
  "category",
  "width",
  "dir",
  "name",
  "port",
]);
const SHORT_FLAGS: Record<string, string> = {
  o: "out",
  f: "format",
  t: "theme",
  s: "scale",
  n: "limit",
  p: "pack",
};

/** The option a typo most likely meant: a prefix match (--formats, --output) or a near spelling. */
export function closest(word: string, options: Iterable<string>): string | undefined {
  const w = word.toLowerCase();
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const o of options) {
    const prefix = w.length >= 3 && (o.startsWith(w) || w.startsWith(o));
    const d = prefix ? 0 : distance(w, o);
    if (d < bestScore) {
      bestScore = d;
      best = o;
    }
  }
  return bestScore <= Math.max(2, Math.floor(w.length / 3)) ? best : undefined;
}

// A bare --animate (v0.1 style) means packets when it is followed by nothing, another flag or a
// spec file; anything else after it must be a mode.
const SPEC_FILE = /\.(ya?ml|json)$/i;

export function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "-h") out.flags.help = true;
    else if (a.startsWith("--") || (a.startsWith("-") && (a.length === 2 || a[2] === "="))) {
      const eq = a.indexOf("=");
      let key = a.replace(/^--?/, "");
      let value: string | boolean | undefined;
      if (eq > 0) {
        key = a.slice(a.startsWith("--") ? 2 : 1, eq);
        value = a.slice(eq + 1);
      }
      key = SHORT_FLAGS[key] ?? key;
      if (!KNOWN_FLAGS.has(key)) {
        const near = closest(key, KNOWN_FLAGS);
        usage(
          `unknown flag ${eq > 0 ? a.slice(0, eq) : a}${near ? ` (did you mean --${near}?)` : ""}`,
        );
      }
      if (value === undefined) {
        const next = argv[i + 1];
        if (BOOL.has(key)) value = true;
        else if (
          key === "animate" &&
          !ANIMATE_MODES.includes(next as AnimateMode) &&
          (next === undefined || next.startsWith("-") || SPEC_FILE.test(next))
        )
          value = true;
        else {
          value = next;
          i += 1;
        }
      }
      if (value === undefined) usage(`--${key} needs a value`);
      // --strict=true / --json=false: every consumer tests `=== true`, so a string must not leak.
      if (BOOL.has(key) && typeof value === "string") {
        const b = value.toLowerCase();
        if (b !== "true" && b !== "false") usage(`--${key} must be true or false (got "${value}")`);
        value = b === "true";
      }
      if (key === "animate" && value !== true && !ANIMATE_MODES.includes(value as AnimateMode))
        usage(`--animate must be ${ANIMATE_MODES.join(", ")} (got "${value}")`);
      if (key === "skin" && !SKINS.includes(value as Skin))
        usage(`--skin must be ${SKINS.join(", ")} (got "${value}")`);
      const prev = out.flags[key];
      out.flags[key] =
        key === "font" && typeof prev === "string"
          ? `${prev},${value}`
          : (value as string | boolean);
    } else out._.push(a);
  }
  return out;
}
