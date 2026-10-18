// Small color helpers: parsing, mixing and WCAG contrast.

export function parseHex(hex: string): [number, number, number] | undefined {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return undefined;
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** A hex color as the spec allows it: a leading "#" and 3 or 6 digits. */
export const isHex = (s: string) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(s);

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** `amount` of `a` over `b`: mixHex(a, b, 0.1) is a 10% tint of a on b. */
export function mixHex(a: string, b: string, amount: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  return toHex(
    [0, 1, 2].map((i) => (ca[i] ?? 0) * amount + (cb[i] ?? 0) * (1 - amount)) as [
      number,
      number,
      number,
    ],
  );
}

export function luminance(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 0;
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Moves `fg` toward whichever of black and white contrasts more with `bg` until it reaches
 * `ratio`. On mid-tone backgrounds the other pole can be worse than `fg` itself, and no color
 * contrasts more than that pole, so the result never has less contrast than `fg` and, when
 * `ratio` is out of reach, is that better pole.
 */
export function ensureContrast(fg: string, bg: string, ratio = 4.5): string {
  if (!isHex(fg) || !isHex(bg) || contrast(fg, bg) >= ratio) return fg;
  const target = contrast("#000000", bg) >= contrast("#ffffff", bg) ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mixHex(target, fg, t);
    if (contrast(c, bg) >= ratio) return c;
  }
  return target;
}
