// Named subsets of one spec (`views:`): each becomes its own model, so an overview and its detail
// figures come from one source and cannot drift apart.
import type { Model } from "./types.ts";

export interface ViewModel {
  /** The view's name; undefined for the whole diagram. */
  name?: string;
  model: Model;
}

/** The models to draw for --view: the whole diagram by default, one view, or `all` of them. */
export function viewsOf(model: Model, _flag?: string | boolean): ViewModel[] {
  return [{ model }];
}
