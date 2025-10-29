import type { YRange } from "../om/YRange";

export interface PromptRequest {
  sessionId: string;
  prompt: string;
  partId?: string;
  docId?: string;
  selection?: YRange;
}

