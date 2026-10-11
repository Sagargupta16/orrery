import { main } from "./cli.ts";

main().catch((e: unknown) => {
  process.stderr.write(`stackdraw: ${(e as Error)?.stack ?? e}\n`);
  process.exitCode = 1;
});
