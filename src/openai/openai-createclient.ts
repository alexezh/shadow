import { Database } from "../database.js";
import { ToolDispatcher } from "./tooldispatcher.js";
import { ConversationStateChat, OpenAIClientChatLegacy } from "./openai-chatclientlegacy.js";
import { ConversationStateChatSkill, SkilledAIClient } from "./skilled-aiclient.js";
import { OpenAIClient } from "./openai-client.js";

export function createClient(database: Database): SkilledAIClient {
  const disp = new ToolDispatcher(database);
  return new SkilledAIClient(disp);
}

export function createContext(systemPrompt: string, initialUserMessage: string, contextMessage?: {
  role: 'user';
  content: string;
}) {
  return new ConversationStateChatSkill(systemPrompt, initialUserMessage, contextMessage);
}
