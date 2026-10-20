import { main } from "./cli/index.ts";
import { LibraryError } from "./icons/libraries.ts";

main().catch((e: unknown) => {
  // An icon library that cannot be loaded is an environment problem with known fixes, not a crash.
  if (e instanceof LibraryError) {
    process.stderr.write(`error DG301 ${e.message}\n`);
    for (const fix of e.fixes) process.stderr.write(`      fix: ${fix}\n`);
  } else process.stderr.write(`orrery: ${(e as Error)?.stack ?? e}\n`);
  process.exitCode = 1;
});
