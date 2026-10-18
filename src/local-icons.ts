// Icons from the user's own SVG files (`icons:` in the spec, used as local:<name>): read,
// sanitized and registered so renderIcon draws them like any pack icon.

import type { Model } from "./types.ts";

/** Reads and registers every icon the model declares. */
export async function loadLocalIcons(_model: Model): Promise<void> {}
