// Shared fixtures and checkers. Kept free of vitest imports so each test file reads on its own.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpec } from "../src/spec.ts";
import type { Box, Diagnostic, Model, Point } from "../src/types.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SKILL_DIR = join(ROOT, "skills", "stackdraw");
export const CLI_BUNDLE = join(SKILL_DIR, "scripts", "stackdraw.mjs");
export const EXAMPLES_DIR = join(SKILL_DIR, "examples");

/**
 * A small but complete diagram: three levels of nesting, official icons, a card, a colored shape,
 * a note, a badge, edge labels, a numbered step, a dashed and a dotted line, and a group endpoint.
 * It lays out with no composition warnings in every direction.
 */
export const SAMPLE = `title: Orders platform
subtitle: Sample diagram for the test suite
groups:
  cloud: { type: aws:cloud }
  region: { type: aws:region, label: us-east-1, in: cloud }
  vpc: { type: aws:vpc, in: region }
  public: { type: aws:public-subnet, in: vpc }
  private: { type: aws:private-subnet, in: vpc }
nodes:
  users: { icon: aws:users, label: Users }
  alb: { icon: aws:alb, label: Load balancer, in: public }
  api: { icon: aws:ecs, label: Orders API, note: "Fargate, 3 tasks", badge: x3, in: private }
  worker: { icon: aws:lambda, label: Worker, look: card, in: private }
  db: { shape: cylinder, label: Orders DB, color: "#2563eb", in: private }
  queue: { icon: aws:sqs, label: Jobs, in: region }
  bucket: { icon: aws:s3, label: Receipts, in: region }
edges:
  - users -> alb: HTTPS
  - alb -> api
  - api -> db: { label: SQL, step: 1 }
  - api --> queue: enqueue
  - queue -> worker
  - worker -> bucket
  - vpc ..> bucket: VPC endpoint
`;

export function listDiagnostics(list: Diagnostic[]): string {
  return list.map((d) => `${d.severity} ${d.code} ${d.message}`).join("\n");
}

/** The model of a spec that must parse with no errors; otherwise throws with every diagnostic. */
export function model(source: string, filename = "test.yaml"): Model {
  const result = parseSpec(source, filename);
  if (!result.model) throw new Error(`spec has errors:\n${listDiagnostics(result.diagnostics)}`);
  return result.model;
}

/** Narrows away null and undefined with a readable failure instead of a non-null assertion. */
export function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`expected ${what}`);
  return value;
}

// ---------------------------------------------------------------- geometry

export const contains = (outer: Box, inner: Box, tolerance = 0.5): boolean =>
  inner.x >= outer.x - tolerance &&
  inner.y >= outer.y - tolerance &&
  inner.x + inner.w <= outer.x + outer.w + tolerance &&
  inner.y + inner.h <= outer.y + outer.h + tolerance;

export const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Distance from a point to the outline of a box: 0 on the border, positive inside or outside. */
export function distanceToBorder(p: Point, b: Box): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  return Math.min(p.x - b.x, b.x + b.w - p.x, p.y - b.y, b.y + b.h - p.y);
}

// ---------------------------------------------------------------- XML

const NAME = /[A-Za-z_][\w.:-]*/y;
const BARE_AMPERSAND = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g;
const SPECIAL: [string, string][] = [
  ["<!--", "-->"],
  ["<![CDATA[", "]]>"],
  ["<?", "?>"],
];

function readName(xml: string, at: number): string | undefined {
  NAME.lastIndex = at;
  return NAME.exec(xml)?.[0];
}

function skipSpace(xml: string, at: number): number {
  let i = at;
  while (/\s/.test(xml[i] ?? "")) i++;
  return i;
}

interface OpenTag {
  tag: string;
  end: number;
  selfClosing: boolean;
}

