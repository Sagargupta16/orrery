// A standalone page around the diagram: light/dark switch, pan and pinch-zoom, fit, and SVG/PNG
// downloads. No network requests, works from file://, usable on a phone.
import { esc } from "./svg.ts";

export interface HtmlInput {
  title: string;
  light: string;
  dark: string;
  /** Still frames for the PNG export of animated SVGs (a canvas bakes packets mid-edge). */
  lightStill?: string;
  darkStill?: string;
  /** Base name for downloads. */
  name: string;
  initial: "light" | "dark";
}

export function renderHtml(input: HtmlInput): string {
  const b64 = (svg: string) => Buffer.from(svg).toString("base64");
  const lightB64 = b64(input.light);
  const darkB64 = b64(input.dark);
  const stills =
    input.lightStill && input.darkStill
      ? `{ light: "${b64(input.lightStill)}", dark: "${b64(input.darkStill)}" }`
      : "svgs";
  // A JS literal for the script, where HTML entities are not decoded; "<" escaped so it cannot close it.
  const name = JSON.stringify(input.name).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="generator" content="orrery">
<title>${esc(input.title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f6f7f9;--panel:#ffffff;--ink:#1f2937;--muted:#5f6b7a;--line:#d8dde3;--accent:#2563eb}
body[data-theme=dark]{--bg:#090c10;--panel:#0d1117;--ink:#e6edf3;--muted:#9aa4b2;--line:#30363d;--accent:#58a6ff}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--ink);font:14px/1.4 Inter,"Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Arial,sans-serif;display:flex;flex-direction:column;transition:background .25s ease,color .25s ease}
header{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--panel)}
h1{font-size:15px;font-weight:600;margin:0;flex:1 1 220px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tools{display:flex;flex-wrap:wrap;gap:6px}
button,a.btn{appearance:none;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;text-decoration:none;min-height:44px;min-width:44px;justify-content:center;display:inline-flex;align-items:center;gap:6px;transition:border-color .15s ease,transform .15s ease}
button:hover,a.btn:hover{border-color:var(--accent)}
button:active,a.btn:active{transform:scale(.97)}
main{position:relative;flex:1;overflow:hidden;touch-action:none;cursor:grab}
main.dragging{cursor:grabbing}
#canvas{position:absolute;left:0;top:0}
#canvas img{display:block;max-width:none;border-radius:10px;box-shadow:0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.08);transition:opacity .2s ease}
body[data-theme=dark] #canvas img{box-shadow:0 0 0 1px var(--line)}
.hint{position:absolute;right:12px;bottom:10px;font-size:12px;color:var(--muted);pointer-events:none}
</style>
</head>
<body data-theme="${input.initial}">
<header>
<h1>${esc(input.title)}</h1>
<div class="tools">
<button type="button" data-act="theme" aria-label="Switch light or dark">Theme</button>
<button type="button" data-act="out" aria-label="Zoom out">-</button>
<button type="button" data-act="in" aria-label="Zoom in">+</button>
<button type="button" data-act="fit">Fit</button>
<a class="btn" data-act="svg" download="${esc(input.name)}.svg" href="#">SVG</a>
<button type="button" data-act="png">PNG</button>
</div>
</header>
<main id="stage" aria-label="Diagram, drag to pan, scroll or pinch to zoom">
<div id="canvas"><img id="diagram" alt="${esc(input.title)}"></div>
<div class="hint">drag to pan, scroll or pinch to zoom</div>
</main>
<script>
(() => {
  const svgs = { light: "${lightB64}", dark: "${darkB64}" };
  const stills = ${stills};
  const name = ${name};
  const toUrl = (b64) => "data:image/svg+xml;base64," + b64;
  const body = document.body, stage = document.getElementById("stage"), canvas = document.getElementById("canvas"), img = document.getElementById("diagram");
  let theme = body.dataset.theme, scale = 1, x = 0, y = 0;
  const size = () => { const m = atob(svgs[theme].slice(0, 800)).match(/width="([\\d.]+)" height="([\\d.]+)"/); return m ? [Number(m[1]), Number(m[2])] : [1000, 600]; };
  const apply = () => { const [w, h] = size(); canvas.style.left = x + "px"; canvas.style.top = y + "px"; img.style.width = w * scale + "px"; img.style.height = h * scale + "px"; };
  const fit = () => { const [w, h] = size(); const r = stage.getBoundingClientRect(); scale = Math.min((r.width - 32) / w, (r.height - 32) / h, 2); x = (r.width - w * scale) / 2; y = Math.max(16, (r.height - h * scale) / 2); apply(); };
  const show = () => { body.dataset.theme = theme; img.src = toUrl(svgs[theme]); const [w, h] = size(); img.width = w; img.height = h; apply(); const a = document.querySelector('[data-act=svg]'); a.href = toUrl(svgs[theme]); a.download = name + "-" + theme + ".svg"; };
  const zoomAt = (f, cx, cy) => { const ns = Math.max(0.1, Math.min(8, scale * f)); x = cx - (cx - x) * (ns / scale); y = cy - (cy - y) * (ns / scale); scale = ns; apply(); };
  const pointers = new Map(); let pinch = 0;
  stage.addEventListener("pointerdown", (e) => { stage.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); stage.classList.add("dragging"); });
  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const r = stage.getBoundingClientRect();
      if (pinch) zoomAt(d / pinch, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); pinch = d;
    } else { x += e.clientX - prev[0]; y += e.clientY - prev[1]; apply(); }
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; if (!pointers.size) stage.classList.remove("dragging"); };
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  document.querySelector("[data-act=theme]").onclick = () => { theme = theme === "light" ? "dark" : "light"; show(); };
  document.querySelector("[data-act=in]").onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2); };
  document.querySelector("[data-act=out]").onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2); };
  document.querySelector("[data-act=fit]").onclick = fit;
  document.querySelector("[data-act=png]").onclick = () => {
    // 3x like the CLI, capped at 16.7M pixels, the largest canvas iOS Safari will export.
    const [w, h] = size(); const k = Math.min(3, Math.sqrt(16.7e6 / (w * h))); const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const im = new Image(); im.onload = () => { const g = c.getContext("2d"); g.scale(c.width / w, c.height / h); g.drawImage(im, 0, 0, w, h); const a = document.createElement("a"); a.download = name + "-" + theme + ".png"; a.href = c.toDataURL("image/png"); a.click(); };
    im.src = toUrl(stills[theme]);
  };
  addEventListener("resize", fit);
  show(); fit();
})();
</script>
</body>
</html>
`;
}
