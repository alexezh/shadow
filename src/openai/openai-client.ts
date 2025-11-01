import OpenAI from 'openai';
import type { ChatCompletionTool } from 'openai/resources/index.js';
import type { Session } from '../server/session.js';
import type { PhaseGatedEnvelope } from './phase-envelope.js';

export interface ConversationState {

}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  response: string | PhaseGatedEnvelope;
  kind: "raw" | "envelope";
  conversationId: string;
  usage: TokenUsage;
}

export function getResponseFromChatResult(result: ChatResult): string {
  if (result.kind === "envelope") {
    return (result.response as PhaseGatedEnvelope).envelope?.content ?? "";
  } else {
    return result.response as string;
  }
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
