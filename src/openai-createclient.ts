import { Database } from "./database.js";
import { ConversationStateChat, OpenAIClientChat } from "./openai-chatclient.js";
import { OpenAIClient } from "./openai-client.js";

export function createClient(database: Database): OpenAIClient {
  return new OpenAIClientChat(database);
}

export function createContext(systemPrompt: string, initialUserMessage: string, contextMessage?: {
  role: 'user';
  content: string;
}) {
  return new ConversationStateChat(systemPrompt, initialUserMessage, contextMessage);
}
