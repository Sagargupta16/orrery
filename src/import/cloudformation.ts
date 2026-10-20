// orrery import cloudformation: a CloudFormation or SAM template (JSON or YAML), including `cdk synth` output to a spec, every node carrying the evidence it came from.
import type { Imported } from "./types.ts";

export async function importCloudFormation(_path: string): Promise<Imported> {
  throw new Error("orrery import cloudformation is not built yet");
}
