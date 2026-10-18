import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  aliases,
  allIcons,
  type IconPaint,
  iconInfo,
  iconTone,
  loadIconLibraries,
  PACK_ORDER,
  packInfo,
  renderIcon,
  resolveIcon,
  searchIcons,
  suggestIcons,
} from "../src/icons.ts";
import { librarySource } from "../src/libraries.ts";
import { THEME_TOKENS } from "../src/themes.ts";
import type { ThemeName } from "../src/types.ts";
import { SKILL_DIR } from "./helpers.ts";

const ICONS_DIR = join(SKILL_DIR, "assets", "icons");
const PACKS = Object.keys(packInfo());
const BUNDLED = PACKS.filter((key) => !packInfo()[key]?.lib);
const LIBRARIES = PACKS.filter((key) => packInfo()[key]?.lib);

beforeAll(async () => {
  await loadIconLibraries(allIcons().map((i) => i.id));
});

interface PackFile {
  pack: string;
  icons: Record<string, { v?: string; b?: string; d?: string; r?: string }>;
}

const packFiles = new Map<string, PackFile>();
function readPack(key: string): PackFile {
  let file = packFiles.get(key);
  if (!file) {
    file = JSON.parse(readFileSync(join(ICONS_DIR, `${key}.json`), "utf8")) as PackFile;
    packFiles.set(key, file);
  }
  return file;
}

const paint = (theme: ThemeName): IconPaint => ({
  theme,
  background: THEME_TOKENS[theme].background,
  ink: THEME_TOKENS[theme].text,
});

