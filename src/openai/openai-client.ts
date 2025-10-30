import OpenAI from 'openai';
import { ChatCompletionTool } from 'openai/resources/index.js';
import { Session } from '../server/session.js';

export interface ConversationState {

}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  response: string;
  conversationId: string;
  usage: TokenUsage;
}

export interface OpenAIClient {
  generateEmbedding(terms: string | string[]): Promise<number[]>;
  chatWithMCPTools(
    session: Session | undefined,
    mcpTools: Array<ChatCompletionTool>,
    conversationState: ConversationState,
    userMessage: string,
    options?: {
      skipCurrentPrompt?: boolean,
      requireEnvelope?: boolean,
      startAt?: number
    }
  ): Promise<ChatResult>;
}

let client: OpenAI;
export function initOpenAI(apiKey: string): void {
  client = new OpenAI({
    apiKey: apiKey || process.env.OPENAI_API_KEY
  });
}
export function getOpenAI(): OpenAI {
  return client!;
}
