// Overlay (around:) groups: what they enclose without listing it, and what their headers cover.
import type { Box, ModelGroup, Scene } from "../types.ts";
import type { CheckContext } from "./context.ts";
import { boxOf, EPS, nodeParts, overlaps } from "./geometry.ts";

/** Whether id is the overlay g itself, one of its members, or sits inside one of them. */
function isMember(parentOf: Map<string, string | undefined>, id: string, g: ModelGroup): boolean {
  for (let p: string | undefined = id; p; p = parentOf.get(p)) {
    if (p === g.id || g.around?.includes(p)) return true;
  }
  return false;
}

/** DG213: an overlay (around:) group encloses something that is not one of its members. */
export function overlayEncloses({ scene, model, parentOf, warn }: CheckContext): void {
  for (const mg of model.groups) {
    const ov = mg.around?.length ? scene.groups.find((x) => x.id === mg.id) : undefined;
    if (!ov) continue;
    const enclosed: { id: string; kind: string; box: Box }[] = [];
    for (const n of scene.nodes) {
      if (!isMember(parentOf, n.id, mg) && overlaps(n.box, ov.box, -EPS))
        enclosed.push({ id: n.id, kind: "node", box: n.box });
    }
    for (const g of scene.groups) {
      const b = g.box;
      const inside =
        b.x >= ov.box.x - EPS &&
        b.y >= ov.box.y - EPS &&
        b.x + b.w <= ov.box.x + ov.box.w + EPS &&
        b.y + b.h <= ov.box.y + ov.box.h + EPS;
      if (!g.overlay && inside && !isMember(parentOf, g.id, mg))
        enclosed.push({ id: g.id, kind: "group", box: b });
    }
    for (const x of enclosed) {
      warn(
        "DG213",
        `overlay group "${mg.id}" encloses ${x.kind} "${x.id}", which it does not list in around:`,
        {
          subject: { group: mg.id, enclosed: x.id, kind: x.kind },
          evidence: { overlay: boxOf(ov.box), enclosed: boxOf(x.box) },
          fixes: [
            `add "${x.id}" to around: of "${mg.id}" if it belongs to it`,
            `move "${x.id}" in the nodes list so it sits outside the overlay`,
            "put the members of the overlay next to each other (same parent group, adjacent in the nodes list)",
          ],
        },
      );
    }
  }
}

/** The drawn pieces of a group's header: its label (when it has one) and its tile. */
const headerParts = (g: Scene["groups"][number]): Box[] =>
  [g.label.lines.length ? g.labelBox : undefined, g.iconBox].filter(
    (b): b is Box => !!b && b.w > 0 && b.h > 0,
  );

interface Covered {
  what: string;
  id: string;
  kind: "group" | "node";
  box: Box;
  by: Box;
}

/** The first header part of each other group, then the first part of each node, under ov's header. */
function coveredBy(scene: Scene, ov: Scene["groups"][number]): Covered[] {
  const own = headerParts(ov);
  const hits = (b: Box) => own.find((o) => overlaps(o, b, -EPS));
  const covered: Covered[] = [];
  for (const g of scene.groups) {
    if (g.id === ov.id) continue;
    for (const b of headerParts(g)) {
      const by = hits(b);
      if (by) {
        covered.push({
          what: `the header of group "${g.id}"`,
          id: g.id,
          kind: "group",
          box: b,
          by,
        });
        break;
      }
    }
  }
  for (const n of scene.nodes) {
    for (const part of nodeParts(n)) {
      const by = hits(part.box);
      if (by) {
        covered.push({ what: `node "${n.id}"`, id: n.id, kind: "node", box: part.box, by });
        break;
      }
    }
  }
  return covered;
}

/**
 * DG214: an overlay's header (its tile and label) covers another group's header or a node.
 * Overlays cross other groups by design, so the group checks skip them; their headers still
 * must not hide anything.
 */
export function overlayHeaderCovers({ scene, model, parentOf, warn }: CheckContext): void {
  for (const ov of scene.groups) {
    if (!ov.overlay) continue;
    const covered = coveredBy(scene, ov);
    // Layout already pads the groups of the overlay's members until the header clears the group
    // headers above them, so what is left needs the spec to change.
    const members = model.groups.find((g) => g.id === ov.id)?.around ?? [];
    const loose = members.filter((m) => !parentOf.get(m)).map((m) => `"${m}"`);
    for (const x of covered) {
      warn("DG214", `the header of overlay group "${ov.id}" covers ${x.what}`, {
        subject: { group: ov.id, covered: x.id, kind: x.kind },
        evidence: { header: boxOf(x.by), covered: boxOf(x.box) },
        fixes: [
          ...(loose.length
            ? [`put ${loose.join(", ")} in a group (in:), so layout can make room for the header`]
            : []),
          x.kind === "node"
            ? `move "${x.id}" in the nodes list so it sits clear of the header of "${ov.id}"`
            : `move the members of "${ov.id}" in the nodes list so its header sits clear of "${x.id}"`,
          `shorten the label of "${ov.id}"`,
        ],
      });
    }
  }
}
