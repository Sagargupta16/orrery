// The error every local-icon step throws, and the path form its messages use.

import { isAbsolute, relative } from "node:path";

/** A file that cannot be used as an icon; the message names the file, the problem and the fix. */
export class LocalIconError extends Error {
  file: string;
  problem: string;
  fix: string;
  constructor(file: string, problem: string, fix: string) {
    super(`${file} ${problem}; fix: ${fix}`);
    this.file = file;
    this.problem = problem;
    this.fix = fix;
  }
}

/** Builds the error for the file being read; every step takes one so messages name that file. */
export type Bad = (problem: string, fix: string) => LocalIconError;

export function badFor(file: string): Bad {
  return (problem, fix) => new LocalIconError(file, problem, fix);
}

/** The path as the user typed it when it is under the working folder. */
export function shownPath(path: string): string {
  const rel = relative(process.cwd(), path);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.replaceAll("\\", "/") : path;
}
