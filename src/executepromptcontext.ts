import type { Session } from "./server/session";
import type { Database } from "./database";
import { YRange } from "./om/YNode";
import type { OpenAIClient } from "./openai-client";

export type ExecutePromptContext = {
  session: Session | undefined,
  database: Database,
  openaiClient: OpenAIClient,
  prompt: string,
  partId?: string;
  docId?: string;
  selection?: YRange & { kind: "point" | "range" };
}
