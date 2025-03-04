import type { ActionName, ShadowAction } from "./action";
import type { IShadowAgent, ShadowCp, AgentName, ActionArgs } from "./ishadowagent";

export interface IShadow {
  processAction(action: ShadowAction);

  /**
   * generate action back to system
   */
  invokeAction<T extends ActionArgs = ActionArgs>(action: ActionName, args?: T): void;

  addAgent(stateName: AgentName, state: IShadowAgent);

  /**
   * TODO: add dependency tracking
   */
  getAgent(stateName: AgentName): IShadowAgent;
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

export type DurablePositionId = string & {
  __tag_durpos: never;
}
/**
 * represents the body of the text; wrapper over ISwmBody and other types
 * hiding number of details.
 */
export interface IShadowTextBody {
  addDurablePosition(, pos: ShadowCp): DurablePositionId;
  removeDurablePosition(name: DurablePositionId): void;
  getDurablePosition(name: DurablePositionId): ShadowCp;

  getCharacterDistance(pos1: ShadowCp, pos2: ShadowCp): number;
  getNormalizedDistance(pos1: ShadowCp, pos2: ShadowCp): NormalizedDistance;

  getTextVersion(): TextVersion;
  getChangeStats(ver: TextVersion): number;
}

var actionLog: (text: string) => void;