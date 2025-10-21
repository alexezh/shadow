import { ChatCompletionTool } from "openai/resources/chat/completions";
import { OpenAIClient, TokenUsage } from "./openai-client.js";
import { PhaseGatedEnvelope } from "./phase-envelope.js";

interface StepCompletion {
  next_step?: string | null;
  nextStep?: string | null;
  next_prompt?: string | null;
  nextPrompt?: string | null;
  [key: string]: unknown;
}

function tryParseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractNextPrompt(envelope: PhaseGatedEnvelope | null): string | null {
  if (!envelope?.envelope?.content || typeof envelope.envelope.content !== 'string') {
    return null;
  }

  const completion = tryParseJson<StepCompletion>(envelope.envelope.content);
  if (!completion) {
    return null;
  }

  const nextStep = (completion.next_step ?? completion.nextStep) ?? null;
  const nextPrompt = (completion.next_prompt ?? completion.nextPrompt) ?? null;

  if (!nextStep || typeof nextStep !== 'string' || nextStep.trim().length === 0) {
    return null;
  }

  if (!nextPrompt || typeof nextPrompt !== 'string' || nextPrompt.trim().length === 0) {
    return null;
  }

  return nextPrompt.trim();
}

export async function skilledWorker(
  openaiClient: OpenAIClient,
  mcpTools: Array<ChatCompletionTool>,
  systemPrompt: string,
  userMessage: string,
  options?: { conversationId?: string, startAt: number }
): Promise<{ response: string; conversationId: string; usage: TokenUsage }> {
  let conversationId = options?.conversationId;
  let currentPrompt = userMessage;
  let lastResponse = '';
  const aggregateUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };

  const maxFollowUps = 12;

  for (let iteration = 0; iteration < maxFollowUps; iteration++) {
    const result = await openaiClient.chatWithMCPTools(
      mcpTools,
      systemPrompt,
      currentPrompt,
      {
        conversationId,
        requireEnvelope: true,
        skipCurrentPrompt: iteration > 0,
        startAt: options?.startAt
      }
    );

    lastResponse = result.response;
    conversationId = result.conversationId;
    aggregateUsage.promptTokens += result.usage.promptTokens;
    aggregateUsage.completionTokens += result.usage.completionTokens;
    aggregateUsage.totalTokens += result.usage.totalTokens;

    const envelope = tryParseJson<PhaseGatedEnvelope>(lastResponse);
    if (!envelope) {
      break;
    }

    const nextPrompt = extractNextPrompt(envelope);
    if (!nextPrompt) {
      return {
        response: lastResponse,
        conversationId,
        usage: aggregateUsage
      };
    }

    console.log(`🔁 Continuing workflow with next prompt: ${nextPrompt}`);
    currentPrompt = nextPrompt;
  }

  return {
    response: lastResponse,
    conversationId: conversationId!,
    usage: aggregateUsage
  };
}
