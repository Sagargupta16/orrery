// The CLI's public face: main and the helpers the tool commands share; the code is in src/cli/.
export type { Args } from "./cli/args.ts";
export { main } from "./cli/index.ts";
export { printDiagnostics, readSpec, renderFailure, usage, writeAtomic } from "./cli/io.ts";
