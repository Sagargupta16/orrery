// orrery import kubernetes: Kubernetes manifests (a file or a folder, Helm and Kustomize output included) to a spec, every node carrying the evidence it came from.
import type { Imported } from "./types.ts";

export async function importKubernetes(_path: string): Promise<Imported> {
  throw new Error("orrery import kubernetes is not built yet");
}
