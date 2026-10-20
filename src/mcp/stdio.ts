// The stdio transport: one JSON-RPC message per line on stdin, one reply per line on stdout.
import { createInterface } from "node:readline";
import { type Context, isObj } from "./kit.ts";
import { dispatch, rpcError } from "./protocol.ts";

export function serveStdio(): Promise<void> {
  const send = (body: unknown) => process.stdout.write(`${JSON.stringify(body)}\n`);
  const ctx: Context = { http: false };
  const pending = new Set<Promise<void>>();
  return new Promise((done) => {
    const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
    lines.on("line", (line) => {
      if (!line.trim()) return;
      let msg: unknown;
      try {
        msg = JSON.parse(line);
      } catch {
        return void send(rpcError(null, -32700, "Parse error"));
      }
      if (Array.isArray(msg))
        return void send(
          rpcError(null, -32600, "Invalid Request: one message per line, no batches"),
        );
      const job: Promise<void> = dispatch(msg, ctx)
        .then((reply) => {
          if (reply) send(reply.body);
        })
        .catch((e: unknown) => {
          process.stderr.write(`orrery mcp: ${(e as Error)?.stack ?? e}\n`);
          if (isObj(msg) && "id" in msg) send(rpcError(msg.id, -32603, "Internal error"));
        })
        .finally(() => pending.delete(job));
      pending.add(job);
    });
    // Calls still running when the client closes stdin are answered before the server exits.
    lines.on("close", () => void Promise.allSettled([...pending]).then(() => done()));
  });
}
