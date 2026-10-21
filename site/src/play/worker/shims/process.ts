// The parts of Node's process the renderer touches. Paths resolve against the examples folder, so
// a spec's `icons: { x: ./icons/x.svg }` finds the gallery's own icon files.
const noop = () => true;

const process = {
  env: {} as Record<string, string | undefined>,
  platform: "linux",
  pid: 1,
  argv: [] as string[],
  versions: {} as Record<string, string>,
  exitCode: 0 as number | undefined,
  cwd: () => "/skill/examples",
  stdout: { write: noop, isTTY: false },
  stderr: { write: noop, isTTY: false },
  on: noop,
  emitWarning: noop,
  nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) => queueMicrotask(() => fn(...args)),
};

export default process;
export { process };
