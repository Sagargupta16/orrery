// "Did you mean" suggestions: edit distance, the closest allowed word and the nearest ids.

export function closest(word: string, options: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const o of options) {
    const d = distance(word.toLowerCase(), o.toLowerCase());
    if (d < bestScore) {
      bestScore = d;
      best = o;
    }
  }
  return bestScore <= Math.max(2, Math.floor(word.length / 3)) ? best : undefined;
}

/** Levenshtein edit distance, for "did you mean" suggestions. */
export function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j] ?? 0;
      row[j] = Math.min(
        (row[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return row[b.length] ?? 0;
}

export function suggestIds(id: string, ids: Map<string, string>, kind?: string): string[] {
  return [...ids.entries()]
    .filter(([, k]) => !kind || k === kind)
    .map(([candidate]) => [distance(id.toLowerCase(), candidate.toLowerCase()), candidate] as const)
    .filter(([d]) => d <= Math.max(2, Math.floor(id.length / 3)))
    .sort((a, b) => a[0] - b[0])
    .slice(0, 3)
    .map(([, c]) => c);
}
