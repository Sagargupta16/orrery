// The playground page: the editor, the live preview, problems and review, toggles, downloads and
// share links. All rendering happens in the worker (worker/index.ts); this file only talks to it.
import { createEditor } from "./editor.ts";
import { fragmentOf, readFragment, type Shared } from "./share.ts";
import { cleanSvg, svgToPng } from "./svg.ts";

type Theme = "light" | "dark";
type Skin = "stage" | "classic";

interface Diagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  subject?: Record<string, unknown>;
  fixes?: string[];
}

interface RenderReply {
  id: number;
  kind: "render";
  ok: boolean;
  diagnostics: Diagnostic[];
  svg?: string;
  drawio?: string;
  mmd?: string;
  width?: number;
  height?: number;
  theme?: Theme;
  skin?: Skin;
  title?: string;
  counts?: { nodes: number; groups: number; edges: number };
  ms: number;
}

interface Finding {
  id: string;
  dimension: string;
  severity: "blocker" | "major" | "minor";
  claim: string;
  fixes: string[];
  subjects: string[];
}

interface Report {
  width: number;
  scale: number;
  score: number;
  pass: boolean;
  canvas: { width: number; height: number };
  display: { width: number; height: number };
  hard: Record<string, number>;
  dimensions: Record<string, { score: number; weight: number }>;
  findings: Finding[];
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const root = $("play");
const base = root.dataset.base ?? "/";
const fonts = root.dataset.fonts ?? "";
const defaultExample = root.dataset.default ?? "starter";

const editor = createEditor($<HTMLTextAreaElement>("spec"), $("gutter"));
const select = $<HTMLSelectElement>("example");
const stage = $("stage");
const preview = $("preview");
const workspace = $("workspace");

const state: Shared & { name: string; width: number; edited: boolean } = {
  name: defaultExample,
  width: 880,
  edited: false,
};
let latest = 0;
let last: RenderReply | undefined;
/** The spec text of each render sent, so downloads use the spec of the picture on screen. */
const sent = new Map<number, string>();
let lastSpec = "";
let fit = true;

/** Builds an element with text content only: nothing from a spec ever becomes markup. */
function h(tag: string, cls = "", text?: string, children: Node[] = []): HTMLElement {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  el.append(...children);
  return el;
}

let toastTimer = 0;
function toast(text: string, tone: "ok" | "bad" | "info" = "info") {
  const el = $("toast");
  el.textContent = text;
  el.dataset.tone = tone;
  el.dataset.on = "1";
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => delete el.dataset.on, 3800);
}

function setStatus(kind: "busy" | "ok" | "warn" | "bad", text: string) {
  $("status-dot").dataset.kind = kind;
  $("status-text").textContent = text;
  if (kind === "busy") $("progress").dataset.on = "1";
  else delete $("progress").dataset.on;
}

// The worker -------------------------------------------------------------------------------------

const worker = new Worker(root.dataset.worker ?? "");
const waiting = new Map<number, (reply: Record<string, unknown>) => void>();
let jobs = 1_000_000;

function ask<T>(job: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
  const id = ++jobs;
  return new Promise<T>((resolve, reject) => {
    waiting.set(id, (reply) =>
      reply.kind === "error" ? reject(new Error(String(reply.message))) : resolve(reply as T),
    );
    worker.postMessage({ ...job, id }, transfer);
  });
}

worker.onmessage = (e: MessageEvent<Record<string, unknown>>) => {
  const reply = e.data;
  const id = Number(reply.id);
  if (waiting.has(id)) {
    waiting.get(id)?.(reply);
    waiting.delete(id);
    return;
  }
  if (reply.kind === "ready") $("version").textContent = `orrery ${reply.version}`;
  else if (reply.kind === "status" && reply.text) setStatus("busy", String(reply.text));
  else if (id !== latest) return;
  else if (reply.kind === "render") showRender(reply as unknown as RenderReply);
  else if (reply.kind === "review")
    showReview(reply.report as Report | undefined, reply.error as string | undefined);
  else if (reply.kind === "error") setStatus("bad", `The renderer stopped: ${reply.message}`);
};
worker.addEventListener("message", (e: MessageEvent<Record<string, unknown>>) => {
  if (e.data.kind === "fatal")
    setStatus("bad", `The renderer could not start (${e.data.message}). Reload the page to try again.`);
});
worker.onerror = () => setStatus("bad", "The renderer failed to load. Reload the page to try again.");

