// Hover on an icon id: its official name, the pack it comes from and its category.
import { iconInfo, packInfo } from "../icons/index.ts";
import type { Position, Range } from "./text.ts";

const ID_CHAR = /[A-Za-z0-9:._-]/;

export function hover(
  text: string,
  pos: Position,
): { contents: { kind: "markdown"; value: string }; range: Range } | null {
  const line = (text.split("\n")[pos.line] ?? "").replace(/\r$/, "");
  let start = Math.min(pos.character, line.length);
  let end = start;
  while (start > 0 && ID_CHAR.test(line[start - 1] ?? "")) start--;
  while (end < line.length && ID_CHAR.test(line[end] ?? "")) end++;
  const word = line.slice(start, end);
  if (!/^[a-z0-9]+:[a-z0-9]/i.test(word)) return null;
  const info = iconInfo(word);
  if (!info) return null;
  const pack = packInfo()[info.pack];
  const lines = [
    `**${info.name}** \`${info.id}\``,
    ...(info.id !== word.toLowerCase() ? [`Short name for \`${info.id}\`.`] : []),
    `Pack: ${pack?.title ?? info.pack} (\`${info.pack}\`)`,
    `Category: ${info.category}${info.type ? ` (${info.type})` : ""}`,
  ];
  return {
    contents: { kind: "markdown", value: lines.join("\n\n") },
    range: {
      start: { line: pos.line, character: start },
      end: { line: pos.line, character: end },
    },
  };
}
