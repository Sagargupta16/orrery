// The MCP Apps view (https://github.com/modelcontextprotocol/ext-apps, spec 2026-01-26): one
// self-contained HTML page served as ui://orrery/viewer. render and review name it in their tool
// _meta; a host that renders MCP Apps reads it with resources/read, shows it in a sandboxed iframe
// and posts the tool result to it. The page asks for nothing over the network, so the host's
// default CSP (no connect, images from data: only) is all it needs.
//
// The picture travels in the result's _meta under VIEWER_KEY, which hosts keep out of the model's
// context, and only when the client declared the extension: other hosts get the results unchanged.
// Without it the page falls back to the result's content (the SVG text or the review PNG).
import type { Artifact } from "../render/index.ts";
import type { ReviewReport } from "../review/index.ts";
import { type AnimateMode, type Model, type Skin, THEMES, type ThemeName } from "../types.ts";
import { isObj, type Obj, renderSafe } from "./kit.ts";

export const UI_EXTENSION = "io.modelcontextprotocol/ui";
export const VIEWER_URI = "ui://orrery/viewer";
export const VIEWER_MIME = "text/html;profile=mcp-app";
export const VIEWER_KEY = "orrery/viewer";

/** Tool _meta that links a tool to the viewer; the flat key is the deprecated form older hosts read. */
export const VIEWER_LINK: Obj = { ui: { resourceUri: VIEWER_URI }, "ui/resourceUri": VIEWER_URI };

const RESOURCE_META = { ui: { prefersBorder: true } };

export const VIEWER_RESOURCE = {
  uri: VIEWER_URI,
  name: "orrery-viewer",
  title: "orrery diagram viewer",
  description:
    "Shows a render or review result: the animated SVG with a light and dark switch, zoom and pan, and the review score.",
  mimeType: VIEWER_MIME,
  _meta: RESOURCE_META,
};

/** The client renders MCP Apps views: it declared the extension with the viewer's MIME type. */
export function supportsUi(capabilities: unknown): boolean {
  if (!isObj(capabilities) || !isObj(capabilities.extensions)) return false;
  const ui = capabilities.extensions[UI_EXTENSION];
  return isObj(ui) && Array.isArray(ui.mimeTypes) && ui.mimeTypes.includes(VIEWER_MIME);
}

/** What the viewer draws, carried in the result's _meta[VIEWER_KEY]. */
export interface ViewerPayload {
  title: string;
  /** The theme to show first. */
  theme: "light" | "dark";
  svg: { light?: string; dark?: string };
  width: number;
  height: number;
  review?: {
    score: number;
    pass: boolean;
    width: number;
    dimensions: Record<string, number>;
    findings: { severity: string; claim: string }[];
  };
}

interface PayloadRequest {
  model: Model;
  name: string;
  theme: ThemeName;
  animate?: AnimateMode;
  skin?: Skin;
  /** SVGs the call already rendered; only the missing themes are rendered again. */
  have?: Artifact[];
  report?: ReviewReport;
}

/** The result _meta that hands the viewer both themes (animated) and the review summary. */
export async function viewerMeta(req: PayloadRequest): Promise<Obj | undefined> {
  const svgs = new Map<ThemeName, Artifact>();
  const keep = (list: Artifact[]) => {
    for (const a of list)
      if (a.format === "svg" && a.theme && typeof a.data === "string") svgs.set(a.theme, a);
  };
  keep(req.have ?? []);
  const missing = THEMES.filter((t) => !svgs.has(t));
  if (missing.length) {
    const { model, name, animate, skin } = req;
    keep(
      (await renderSafe({ model, formats: ["svg"], themes: missing, name, animate, skin }))
        .artifacts,
    );
  }
  const first = svgs.get(req.theme) ?? [...svgs.values()][0];
  if (!first) return undefined;
  const svg: ViewerPayload["svg"] = {};
  for (const [theme, a] of svgs) svg[theme] = a.data as string;
  const r = req.report;
  const payload: ViewerPayload = {
    title: req.model.title ?? req.name,
    theme: req.theme,
    svg,
    width: first.width,
    height: first.height,
    ...(r
      ? {
          review: {
            score: r.score,
            pass: r.pass,
            width: r.width,
            dimensions: Object.fromEntries(
              Object.entries(r.dimensions).map(([k, d]) => [k, d.score]),
            ),
            findings: r.findings.slice(0, 5).map((f) => ({ severity: f.severity, claim: f.claim })),
          },
        }
      : {}),
  };
  return { [VIEWER_KEY]: payload };
}