let timer = 0;
function schedule(delay = 260) {
  clearTimeout(timer);
  timer = window.setTimeout(render, delay);
}

function render() {
  latest += 1;
  sent.set(latest, editor.value);
  sent.delete(latest - 8);
  setStatus("busy", "Rendering");
  $("review").dataset.stale = "1";
  worker.postMessage({
    id: latest,
    kind: "render",
    spec: editor.value,
    name: state.name,
    theme: state.theme,
    skin: state.skin,
    width: state.width,
  });
  saveFragment();
}

// Preview ----------------------------------------------------------------------------------------

function applyFit() {
  const svg = stage.querySelector("svg");
  $("zoom").textContent = fit ? "Fit" : "100%";
  $("zoom").setAttribute("aria-pressed", String(!fit));
  if (!svg || !last?.width || !last.height) return;
  svg.style.width = fit ? "100%" : `${last.width}px`;
  svg.style.height = fit ? "100%" : `${last.height}px`;
  stage.dataset.fit = fit ? "1" : "";
}

function showRender(reply: RenderReply) {
  const errors = reply.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = reply.diagnostics.length - errors;
  showProblems(reply.diagnostics);
  if (reply.svg) {
    last = reply;
    lastSpec = sent.get(reply.id) ?? editor.value;
    const svg = cleanSvg(reply.svg);
    if (svg) {
      svg.classList.add("rise");
      stage.replaceChildren(svg);
      preview.dataset.theme = reply.theme ?? "dark";
      applyFit();
    }
    $("preview-meta").textContent = `${reply.width} x ${reply.height} px, ${reply.counts?.nodes ?? 0} nodes, ${reply.counts?.edges ?? 0} edges`;
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-download]")) b.disabled = false;
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-theme]"))
    b.setAttribute("aria-pressed", String(b.dataset.theme === (state.theme ?? reply.theme ?? last?.theme)));
  for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-skin]"))
    b.setAttribute("aria-pressed", String(b.dataset.skin === (state.skin ?? reply.skin ?? last?.skin)));
  const ms = `${Math.round(reply.ms)} ms`;
  if (errors) {
    setStatus("bad", `${errors} error${errors > 1 ? "s" : ""}${reply.svg ? "" : ": showing the last good render"}`);
    stage.dataset.stale = reply.svg ? "" : "1";
    $("review").dataset.stale = "1";
    for (const el of document.querySelectorAll<HTMLElement>("[data-review-score]")) el.textContent = "-";
  } else {
    stage.dataset.stale = "";
    setStatus(warnings ? "warn" : "ok", warnings ? `Rendered in ${ms}, ${warnings} warning${warnings > 1 ? "s" : ""}` : `Rendered in ${ms}`);
  }
}

// Problems ---------------------------------------------------------------------------------------

/** The spec line a diagnostic is about: the line its message names, or where its subject is defined. */
function lineOf(d: Diagnostic, text: string): number | undefined {
  const named = d.message.match(/\bline (\d+)/i);
  if (named) return Number(named[1]);
  const lines = text.split("\n");
  const values = Object.values(d.subject ?? {}).filter((v): v is string => typeof v === "string" && v.length > 0);
  for (const v of values) {
    const key = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const asKey = new RegExp(`^\\s*(-\\s*)?["']?${key}["']?\\s*:`);
    const at = lines.findIndex((l) => asKey.test(l));
    if (at >= 0) return at + 1;
  }
  for (const v of values) {
    const at = lines.findIndex((l) => l.includes(v));
    if (at >= 0) return at + 1;
  }
  return undefined;
}

