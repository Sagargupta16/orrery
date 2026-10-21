// The preview puts the renderer's SVG straight into the page, so the page's own Inter and Geist
// Mono faces draw it (the faces orrery measures text with). A shared link can carry any spec, so
// the markup is cleaned first: no scripts, no foreign content, no event handlers, no outside links.
// PNG export draws the still SVG on a canvas, with the same faces embedded in it.

const BLOCKED = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
]);
const SAFE_HREF = /^(#|data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,])/i;

export function cleanSvg(markup: string): SVGSVGElement | undefined {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = doc.documentElement;
  if (root.localName !== "svg" || doc.getElementsByTagName("parsererror").length) return undefined;
  const drop: Element[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  for (let node: Node | null = root; node; node = walker.nextNode()) {
    const el = node as Element;
    if (BLOCKED.has(el.localName.toLowerCase())) {
      drop.push(el);
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if ((name === "href" || name.endsWith(":href") || name === "src") && !SAFE_HREF.test(value))
        el.removeAttribute(attr.name);
      else if (/^\s*javascript:/i.test(value)) el.removeAttribute(attr.name);
    }
  }
  for (const el of drop) el.remove();
  return document.importNode(root, true) as unknown as SVGSVGElement;
}

const FACES: [family: string, weight: string, file: string][] = [
  ["Inter", "100 499", "Inter-Regular.ttf"],
  ["Inter", "500 900", "Inter-SemiBold.ttf"],
  ["Geist Mono", "100 599", "GeistMono-Regular.ttf"],
  ["Geist Mono", "600 900", "GeistMono-Bold.ttf"],
];

/** @font-face rules for the faces at their site URLs (the preview). */
export function faceCss(fonts: string): string {
  return FACES.map(
    ([family, weight, file]) =>
      `@font-face{font-family:"${family}";font-weight:${weight};font-display:swap;src:url("${fonts}${file}") format("truetype")}`,
  ).join("\n");
}

let embedded: Promise<string> | undefined;

/** The same rules with the faces inlined, for an SVG drawn as an image (which loads nothing). */
function embeddedCss(fonts: string): Promise<string> {
  embedded ??= Promise.all(
    FACES.map(async ([family, weight, file]) => {
      const bytes = new Uint8Array(await (await fetch(`${fonts}${file}`)).arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/ttf;base64,${btoa(binary)}) format("truetype")}`;
    }),
  ).then((rules) => rules.join(""));
  return embedded;
}

/** Most pixels a canvas holds on every browser that matters (iOS Safari caps at 16.7 MP). */
const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 8192;

/** Draws a still SVG to PNG bytes at `scale` (lowered for very large diagrams). */
export async function svgToPng(
  svg: string,
  width: number,
  height: number,
  fonts: string,
  scale = 2,
): Promise<{ png: Uint8Array; scale: number }> {
  const css = await embeddedCss(fonts);
  const markup = svg.replace(/<svg\b[^>]*>/, (open) => `${open}<defs><style>${css}</style></defs>`);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const s = Math.min(scale, MAX_SIDE / width, MAX_SIDE / height, Math.sqrt(MAX_PIXELS / (width * height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * s);
    canvas.height = Math.round(height * s);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("this browser has no 2D canvas");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("the canvas gave no PNG"))), "image/png"),
    );
    return { png: new Uint8Array(await blob.arrayBuffer()), scale: s };
  } finally {
    URL.revokeObjectURL(url);
  }
}
