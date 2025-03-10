import type {
  ShadowMessageArgs,
  ShadowMessageId,
  ShadowMessage,
  ShadowRevisionId,
  DurablePositionId,
} from "./shadowmessage.ts";
import type { IShadowAgent, AgentName } from "./ishadowagent.ts";
import {
  type GlobalCp
} from "./shadowmessage.ts";

export interface IShadow {
  loadDocument(body: IShadowTextBody): void;

  processMessage(message: ShadowMessage): void;

  /**
   * generate action back to system
   */
  invokeAction(msg: ShadowMessage): void;

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

/**
 * represents the body of the text; wrapper over ISwmBody and other types
 * hiding number of details.
 */
export interface IShadowTextBody {
  getEditRange(rev: ShadowRevisionId): { start: GlobalCp, end: GlobalCp };

  addDurablePosition(pos: GlobalCp): DurablePositionId;
  removeDurablePosition(name: DurablePositionId | null): void;
  getDurablePosition(name: DurablePositionId | null): GlobalCp | null;

  getCharacterDistance(pos1: GlobalCp, pos2: GlobalCp): number;
  getNormalizedDistance(pos1: GlobalCp, pos2: GlobalCp): NormalizedDistance;

  getTextVersion(): TextVersion;
  getChangeStats(ver: TextVersion): number;
}