function showProblems(diagnostics: Diagnostic[]) {
  const list = $("problems");
  const marks = new Map<number, "error" | "warning">();
  const text = editor.value;
  const items = diagnostics.map((d, i) => {
    const line = lineOf(d, text);
    if (line && marks.get(line) !== "error") marks.set(line, d.severity);
    const fixes = (d.fixes ?? []).map((f) => h("li", "", f));
    const button = h("button", "diag-button", undefined, [
      h("span", "flex flex-wrap items-center gap-2", undefined, [
        h("span", `sev sev-${d.severity}`, d.severity),
        h("code", "font-mono text-xs text-dim", d.code),
        ...(line ? [h("span", "font-mono text-xs text-faint", `line ${line}`)] : []),
      ]),
      h("span", "mt-1.5 block text-sm text-ink", d.message),
      ...(fixes.length ? [h("ul", "fixes", undefined, fixes)] : []),
    ]);
    button.setAttribute("type", "button");
    if (line)
      button.addEventListener("click", () => {
        setView("spec");
        $("panel-spec").scrollIntoView({ block: "nearest", behavior: "smooth" });
        editor.reveal(line);
      });
    else button.setAttribute("disabled", "");
    const item = h("li", "rise", undefined, [button]);
    item.style.animationDelay = `${Math.min(i, 12) * 28}ms`;
    return item;
  });
  list.replaceChildren(...items);
  editor.mark(marks);
  $("problems-empty").hidden = diagnostics.length > 0;
  const count = $("problem-count");
  count.textContent = String(diagnostics.length);
  count.dataset.kind = diagnostics.some((d) => d.severity === "error") ? "bad" : diagnostics.length ? "warn" : "ok";
  for (const el of document.querySelectorAll<HTMLElement>("[data-checks-count]")) {
    el.textContent = String(diagnostics.length);
    el.dataset.kind = count.dataset.kind;
  }
}

// Review -----------------------------------------------------------------------------------------

let shownScore = 0;
function countTo(el: HTMLElement, to: number) {
  const from = shownScore;
  shownScore = to;
  const started = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - started) / 700);
    const eased = 1 - (1 - t) ** 4;
    el.textContent = (from + (to - from) * eased).toFixed(1);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const DIMENSION_NAMES: Record<string, string> = {
  conventions: "Conventions",
  layout: "Layout",
  grid: "Grid",
  flow: "Flow",
  overlap: "Overlap",
  quality: "Legibility",
};
const HARD_NAMES: Record<string, string> = {
  overlaps: "overlaps",
  edgesThroughNodes: "edges through nodes",
  edgesThroughHeaders: "edges through headers",
  edgesThroughLabels: "edges through labels",
  offCanvas: "off canvas",
  contrastFailures: "contrast failures",
};

