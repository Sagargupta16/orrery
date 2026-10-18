// Pools and swimlanes: groups of type pool and lane. ELK lays the flow out without them, then the
// lanes become bands across the flow and every node moves into its own lane's band.

import type { LayoutHooks } from "./hooks.ts";

export const laneHooks: LayoutHooks = {};
