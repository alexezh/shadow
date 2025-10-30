import OpenAI from 'openai';
import { Database } from '../database.js';
import { ChatCompletionTool } from 'openai/resources/index.js';
import { parsePhaseEnvelope, PhaseGatedEnvelope, Phase, validatePhaseProgression } from '../phase-envelope.js';
import { ToolDispatcher } from '../tooldispatcher.js';
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