function showReview(report: Report | undefined, error?: string) {
  const box = $("review");
  if (!report) {
    $("review-context").textContent = error ? `The review could not run: ${error}` : "";
    return;
  }
  box.dataset.stale = "";
  countTo($("score"), report.score);
  const verdict = $("verdict");
  verdict.textContent = report.pass ? "Pass" : "Fail";
  verdict.dataset.kind = report.pass ? "ok" : "bad";
  for (const el of document.querySelectorAll<HTMLElement>("[data-review-score]")) el.textContent = report.score.toFixed(0);
  const pct = Math.round(report.scale * 100);
  $("review-context").textContent =
    pct < 100
      ? `${report.canvas.width} x ${report.canvas.height} px shown ${report.display.width} px wide: text and icons at ${pct}% of their size.`
      : `${report.canvas.width} x ${report.canvas.height} px fits a column ${report.width} px wide at full size.`;

  const rows = Object.entries(report.dimensions).map(([name, d]) => {
    const fill = h("span", "bar-fill");
    fill.style.setProperty("--to", `${d.score}%`);
    fill.dataset.kind = d.score >= 90 ? "ok" : d.score >= 70 ? "warn" : "bad";
    return h("li", "dim-row", undefined, [
      h("span", "text-sm text-ink", DIMENSION_NAMES[name] ?? name),
      h("span", "font-mono text-[0.7rem] text-faint tabular", `${Math.round(d.weight * 100)}%`),
      h("span", "bar", undefined, [fill]),
      h("span", "font-mono text-sm text-ink tabular text-right", d.score.toFixed(0)),
    ]);
  });
  $("dimensions").replaceChildren(...rows);
  // The bars grow from zero each time, so a change in score reads as motion.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const f of $("dimensions").querySelectorAll<HTMLElement>(".bar-fill")) f.style.width = f.style.getPropertyValue("--to");
    }),
  );

  const hard = Object.entries(report.hard).filter(([, n]) => n > 0);
  $("hard").replaceChildren(...hard.map(([k, n]) => h("span", "chip chip-bad", `${n} ${HARD_NAMES[k] ?? k}`)));

  const findings = report.findings.slice(0, 40).map((f, i) => {
    const item = h("li", "finding rise", undefined, [
      h("span", "flex flex-wrap items-center gap-2", undefined, [
        h("span", `sev sev-${f.severity}`, f.severity),
        h("code", "font-mono text-xs text-dim", f.id),
      ]),
      h("span", "mt-1.5 block text-sm text-ink", f.claim),
      ...(f.fixes.length ? [h("ul", "fixes", undefined, f.fixes.slice(0, 3).map((x) => h("li", "", x)))] : []),
    ]);
    item.style.animationDelay = `${Math.min(i, 12) * 28}ms`;
    return item;
  });
  $("findings").replaceChildren(...findings);
  $("findings-empty").hidden = report.findings.length > 0;
  $("findings-more").textContent =
    report.findings.length > 40 ? `and ${report.findings.length - 40} more; run orrery review for the full report` : "";
}

// Views, toggles, width ----------------------------------------------------------------------------

function setView(view: string) {
  workspace.dataset.view = view;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-view-tab]"))
    b.setAttribute("aria-selected", String(b.dataset.viewTab === view));
}
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-view-tab]"))
  b.addEventListener("click", () => setView(b.dataset.viewTab ?? "diagram"));

function setChecks(tab: string) {
  $("checks").dataset.tab = tab;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-check-tab]"))
    b.setAttribute("aria-selected", String(b.dataset.checkTab === tab));
}
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-check-tab]"))
  b.addEventListener("click", () => setChecks(b.dataset.checkTab ?? "problems"));

for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-theme]"))
  b.addEventListener("click", () => {
    state.theme = b.dataset.theme as Theme;
    schedule(0);
  });
for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-skin]"))
  b.addEventListener("click", () => {
    state.skin = b.dataset.skin as Skin;
    schedule(0);
  });

const widthInput = $<HTMLInputElement>("width");
function setWidth(width: number, rerender = true) {
  state.width = Math.max(200, Math.min(4000, Math.round(width) || 880));
  widthInput.value = String(state.width);
  for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-width]"))
    b.setAttribute("aria-pressed", String(Number(b.dataset.width) === state.width));
  if (rerender) schedule(0);
}
for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-width]"))
  b.addEventListener("click", () => setWidth(Number(b.dataset.width)));
widthInput.addEventListener("change", () => setWidth(Number(widthInput.value)));

$("zoom").addEventListener("click", () => {
  fit = !fit;
  applyFit();
});

// Spec, examples, fragment -----------------------------------------------------------------------

let fragmentTimer = 0;
function saveFragment() {
  clearTimeout(fragmentTimer);
  fragmentTimer = window.setTimeout(async () => {
    const fragment = await fragmentOf({
      ...state,
      spec: state.edited || !state.example ? editor.value : undefined,
    });
    history.replaceState(null, "", `${location.pathname}${location.search}#${fragment}`);
  }, 500);
}

