import type { YRange } from "../om/YNode";

export interface PromptRequest {
  sessionId: string;
  prompt: string;
  partId?: string;
  docId?: string;
  selectionRange?: YRange;
}

