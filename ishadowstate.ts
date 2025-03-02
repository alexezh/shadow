import type { ShadowAction } from "./action";

export interface IShadowState {
  onAction(action: ShadowAction): PValue;
  readonly weight: PValue;
}

export type StateName =
  "editor.formatting" |
  "editor.writing" | // mostly new text
  "editor.editing" | // changing existing text
  "editor.correcting" |
  "editor.struggle" |
  "display.struggle" |
  "display.rewrite" |
  "display.sectionsummary"

/**
 * number is more compact representation of time
 */
export type TimeValue = number & {
  __tagtime: never;
}

export type PValue = number & {
  __tagprob: never;
}

/**
 * 0-1 same paragraphs, 1000 and -1000 end of document
 */
export type TextDistance = number & {
  __tagdist: never;
}

export type ActionArgs = {
  __tagargs: never;
}

export type EditArgs = ActionArgs & {
}

export type MoveArgs = ActionArgs & {
  distance?: TextDistance,
}

// class MemoryLane {
//   public actions: Action[];
// }