import { ConversationState, OpenAIClient, TokenUsage } from "./openai-client.js";
import { PhaseGatedEnvelope } from "./phase-envelope.js";
import type { ExecutePromptContext } from "./executepromptcontext.js";
import type { ToolDef } from "../skills/tooldef.js";
import { getRootSkill, type ChatPromptContext, type ChatPromptResult } from "../skills/rootskill.js";
import { ConversationStateChat } from "./openai-chatclientlegacy.js";
import { createContext } from "./openai-createclient.js";
import { SkilledAIClient } from "./skilled-aiclient.js";
import { ToolDispatcher } from "./tooldispatcher.js";

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
  ctx: ExecutePromptContext,
  chatCtx: ChatPromptContext,
): Promise<{ response: string; conversationState: ConversationState; usage: TokenUsage }> {

  const toolDispatcher = new ToolDispatcher(ctx.database);
  const skilledClient = new SkilledAIClient(toolDispatcher);
  const startAt = performance.now();

  const chatPrompt = await getRootSkill(chatCtx);

  const conversationState = createContext(
    chatPrompt.systemPrompt,
    ctx.prompt,
    chatPrompt.contextMessage
  );

  let currentPrompt = ctx.prompt;
  let lastResponse = '';
  const aggregateUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };

  const maxFollowUps = 12;

  for (let iteration = 0; iteration < maxFollowUps; iteration++) {
    // Set the current prompt in the MCP client for history tracking
    if (iteration > 0) {
      toolDispatcher.setCurrentPrompt(currentPrompt);
    }

    const result = await skilledClient.chatWithSkills(
      ctx.session,
      mcpTools,
      conversationState,
      currentPrompt,
      {
        startAt: startAt
      }
    );

    lastResponse = result.response;
    aggregateUsage.promptTokens += result.usage.promptTokens;
    aggregateUsage.completionTokens += result.usage.completionTokens;
    aggregateUsage.totalTokens += result.usage.totalTokens;

    const envelope = tryParseJson<PhaseGatedEnvelope>(lastResponse);
    if (!envelope) {
      break;
    }

    const nextPrompt = extractNextPrompt(envelope);
    if (!nextPrompt) {
      break;
    }

    console.log(`🔁 Continuing workflow with next prompt: ${nextPrompt}`);
    currentPrompt = nextPrompt;
  }

  const endAt = performance.now();
  const elapsedSeconds = (endAt - startAt) / 1000;
  const contextSummary = conversationState.getSummary();
  console.log(`skilledWorker: elapsed=${elapsedSeconds.toFixed(2)}s prompt=${aggregateUsage.promptTokens} completion=${aggregateUsage.completionTokens} total=${aggregateUsage.totalTokens}`);
  console.log(`Context usage: messages=${contextSummary.messageCount} chars=${contextSummary.messageChars} trackedPrompt=${contextSummary.promptTokens} trackedCompletion=${contextSummary.completionTokens}`);
  console.log('Response:', lastResponse);

  return {
    response: lastResponse,
    conversationState,
    usage: aggregateUsage
  };
}
