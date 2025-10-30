import { Database } from "../database.js";
import { ConversationStateChat, OpenAIClientChatLegacy } from "./openai-chatclientlegacy.js";
import { ConversationStateChatSkill, OpenAIClientChatSkill } from "./openai-chatclientskill.js";
import { OpenAIClient } from "./openai-client.js";

export function createClient(database: Database): OpenAIClient {
  return new OpenAIClientChatSkill(database);
}

export function createContext(systemPrompt: string, initialUserMessage: string, contextMessage?: {
  role: 'user';
  content: string;
}) {
  return new ConversationStateChatSkill(systemPrompt, initialUserMessage, contextMessage);
}
