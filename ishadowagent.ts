import type {
  ShadowMessageArgs,
  ShadowMessageId,
  ShadowMessage,
} from "./shadowmessage.ts";

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
  onAction(action: ShadowMessage): PValue;
  readonly weight: PValue;
  /**
   * informational; list of messages which agent emits
   */
  readonly emits?: ShadowMessageId[];
}

export type AgentName =
  | "editor.formatting"
  | "editor.writing" // mostly new text
  //  "editor.editing" | // changing existing text
  | "editor.correcting"
  | "editor.struggle"
  | "addtoc"
  | "display.struggle"
  | "display.rewrite"
  | "display.sectionsummary";

/**
 * number is more compact representation of time
 */
export type TimeValue = number & {
  __tagtime: never;
};

export type PValue = number & {
  __tagprob: never;
};

/**
 * 0-1 same paragraphs, 1000 and -1000 end of document
 */
export type TextDistance = number & {
  __tagdist: never;
};

export type TypeArgs = ShadowMessageArgs & {
  cp: GlobalCp;
  inserted: number;
  deleted: number;
};

/**
 * most probably implemented as fragmented position
 * does not really matter as it is just passed to IShadowTextBody
 */
export type GlobalCp = number & {
  __tag_globalcp: never;
};

export type MoveIpArgs = ShadowMessageArgs & {
  cp: GlobalCp;
};

export type StartWritingArgs = ShadowMessageArgs & {
  cp: GlobalCp;
};

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
