import type { Session } from "../server/session";
import type { Database } from "../database";
import { YRange } from "../om/YRange";
import type { OpenAIClient } from "./openai-client";

export type ExecutePromptContext = {
  session: Session,
  prompt: string,
  partId?: string;
  docId?: string;
  selection?: YRange & { kind: "point" | "range" };
}
