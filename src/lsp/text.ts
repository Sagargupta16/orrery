// Offsets and LSP positions: lines and UTF-16 characters, which is what a JS string index counts.

export interface Position {
  line: number;
  character: number;
}
export interface Range {
  start: Position;
  end: Position;
}
export interface Span {
  start: number;
  end: number;
}
/** An edit on offsets; the server turns it into an LSP TextEdit on the document it came from. */
export interface Edit extends Span {
  text: string;
}

/** The offset each line starts at; "\r\n" ends a line at its "\n". */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

export function positionAt(starts: number[], offset: number): Position {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo, character: offset - (starts[lo] ?? 0) };
}

/** The offset of a position, clamped to its line (a character past the end means the end). */
export function offsetAt(text: string, starts: number[], pos: Position): number {
  const start = starts[pos.line];
  if (start === undefined) return text.length;
  const next = starts[pos.line + 1];
  let end = next === undefined ? text.length : next - 1;
  if (end > start && text[end - 1] === "\r") end -= 1;
  return Math.min(start + Math.max(0, pos.character), end);
}

export function rangeOf(starts: number[], span: Span): Range {
  return { start: positionAt(starts, span.start), end: positionAt(starts, span.end) };
}

/** One textDocument/didChange entry applied: a range with its new text, or the whole text. */
export function applyChange(text: string, change: { range?: Range; text: string }): string {
  if (!change.range) return change.text;
  const starts = lineStarts(text);
  const a = offsetAt(text, starts, change.range.start);
  const b = offsetAt(text, starts, change.range.end);
  return text.slice(0, a) + change.text + text.slice(Math.max(a, b));
}
