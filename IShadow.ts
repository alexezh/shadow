import type {
  ShadowMessageArgs,
  ShadowMessageId,
  ShadowMessage,
} from "./shadowmessage";
import type { IShadowAgent, GlobalCp, AgentName } from "./ishadowagent";

export interface IShadow {
  loadDocument(): void;

  processMessage(message: ShadowMessage): void;

  /**
   * generate action back to system
   */
  invokeAction<T extends ShadowMessageArgs = ShadowMessageArgs>(
    action: ShadowMessageId,
    args?: T
  ): void;

  addAgent(stateName: AgentName, state: IShadowAgent): void;

  canDisplaySuggestion(id: ShadowMessageId): boolean;
  displaySuggestion(id: ShadowMessageId): void;

  /**
   * TODO: add dependency tracking
   */
  getAgent(stateName: AgentName): IShadowAgent;
}

export type TextVersion = number & {
  __tag_ver: never;
};

/**
 * distance normalized to -1, 1 where -1 is start of doc
 */
export type NormalizedDistance = number & {
  __tag_normpos: never;
};

export type DurablePositionId = string & {
  __tag_durpos: never;
};
/**
 * represents the body of the text; wrapper over ISwmBody and other types
 * hiding number of details.
 */
export interface IShadowTextBody {
  addDurablePosition(pos: GlobalCp): DurablePositionId;
  removeDurablePosition(name: DurablePositionId): void;
  getDurablePosition(name: DurablePositionId): GlobalCp;

  getCharacterDistance(pos1: GlobalCp, pos2: GlobalCp): number;
  getNormalizedDistance(pos1: GlobalCp, pos2: GlobalCp): NormalizedDistance;

  getTextVersion(): TextVersion;
  getChangeStats(ver: TextVersion): number;
}
