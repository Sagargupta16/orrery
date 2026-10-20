// The patch op shapes the review loop writes, and the error an op throws when it cannot apply.

export type PatchOp =
  | { op: "set"; path: string; value: unknown }
  | { op: "unset"; path: string }
  | { op: "add"; path: string; value: unknown }
  | { op: "move"; path: string; after?: string; before?: string }
  | { op: "edge"; match: string | null; value: string | Record<string, unknown> | null };

export class PatchError extends Error {}
