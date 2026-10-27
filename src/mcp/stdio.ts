// The stdio transport: one JSON-RPC message per line on stdin, one reply per line on stdout.
import { type Context, isObj } from "./kit.ts";
import { dispatch, rpcError } from "./protocol.ts";

/** One line's bytes as text, without the "\r" of a CRLF ending. */
const decode = (bytes: Buffer) => bytes.toString("utf8").replace(/\r$/, "");

export function serveStdio(): Promise<void> {
  const send = (body: unknown) => process.stdout.write(`${JSON.stringify(body)}\n`);
  const ctx: Context = { http: false };
  const pending = new Set<Promise<void>>();
  return new Promise((done) => {
    const receive = (line: string) => {
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
    };
    // Messages end at "\n" alone, as MCP frames them: readline also splits at U+2028 and U+2029,
    // which JSON.stringify leaves raw inside strings. A line is decoded whole, so a character
    // split across two chunks stays intact.
    let head: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => {
      let start = 0;
      for (let end = chunk.indexOf(0x0a); end !== -1; end = chunk.indexOf(0x0a, start)) {
        receive(decode(Buffer.concat([...head, chunk.subarray(start, end)])));
        head = [];
        start = end + 1;
      }
      if (start < chunk.length) head.push(chunk.subarray(start));
    });
    // Calls still running when the client closes stdin are answered before the server exits.
    process.stdin.on("end", () => {
      if (head.length) receive(decode(Buffer.concat(head)));
      void Promise.allSettled([...pending]).then(() => done());
    });
  });
}
