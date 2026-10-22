// An entity table's measures: the header, the rows and their columns (key tags, names, types),
// sized for both skins, and where each row is once ELK placed the table. Layout, the renderers and
// draw.io all read them from here, so every output draws the rows on the same lines.

import { measure, textBlock } from "../../text.ts";
import type { Box, ErField, ModelNode, SceneNode, TextBlock } from "../../types.ts";
import { SIZES } from "../sizes.ts";
import type { SceneField } from "./index.ts";

/** A field row's height: 12px text and a key tag, as dbdiagram.io and DrawSQL space them. */
export const ROW = 22;
/** Room above the first row and below the last. */
export const BODY_PAD = 4;
/** Left and right padding of the header and the rows. */
export const PAD = 12;
/** Field names, types and key tags (Inter, px). */
export const NAME_SIZE = 12;
export const TYPE_SIZE = 11;
export const TAG_SIZE = 8.5;
/** The stage skin sets rows in Geist Mono at these sizes; columns leave room for either face. */
export const STAGE_NAME = 10.5;
export const STAGE_TYPE = 9.5;
/** Header icon, inline before the label. */
export const HEAD_ICON = 18;
/** A key tag chip: its text plus this on each side, and the gap between two chips. */
export const TAG_PAD = 4;
export const TAG_GAP = 3;
const NAME_GAP = 16;
const MIN_W = 168;

/** Geist Mono advances every glyph 0.6em (render/stage/text.ts); `track` is letter spacing in em. */
export const monoWidth = (s: string, size: number, track = 0) => {
  const c = [...s].length;
  return c ? size * (c * (0.6 + track) - track) : 0;
};

/** The key tags a row shows, in order: PK, FK, UQ (unique and not already the key). */
export function tagsOf(f: Pick<ErField, "pk" | "fk" | "unique">): string[] {
  return [...(f.pk ? ["PK"] : []), ...(f.fk ? ["FK"] : []), ...(f.unique && !f.pk ? ["UQ"] : [])];
}

/** A tag chip's width: the wider of Inter and the stage's mono caps. */
export const tagWidth = (tag: string) =>
  Math.ceil(Math.max(measure(tag, TAG_SIZE, 600), monoWidth(tag, TAG_SIZE, 0.06))) + 2 * TAG_PAD;

/** What a row's type column reads: the type, `?` after it when the field may be null. */
export const typeText = (f: Pick<ErField, "type" | "nullable">) =>
  f.type ? `${f.type}${f.nullable ? "?" : ""}` : f.nullable ? "null" : "";

/** Where the columns of a table start, from its left edge, and how wide each is. */
export interface Columns {
  tag: number;
  tagW: number;
  name: number;
  nameW: number;
  type: number;
  typeW: number;
  /** Width the rows need, padding included. */
  width: number;
}

/** The columns of a table's rows: tags (when any row has one), names, types. */
export function columnsOf(fields: readonly Omit<ErField, "note">[]): Columns {
  const tagW = Math.max(
    0,
    ...fields.map((f) => {
      const tags = tagsOf(f);
      return tags.reduce((w, t) => w + tagWidth(t), 0) + TAG_GAP * Math.max(0, tags.length - 1);
    }),
  );
  const nameW = Math.ceil(
    Math.max(
      0,
      ...fields.map((f) =>
        Math.max(measure(f.name, NAME_SIZE, f.pk ? 600 : 400), monoWidth(f.name, STAGE_NAME)),
      ),
    ),
  );
  const typeW = Math.ceil(
    Math.max(
      0,
      ...fields.map((f) => {
        const t = typeText(f);
        return Math.max(measure(t, TYPE_SIZE), monoWidth(t, STAGE_TYPE));
      }),
    ),
  );
  const tag = PAD;
  const name = tag + (tagW ? tagW + 8 : 0);
  const type = name + nameW + NAME_GAP;
  const width = (typeW ? type + typeW : name + nameW) + PAD;
  return { tag, tagW, name, nameW, type, typeW, width };
}

export interface Table {
  w: number;
  h: number;
  /** Height of the header band, above the rows. */
  header: number;
  label: TextBlock;
  note?: TextBlock;
}

/** A table's size, header height and text, measured from the model node; undefined: no fields. */
export function tableOf(n: ModelNode): Table | undefined {
  const fields = n.fields;
  if (!fields?.length) return undefined;
  const label = textBlock(n.label, SIZES.nodeLabel, SIZES.cardLabelMax, 600);
  const note = n.note ? textBlock(n.note, SIZES.note, SIZES.cardLabelMax) : undefined;
  const textW = Math.max(label.width, note?.width ?? 0);
  const textH = label.height + (note ? note.height + 2 : 0);
  const icon = n.icon ? HEAD_ICON + 8 : 0;
  const header = Math.ceil(Math.max(34, Math.max(textH, n.icon ? HEAD_ICON : 0) + 16));
  const cols = columnsOf(fields);
  const w = Math.ceil(Math.max(MIN_W, PAD + icon + textW + PAD, cols.width));
  const h = header + 2 * BODY_PAD + fields.length * ROW;
  return { w, h, header, label, note };
}

/**
 * A table's rows, each where it is drawn: laid out from the node's box, so a pass that moves the
 * box and not the rows still draws them in place.
 */
export function rowsOf(nd: SceneNode): SceneField[] {
  const fields = nd.fields ?? [];
  const top = nd.box.y + nd.box.h - BODY_PAD - fields.length * ROW;
  return fields.map((f, i) => ({
    ...f,
    box: { x: nd.box.x, y: top + i * ROW, w: nd.box.w, h: ROW },
  }));
}

/** The header band of a table: from its top to the rows. */
export function headerOf(nd: SceneNode): Box {
  const rows = (nd.fields ?? []).length;
  return { ...nd.box, h: nd.box.h - 2 * BODY_PAD - rows * ROW };
}
