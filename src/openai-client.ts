import OpenAI from 'openai';
import { MCPLocalClient } from './mcp-client.js';
import { Database } from './database.js';
import { ChatCompletionTool } from 'openai/resources/index.js';
import { parsePhaseEnvelope, PhaseGatedEnvelope, Phase, validatePhaseProgression } from './phase-envelope.js';

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
  private mcpClient: MCPLocalClient;

  constructor(database: Database, apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY
    });
    this.mcpClient = new MCPLocalClient(database, this.client);
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
    mcpTools: Array<ChatCompletionTool>,
    conversationState: ConversationState,
    userMessage: string,
    options?: {
      skipCurrentPrompt?: boolean,
      requireEnvelope?: boolean,
      startAt?: number
    }
  ): Promise<ChatResult> {

    // Set the current prompt in the MCP client for history tracking
    if (!options?.skipCurrentPrompt) {
      this.mcpClient.setCurrentPrompt(userMessage);
    }

    // Add user message to conversation state (only for subsequent messages, not the initial one)
    if (options?.skipCurrentPrompt) {
      conversationState.addUserMessage(userMessage);
    }

    // Get or create conversation
    const requireEnvelope = options?.requireEnvelope ?? false;
    const messages = conversationState.messages;
    let lastPhase = conversationState.lastPhase;

    console.log(`💬 Conversation with ${messages.length} messages`);

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

    const respondToToolCallsWithError = (toolCalls: any[], reason: string) => {
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

    // Loop to handle multiple function calls
    let maxIterations = 100;
    let iteration = 0;
    let invalidEnvelopeCount = 0;
    let emptyResponseCount = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;

    // Track recent tool calls to detect infinite loops
    const recentToolCalls: string[] = [];
    const MAX_SAME_TOOL_CALLS = 3;

    while (iteration < maxIterations) {
      const responsesInput = toResponseInput(messages);

      // Debug: log the last few messages to see what's being sent
      if (iteration > 0) {
        console.log(`\n🔍 DEBUG - Messages being sent (iteration ${iteration}):`);
        const lastMessages = responsesInput.slice(-3);
        for (const msg of lastMessages) {
          console.log(`  Role: ${msg.role}`);
          for (const block of msg.content) {
            console.log(`    Type: ${block.type}, Text: ${block.text.substring(0, 100)}...`);
          }
        }
        console.log('');
      }

      const responsesTools = mcpTools.map(tool => ({
        type: 'function' as const,
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      }));

      const stream = await retryWithBackoff(async () => {
        return this.client.responses.stream({
          model: 'gpt-4.1',
          input: responsesInput as any,
          tools: responsesTools as any,
          temperature: 0.7
        });
      });

      let iterationPromptTokens = 0;
      let iterationCompletionTokens = 0;
      let iterationTotalTokens = 0;

      let assistantContent = '';
      let refusalContent = '';
      const toolCallsMap = new Map<string, OpenAI.Chat.Completions.ChatCompletionMessageToolCall>();

      try {
        for await (const event of stream as any) {
          if (!event || typeof event !== 'object') {
            continue;
          }

          const type = event.type as string | undefined;

          // Log function call creation events specifically
          if (type === 'response.function_call.created') {
            console.log(`\n🎯 FUNCTION CALL CREATED EVENT:`);
            console.log(JSON.stringify(event, null, 2));
          }

          if (type === 'response.output_text.delta') {
            assistantContent += event.delta ?? '';
            continue;
          }

          if (type === 'response.refusal.delta') {
            refusalContent += event.delta ?? '';
            continue;
          }

          if (type === 'response.tool_calls.created') {
            const call = event.tool_call;
            console.log(`🔧 Tool call created event:`, JSON.stringify(event).substring(0, 500));
            if (call && call.id) {
              const funcName = call.function?.name ?? call.name ?? '';
              console.log(`🔧 Creating tool call with ID: ${call.id}, name: ${funcName}`);
              toolCallsMap.set(call.id, {
                id: call.id,
                type: 'function',
                function: {
                  name: funcName,
                  arguments: ''
                }
              });
            }
            continue;
          }

          if (type === 'response.tool_calls.arguments.delta') {
            const callId = event.tool_call_id ?? event.tool_call?.id ?? event.call_id ?? event.id;
            if (!callId) {
              console.warn('⚠️ response.tool_calls.arguments.delta event missing ID:', JSON.stringify(event).substring(0, 300));
              continue;
            }
            if (!toolCallsMap.has(callId)) {
              const funcName = event.tool_call?.function?.name ?? event.tool_call?.name ?? event.name ?? '';
              console.log(`📝 Creating new tool call entry for ID: ${callId}, name: ${funcName}`, JSON.stringify(event).substring(0, 300));
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
            toolCall.function.arguments += event.delta ?? '';
            continue;
          }

          if (type === 'response.usage.delta') {
            const delta = event.delta ?? {};
            const promptDelta = delta.prompt_tokens ?? 0;
            const completionDelta = delta.completion_tokens ?? 0;
            const totalDelta = delta.total_tokens ?? (promptDelta + completionDelta);
            iterationPromptTokens += promptDelta;
            iterationCompletionTokens += completionDelta;
            iterationTotalTokens += totalDelta;
            continue;
          }

          if (type === 'response.completed' || type === 'response.done') {
            const usage = event.response?.usage ?? event.usage;
            if (usage) {
              iterationPromptTokens = usage.prompt_tokens ?? iterationPromptTokens;
              iterationCompletionTokens = usage.completion_tokens ?? iterationCompletionTokens;
              iterationTotalTokens = usage.total_tokens ?? iterationTotalTokens;
            }
            continue;
          }

          if (type === 'response.function_call.created') {
            // This event contains the function name!
            const itemId = event.item_id ?? event.call_id ?? event.id;
            const funcName = event.name ?? event.function?.name ?? '';
            console.log(`🔧 Function call created: ID=${itemId}, name=${funcName}`);

            if (itemId && funcName) {
              toolCallsMap.set(itemId, {
                id: itemId,
                type: 'function',
                function: {
                  name: funcName,
                  arguments: ''
                }
              });
            }
            continue;
          }

          // Handle various metadata and status events
          if (type === 'response.created' ||
            type === 'response.started' ||
            type === 'response.in_progress' ||
            type === 'response.output_item.added' ||
            type === 'response.output_item.done' ||
            type === 'response.content_part.added' ||
            type === 'response.content_part.done' ||
            type === 'response.output_text.created' ||
            type === 'response.output_text.done' ||
            type === 'response.tool_calls.done' ||
            type === 'response.function_call.done') {
            // These are informational events, just continue
            continue;
          }

          if (type === 'response.function_call_arguments.delta') {
            // Handle function call arguments delta
            const callId = event.item_id ?? event.call_id ?? event.id;
            if (!callId) {
              console.warn('⚠️ response.function_call_arguments.delta event missing item_id:', JSON.stringify(event).substring(0, 300));
              continue;
            }

            if (!toolCallsMap.has(callId)) {
              console.warn(`⚠️ Received arguments delta for unknown call ID: ${callId}. This should not happen - function_call.created event should come first.`);
              // Create entry anyway with empty name - it will fail later
              toolCallsMap.set(callId, {
                id: callId,
                type: 'function',
                function: {
                  name: '',
                  arguments: ''
                }
              });
            }
            const toolCall = toolCallsMap.get(callId)!;
            toolCall.function.arguments += event.delta ?? '';
            continue;
          }

          if (type === 'response.error') {
            const errMessage = event.error?.message ?? 'Unknown response stream error';
            throw new Error(errMessage);
          }

          // Log unhandled event types for debugging
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
            console.warn(`⚠️ Unhandled response event type: ${type}`, JSON.stringify(event).substring(0, 200));
          }
        }
      } finally {
        // New Responses streams close automatically; no finalize hook needed.
      }

      const assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessage = {
        role: 'assistant',
        content: assistantContent,
        refusal: refusalContent || null,
        ...(toolCallsMap.size > 0 && { tool_calls: Array.from(toolCallsMap.values()) })
      };

      totalPromptTokens += iterationPromptTokens;
      totalCompletionTokens += iterationCompletionTokens;
      totalTokens += iterationTotalTokens || (iterationPromptTokens + iterationCompletionTokens);
      conversationState.recordUsage(
        `iteration-${iteration}`,
        iterationPromptTokens,
        iterationCompletionTokens,
        iterationTotalTokens || (iterationPromptTokens + iterationCompletionTokens)
      );

      const toolCalls = assistantMessage.tool_calls ?? [];

      // Clean up the message for adding to conversation
      const messageToAdd: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
        role: 'assistant',
        content: assistantMessage.content || null,
        ...(toolCalls.length > 0 && { tool_calls: toolCalls })
      };

      const elapsed = (options?.startAt) ? (performance.now() - options.startAt) / 1000 : 0;
      const contentStr = assistantMessage.content || '';
      const responseText = contentStr.length !== 0 ? contentStr.substring(0, 100) : JSON.stringify(messageToAdd).substring(0, 200);

      console.log(`assistant: [elapsed: ${elapsed}] [tt: ${totalPromptTokens}] ${responseText}`);

      // Add the complete assistant message
      messages.push(messageToAdd);
      conversationState.recordMessage('assistant', contentStr, 'assistant');

      const rawContent = (assistantMessage.content || '').trim();
      let controlEnvelope: PhaseGatedEnvelope | null = null;

      if (rawContent.length > 0) {
        try {
          controlEnvelope = parsePhaseEnvelope(rawContent);
          if (requireEnvelope) {
            const transitionIssue = validatePhaseProgression(lastPhase, controlEnvelope.phase);
            if (transitionIssue) {
              pushSystemMessage(`Phase transition error: ${transitionIssue} Respond again with a valid phase-gated control envelope JSON.`);
              invalidEnvelopeCount++;
              if (invalidEnvelopeCount > 5) {
                throw new Error('Exceeded maximum invalid phase transitions from the assistant.');
              }
              continue;
            }

            lastPhase = controlEnvelope.phase;
            invalidEnvelopeCount = 0;
          } else {
            lastPhase = controlEnvelope.phase;
          }
        } catch (error: any) {
          if (requireEnvelope) {
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error(`Assistant failed to provide a valid phase - gated control envelope JSON after multiple attempts: ${error?.message || String(error)} `);
            }

            respondToToolCallsWithError(toolCalls, `Rejected tool call: ${error?.message || String(error)} `);

            pushSystemMessage(`Your previous reply was not valid phase-gated control envelope JSON. Error: ${error?.message || String(error)}. Respond again using only the required JSON structure.`);
            continue;
          } else {
            controlEnvelope = null;
          }
        }
      }
      // else if (toolCalls && toolCalls.length > 0) {
      //   if (!controlEnvelope) {
      //     invalidEnvelopeCount++;
      //     if (invalidEnvelopeCount > 5) {
      //       throw new Error('Assistant attempted to call tools repeatedly without providing the control envelope JSON.');
      //     }

      //     respondToToolCallsWithError(toolCalls, 'Rejected tool call: control envelope JSON missing.');

      //     messages.push({
      //       role: 'system',
      //       content: 'Every response must include the phase-gated control envelope JSON before invoking tools. Provide the envelope and retry.'
      //     });
      //     continue;
      //   }
      // }

      if (toolCalls.length > 0) {
        // Check for infinite loop - same tool called multiple times in a row
        const toolCallSignature = toolCalls.map(tc => `${tc.function?.name}:${tc.function?.arguments}`).join('|');
        recentToolCalls.push(toolCallSignature);

        // Keep only the last MAX_SAME_TOOL_CALLS entries
        if (recentToolCalls.length > MAX_SAME_TOOL_CALLS) {
          recentToolCalls.shift();
        }

        // Check if all recent calls are identical
        if (recentToolCalls.length === MAX_SAME_TOOL_CALLS &&
          recentToolCalls.every(sig => sig === toolCallSignature)) {
          console.error(`❌ Detected infinite loop: ${toolCalls[0].function?.name} called ${MAX_SAME_TOOL_CALLS} times with same arguments`);
          pushSystemMessage(`You have called ${toolCalls[0].function?.name} ${MAX_SAME_TOOL_CALLS} times with the same arguments. The tool results are being provided, but you keep making the same call. Please process the tool results and proceed with the next step instead of repeating the same tool call.`);
          respondToToolCallsWithError(toolCalls, 'Infinite loop detected - same tool called repeatedly');
          invalidEnvelopeCount++;
          if (invalidEnvelopeCount > 5) {
            throw new Error(`Assistant stuck in infinite loop calling ${toolCalls[0].function?.name} repeatedly`);
          }
          continue;
        }

        let synthesizedEnvelope = false;
        let coercedPhase = false;

        if (!controlEnvelope) {
          console.warn('⚠️ Assistant invoked tools without providing a control envelope; synthesizing one with phase="action".');
          controlEnvelope = {
            phase: 'action',
            control: { allowed_tools: toolCalls.map((call: any) => call.function?.name).filter((n: string | undefined): n is string => !!n) },
            envelope: { type: 'text', content: '' }
          } as PhaseGatedEnvelope;
          lastPhase = 'action';
          synthesizedEnvelope = true;
        }

        if (controlEnvelope.phase !== 'action') {
          console.warn(`⚠️ Assistant invoked tools while in phase="${controlEnvelope.phase}". Coercing to phase="action" for execution.`);
          controlEnvelope.phase = 'action';
          lastPhase = 'action';
          coercedPhase = true;
        }

        const allowedTools = controlEnvelope.control.allowed_tools ?? [];
        const allowToolUse = controlEnvelope.control.allow_tool_use;
        let disallowed = toolCalls
          .map(toolCall => toolCall.function?.name || '')
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

        await this.executeTools(toolCalls, messages, conversationState);

        if (synthesizedEnvelope) {
          pushSystemMessage('Reminder: include a phase="action" envelope that lists your tools before invoking them.');
        } else if (coercedPhase) {
          pushSystemMessage('Reminder: set phase="action" whenever you invoke tools.');
        }

        iteration++;
        continue;
      }

      if (toolCalls.length === 0) {
        if (requireEnvelope) {
          if (!controlEnvelope) {
            pushSystemMessage('All responses must include the control envelope JSON. Provide the envelope.');
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error('Assistant did not provide the control envelope JSON.');
            }
            continue;
          }

          if (controlEnvelope.phase !== 'final') {
            pushSystemMessage('Continue working until you can respond with a phase="final" control envelope JSON summarizing the outcome.');
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error('Assistant failed to reach the final phase with a valid envelope.');
            }
            continue;
          }

          // Update last phase
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
          if (rawContent.length === 0) {
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
            continue;
          }

          // Reset empty response counter on successful response
          emptyResponseCount = 0;

          conversationState.lastPhase = lastPhase;

          return {
            response: rawContent,
            conversationId: '',
            usage: {
              promptTokens: totalPromptTokens,
              completionTokens: totalCompletionTokens,
              totalTokens: totalTokens || (totalPromptTokens + totalCompletionTokens)
            }
          };
        }
      }

      iteration++;
    }

    // Update last phase even if max iterations reached
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

  private async executeTools(
    toolCalls: any,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    conversationState: ConversationState
  ): Promise<void> {
    // Execute tool calls
    for (const toolCall of toolCalls) {
      const toolStartAt = performance.now();

      if (toolCall.type === 'function') {
        try {
          const functionArgs = JSON.parse(toolCall.function.arguments);
          const result = await this.mcpClient.executeTool({
            name: toolCall.function.name,
            arguments: functionArgs
          });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result
          });
          conversationState.recordMessage('tool', result, toolCall.function.name);
        } catch (error) {
          const errText = `Error executing ${toolCall.function.name}: ${error}`;
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: errText
          });
          conversationState.recordMessage('tool', errText, `${toolCall.function.name}-error`);
        }
      }

      console.log(`executeTools: ${toolCall.function.name} elapsed: ${(performance.now() - toolStartAt) / 1000}`);
    }
  }
}
