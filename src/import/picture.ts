// orrery import picture: an SVG or PNG orrery drew, read back to the spec text it carries, byte for
// byte (src/render/embed.ts writes it there).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { usage } from "../cli/io.ts";
import { extractSpec } from "../render/embed.ts";
import type { Imported } from "./types.ts";

export async function importPicture(path: string): Promise<Imported> {
  const yaml = extractSpec(readFileSync(resolve(path)));
  if (yaml === undefined)
    usage(
      `${path} carries no orrery spec (another tool drew it, its spec says embed: false, or an optimizer stripped it); read it as any other picture (references/importing.md)`,
    );
  return { yaml, warnings: [] };
}
