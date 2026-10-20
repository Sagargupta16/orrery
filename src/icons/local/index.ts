// Icons from the user's own SVG files (`icons:` in the spec, used as local:<name>): read,
// sanitized and registered so renderIcon draws them like any pack icon. The same reader backs
// `orrery icons new`, `check` and `adopt`, which hold a drawing to the rules in
// references/icons.md (IC01..IC10).
//
// read.ts loads and converts a file, on top of xml.ts (parse, serialize), sanitize.ts and
// paint.ts. rules.ts measures the drawing that drawing.ts builds from geometry.ts and path.ts;
// adopt.ts rebuilds that drawing as clean paths; starter.ts is the `icons new` template.

export { type Adopted, adoptIcon } from "./adopt.ts";
export { LocalIconError, shownPath } from "./errors.ts";
export { loadLocalIcons, localArt } from "./read.ts";
export {
  checkIcon,
  ICON_RULES,
  type IconCheck,
  type IconRule,
  MAX_COMMANDS,
  type RuleResult,
} from "./rules.ts";
export { starterIcon } from "./starter.ts";
