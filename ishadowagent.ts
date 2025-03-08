import type {
  ShadowMessageId,
  ShadowMessage,
} from "./shadowmessage.ts";
import {
  type PValue,
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
  | "typing"
  | "formatting" // mostly new text
  //  "editor.editing" | // changing existing text
  | "editor.correcting"
  | "editor.struggle"
  | "addtoc"
  | "display.struggle"
  | "display.rewrite"
  | "display.sectionsummary";


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