export function readViewer(uri: unknown) {
  if (uri !== VIEWER_URI) return undefined;
  return [{ uri: VIEWER_URI, mimeType: VIEWER_MIME, text: VIEWER_HTML, _meta: RESOURCE_META }];
}

// The page speaks the host's postMessage JSON-RPC itself (ui/initialize, then
// ui/notifications/initialized; tool-result and host-context-changed come in) rather than
// bundling the ext-apps SDK. Its look and controls match the standalone page render -f html makes.
export const VIEWER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="orrery">
<title>orrery diagram</title>
<style>
:root{color-scheme:light dark;--bg:#f6f7f9;--panel:#ffffff;--ink:#1f2937;--muted:#5f6b7a;--line:#d8dde3;--accent:#2563eb;--good:#15803d;--bad:#b45309}
body[data-theme=dark]{--bg:#090c10;--panel:#0d1117;--ink:#e6edf3;--muted:#9aa4b2;--line:#30363d;--accent:#58a6ff;--good:#3fb950;--bad:#d29922}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0}
body{background:var(--bg);color:var(--ink);font:14px/1.4 Inter,"Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Arial,sans-serif;transition:background .25s ease,color .25s ease}
header{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--panel)}
h1{font-size:14px;font-weight:600;margin:0;flex:1 1 180px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
button{appearance:none;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;cursor:pointer;min-height:36px;min-width:36px;display:inline-flex;align-items:center;justify-content:center;transition:border-color .15s ease,transform .15s ease}
button:hover{border-color:var(--accent)}
button:active{transform:scale(.97)}
button:disabled{opacity:.45;cursor:default;border-color:var(--line)}
#zoom{min-width:48px;text-align:center;font-size:12px;color:var(--muted)}
#review{border:1px solid var(--line);border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600;cursor:pointer}
#review[data-pass=true]{color:var(--good);border-color:var(--good)}
#review[data-pass=false]{color:var(--bad);border-color:var(--bad)}
#details{border-bottom:1px solid var(--line);background:var(--panel);padding:8px 12px;font-size:12px;color:var(--muted)}
#details ul{margin:6px 0 0;padding-left:18px}
#dims{display:flex;flex-wrap:wrap;gap:4px 14px}
#dims b{color:var(--ink);font-weight:600}
main{position:relative;overflow:hidden;touch-action:none;cursor:grab;height:360px}
main.dragging{cursor:grabbing}
#canvas{position:absolute;left:0;top:0;transform-origin:0 0}
#canvas img{display:block;max-width:none;border-radius:8px}
#empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:var(--muted)}
.hint{position:absolute;right:10px;bottom:8px;font-size:11px;color:var(--muted);pointer-events:none}
@media (max-width:440px){header{padding:8px}.tools{gap:4px}button{padding:6px 8px}#zoom{min-width:36px}#review{padding:4px 8px}.hint{display:none}}
</style>
</head>
<body data-theme="light">
<header>
<h1 id="title">orrery</h1>
<div class="tools">
<span id="review" role="button" tabindex="0" hidden></span>
<button type="button" id="theme" aria-label="Switch light or dark" disabled>Dark</button>
<button type="button" id="out" aria-label="Zoom out">-</button>
<span id="zoom">100%</span>
<button type="button" id="in" aria-label="Zoom in">+</button>
<button type="button" id="fit">Fit</button>
</div>
</header>
<div id="details" hidden><div id="dims"></div><ul id="findings"></ul></div>
<main id="stage" aria-label="Diagram, drag to pan, scroll or pinch to zoom">
<div id="canvas"><img id="diagram" alt=""></div>
<div id="empty">Waiting for the diagram</div>
<div class="hint">drag to pan, scroll or pinch to zoom</div>
</main>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const body = document.body, stage = $("stage"), canvas = $("canvas"), img = $("diagram");
  const view = { title: "", svg: {}, png: "", width: 0, height: 0, theme: "light" };
  let theme = "light", chosen = false, scale = 1, x = 0, y = 0, host = {};
  // The reader's own pick, then the host's theme, then the spec's, among the themes on hand; a
  // lone PNG keeps the page in the picture's theme.
  const pick = () => [chosen && theme, host.theme, view.theme, "light", "dark"].find((t) => t && view.svg[t]) || (view.png ? view.theme : host.theme || view.theme);

  // ---- the host bridge: JSON-RPC 2.0 over postMessage to the parent frame
  let seq = 0;
  const pending = new Map();
  const post = (msg) => window.parent.postMessage({ jsonrpc: "2.0", ...msg }, "*");
  const request = (method, params) => new Promise((done, fail) => { const id = ++seq; pending.set(id, { done, fail }); post({ id, method, params }); });
  const notify = (method, params) => post({ method, params });
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent) return;
    const m = e.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.method === undefined) {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.error ? p.fail(m.error) : p.done(m.result || {});
      return;
    }
    if (m.method === "ui/notifications/tool-result") show(m.params || {});
    else if (m.method === "ui/notifications/host-context-changed") context(m.params || {});
    // Requests the page has nothing to add to (ui/resource-teardown, ping) get an empty result.
    else if (m.id !== undefined) post({ id: m.id, result: {} });
  });

  // ---- reading a render or review result
  const svgSize = (svg) => {
    const m = /<svg\\b[^>]*?\\swidth="([\\d.]+)"[^>]*?\\sheight="([\\d.]+)"/.exec(svg || "");
    return m ? [Number(m[1]), Number(m[2])] : [0, 0];
  };
  const parse = (t) => { try { return JSON.parse(t); } catch { return undefined; } };
  function show(result) {
    const content = Array.isArray(result.content) ? result.content : [];
    const data = result._meta && result._meta["${VIEWER_KEY}"];
    view.png = "";
    if (data && data.svg) {
      Object.assign(view, { title: data.title || "", svg: data.svg, width: data.width, height: data.height, theme: data.theme });
      review(data.review);
    } else {
      // No viewer data (a host that did not declare the extension): read the content itself.
      const head = parse(content[0] && content[0].text) || {};
      view.svg = {};
      for (const o of head.outputs || []) {
        const c = content[o.content];
        if (o.format === "svg" && c && c.type === "text") view.svg[o.theme === "dark" ? "dark" : "light"] = c.text;
      }
      const image = content.find((c) => c.type === "image");
      if (!view.svg.light && !view.svg.dark && image) view.png = "data:" + image.mimeType + ";base64," + image.data;
      review(head.dimensions ? { score: head.score, pass: head.pass, width: head.width, dimensions: Object.fromEntries(Object.entries(head.dimensions).map(([k, d]) => [k, d.score])), findings: (head.findings || []).slice(0, 5) } : undefined);
      view.title = head.name || "";
      view.theme = head.theme || "light";
      const first = view.svg.light || view.svg.dark;
      [view.width, view.height] = first ? svgSize(first) : [head.display ? head.display.width : 0, head.display ? head.display.height : 0];
      if (!first && !view.png) return empty(result.isError ? "The call failed: " + ((content[0] && content[0].text) || "no message") : head.ok === false ? "No picture: the spec has " + head.errors + " error(s). Fix them and render again." : "No picture in this result.");
    }
    $("title").textContent = view.title || "orrery diagram";
    img.alt = view.title || "Diagram";
    theme = pick();
    draw(true);
  }
  function review(r) {
    const badge = $("review");
    badge.hidden = !r;
    if (!r) { $("details").hidden = true; return; }
    badge.dataset.pass = String(!!r.pass);
    badge.textContent = "Review " + r.score + (r.pass ? " pass" : " fail");
    badge.title = "Measured at " + r.width + " px";
    $("dims").replaceChildren(...Object.entries(r.dimensions || {}).map(([k, v]) => { const s = document.createElement("span"); s.append(k + " "); const b = document.createElement("b"); b.textContent = v; s.append(b); return s; }));
    $("findings").replaceChildren(...(r.findings || []).map((f) => { const li = document.createElement("li"); li.textContent = f.severity + ": " + f.claim; return li; }));
  }
  function empty(message) {
    $("empty").textContent = message;
    $("empty").hidden = false;
    img.hidden = true;
    $("theme").disabled = true;
    resize();
  }

  // ---- drawing, zoom and pan
  const src = () => view.svg[theme] ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(view.svg[theme]) : view.png;
  function draw(refit) {
    body.dataset.theme = theme;
    const both = !!(view.svg.light && view.svg.dark);
    $("theme").disabled = !both;
    $("theme").textContent = theme === "light" ? "Dark" : "Light";
    $("empty").hidden = true;
    img.hidden = false;
    img.src = src();
    img.width = view.width;
    img.height = view.height;
    if (refit) resize(); else apply();
  }
  const apply = () => { canvas.style.transform = "translate(" + x + "px," + y + "px) scale(" + scale + ")"; $("zoom").textContent = Math.round(scale * 100) + "%"; };
  function fit() {
    if (!view.width) return;
    const r = stage.getBoundingClientRect();
    scale = Math.min((r.width - 16) / view.width, (r.height - 16) / view.height, 2);
    x = (r.width - view.width * scale) / 2;
    y = (r.height - view.height * scale) / 2;
    apply();
  }
  const zoomAt = (f, cx, cy) => { const ns = Math.max(0.1, Math.min(8, scale * f)); x = cx - (cx - x) * (ns / scale); y = cy - (cy - y) * (ns / scale); scale = ns; apply(); };
  const centre = (f) => { const r = stage.getBoundingClientRect(); zoomAt(f, r.width / 2, r.height / 2); };
  const pointers = new Map();
  let pinch = 0;
  stage.addEventListener("pointerdown", (e) => { stage.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); stage.classList.add("dragging"); });
  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), r = stage.getBoundingClientRect();
      if (pinch) zoomAt(d / pinch, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
      pinch = d;
    } else { x += e.clientX - prev[0]; y += e.clientY - prev[1]; apply(); }
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; if (!pointers.size) stage.classList.remove("dragging"); };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  stage.addEventListener("dblclick", fit);
  $("theme").onclick = () => { chosen = true; theme = theme === "light" ? "dark" : "light"; draw(false); };
  $("in").onclick = () => centre(1.25);
  $("out").onclick = () => centre(0.8);
  $("fit").onclick = fit;
  const toggle = () => { $("details").hidden = !$("details").hidden; resize(); };
  $("review").onclick = toggle;
  $("review").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };
  addEventListener("keydown", (e) => { if (e.target !== document.body) return; if (e.key === "+" || e.key === "=") centre(1.25); else if (e.key === "-") centre(0.8); else if (e.key === "0") fit(); });

  // ---- sizing: the stage is as tall as the diagram at this width, within what the host allows
  let sent = 0;
  function resize() {
    const dims = host.containerDimensions || {};
    const chrome = document.querySelector("header").offsetHeight + ($("details").hidden ? 0 : $("details").offsetHeight);
    const wanted = view.width ? (innerWidth - 16) * view.height / view.width + 16 : 200;
    const room = dims.height ? dims.height - chrome : Math.min(dims.maxHeight ? dims.maxHeight - chrome : 640, Math.max(220, wanted));
    stage.style.height = Math.max(160, Math.round(room)) + "px";
    fit();
    const h = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (h !== sent) { sent = h; notify("ui/notifications/size-changed", { width: Math.ceil(document.documentElement.scrollWidth), height: h }); }
  }
  function context(c) {
    host = { ...host, ...c, containerDimensions: c.containerDimensions || host.containerDimensions };
    const next = pick();
    if (next !== theme && (next === "light" || next === "dark")) { theme = next; if (view.width) draw(false); else body.dataset.theme = theme; }
    resize();
  }
  let width = innerWidth;
  addEventListener("resize", () => { if (innerWidth !== width) { width = innerWidth; resize(); } });

  request("ui/initialize", { protocolVersion: "2026-01-26", appInfo: { name: "orrery-viewer", version: "1" }, appCapabilities: {} })
    .then((r) => { context(r.hostContext || {}); notify("ui/notifications/initialized", {}); })
    .catch(() => notify("ui/notifications/initialized", {}));
})();
</script>
</body>
</html>
`;
