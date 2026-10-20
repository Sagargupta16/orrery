// The stage skin: the owner's portfolio scene language drawn over orrery's layout (classic and
// stage place every box and point the same). A near-black canvas with a hairline grid and one tint
// wash behind the story; ink tiles holding monochrome glyphs; mono caps labels; dim hairline wires
// with open chevrons; no vendor hues.
//
// The motion is one story on one clock: the groups light, then the tiles, then a packet with a
// comet tail rides the spec's story path, a process's BPMN token, the numbered edges in step
// order, else the longest path, lighting each wire behind it, and every step badge pops as its
// packet leaves. At most two other edges run a small packet of their own. Everything holds, fades
// out together and the loop starts again. The still frame (PNG, draw.io, animate: none) is the held
// frame: everything lit, no packets.
//
// The code lives in stage/: index.ts draws the document layer by layer with the draw-*.ts steps,
// story.ts plans the motion along the paths walks.ts finds, timing.ts holds the clock and its SMIL
// helpers, text.ts the mono faces, filters.ts the one-color icons and ctx.ts the shared context.

export { renderStage } from "./stage/index.ts";
