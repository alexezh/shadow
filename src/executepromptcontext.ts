import type { Session } from "./clippy/session";
import type { Database } from "./database";
import type { OpenAIClient } from "./openai-client";

export type ExecutePromptContext = {
  session: Session | undefined,
  database: Database,
  openaiClient: OpenAIClient,
  prompt: string,
  partId?: string;
  docId?: string;
  selectionRange?: unknown;
}
