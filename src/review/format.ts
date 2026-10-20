// The review report as terminal text: the score table, the hard counts and one line per finding.
import { DIMENSIONS, type ReviewDimension, type ReviewSeverity } from "./findings.ts";
import type { ReviewFinding, ReviewReport } from "./types.ts";

/** The report as a terminal table plus one line per finding (the review command prints this). */
export function formatReview(report: ReviewReport, opts: { fixes?: boolean } = {}): string {
  const count = (d: ReviewDimension, sev: ReviewSeverity) =>
    report.findings.filter((f) => f.dimension === d && f.severity === sev).length;
  const lines = [
    `review ${report.name ?? "diagram"}: ${report.canvas.width}x${report.canvas.height} in a ${report.width}px column, seen at ${report.display.width}x${report.display.height} (scale ${report.scale}, ${report.theme})`,
    `score ${report.score}/100  ${report.pass ? "PASS" : "FAIL"} (pass = no blocker or major and score >= 85)`,
    "",
    "dimension    score  weight  blocker  major  minor",
    ...DIMENSIONS.map(
      (d) =>
        `${d.padEnd(12)} ${String(report.dimensions[d].score).padStart(5)}  ${String(report.dimensions[d].weight).padStart(6)}  ${String(count(d, "blocker")).padStart(7)}  ${String(count(d, "major")).padStart(5)}  ${String(count(d, "minor")).padStart(5)}`,
    ),
    "",
    `hard: overlaps ${report.hard.overlaps}, through nodes ${report.hard.edgesThroughNodes}, through headers ${report.hard.edgesThroughHeaders}, through labels ${report.hard.edgesThroughLabels}, off canvas ${report.hard.offCanvas}, contrast ${report.hard.contrastFailures}`,
  ];
  if (report.rubrics.length) lines.push(`rubrics: ${report.rubrics.join(", ")}`);
  if (report.findings.length) lines.push("");
  // Identical lines (the same claim on the same subjects) print once with a count.
  const seen = new Map<string, { f: ReviewFinding; n: number }>();
  for (const f of report.findings) {
    const subjects = f.subjects.length ? ` [${f.subjects.join(", ")}]` : "";
    const line = `${f.severity.padEnd(7)} ${f.id}${subjects} ${f.claim}`;
    const hit = seen.get(line);
    if (hit) hit.n++;
    else seen.set(line, { f, n: 1 });
  }
  for (const [line, { f, n }] of seen) {
    lines.push(n > 1 ? `${line} (x${n})` : line);
    if (opts.fixes !== false)
      for (const fix of f.fixes.slice(0, 2)) lines.push(`        fix: ${fix}`);
  }
  return lines.join("\n");
}
