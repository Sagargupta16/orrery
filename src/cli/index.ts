// The CLI entry: parse the command line and hand it to the command it names.
import { cmdDoc } from "../doc/index.ts";
import { cmdMcp } from "../mcp/index.ts";
import { cmdPatch } from "../patch/index.ts";
import { cmdWatch } from "../watch.ts";
import { parseArgs } from "./args.ts";
import { cmdDemo, cmdDoctor } from "./doctor.ts";
import { HELP, VERSION } from "./help.ts";
import { cmdIcons } from "./icons.ts";
import { usage } from "./io.ts";
import { cmdRender } from "./render.ts";
import { cmdReview } from "./review.ts";
import { cmdImport, cmdInit, cmdStyles } from "./templates.ts";

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const [cmd, ...rest] = args._;
  args._ = rest;
  if (args.flags.version === true) return void process.stdout.write(`${VERSION}\n`);
  if (!cmd || args.flags.help === true || cmd === "help")
    return void process.stdout.write(`${HELP}\n`);
  switch (cmd) {
    case "render":
      return cmdRender(args, false);
    case "validate":
    case "check":
      return cmdRender(args, true);
    case "review":
      return cmdReview(args);
    case "icons":
    case "icon":
      return cmdIcons(args);
    case "styles":
      return cmdStyles(args);
    case "init":
      return cmdInit(args);
    case "import":
      return cmdImport(args);
    case "watch":
      return cmdWatch(args);
    case "patch":
      return cmdPatch(args);
    case "doc":
      return cmdDoc(args);
    case "mcp":
      return cmdMcp(args);
    case "doctor":
      return cmdDoctor();
    case "demo":
      return cmdDemo(args);
    default:
      usage(`unknown command "${cmd}"`);
  }
}
