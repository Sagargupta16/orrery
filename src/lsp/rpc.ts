// The LSP base protocol: JSON-RPC 2.0 messages, each behind a Content-Length header, on a byte
// stream. Unlike the MCP stdio transport (one message per line), a body may hold newlines.

export interface Message {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

/** One framed message as bytes: the header counts the UTF-8 body, not its characters. */
export function frame(msg: unknown): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

/**
 * A reader that takes chunks as they arrive and calls `onMessage` once per complete message. A
 * frame without a Content-Length header is dropped; a body that is not JSON goes to `onBadJson`.
 */
export function messageReader(onMessage: (msg: unknown) => void, onBadJson: () => void) {
  let buf: Buffer = Buffer.alloc(0);
  return (chunk: Buffer) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      const length = /content-length:\s*(\d+)/i.exec(buf.subarray(0, end).toString("ascii"))?.[1];
      const start = end + 4;
      if (length === undefined) {
        buf = buf.subarray(start);
        continue;
      }
      if (buf.length < start + Number(length)) return;
      const body = buf.subarray(start, start + Number(length)).toString("utf8");
      buf = buf.subarray(start + Number(length));
      let msg: unknown;
      try {
        msg = JSON.parse(body);
      } catch {
        onBadJson();
        continue;
      }
      onMessage(msg);
    }
  };
}
