import OpenAI from 'openai';
import { ToolDispatcher } from './tooldispatcher.js';
import { Database } from './database.js';
import { ChatCompletionTool } from 'openai/resources/index.js';
import { parsePhaseEnvelope, PhaseGatedEnvelope, Phase, validatePhaseProgression } from './phase-envelope.js';
import { Session } from './clippy/session.js';

type TrackerEntry =
  | { kind: 'message'; role: string; tag?: string; length: number; timestamp: number }
  | { kind: 'usage'; tag: string; promptTokens: number; completionTokens: number; totalTokens: number; timestamp: number };

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if it's a rate limit error
      // Handle both HTTP 429 status and OpenAI RateLimitError
      const isRateLimitError =
        error?.status === 429 ||
        error?.code === 'rate_limit_exceeded' ||
        error?.type === 'rate_limit_exceeded' ||
        error?.constructor?.name === 'RateLimitError' ||
        error?.message?.includes('Rate limit reached');

      if (isRateLimitError) {
        if (attempt < maxRetries) {
          // Extract wait time from error message if available
          // Handles formats like "Please try again in 718ms" or "Please try again in 2.5s"
          const waitTimeMsMatch = error?.message?.match(/Please try again in (\d+)ms/);
          const waitTimeSecMatch = error?.message?.match(/Please try again in ([\d.]+)s/);

          let waitTime: number;
          if (waitTimeMsMatch) {
            waitTime = parseInt(waitTimeMsMatch[1]);
          } else if (waitTimeSecMatch) {
            waitTime = Math.ceil(parseFloat(waitTimeSecMatch[1]) * 1000);
          } else {
            // Exponential backoff if no wait time specified
            waitTime = initialDelayMs * Math.pow(2, attempt);
          }

          // Add a small buffer to the wait time to ensure we're past the rate limit
          waitTime = Math.ceil(waitTime * 1.1) + 100;

          console.log(`⏳ Rate limit hit, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      } else {
        // For non-rate-limit errors, throw immediately
        throw error;
      }
    }
  }

  throw lastError;
}

export async function generateEmbedding(client: OpenAI, terms: string | string[]): Promise<number[]> {
  return retryWithBackoff(async () => {
    let text = (Array.isArray(terms)) ? terms.join(' ') : terms;
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: terms
    });

    return response.data[0]?.embedding || [];
  });
}

export class ConversationState {
  public messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  public systemPrompt: string;
  public lastPhase: Phase | null;
  public createdAt: Date;

  // Context tracking
  public promptTokens: number = 0;
  public completionTokens: number = 0;
  public totalTokens: number = 0;
  public messageChars: number = 0;
  public messageCount: number = 0;
  public entries: TrackerEntry[] = [];

  constructor(systemPrompt: string, initialUserMessage: string) {
    this.messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: initialUserMessage }
    ];
    this.systemPrompt = systemPrompt;
    this.lastPhase = null;
    this.createdAt = new Date();

    // Record initial messages
    this.recordMessage('system', systemPrompt, 'system');
    this.recordMessage('user', initialUserMessage, 'user');
  }

  recordMessage(role: string, content: string, tag?: string): void {
    const length = content ? content.length : 0;
    this.messageChars += length;
    this.messageCount += 1;
    this.entries.push({
      kind: 'message',
      role,
      tag,
      length,
      timestamp: Date.now()
    });
  }

  recordUsage(tag: string, promptTokens: number, completionTokens: number, totalTokens?: number): void {
    if (!promptTokens && !completionTokens && !totalTokens) {
      return;
    }
    const resolvedTotal = totalTokens ?? (promptTokens + completionTokens);
    this.promptTokens += promptTokens;
    this.completionTokens += completionTokens;
    this.totalTokens += resolvedTotal;
    this.entries.push({
      kind: 'usage',
      tag,
      promptTokens,
      completionTokens,
      totalTokens: resolvedTotal,
      timestamp: Date.now()
    });
  }

  getSummary(): TokenUsage & { messageChars: number; messageCount: number } {
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
      messageChars: this.messageChars,
      messageCount: this.messageCount
    };
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content });
    this.recordMessage('user', content, 'user');
  }
}

type ResponsesInputMessage = {
  role: string;
  content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'output_text'; text: string }
  >;
  // Note: tool_calls and tool_results are NOT supported in Responses API input
  // Tool results must be sent as input_text with the result embedded in the text
};

function toResponseInput(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): ResponsesInputMessage[] {
  const result: ResponsesInputMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const blocks: ResponsesInputMessage['content'] = [];

    // Handle tool messages - merge with preceding assistant message's tool call
    if (msg.role === 'tool') {
      // Find the preceding assistant message with tool_calls
      let assistantMsg = null;
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j].role === 'assistant' && (messages[j] as any).tool_calls) {
          assistantMsg = messages[j];
          break;
        }
      }

      const toolCallId = (msg as any).tool_call_id ?? '';
      const output = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? '');

      // Find which tool call this result is for
      let toolName = 'unknown';
      if (assistantMsg) {
        const toolCalls = (assistantMsg as any).tool_calls || [];
        const matchingCall = toolCalls.find((tc: any) => tc.id === toolCallId);
        if (matchingCall) {
          toolName = matchingCall.function?.name || 'unknown';
        }
      }

      // Format as user message with context about what tool was called
      blocks.push({
        type: 'input_text',
        text: `Result from ${toolName}:\n${output}`
      });

      result.push({
        role: 'user',
        content: blocks
      });
      continue;
    }

    // Skip assistant messages that only contain tool_calls without content
    if (msg.role === 'assistant' && (msg as any).tool_calls) {
      const hasContent = typeof msg.content === 'string' && msg.content !== null && msg.content.length > 0;

      if (!hasContent) {
        // Skip - tool results will reference the tool name
        continue;
      }

      // If there is content, include it but ignore the tool_calls
      blocks.push({ type: 'output_text', text: msg.content as string });
      result.push({
        role: msg.role,
        content: blocks
      });
      continue;
    }

    // Handle regular messages
    if (typeof msg.content === 'string' && msg.content !== null) {
      if (msg.content.length > 0) {
        const type = msg.role === 'assistant' ? 'output_text' : 'input_text';
        blocks.push({ type, text: msg.content });
      }
    } else if (Array.isArray(msg.content)) {
      for (const entry of msg.content) {
        const entryAny = entry as any;
        if (typeof entryAny === 'string') {
          if (entryAny.length > 0) {
            const type = msg.role === 'assistant' ? 'output_text' : 'input_text';
            blocks.push({ type, text: entryAny });
          }
        } else if (entryAny && typeof entryAny === 'object' && 'text' in entryAny) {
          const text = entryAny.text ?? '';
          const type = msg.role === 'assistant' ? 'output_text' : 'input_text';
          blocks.push({ type, text: String(text) });
        }
      }
    }

    if (blocks.length > 0) {
      result.push({
        role: msg.role,
        content: blocks
      });
    }
  }

  return result;
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

export class OpenAIClient {
  private client: OpenAI;
  private mcpClient: ToolDispatcher;

  constructor(database: Database, apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY
    });
    this.mcpClient = new ToolDispatcher(database, this.client);
  }

  // async generateInstructions(terms: string[]): Promise<string> {
  //   const prompt = `Generate detailed instructions for the following terms: ${terms.join(', ')}`;

  //   const response = await this.client.chat.completions.create({
  //     model: 'gpt-4o',
  //     messages: [
  //       {
  //         role: 'system',
  //         content: 'You are Shadow, a word processing software agent responsible for working with documents.'
  //       },
  //       {
  //         role: 'user',
  //         content: prompt
  //       }
  //     ],
  //     max_tokens: 1000,
  //     temperature: 0.7
  //   });

  //   return response.choices[0]?.message?.content || '';
  // }

  async generateEmbedding(terms: string | string[]): Promise<number[]> {
    return generateEmbedding(this.client, terms)
  }

  async chatWithMCPTools(
    session: Session | undefined,
    mcpTools: Array<ChatCompletionTool>,
    conversationState: ConversationState,
    userMessage: string,
    options?: {
      skipCurrentPrompt?: boolean,
      requireEnvelope?: boolean,
      startAt?: number
    }
  ): Promise<ChatResult> {
    const startAt = options?.startAt ?? performance.now();
    const requireEnvelope = options?.requireEnvelope ?? false;

    if (!options?.skipCurrentPrompt) {
      this.mcpClient.setCurrentPrompt(userMessage);
    } else {
      conversationState.addUserMessage(userMessage);
    }

    const messages = conversationState.messages;
    let lastPhase = conversationState.lastPhase;
    let iteration = 0;
    const maxIterations = 100;
    let invalidEnvelopeCount = 0;
    let emptyResponseCount = 0;
    const recentToolCalls: string[] = [];
    const MAX_SAME_TOOL_CALLS = 3;

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;

    const pushSystemMessage = (content: string): void => {
      messages.push({ role: 'system', content });
      conversationState.recordMessage('system', content, 'system');
    };

    const pushToolMessage = (toolCallId: string, content: string, tag: string): void => {
      messages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        content
      });
      conversationState.recordMessage('tool', content, tag);
    };

    const respondToToolCallsWithError = (toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[], reason: string): void => {
      if (!toolCalls || toolCalls.length === 0) {
        return;
      }

      for (const toolCall of toolCalls) {
        if (!toolCall?.id) {
          console.warn(`⚠️ Unable to respond to tool call without id (tool=${toolCall?.function?.name || 'unknown'})`);
          continue;
        }

        console.warn(`respondToToolCallsWithError: (tool=${toolCall?.function?.name || 'unknown'}) (reason=${reason})`);

        pushToolMessage(
          toolCall.id,
          JSON.stringify({
            success: false,
            error: reason
          }, null, 2),
          toolCall?.function?.name || 'tool-error'
        );
      }
    };

    while (iteration < maxIterations) {
      const responsesInput = toResponseInput(messages);
      const responsesTools = this.toResponseTools(mcpTools);

      const {
        message: assistantMessage,
        toolCalls,
        usage: iterationUsage,
        refusal
      } = await this.streamAssistantIteration(responsesInput, responsesTools);

      totalPromptTokens += iterationUsage.promptTokens;
      totalCompletionTokens += iterationUsage.completionTokens;
      totalTokens += iterationUsage.totalTokens ?? (iterationUsage.promptTokens + iterationUsage.completionTokens);

      conversationState.recordUsage(
        `iteration-${iteration}`,
        iterationUsage.promptTokens,
        iterationUsage.completionTokens,
        iterationUsage.totalTokens ?? (iterationUsage.promptTokens + iterationUsage.completionTokens)
      );

      const elapsedSeconds = (performance.now() - startAt) / 1000;
      const preview = assistantMessage.content
        ? String(assistantMessage.content).slice(0, 120)
        : (toolCalls.length > 0 ? `[tool calls: ${toolCalls.map(tc => tc.function?.name).join(', ')}]` : '[no content]');
      console.log(`assistant: [elapsed ${elapsedSeconds.toFixed(2)}s] [prompt ${totalPromptTokens}] ${preview}`);
      if (refusal) {
        console.warn(`assistant refusal: ${refusal}`);
      }

      messages.push(assistantMessage);
      conversationState.recordMessage('assistant', assistantMessage.content ? String(assistantMessage.content) : '', 'assistant');

      const trimmedContent = (assistantMessage.content ? String(assistantMessage.content) : '').trim();
      let controlEnvelope: PhaseGatedEnvelope | null = null;

      if (trimmedContent.length > 0) {
        try {
          controlEnvelope = parsePhaseEnvelope(trimmedContent);
          const transitionIssue = validatePhaseProgression(lastPhase, controlEnvelope.phase);

          if (requireEnvelope && transitionIssue) {
            pushSystemMessage(`Phase transition error: ${transitionIssue} Respond again with a valid phase-gated control envelope JSON.`);
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error('Exceeded maximum invalid phase transitions from the assistant.');
            }
            continue;
          }

          lastPhase = controlEnvelope.phase;
          invalidEnvelopeCount = 0;
        } catch (error: any) {
          if (requireEnvelope) {
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error(`Assistant failed to provide a valid phase-gated control envelope JSON after multiple attempts: ${error?.message || String(error)}`);
            }

            respondToToolCallsWithError(toolCalls, `Rejected tool call: ${error?.message || String(error)}`);
            pushSystemMessage(`Your previous reply was not valid phase-gated control envelope JSON. Error: ${error?.message || String(error)}. Respond again using only the required JSON structure.`);
            continue;
          }
        }
      }

      if (toolCalls.length > 0) {
        const signature = toolCalls.map(tc => `${tc.function?.name}:${tc.function?.arguments}`).join('|');
        recentToolCalls.push(signature);
        if (recentToolCalls.length > MAX_SAME_TOOL_CALLS) {
          recentToolCalls.shift();
        }

        if (recentToolCalls.length === MAX_SAME_TOOL_CALLS && recentToolCalls.every(sig => sig === signature)) {
          const repeatingCall = toolCalls[0]?.function?.name ?? 'unknown';
          console.error(`❌ Detected infinite loop: ${repeatingCall} called ${MAX_SAME_TOOL_CALLS} times with same arguments`);
          pushSystemMessage(`You have called ${repeatingCall} ${MAX_SAME_TOOL_CALLS} times with the same arguments. Process the tool results before repeating the same call.`);
          respondToToolCallsWithError(toolCalls, 'Infinite loop detected - same tool called repeatedly');
          invalidEnvelopeCount++;
          if (invalidEnvelopeCount > 5) {
            throw new Error(`Assistant stuck in infinite loop calling ${repeatingCall} repeatedly`);
          }
          continue;
        }

        let synthesizedEnvelope = false;
        let coercedPhase = false;

        if (!controlEnvelope) {
          console.warn('⚠️ Assistant invoked tools without providing a control envelope; synthesizing one with phase="action".');
          controlEnvelope = {
            phase: 'action',
            control: { allowed_tools: toolCalls.map(tc => tc.function?.name).filter((name): name is string => !!name) },
            envelope: { type: 'text', content: '' }
          };
          lastPhase = 'action';
          synthesizedEnvelope = true;
        }

        if (controlEnvelope.phase !== 'action') {
          console.warn(`⚠️ Assistant invoked tools while in phase="${controlEnvelope.phase}". Coercing to phase="action" for execution.`);
          controlEnvelope.phase = 'action';
          lastPhase = 'action';
          coercedPhase = true;
        }

        const allowedTools = controlEnvelope.control?.allowed_tools ?? [];
        const allowToolUse = controlEnvelope.control?.allow_tool_use;
        let disallowed = toolCalls
          .map(tc => tc.function?.name || '')
          .filter(name => name.length > 0 && allowedTools.length > 0 && !allowedTools.includes(name));

        disallowed = [];

        if (allowToolUse === false) {
          respondToToolCallsWithError(toolCalls, 'Rejected tool call: control.allow_tool_use is false.');
          pushSystemMessage('control.allow_tool_use is false; do not invoke tools in the same response. Provide a new envelope.');
          invalidEnvelopeCount++;
          if (invalidEnvelopeCount > 5) {
            throw new Error('Assistant attempted to invoke tools while explicitly disallowing them.');
          }
          continue;
        }

        if (disallowed.length > 0) {
          respondToToolCallsWithError(toolCalls, `Rejected tool call: ${disallowed.join(', ')} not listed in control.allowed_tools.`);
          pushSystemMessage(`The tools ${disallowed.join(', ')} are not listed in control.allowed_tools. Update the envelope and resend.`);
          invalidEnvelopeCount++;
          if (invalidEnvelopeCount > 5) {
            throw new Error('Assistant repeatedly attempted to invoke tools not present in control.allowed_tools.');
          }
          continue;
        }

        await this.executeTools(session!, toolCalls, messages, conversationState);

        if (synthesizedEnvelope) {
          pushSystemMessage('Reminder: include a phase="action" envelope that lists your tools before invoking them.');
        } else if (coercedPhase) {
          pushSystemMessage('Reminder: set phase="action" whenever you invoke tools.');
        }

        iteration++;
        continue;
      }

      if (requireEnvelope) {
        if (!controlEnvelope) {
          pushSystemMessage('All responses must include the control envelope JSON. Provide the envelope.');
          invalidEnvelopeCount++;
          if (invalidEnvelopeCount > 5) {
            throw new Error('Assistant did not provide the control envelope JSON.');
          }
          iteration++;
          continue;
        }

        if (controlEnvelope.phase !== 'final') {
          pushSystemMessage('Continue working until you can respond with a phase="final" control envelope JSON summarizing the outcome.');
          invalidEnvelopeCount++;
          if (invalidEnvelopeCount > 5) {
            throw new Error('Assistant failed to reach the final phase with a valid envelope.');
          }
          iteration++;
          continue;
        }

        conversationState.lastPhase = lastPhase;
        return {
          response: JSON.stringify(controlEnvelope, null, 2),
          conversationId: '',
          usage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalTokens || (totalPromptTokens + totalCompletionTokens)
          }
        };
      } else {
        if (!trimmedContent) {
          emptyResponseCount++;
          if (emptyResponseCount > 3) {
            console.warn('⚠️ Received multiple consecutive empty responses from the model. Breaking loop.');
            conversationState.lastPhase = lastPhase;
            return {
              response: 'Error: Model returned multiple empty responses',
              conversationId: '',
              usage: {
                promptTokens: totalPromptTokens,
                completionTokens: totalCompletionTokens,
                totalTokens: totalTokens || (totalPromptTokens + totalCompletionTokens)
              }
            };
          }
          console.warn(`⚠️ Received empty response from model (count: ${emptyResponseCount}). Continuing...`);
          iteration++;
          continue;
        }

        emptyResponseCount = 0;
        conversationState.lastPhase = lastPhase;

        return {
          response: trimmedContent,
          conversationId: '',
          usage: {
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalTokens || (totalPromptTokens + totalCompletionTokens)
          }
        };
      }
    }

    conversationState.lastPhase = lastPhase;
    return {
      response: 'Max iterations reached without final response',
      conversationId: '',
      usage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalTokens || (totalPromptTokens + totalCompletionTokens)
      }
    };
  }

  private toResponseTools(mcpTools: Array<ChatCompletionTool>): Array<{
    type: 'function';
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }> {
    return mcpTools.map(tool => ({
      type: 'function' as const,
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters as Record<string, unknown> | undefined
    }));
  }

  private async streamAssistantIteration(
    input: ResponsesInputMessage[],
    tools: Array<{ type: 'function'; name: string; description?: string; parameters?: Record<string, unknown> | undefined; }>
  ): Promise<{
    message: OpenAI.Chat.Completions.ChatCompletionMessageParam;
    rawContent: string;
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
    usage: TokenUsage;
    refusal: string | null;
  }> {
    const stream = await retryWithBackoff(async () => {
      return this.client.responses.stream({
        model: 'gpt-4.1',
        input: input as any,
        tools: tools as any,
        temperature: 0.7
      });
    });

    let assistantContent = '';
    let refusalContent = '';
    const toolCallsMap = new Map<string, OpenAI.Chat.Completions.ChatCompletionMessageToolCall>();
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    try {
      streamLoop:
      for await (const event of stream as any) {
        if (!event || typeof event !== 'object') {
          continue;
        }

        const type = event.type as string | undefined;

        if (type === 'response.output_text.delta') {
          assistantContent += event.delta ?? '';
          continue;
        }

        if (type === 'response.refusal.delta') {
          refusalContent += event.delta ?? '';
          continue;
        }

        if (type === 'response.tool_calls.created' || type === 'response.function_call.created') {
          const call = event.tool_call ?? event;
          const callId = call?.id ?? event.item_id ?? event.call_id;
          const funcName = call?.function?.name ?? call?.name ?? event.name ?? '';
          if (!callId) {
            continue;
          }

          toolCallsMap.set(callId, {
            id: callId,
            type: 'function',
            function: {
              name: funcName,
              arguments: ''
            }
          });
          continue;
        }

        if (type === 'response.tool_calls.arguments.delta' || type === 'response.function_call_arguments.delta') {
          const callId = event.tool_call_id ?? event.tool_call?.id ?? event.item_id ?? event.call_id ?? event.id;
          if (!callId) {
            console.warn('⚠️ Missing tool call id while streaming arguments delta', JSON.stringify(event).slice(0, 200));
            continue;
          }

          if (!toolCallsMap.has(callId)) {
            const funcName = event.tool_call?.function?.name ?? event.tool_call?.name ?? event.name ?? '';
            toolCallsMap.set(callId, {
              id: callId,
              type: 'function',
              function: {
                name: funcName,
                arguments: ''
              }
            });
          }

          const toolCall = toolCallsMap.get(callId)!;
          const res = accumulateCallParams(event, callId, toolCall);
          if (res === "break") {
            break streamLoop;
          }
          continue;
        }

        if (type === 'response.usage.delta') {
          const delta = event.delta ?? {};
          const promptDelta = delta.prompt_tokens ?? 0;
          const completionDelta = delta.completion_tokens ?? 0;
          const totalDelta = delta.total_tokens ?? (promptDelta + completionDelta);
          promptTokens += promptDelta;
          completionTokens += completionDelta;
          totalTokens += totalDelta;
          continue;
        }

        if (type === 'response.completed' || type === 'response.done') {
          const usage = event.response?.usage ?? event.usage;
          if (usage) {
            promptTokens = usage.prompt_tokens ?? promptTokens;
            completionTokens = usage.completion_tokens ?? completionTokens;
            totalTokens = usage.total_tokens ?? totalTokens;
          }
          continue;
        }

        if (type === 'response.error') {
          const errMessage = event.error?.message ?? 'Unknown response stream error';
          throw new Error(errMessage);
        }

        if (type &&
          !type.startsWith('response.output_text') &&
          !type.startsWith('response.output_item') &&
          !type.startsWith('response.content_part') &&
          !type.startsWith('response.refusal') &&
          !type.startsWith('response.tool_calls') &&
          !type.startsWith('response.function_call') &&
          !type.startsWith('response.usage') &&
          !type.startsWith('response.completed') &&
          !type.startsWith('response.done') &&
          !type.startsWith('response.created') &&
          !type.startsWith('response.started') &&
          !type.startsWith('response.in_progress') &&
          !type.startsWith('response.error')) {
          console.warn(`⚠️ Unhandled response event type: ${type}`, JSON.stringify(event).slice(0, 200));
        }
      }
    } finally {
      // Streams close automatically; no explicit cleanup needed.
    }

    const toolCalls = Array.from(toolCallsMap.values());
    const message: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: 'assistant',
      content: assistantContent || null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
    };

    return {
      message,
      rawContent: (assistantContent || '').trim(),
      toolCalls,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens
      },
      refusal: refusalContent || null
    };
  }

  private async executeTools(
    session: Session,
    toolCalls: any,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    conversationState: ConversationState
  ): Promise<void> {
    // Execute tool calls
    for (const toolCall of toolCalls ?? []) {
      const toolStartAt = performance.now();

      if (toolCall?.type !== 'function') {
        console.warn(`⚠️ Unsupported tool call type "${toolCall?.type}", skipping.`);
        continue;
      }

      const functionName = toolCall.function?.name ?? toolCall.name ?? 'unknown';
      const rawArgs = toolCall.function?.arguments ?? toolCall.arguments ?? '{}';

      let parsedArgs: Record<string, unknown> = {};
      if (typeof rawArgs === 'string') {
        const trimmed = rawArgs.trim();
        if (trimmed.length > 0) {
          try {
            parsedArgs = JSON.parse(trimmed);
          } catch (error) {
            const errText = `Error parsing arguments for ${functionName}: ${error}`;
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: errText
            });
            conversationState.recordMessage('tool', errText, `${functionName}-error`);
            console.error(errText);
            continue;
          }
        }
      } else if (rawArgs && typeof rawArgs === 'object') {
        parsedArgs = rawArgs as Record<string, unknown>;
      }

      try {
        const result = await this.mcpClient.executeTool(session, {
          name: functionName,
          arguments: parsedArgs
        });

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        });
        conversationState.recordMessage('tool', result, functionName);
      } catch (error) {
        const errText = `Error executing ${functionName}: ${error}`;
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: errText
        });
        conversationState.recordMessage('tool', errText, `${functionName}-error`);
      }

      console.log(`executeTools: ${functionName} elapsed: ${(performance.now() - toolStartAt) / 1000}`);
    }
  }
}

function looksLikeJson(s: string) {
  const t = s.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function isBalancedJsonish(s: string) {
  // Cheap guard for streams that aren’t strict JSON yet.
  let depth = 0, inStr = false, esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
  }
  return depth === 0 && !inStr;
}

function parseIfReady(s: string): { ok: true; value: any } | { ok: false } {
  const t = s.trim();
  if (!looksLikeJson(t)) return { ok: false };
  if (!isBalancedJsonish(t)) return { ok: false };
  try { return { ok: true, value: JSON.parse(t) }; } catch { return { ok: false }; }
}

function accumulateCallParams(
  event: any,
  callId: string,
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall) {
  (toolCall as any).__blankCount ??= 0;
  (toolCall as any).__locked ??= false;
  (toolCall as any).__debounce ??= 0;

  const rawDelta = typeof event.delta === 'string'
    ? event.delta
    : (event.delta?.arguments ?? '');

  if ((toolCall as any).__locked) {
    // Already have complete args; ignore trailing whitespace ticks.
    if (typeof rawDelta === 'string' && rawDelta.trim().length === 0) {
      (toolCall as any).__debounce++;
      if ((toolCall as any).__debounce >= 2) {
        return "break"; // move to next step quickly
      }
    }
    // If model erroneously sends more non-whitespace after lock, you could log it.
    return "continue";
  }

  if (typeof rawDelta === 'string') {
    if (rawDelta.length && rawDelta.trim().length > 0) {
      toolCall.function.arguments += rawDelta;
      (toolCall as any).__blankCount = 0;

      // Check completeness on every meaningful chunk.
      const ready = parseIfReady(toolCall.function.arguments);
      if (ready.ok) {
        (toolCall as any).__locked = true;
        (toolCall as any).__debounce = 0;

        // Optionally store parsed args to avoid re-parse later:
        (toolCall as any).__parsed = ready.value;

        // Don’t wait for 20 tabs—just require a tiny debounce of whitespace.
        return "contunue";
      }
    } else {
      // Whitespace delta (\t, \n, etc.)
      (toolCall as any).__blankCount = ((toolCall as any).__blankCount ?? 0) + 1;

      // If it *looks* like complete JSON but parse failed due to e.g. dangling comma,
      // you can still bail out after a few blanks, or keep your old high watermark.
      if (looksLikeJson(toolCall.function.arguments) && isBalancedJsonish(toolCall.function.arguments)) {
        if ((toolCall as any).__blankCount >= 3) {
          console.warn(`⚠️ Whitespace heartbeats; treating tool args as complete by balance.`);
          (toolCall as any).__locked = true;
          (toolCall as any).__debounce = 0;
          return "continue";
        }
      }

      // Legacy guard: if nothing but whitespace for too long
      if (toolCall.function.arguments.length === 0 && (toolCall as any).__blankCount > 20) {
        throw new Error(`Tool call ${toolCall.function.name || callId} produced only whitespace arguments.`);
      }

      // If we have *some* args but only blanks for too long, bail out too:
      if (toolCall.function.arguments.length > 0 && (toolCall as any).__blankCount > 50) {
        console.warn(`⚠️ Excessive whitespace deltas for tool ${toolCall.function.name || callId}; assuming arguments complete.`);
        (toolCall as any).__locked = true;
        (toolCall as any).__debounce = 0;
      }
    }
  }

  return "continue";
}