/** Reads one start tag at `lt`, pushing what is wrong with it into `problems`. */
function readStartTag(xml: string, lt: number, problems: string[]): OpenTag | undefined {
  const tag = readName(xml, lt + 1);
  if (!tag) {
    problems.push(`malformed tag at ${lt}`);
    return undefined;
  }
  const seen = new Set<string>();
  let j = lt + 1 + tag.length;
  while (j < xml.length) {
    const before = j;
    j = skipSpace(xml, j);
    if (xml.startsWith("/>", j)) return { tag, end: j + 2, selfClosing: true };
    if (xml[j] === ">") return { tag, end: j + 1, selfClosing: false };
    if (j === before) problems.push(`no space before an attribute of <${tag}> at ${j}`);
    const attr = readName(xml, j);
    if (!attr) {
      problems.push(`malformed attribute in <${tag}> at ${j}`);
      return undefined;
    }
    j = skipSpace(xml, j + attr.length);
    if (xml[j] !== "=") {
      problems.push(`attribute ${attr} of <${tag}> has no value`);
      return undefined;
    }
    j = skipSpace(xml, j + 1);
    const quote = xml[j];
    const close = quote === '"' || quote === "'" ? xml.indexOf(quote, j + 1) : -1;
    if (close < 0) {
      problems.push(`attribute ${attr} of <${tag}> is not quoted and closed`);
      return undefined;
    }
    const value = xml.slice(j + 1, close);
    if (value.includes("<")) problems.push(`"<" inside attribute ${attr} of <${tag}>`);
    for (const m of value.matchAll(BARE_AMPERSAND))
      problems.push(`bare "&" in attribute ${attr} of <${tag}> at ${j + 1 + (m.index ?? 0)}`);
    if (seen.has(attr)) problems.push(`duplicate attribute ${attr} in <${tag}>`);
    seen.add(attr);
    j = close + 1;
  }
  problems.push(`unterminated <${tag}> at ${lt}`);
  return undefined;
}

/**
 * Everything that keeps `xml` from being well-formed: crossed or unclosed tags, malformed or
 * duplicate attributes, "<" in values, bare "&", text outside a single root. Empty when fine.
 */
export function xmlProblems(xml: string): string[] {
  const problems: string[] = [];
  const stack: string[] = [];
  let roots = 0;
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    const text = xml.slice(i, lt < 0 ? xml.length : lt);
    if (text.trim()) {
      if (!stack.length) problems.push(`text outside the root element at ${i}`);
      for (const m of text.matchAll(BARE_AMPERSAND))
        problems.push(`bare "&" in text at ${i + (m.index ?? 0)}`);
    }
    if (lt < 0) break;
    const special = SPECIAL.find(([open]) => xml.startsWith(open, lt));
    if (special) {
      const end = xml.indexOf(special[1], lt + special[0].length);
      if (end < 0) {
        problems.push(`unclosed ${special[0]} at ${lt}`);
        break;
      }
      i = end + special[1].length;
      continue;
    }
    if (xml.startsWith("<!", lt)) {
      problems.push(`unexpected declaration at ${lt}`);
      break;
    }
    if (xml[lt + 1] === "/") {
      const name = readName(xml, lt + 2);
      const gt = xml.indexOf(">", lt);
      if (!name || gt < 0 || xml.slice(lt + 2 + name.length, gt).trim()) {
        problems.push(`malformed closing tag at ${lt}`);
        break;
      }
      const open = stack.pop();
      if (open !== name) problems.push(`</${name}> at ${lt} closes <${open ?? "nothing"}>`);
      i = gt + 1;
      continue;
    }
    const start = readStartTag(xml, lt, problems);
    if (!start) break;
    if (!stack.length) roots += 1;
    if (!start.selfClosing) stack.push(start.tag);
    i = start.end;
  }
  if (stack.length) problems.push(`unclosed elements: ${stack.join(" > ")}`);
  if (roots !== 1) problems.push(`${roots} root elements`);
  return problems;
}

/** Every value of an attribute across a document, in order. */
export const attributeValues = (xml: string, name: string): string[] =>
  [...xml.matchAll(new RegExp(`\\s${name}="([^"]*)"`, "g"))].map((m) => m[1] ?? "");

// ---------------------------------------------------------------- PNG

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Pixel size from the IHDR chunk, which the PNG spec requires to come first. */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const type = String.fromCharCode(...png.subarray(12, 16));
  if (type !== "IHDR") throw new Error(`first PNG chunk is "${type}", not IHDR`);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

// ---------------------------------------------------------------- CLI

export interface CliRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the bundled CLI the way an agent does: `node skills/stackdraw/scripts/stackdraw.mjs`. */
export function runCli(args: string[], cwd = ROOT, stdin?: string): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_BUNDLE, ...args], {
      cwd,
      stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    if (stdin !== undefined) child.stdin?.end(stdin);
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
