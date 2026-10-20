// Builds a design document from Markdown whose `<!-- orrery: spec.yaml | caption -->` markers
// become numbered figures: inline SVG in HTML, image files next to Markdown, PNGs in Word.
import type { Args } from "./cli.ts";

export async function cmdDoc(_args: Args): Promise<void> {
  throw new Error("orrery doc is not built yet");
}