async function loadExample(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}gallery/${name}/${name}.yaml`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    editor.value = await res.text();
    state.example = name;
    state.name = name;
    state.edited = false;
    select.value = name;
    return true;
  } catch {
    toast(`Could not load the example ${name}`, "bad");
    return false;
  }
}

select.addEventListener("change", async () => {
  if (select.value && (await loadExample(select.value))) schedule(0);
});

editor.onChange(() => {
  if (!state.edited) {
    // An edited example is the user's own diagram now: downloads and ids say "diagram".
    state.edited = true;
    state.name = "diagram";
    select.value = "";
  }
  schedule();
});

async function share() {
  const fragment = await fragmentOf({ ...state, example: undefined, spec: editor.value });
  const link = `${location.origin}${location.pathname}#${fragment}`;
  history.replaceState(null, "", `#${fragment}`);
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title: last?.title ?? "orrery diagram", url: link });
      return;
    } catch {}
  }
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copied. The spec rides in its #fragment, which never reaches a server.", "ok");
  } catch {
    toast("The link is in the address bar: copy it from there.", "info");
  }
}
$("share").addEventListener("click", share);

// Downloads ----------------------------------------------------------------------------------------

function save(data: BlobPart, type: string, file: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = h("a") as HTMLAnchorElement;
  a.href = url;
  a.download = file;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function fileBase(): string {
  const skin = state.skin ?? last?.skin;
  return `${state.name}${skin === "classic" ? "-classic" : ""}-${state.theme ?? last?.theme ?? "dark"}`;
}

async function download(kind: string) {
  ($("download-menu") as HTMLDetailsElement).open = false;
  if (kind === "yaml") return save(editor.value, "text/yaml", `${state.name}.yaml`);
  if (!last?.svg) return toast("Fix the spec's errors first: there is nothing to download yet", "bad");
  if (kind === "svg") return save(last.svg, "image/svg+xml", `${fileBase()}.svg`);
  if (kind === "drawio" && last.drawio) return save(last.drawio, "application/xml", `${fileBase()}.drawio`);
  if (kind === "mmd" && last.mmd) return save(last.mmd, "text/plain", `${state.name}.mmd`);
  if (kind === "png") {
    toast("Drawing the PNG");
    try {
      const still = await ask<{ svg: string; width: number; height: number }>({
        kind: "still",
        spec: lastSpec,
        name: state.name,
        theme: state.theme,
        skin: state.skin,
      });
      const { png, scale } = await svgToPng(still.svg, still.width, still.height, fonts);
      const embedded = await ask<{ png: Uint8Array }>({ kind: "embed", spec: lastSpec, png }, [png.buffer as ArrayBuffer]);
      save(embedded.png as BlobPart, "image/png", `${fileBase()}.png`);
      toast(scale < 2 ? `PNG saved at ${scale.toFixed(2)}x (the largest canvas this browser draws)` : "PNG saved at 2x", "ok");
    } catch (e) {
      toast(`The PNG could not be drawn: ${(e as Error).message}`, "bad");
    }
  }
}
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-download]"))
  b.addEventListener("click", () => download(b.dataset.download ?? "svg"));
document.addEventListener("click", (e) => {
  const menu = $("download-menu") as HTMLDetailsElement;
  if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
});

// Start ------------------------------------------------------------------------------------------

/** Applies a link's theme, skin and width, then its spec or example; false when it names nothing to draw. */
async function openFragment(hash: string): Promise<boolean> {
  const shared = await readFragment(hash);
  if (shared.theme) state.theme = shared.theme;
  if (shared.skin) state.skin = shared.skin;
  if (shared.width) setWidth(shared.width, false);
  if (shared.broken) toast("That link's spec could not be read; it may be cut short", "bad");
  if (shared.spec !== undefined) {
    editor.value = shared.spec;
    state.edited = true;
    state.name = shared.name ?? "diagram";
    select.value = "";
    return true;
  }
  if (!shared.example) return false;
  // The example already on screen needs no fetch, unless it was edited: the link resets it.
  if (shared.example === state.example && !state.edited) return true;
  return loadExample(shared.example);
}

async function start() {
  setStatus("busy", "Loading the renderer");
  setView(matchMedia("(min-width: 1024px)").matches ? "spec" : "diagram");
  setChecks("problems");
  if (!(await openFragment(location.hash))) await loadExample(defaultExample);
  render();
}

window.addEventListener("hashchange", () => {
  // A pasted link opened in the same tab: load what it carries, as a fresh load would.
  void openFragment(location.hash).then((opened) => {
    if (opened) schedule(0);
  });
});

void start();
