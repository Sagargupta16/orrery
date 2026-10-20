// The version stamp and the help text that --help and every usage error print.
import { PACK_ORDER } from "../icons/index.ts";

declare const __VERSION__: string;
export const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "dev";

export const HELP = `orrery ${VERSION}: architecture and system design diagrams with official icons

Usage:
  orrery render <spec.yaml> [-o out] [-f svg,png,drawio,drawio.svg,tsx,html|all] [--theme light|dark|both]
                    [--scale 3] [--skin classic|stage] [--animate packets|flow|relay|none]
                    [--static] [--font extra.ttf] [--view <name>|all]
                    [--strict] [--force] [--json]
  orrery validate <spec.yaml> [--strict] [--json]
  orrery review <spec.yaml> [-o out] [--width 880] [--theme light|dark] [--skin classic|stage]
                    [--strict] [--json]
  orrery icons search <words...> [--pack aws] [--type service] [--limit 15] [--json]
  orrery icons show <icon-id> [-o icon.svg|icon.png] [--theme dark]
  orrery icons list [--pack aws] [--category Compute] [--type service] [--json]
  orrery icons packs [--json]
  orrery icons fetch [pack...]
  orrery icons new <name> [--dir icons] [--force]
  orrery icons check <icon.svg> [-o sheet.png]
  orrery icons adopt <file.svg> --name <name> [--dir icons] [--force]
  orrery watch <spec.yaml> [-o out] [-f svg,png] [--theme dark] [--skin stage] [--animate ...]
                    [--scale 3] [--review] [--width 880]
  orrery patch <spec.yaml> <candidates.json|-> [-o best.yaml] [--width 880] [--theme dark]
                    [--skin classic|stage] [--json]
  orrery doc <design.md> [-o out.html|out.md|out.docx] [-f html,md,docx] [--theme light]
                    [--skin classic|stage]
  orrery mcp [--port 8765]
  orrery mcp install <claude-code|claude-desktop|cursor|vscode|gemini|codex|kiro> [project|user]
                    [--force] [--json]
  orrery mcp install --list
  orrery diff <before.yaml> <after.yaml> [-o changes.svg] [--json]
  orrery verify <spec.yaml> [--link] [--commit <sha>] [--json]
  orrery describe <spec.yaml> [--json]
  orrery lsp
  orrery styles [--json]
  orrery import <mermaid|terraform|cloudformation|compose|kubernetes|picture> <file> [-o diagram.yaml]
  orrery init [template] [-o diagram.yaml] [--list]
  orrery doctor
  orrery demo [out-dir]

Packs: ${PACK_ORDER.join(", ")}. Spec reference: references/spec.md in the skill folder.
Exit codes: 0 ok, 1 diagram errors (or warnings with --strict), 2 bad command line.`;
