import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The bundled CLI lives in skills/orrery/scripts/ and the sources in src/; both find the skill
// folder by walking up until they see its icon index.
function findSkillRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    for (const candidate of [dir, join(dir, "skills", "orrery")]) {
      if (existsSync(join(candidate, "assets", "icons", "index.json"))) return candidate;
    }
    dir = dirname(dir);
  }
  throw new Error("orrery: cannot find the skill assets (assets/icons/index.json)");
}

export const skillRoot = findSkillRoot();
export const iconsDir = join(skillRoot, "assets", "icons");
export const fontsDir = join(skillRoot, "assets", "fonts");
export const vendorDir = join(skillRoot, "scripts", "vendor");
export const examplesDir = join(skillRoot, "examples");
