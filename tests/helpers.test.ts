// The well-formedness and geometry checks other files rely on must themselves catch problems,
// or a broken checker would pass every renderer.
import { describe, expect, it } from "vitest";
import { distanceToBorder, PNG_SIGNATURE, pngSize, xmlProblems } from "./helpers.ts";

describe("xmlProblems", () => {
  it("accepts well-formed documents", () => {
    expect(
      xmlProblems(
        `<?xml version="1.0"?>\n<!-- note --><svg a="1" b='2'><g id="x"><path d="M0 0"/></g><text>a &amp; b &#39; &#x27;</text><style><![CDATA[a{b:c}]]></style></svg>\n`,
      ),
    ).toEqual([]);
  });

  it.each([
    ["an unclosed element", "<svg><g></svg>"],
    ["crossed elements", "<svg><g><a></g></a></svg>"],
    ["a stray closing tag", "<svg></g></svg>"],
    ["a bare ampersand in text", "<svg><text>a & b</text></svg>"],
    ["a bare ampersand in a value", '<svg><a href="?a=1&b=2"/></svg>'],
    ["a < inside a value", '<svg><g id="a<b"/></svg>'],
    ["a duplicate attribute", '<svg><g id="a" id="b"/></svg>'],
    ["an unquoted attribute", "<svg><g id=a/></svg>"],
    ["an attribute without a value", "<svg><g hidden/></svg>"],
    ["two root elements", "<svg/><svg/>"],
    ["text outside the root", "<svg/>tail"],
    ["an unterminated tag", '<svg><g id="a"'],
    ["attributes with no space between", '<svg><g a="1"b="2"/></svg>'],
  ])("rejects %s", (_what, xml) => {
    expect(xmlProblems(xml).length).toBeGreaterThan(0);
  });
});

describe("pngSize", () => {
  it("reads width and height from IHDR", () => {
    const png = new Uint8Array(24);
    png.set(PNG_SIGNATURE);
    png.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
    png.set([0, 0, 1, 44, 0, 0, 0, 90], 16);
    expect(pngSize(png)).toEqual({ width: 300, height: 90 });
  });

  it("refuses data whose first chunk is not IHDR", () => {
    expect(() => pngSize(new Uint8Array(24))).toThrow(/IHDR/);
  });
});

describe("distanceToBorder", () => {
  const box = { x: 10, y: 10, w: 100, h: 50 };
  it("is 0 on the border and grows inside and outside", () => {
    expect(distanceToBorder({ x: 10, y: 30 }, box)).toBe(0);
    expect(distanceToBorder({ x: 60, y: 60 }, box)).toBe(0);
    expect(distanceToBorder({ x: 60, y: 30 }, box)).toBe(20);
    expect(distanceToBorder({ x: 0, y: 30 }, box)).toBe(10);
    expect(distanceToBorder({ x: 113, y: 64 }, box)).toBe(5);
  });
});
