// Shared CLI plumbing: usage errors, spec input, atomic writes and diagnostics on stderr.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { LibraryError } from "../icons/libraries.ts";
import { LocalIconError } from "../icons/local/index.ts";
import { readText } from "../spec/values.ts";
import type { Diagnostic } from "../types.ts";
import type { Args } from "./args.ts";
import { HELP } from "./help.ts";

export function usage(message: string): never {
  process.stderr.write(`orrery: ${message}\n\n${HELP}\n`);
  process.exit(2);
}

export const sha = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

// Windows refuses to replace a file another process has open (a preview, an editor, a reader
// racing `orrery watch`) with EPERM, EACCES or EBUSY; the lock lasts milliseconds, so the rename
// is retried for up to about two seconds, as graceful-fs does.
const BUSY = new Set(["EPERM", "EACCES", "EBUSY"]);
const pause = new Int32Array(new SharedArrayBuffer(4));

export function writeAtomic(path: string, data: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, path);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? "";
      if (process.platform !== "win32" || !BUSY.has(code) || attempt >= 40) {
        rmSync(tmp, { force: true });
        throw e;
      }
      Atomics.wait(pause, 0, 0, 50);
    }
  }
}

export function printDiagnostics(list: Diagnostic[], json: boolean) {
  if (json) return;
  for (const d of list) {
    const where = d.subject ? ` ${JSON.stringify(d.subject)}` : "";
    process.stderr.write(
      `${d.severity === "error" ? "error" : "warn "} ${d.code} ${d.message}${where}\n`,
    );
    for (const fix of d.fixes ?? []) process.stderr.write(`      fix: ${fix}\n`);
  }
}

/** A render stopped by a library download or a bad local icon file, as a diagnostic. */
export function renderFailure(e: unknown): Diagnostic | undefined {
  if (e instanceof LibraryError)
    return { severity: "error", code: "DG301", message: e.message, fixes: e.fixes };
  if (e instanceof LocalIconError)
    return {
      severity: "error",
      code: "DG111",
      message: `icon file ${e.file} ${e.problem}`,
      subject: { where: "icons", file: e.file },
      fixes: [e.fix],
    };
  return undefined;
}

const isFile = (path: string) => existsSync(path) && statSync(path).isFile();

export function readSpec(path: string): { text: string; name: string; path: string } {
  if (path === "-") return { text: readText(0), name: "diagram", path: "stdin.yaml" };
  const full = resolve(path);
  if (!existsSync(full)) usage(`no such spec file: ${path}`);
  if (!isFile(full)) usage(`not a file: ${path} (pass the spec file, not its folder)`);
  return {
    // By its byte order mark: a Windows PowerShell `>` redirect writes UTF-16.
    text: readText(full),
    name: basename(full).replace(/\.(ya?ml|json)$/i, ""),
    path: full,
  };
}

/** The --font files (the flag repeats), each of which must be a file. */
export function fontFiles(args: Args): string[] {
  const fonts = typeof args.flags.font === "string" ? args.flags.font.split(",") : [];
  for (const f of fonts)
    if (!isFile(f)) usage(`${existsSync(f) ? "not a file" : "no such file"}: ${f} (from --font)`);
  return fonts;
}
