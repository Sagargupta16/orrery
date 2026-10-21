// Spec against picture: empty groups, lone nodes, unexplained line styles and ignored settings.
import type { EdgeLine, Model } from "../types.ts";
import type { CheckContext } from "./context.ts";

/** DG207: empty groups. A node on a group's border (on:) is one of its members. */
export function emptyGroups({ model, warn }: CheckContext): void {
  for (const g of model.groups) {
    // An empty pool that exchanges messages is a black-box participant (BPMN), not a leftover.
    const used =
      !!g.around?.length ||
      model.nodes.some((x) => x.parent === g.id || x.on === g.id) ||
      model.groups.some((x) => x.parent === g.id) ||
      (g.type === "pool" && model.edges.some((e) => e.from === g.id || e.to === g.id));
    if (!used) {
      warn("DG207", `group "${g.id}" is empty`, {
        subject: { group: g.id },
        fixes: [`put nodes in it with in: ${g.id}, or remove it`],
      });
    }
  }
}

/**
 * DG208: nodes nothing connects to, or, once, a diagram of several nodes with no edges at all
 * (without arrows the diagram shows no flow). A journey's grid tells its story without them.
 */
export function lonelyNodes({ model, parentOf, warn }: CheckContext): void {
  if (!model.edges.length) {
    if (model.kind !== "journey" && model.nodes.length > 1) {
      warn("DG208", `${model.nodes.length} nodes and no edges, so the diagram shows no flow`, {
        evidence: { nodes: model.nodes.length, edges: 0 },
        fixes: [
          "connect the nodes with edges (a -> b) in the order requests or data move",
          "fine for a legend or an inventory of services",
        ],
      });
    }
    return;
  }
  const touched = new Set(model.edges.flatMap((e) => [e.from, e.to]));
  const reached = (id: string): boolean => {
    for (let p: string | undefined = id; p; p = parentOf.get(p)) if (touched.has(p)) return true;
    return model.groups.some((g) => g.around?.includes(id) && touched.has(g.id));
  };
  // A journey's grid places its steps, so links between them are optional.
  for (const n of model.kind === "journey" ? [] : model.nodes) {
    if (!reached(n.id)) {
      warn("DG208", `node "${n.id}" has no connections`, {
        subject: { node: n.id },
        fixes: [`connect "${n.id}" or remove it (fine for a legend or a standalone service)`],
      });
    }
  }
}

/**
 * DG217: a line style is drawn that the legend does not explain. BPMN's own notation explains a
 * dashed message flow and a dotted association.
 */
export function unexplainedLines({ model, warn }: CheckContext): void {
  const explained = new Set<EdgeLine>((model.legend ?? []).map((l) => l.line));
  const notation = (e: Model["edges"][number]) =>
    (e.flow === "message" && e.line === "dashed") ||
    (e.flow === "association" && e.line === "dotted");
  const styles = new Map<EdgeLine, number>();
  for (const e of model.edges) {
    if (e.line !== "solid" && !explained.has(e.line) && !notation(e))
      styles.set(e.line, (styles.get(e.line) ?? 0) + 1);
  }
  if (styles.size) {
    const counts = [...styles].map(([line, k]) => `${line} (${k} edge${k === 1 ? "" : "s"})`);
    warn("DG217", `line styles without a legend entry: ${counts.join(", ")}`, {
      subject: { lines: [...styles.keys()] },
      evidence: Object.fromEntries(styles),
      fixes: [
        `add legend: { ${[...styles.keys()].map((l) => `${l}: <what ${l} means>`).join(", ")} }`,
        "or draw these edges solid",
      ],
    });
  }
}

/** DG218: ELK needed a fallback strategy, so the picture may not follow the spec order. */
export function layoutFallback({ scene, warn }: CheckContext): void {
  if (scene.layoutFallback) {
    warn(
      "DG218",
      `layout used the "${scene.layoutFallback}" fallback; spec order may not be kept`,
      {
        evidence: { fallback: scene.layoutFallback },
        fixes: [
          "check that the node order in the picture still tells the story",
          "simplify nested groups or links between groups",
          "try layout: { layering: simplex }",
        ],
      },
    );
  }
}

/** Which part of the model an id names; "layout" when none does. */
const kindOf = (model: Model, id: string) =>
  model.nodes.some((n) => n.id === id)
    ? "node"
    : model.groups.some((g) => g.id === id)
      ? "group"
      : model.edges.some((e) => e.id === id)
        ? "edge"
        : "layout";

/**
 * DG219: a setting layout could not honor (Scene.ignored), so the spec says more than the picture.
 */
export function ignoredSettings({ scene, model, warn }: CheckContext): void {
  for (const ig of scene.ignored ?? []) {
    const kind = kindOf(model, ig.subject);
    const what = ig.setting.startsWith(`${ig.subject}.`)
      ? ig.setting
      : `${ig.subject} ${ig.setting}`;
    warn("DG219", `${what} had no effect: ${ig.reason}`, {
      subject: { [kind]: ig.subject, setting: ig.setting },
      evidence: { reason: ig.reason },
      fixes: [
        kind === "layout"
          ? `remove ${ig.setting}, or change it so layout can honor it`
          : `remove ${ig.setting} from "${ig.subject}", or change it so layout can honor it`,
        "check the picture: the setting is not what placed it",
      ],
    });
  }
}
