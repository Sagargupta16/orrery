// The layout pass of the language server: parse and render a spec once to collect checkScene's
// warnings. ELK runs for 200 ms to seconds on a large spec, so `orrery lsp` runs it in a worker
// thread that re-runs this program's own entry file (src/main.ts, or the bundle) with
// `lsp`, which finds `workerData` and serves layout jobs instead of the protocol. Completion and
// hover are answered on the main thread meanwhile.
import { realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { renderFailure } from "../cli/io.ts";
import { renderModel } from "../render/index.ts";
import { parseSpec } from "../spec/index.ts";
import type { Diagnostic } from "../types.ts";

/** What the worker thread is started with: its presence is what makes `orrery lsp` a worker. */
const MARK = "orreryLspLayout";

export interface LayoutRunner {
  /**
   * The layout findings of `text`, or undefined when the text no longer parses, the layout
   * failed for a reason that is not the spec's, or a newer text of the same `key` replaced it.
   */
  run(key: string, path: string, text: string): Promise<Diagnostic[] | undefined>;
  close(): void;
}

/** One layout pass; `path` is what parseSpec resolves `icons:` files against. */
export async function layoutFindings(
  path: string,
  text: string,
): Promise<Diagnostic[] | undefined> {
  const { model } = parseSpec(text, path);
  if (!model) return undefined;
  const name = basename(path).replace(/\.(ya?ml|json)$/i, "");
  try {
    return (await renderModel({ model, formats: [], themes: [model.theme], name })).diagnostics;
  } catch (e) {
    const failure = renderFailure(e);
    if (failure) return [failure];
    throw e;
  }
}

/** The layout on the calling thread: what the tests and a failed worker use. */
export const inlineLayout: LayoutRunner = {
  run: async (_key, path, text) => {
    try {
      return await layoutFindings(path, text);
    } catch (e) {
      process.stderr.write(`orrery lsp: layout failed: ${(e as Error)?.stack ?? e}\n`);
      return undefined;
    }
  },
  close() {},
};

interface Job {
  id: number;
  key: string;
  path: string;
  text: string;
  done: (found: Diagnostic[] | undefined) => void;
}

/**
 * Layout in one worker thread. Jobs run one at a time, and only the newest text of each document
 * waits its turn: a job queued behind a running one is dropped when its document changes again.
 * A worker that cannot start or dies hands the rest to the calling thread.
 */
export function workerLayout(): LayoutRunner {
  let worker: Worker | undefined;
  try {
    // realpath: an npm bin link has no extension, which a Worker refuses.
    worker = new Worker(realpathSync(resolve(process.argv[1] ?? "")), {
      argv: ["lsp"],
      workerData: { [MARK]: true },
    });
    worker.unref();
  } catch {
    return inlineLayout;
  }
  const waiting = new Map<string, Job>();
  let running: Job | undefined;
  let nextId = 0;
  let broken = false;

  const fail = () => {
    broken = true;
    const jobs = [...(running ? [running] : []), ...waiting.values()];
    running = undefined;
    waiting.clear();
    for (const job of jobs)
      void inlineLayout.run(job.key, job.path, job.text).then((found) => job.done(found));
  };
  const next = () => {
    if (running || !worker) return;
    const [key, job] = waiting.entries().next().value ?? [];
    if (!key || !job) return;
    waiting.delete(key);
    running = job;
    worker.postMessage({ id: job.id, path: job.path, text: job.text });
  };

  worker.on("message", (m: { id: number; found?: Diagnostic[]; error?: string }) => {
    if (m.id !== running?.id) return;
    const job = running;
    running = undefined;
    if (m.error) process.stderr.write(`orrery lsp: layout failed: ${m.error}\n`);
    job.done(m.found);
    next();
  });
  worker.on("error", (e: Error) => {
    process.stderr.write(`orrery lsp: layout worker failed: ${e.stack ?? e}\n`);
    fail();
  });
  worker.on("exit", () => {
    if (!broken && worker) fail();
  });

  return {
    run(key, path, text) {
      if (broken) return inlineLayout.run(key, path, text);
      return new Promise((done) => {
        waiting.get(key)?.done(undefined);
        waiting.set(key, { id: nextId++, key, path, text, done });
        next();
      });
    },
    close() {
      const w = worker;
      worker = undefined;
      for (const job of [...(running ? [running] : []), ...waiting.values()]) job.done(undefined);
      running = undefined;
      waiting.clear();
      void w?.terminate();
    },
  };
}

/** True inside the worker thread started by workerLayout. */
export const isLayoutWorker = !isMainThread && !!(workerData as Record<string, unknown>)?.[MARK];

/** The worker's side: answer layout jobs until the thread is terminated. */
export function serveLayout(): void {
  parentPort?.on("message", async (job: { id: number; path: string; text: string }) => {
    try {
      parentPort?.postMessage({ id: job.id, found: await layoutFindings(job.path, job.text) });
    } catch (e) {
      parentPort?.postMessage({ id: job.id, error: String((e as Error)?.stack ?? e) });
    }
  });
}