const idsIn = (body: string) => [...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] ?? "");
const refsIn = (body: string) =>
  [...body.matchAll(/url\(#([^)"']+)\)|href="#([^"]+)"/g)].map((m) => m[1] ?? m[2] ?? "");

describe("icon catalogs", () => {
  it("indexes exactly the packs search knows", () => {
    expect([...PACKS].sort()).toEqual([...PACK_ORDER].sort());
  });

  it.each(BUNDLED)("%s.json loads and matches the index", (key) => {
    expect(existsSync(join(ICONS_DIR, `${key}.json`))).toBe(true);
    const pack = readPack(key);
    expect(pack.pack).toBe(key);
    const indexed = allIcons()
      .filter((i) => i.pack === key)
      .map((i) => i.slug)
      .sort();
    expect(indexed.length).toBe(packInfo()[key]?.count);
    expect(Object.keys(pack.icons).sort()).toEqual(indexed);
    const badViewBox = allIcons()
      .filter((i) => i.pack === key)
      .filter((i) => {
        const v = renderIcon(i.id, "t", paint("light")).viewBox;
        return v.some(Number.isNaN) || !(v[2] > 0 && v[3] > 0);
      })
      .map((i) => i.slug);
    expect(badViewBox).toEqual([]);
  });

  it.each(LIBRARIES)("%s is not bundled and its pin matches the installed library", (key) => {
    const lib = packInfo()[key]?.lib;
    expect(existsSync(join(ICONS_DIR, `${key}.json`))).toBe(false);
    expect(lib && librarySource(lib)).toBe("node_modules");
  });

  it("ships only current official artwork", () => {
    const ids = allIcons().map((i) => i.id);
    // Google: the legacy console icons should not be used as of 2026.
    expect(allIcons().filter((i) => i.type === "legacy")).toEqual([]);
    // Logo-set redraws of cloud service icons; the vendors' own packs cover them.
    expect(
      ids.filter((id) => /^logos:(aws|amazon)-|^si:google(bigquery|pubsub)$/.test(id)),
    ).toEqual([]);
    expect(ids).toContain("logos:aws");
  });

  it("gives Google products the icon Google assigns them", () => {
    const body = (id: string) => renderIcon(id, "t", paint("light")).body;
    expect(iconInfo("gcp:pubsub")?.name).toBe("Pub/Sub");
    expect(body("gcp:pubsub")).toBe(body("gcp:category-data-analytics"));
    expect(body("gcp:cloud-armor")).toBe(body("gcp:category-networking"));
    expect(body("gcp:looker-studio")).toBe(body("gcp:looker"));
  });

  it("names, categorizes and types every icon", () => {
    const incomplete = allIcons()
      .filter((i) => !i.name.trim() || !i.category.trim() || !i.type.trim())
      .map((i) => i.id);
    expect(incomplete).toEqual([]);
  });
});

describe("aliases", () => {
  const table = Object.entries(aliases());
  const ids = new Set(allIcons().map((i) => i.id));

  it("resolves every alias to a real icon", () => {
    expect(table.length).toBeGreaterThan(100);
    const broken = table
      .filter(([alias]) => !ids.has(resolveIcon(alias) ?? ""))
      .map(([alias, target]) => `${alias} -> ${target}`);
    expect(broken).toEqual([]);
  });

  it("never shadows a real icon id", () => {
    expect(table.filter(([alias]) => ids.has(alias)).map(([alias]) => alias)).toEqual([]);
  });

  it.each([
    ["aws:s3", "aws:simple-storage-service"],
    ["k8s:deploy", "k8s:deployment"],
    ["generic:database", "tabler:database"],
    ["AWS:S3", "aws:simple-storage-service"],
    ["aws/s3", "aws:simple-storage-service"],
    [" aws.s3 ", "aws:simple-storage-service"],
    ["aws:Simple Storage Service", "aws:simple-storage-service"],
  ])("resolves %s to %s", (alias, id) => {
    expect(resolveIcon(alias)).toBe(id);
  });

  it("resolves nothing for unknown ids", () => {
    expect(resolveIcon("aws:lamda")).toBeUndefined();
    expect(resolveIcon("nope:nope")).toBeUndefined();
    expect(iconInfo("aws:lamda")).toBeUndefined();
  });
});

describe("icon bodies are safe to inline", () => {
  const UNSAFE: [string, RegExp][] = [
    ["a <script> element", /<script/i],
    ["an event handler attribute", /on[a-z]+=/i],
    ["an href or src that leaves the icon", /\s(?:xlink:)?(?:href|src)\s*=\s*["']\s*(?!#)/i],
    ["an external url()", /url\(\s*["']?\s*(?!#)/i],
    ["a <foreignObject>", /<foreignObject/i],
    ["a <style> block (its selectors would apply to the whole diagram)", /<style/i],
  ];

  it("contains no script, event handler, external reference, foreignObject or style", () => {
    const offenders: string[] = [];
    for (const i of allIcons()) {
      for (const theme of ["light", "dark"] as const) {
        const body = renderIcon(i.id, "t", paint(theme)).body;
        for (const [what, re] of UNSAFE) if (re.test(body)) offenders.push(`${i.id}: ${what}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it.each(["light", "dark"] as const)(
    "leaves no {{c}} placeholder after renderIcon (%s)",
    (theme) => {
      const left = allIcons()
        .filter((i) => renderIcon(i.id, "t", paint(theme)).body.includes("{{c}}"))
        .map((i) => i.id);
      expect(left).toEqual([]);
    },
  );
});

describe("renderIcon", () => {
  it("gives two instances of an Azure gradient icon no shared id", () => {
    const a = renderIcon("azure:virtual-machine", "n1", paint("light")).body;
    const b = renderIcon("azure:virtual-machine", "n2", paint("light")).body;
    expect(a).toMatch(/<linearGradient/);
    const [idsA, idsB] = [idsIn(a), idsIn(b)];
    expect(idsA.length).toBeGreaterThan(0);
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
    expect(refsIn(a).length).toBeGreaterThan(0);
    expect(refsIn(a).filter((r) => !idsA.includes(r))).toEqual([]);
    expect(refsIn(b).filter((r) => !idsB.includes(r))).toEqual([]);
  });

  it("prefixes every id of every icon with the instance name", () => {
    const unprefixed = allIcons()
      .filter((i) =>
        idsIn(renderIcon(i.id, "inst", paint("light")).body).some((id) => !id.startsWith("inst-")),
      )
      .map((i) => i.id);
    expect(unprefixed).toEqual([]);
  });

  it("keeps every internal reference pointing at an id of the same icon", () => {
    // Upstream gilbarbara/logos waffle-icon.svg already references ids it never defines.
    const brokenUpstream = new Set(["logos:waffle-icon"]);
    const dangling = allIcons()
      .filter((i) => !brokenUpstream.has(i.id))
      .filter((i) => {
        const body = renderIcon(i.id, "inst", paint("dark")).body;
        const own = new Set(idsIn(body));
        return refsIn(body).some((r) => !own.has(r));
      })
      .map((i) => i.id);
    expect(dangling).toEqual([]);
  });

  it("paints monochrome marks for the theme and keeps dark marks visible on dark", () => {
    const brand = JSON.parse(readFileSync(join(ICONS_DIR, "index.json"), "utf8")).colors[
      "si:github"
    ];
    expect(brand).toMatch(/^#[0-9a-f]{6}$/i);
    expect(renderIcon("si:github", "x", paint("light")).body).toContain(`fill="${brand}"`);
    const dark = renderIcon("si:github", "x", paint("dark")).body;
    expect(dark).toContain(`fill="${THEME_TOKENS.dark.text}"`);
    expect(dark).not.toContain(`fill="${brand}"`);
    const tinted = renderIcon("tabler:database", "x", { ...paint("light"), color: "#d6336c" });
    expect(tinted.body).toContain('stroke="#d6336c"');
  });

  it("sorts every kind of artwork into a stage tone", () => {
    expect(iconTone("aws:lambda", "dark")).toBe("glyph");
    expect(iconTone("k8s:pod", "dark")).toBe("glyph");
    expect(iconTone("aws:group-region", "light")).toBe("glyph");
    expect(iconTone("aws:group-aws-cloud-logo", "dark")).toBe("inverse");
    expect(iconTone("aws:simple-storage-service-bucket", "dark")).toBe("shape");
    expect(iconTone("gcp:cloud-run", "dark")).toBe("shape");
    expect(iconTone("azure:app-services", "dark")).toBe("two");
    expect(iconTone("tabler:database", "dark")).toBe("mono");
    expect(iconTone("si:github", "light")).toBe("mono");
    const mono = renderIcon("tabler:database", "x", { ...paint("dark"), mono: "#919394" });
    expect(mono.body).toContain('stroke="#919394"');
  });

  it("returns the icon's viewBox", () => {
    const r = renderIcon("aws:lambda", "x", paint("light"));
    expect(r.viewBox).toHaveLength(4);
    expect(r.viewBox[2]).toBeGreaterThan(0);
    expect(r.viewBox[3]).toBeGreaterThan(0);
  });

  it("throws for an unknown icon", () => {
    expect(() => renderIcon("aws:lamda", "x", paint("light"))).toThrow(/unknown icon/);
  });
});

describe("icon search", () => {
  const first = (query: string, pack?: string) => searchIcons(query, { pack })[0];
  const OFFICIAL = new Set(["aws", "azure", "gcp", "k8s"]);

  it.each([
    ["lambda", "aws:lambda"],
    ["s3", "aws:simple-storage-service"],
    ["cloud run", "gcp:cloud-run"],
    ["dynamodb", "aws:dynamodb"],
    ["pod", "k8s:pod"],
  ])('ranks the official icon first for "%s"', (query, id) => {
    expect(first(query)?.id).toBe(id);
  });

  it('ranks the official icon first for "sqs"', () => {
    expect(first("sqs")?.id).toBe("aws:simple-queue-service");
  });

  it('ranks a Kubernetes pack icon first for "kubernetes"', () => {
    expect(first("kubernetes")?.id).toMatch(/^k8s:/);
  });

  it('ranks an official cloud icon first for "vpc"', () => {
    expect(OFFICIAL.has(first("vpc")?.pack ?? "")).toBe(true);
  });

  it('finds a PostgreSQL logo in the top three for "postgres"', () => {
    const top = searchIcons("postgres", { limit: 3 });
    expect(
      top.some((i) => (i.pack === "logos" || i.pack === "si") && /postgres/.test(i.slug)),
    ).toBe(true);
  });

  it('ranks an Elastic Load Balancing icon first for "load balancer" in the aws pack', () => {
    expect(first("load balancer", "aws")?.id).toMatch(/^aws:elastic-load-balancing/);
  });

  it("filters by pack, a pack prefix in the query, type and limit", () => {
    expect(searchIcons("database", { pack: "azure" }).every((i) => i.pack === "azure")).toBe(true);
    expect(searchIcons("aws:queue").every((i) => i.pack === "aws")).toBe(true);
    const services = searchIcons("database", { type: "service", limit: 4 });
    expect(services).toHaveLength(4);
    expect(services.every((i) => i.type === "service")).toBe(true);
  });

  it("returns nothing for an empty or unmatched query", () => {
    expect(searchIcons("   ")).toEqual([]);
    expect(searchIcons("zzqqxv")).toEqual([]);
  });

  it.each([
    ["aws:lamda", "aws:lambda"],
    ["k8s:deploymnet", "k8s:deployment"],
    ["gcp:cloudrun", "gcp:cloud-run"],
  ])("suggests %s -> %s for a typo", (typo, id) => {
    expect(suggestIcons(typo)[0]).toBe(id);
  });
});
