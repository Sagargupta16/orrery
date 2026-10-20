// orrery lsp: a Language Server for spec files over stdio, with no dependencies. Diagnostics from
// parseSpec and layout's checks land on the characters they are about, their mechanical fixes
// are code actions, and icon ids, group types, ids and keys complete as they are typed.
//
// lsp/rpc.ts frames the messages, lsp/server.ts answers them, lsp/locate.ts places a finding
// in the YAML, lsp/fixes.ts turns its fixes into edits, and complete, hover and symbols serve
// the requests of those names.
import type { Args } from "../cli/args.ts";
import { usage } from "../cli/io.ts";
import { frame, messageReader } from "./rpc.ts";
import { createServer } from "./server.ts";

export async function cmdLsp(args: Args): Promise<void> {
  if (args._.length) usage(`lsp takes no arguments (got ${args._.join(" ")})`);
  const send = (msg: unknown) => process.stdout.write(frame(msg));
  await new Promise<void>((done) => {
    let finished = false;
    const finish = (code: number) => {
      if (finished) return;
      finished = true;
      server.close();
      process.stdin.off("data", read);
      process.stdin.destroy();
      process.exitCode = code;
      done();
    };
    const server = createServer(send, finish);
    const read = messageReader(
      (msg) => server.handle(msg),
      () => send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }),
    );
    process.stdin.on("data", read);
    // An editor that goes away without exit: stop as the protocol says, 1 unless shut down.
    process.stdin.on("end", () => finish(server.exitCode()));
  });
}
