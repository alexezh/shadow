import type { ActionName, ShadowAction } from "./action";
import type { IShadowAgent, ShadowCp, StateAgent } from "./ishadowagent";

export interface IShadow {
  processAction(action: ShadowAction);

  /**
   * generate action back to system
   */
  invokeAction(action: ActionName): void;

  addState(stateName: StateAgent, state: IShadowAgent);

  /**
   * TODO: add dependency tracking
   */
  getState(stateName: StateAgent): IShadowAgent;
}

export type TextVersion = number & {
  __tag_ver: never;
}

/**
 * distance normalized to -1, 1 where -1 is start of doc
 */
export type NormalizedDistance = number & {
  __tag_normpos: never;
}

/**
 * represents the body of the text; wrapper over ISwmBody and other types
 * hiding number of details.
 */
export interface IShadowTextBody {
  addDurablePosition(name: string, pos: ShadowCp);
  removeDurablePosition(name: string);
  getDurablePosition(name: string): ShadowCp;

  getNormalizedDistance(pos1: ShadowCp, pos2: ShadowCp): NormalizedDistance;

  getTextVersion(): TextVersion;
  getChangeStats(ver: TextVersion): number;
}