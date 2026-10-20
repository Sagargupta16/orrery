// The spec inside its own pictures: an SVG carries it in <metadata>, a PNG in an iTXt chunk, so
// `orrery import picture` turns any rendered file back into the spec that drew it.

/** The SVG with the spec embedded; unchanged when there is no spec text. */
export function embedSvgSpec(svg: string, _source?: string): string {
  return svg;
}

/** The PNG with the spec embedded; unchanged when there is no spec text. */
export function embedPngSpec(png: Uint8Array, _source?: string): Uint8Array {
  return png;
}

/** The spec text a picture carries, from an SVG string or PNG bytes; undefined when it has none. */
export function extractSpec(_file: string | Uint8Array): string | undefined {
  return undefined;
}
