// Node's globals the renderer names without importing them; esbuild injects these wherever the
// bundled code uses `Buffer` or `process`.
export { Buffer } from "./buffer.ts";
export { default as process } from "./process.ts";
