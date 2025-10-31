import { ConversationState, TokenUsage } from "../openai/openai-client.js";
import { PhaseGatedEnvelope } from "../openai/phase-envelope.js";
import type { ExecutePromptContext } from "../openai/executepromptcontext.js";
import { getRootSkill } from "./rootskill.js";
import { SkilledAIClient } from "../openai/skilled-aiclient.js";

interface StepCompletion {
  next_step?: string | null;
  nextStep?: string | null;
  next_prompt?: string | null;
  nextPrompt?: string | null;
  [key: string]: unknown;
}

export async function skilledWorker(
  ctx: ExecutePromptContext,
): Promise<{ response: string; conversationState: ConversationState; usage: TokenUsage }> {

  const skilledClient = new SkilledAIClient();
  const startAt = performance.now();

  const rootSkill = await getRootSkill(ctx.session.database, ctx);

  const vmCtx = ctx.session.vm.createContext(
    rootSkill.text,
    ctx.prompt,
    rootSkill.contextMessage
  );

  let currentPrompt = ctx.prompt;
  let lastResponse = '';
  const aggregateUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };

  const maxFollowUps = 12;

  vmCtx.executionStartAt = startAt;

  for (let iteration = 0; iteration < maxFollowUps; iteration++) {
    const result = await skilledClient.chatWithSkills(
      vmCtx,
      currentPrompt
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
  const contextSummary = vmCtx.getSummary();
  console.log(`skilledWorker: elapsed=${elapsedSeconds.toFixed(2)}s prompt=${aggregateUsage.promptTokens} completion=${aggregateUsage.completionTokens} total=${aggregateUsage.totalTokens}`);
  console.log(`Context usage: messages=${contextSummary.messageCount} chars=${contextSummary.messageChars} trackedPrompt=${contextSummary.promptTokens} trackedCompletion=${contextSummary.completionTokens}`);
  console.log('Response:', lastResponse);

  return {
    response: lastResponse,
    conversationState: vmCtx,
    usage: aggregateUsage
  };
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
