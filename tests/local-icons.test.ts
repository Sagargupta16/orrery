import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalIconError, localArt } from "../src/icons/local/index.ts";
import { ROOT } from "./helpers.ts";

/** A 24-grid icon with a gradient, filled by the given url(...) value. */
const withFill = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs><path d="M2 2h20v20H2z" fill="${fill}"/></svg>`;

describe("local icon references", () => {
  it("accepts its own ids however the url is quoted or spaced", () => {
    for (const fill of ["url(#g)", "url('#g')", "url( #g )", "url( '#g' )", "url(' #g')"])
      expect(() => localArt(withFill(fill), "icon.svg"), fill).not.toThrow();
  });

  it("refuses anything that points outside the file", () => {
    for (const fill of [
      "url(https://x.example/a.svg#g)",
      "url('other.svg#g')",
      "url(data:image/png;base64,AAAA)",
      "url(#g",
    ]) {
      expect(() => localArt(withFill(fill), "icon.svg"), fill).toThrow(LocalIconError);
      expect(() => localArt(withFill(fill), "icon.svg"), fill).toThrow(/points outside the file/);
    }
  });
});

describe("icons check", () => {
  it("reports a file too large for an icon instead of crashing", () => {
    const dir = mkdtempSync(join(tmpdir(), "orrery-icon-"));
    const big = join(dir, "big.svg");
    const part = '<path d="M1 1h22v22H1z" fill="none" stroke="currentColor"/>';
    writeFileSync(
      big,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${part.repeat(9000)}</svg>`,
    );
    const r = spawnSync(
      process.execPath,
      [join(ROOT, "src", "main.ts"), "icons", "check", big, "-o", join(dir, "sheet.png")],
      { encoding: "utf8" },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/too large for an icon; no contact sheet written/);
    expect(r.stderr).not.toMatch(/\n\s+at /);
  });
});
