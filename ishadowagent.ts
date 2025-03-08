import type { ActionName, ShadowAction } from "./action";

/**
 * different components of shadow as packaged as agents
 * 
 * agents receive and generate actions; such as if an agent wants to display suggestion
 * it generates an action back to the system. Agents can depend on other agents when making 
 * decisions. 
 * 
 * BTW, alternative name is State, but agent is cooler at this point
 */
export interface IShadowAgent {
  onAction(action: ShadowAction): PValue;
  readonly weight: PValue;
  readonly suggestion?: ActionName[];
}

export type AgentName =
  "editor.formatting" |
  "editor.writing" | // mostly new text
  //  "editor.editing" | // changing existing text
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
}

export type TypeArgs = ActionArgs & {
  cp: ShadowCp,
  inserted: number,
  deleted: number
}

/**
 * most probably implemented as fragmented position
 * does not really matter as it is just passed to IShadowTextBody
 */
export type ShadowCp = number & {
  __tag_paraId: never;
}

export type MoveIpArgs = ActionArgs & {
  cp: ShadowCp
}

export type StartWritingArgs = ActionArgs & {
  cp: ShadowCp
}

// class MemoryLane {
//   public actions: Action[];
// }

export function updateWeight(v: PValue, d: number): PValue {
  let t = v + d;
  if (t > 1) {
    return 1 as PValue;
  } else if (t < 0) {
    return 0 as PValue;
  } else {
    return t as PValue;
  }
}