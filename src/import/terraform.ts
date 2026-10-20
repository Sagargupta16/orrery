// orrery import terraform: a `terraform show -json` plan or state file to a spec, every node carrying the evidence it came from.
import type { Imported } from "./types.ts";

export async function importTerraform(_path: string): Promise<Imported> {
  throw new Error("orrery import terraform is not built yet");
}
