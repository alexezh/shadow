import OpenAI from 'openai';
import { Database } from '../database.js';
import { ChatCompletionTool } from 'openai/resources/index.js';
import { parsePhaseEnvelope, PhaseGatedEnvelope, Phase, validatePhaseProgression } from './phase-envelope.js';
import { ToolDispatcher } from '../tooldispatcher.js';
import { Session } from '../server/session.js';
import { ChatResult, getOpenAI, OpenAIClient, TokenUsage } from './openai-client.js';
import { generateEmbedding } from './generateembedding.js';
import { retryWithBackoff } from './retrywithbackoff.js';

type TrackerEntry =
  | { kind: 'message'; role: string; tag?: string; length: number; timestamp: number }
  | { kind: 'usage'; tag: string; promptTokens: number; completionTokens: number; totalTokens: number; timestamp: number };



export class ConversationStateChat {
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

  constructor(systemPrompt: string, initialUserMessage: string, contextMessage?: {
    role: 'user';
    content: string;
  }) {
    if (contextMessage) {
      this.messages = [
        { role: 'system', content: systemPrompt },
        { role: 'developer', content: contextMessage.content! },
        { role: 'user', content: initialUserMessage }
      ];

    } else {
      this.messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: initialUserMessage }
      ];
    }
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

export class OpenAIClientChatLegacy implements OpenAIClient {
  private client: OpenAI;
  private mcpClient: ToolDispatcher;

  constructor(database: Database, apiKey?: string) {
    this.client = getOpenAI();
    this.mcpClient = new ToolDispatcher(database);
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
    conversationState: ConversationStateChat,
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

    // Add user message to conversation state
    conversationState.addUserMessage(userMessage);

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
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;

    while (iteration < maxIterations) {
      const response = await retryWithBackoff(async () => {
        return this.client.chat.completions.create({
          model: 'gpt-4.1',
          messages,
          tools: mcpTools,
          stream: true,
          stream_options: {
            include_usage: true
          },
          tool_choice: 'auto',
          max_tokens: 1500,
          //max_completion_tokens: 1500,
          temperature: 0.7
        });
      });

      let iterationPromptTokens = 0;
      let iterationCompletionTokens = 0;
      let iterationTotalTokens = 0;

      let assistantMessage = {
        role: 'assistant' as const,
        content: '',
        tool_calls: [] as any[]
      };

      // Collect all streaming chunks
      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          assistantMessage.content += delta.content;
        }

        if (delta?.tool_calls) {
          // Handle streaming tool calls
          for (const toolCall of delta.tool_calls) {
            if (toolCall.index !== undefined) {
              // Initialize tool call if it doesn't exist
              if (!assistantMessage.tool_calls[toolCall.index]) {
                assistantMessage.tool_calls[toolCall.index] = {
                  id: toolCall.id || '',
                  type: 'function' as const,
                  function: {
                    name: toolCall.function?.name || '',
                    arguments: ''
                  }
                };
              }

              // Accumulate the function arguments
              if (toolCall.function?.arguments) {
                assistantMessage.tool_calls[toolCall.index].function.arguments += toolCall.function.arguments;
              }
            }
          }
        }

        const streamingUsage = (chunk as any)?.usage;
        if (streamingUsage) {
          if (typeof streamingUsage.prompt_tokens === 'number') {
            iterationPromptTokens = streamingUsage.prompt_tokens;
          }
          if (typeof streamingUsage.completion_tokens === 'number') {
            iterationCompletionTokens = streamingUsage.completion_tokens;
          }
          if (typeof streamingUsage.total_tokens === 'number') {
            iterationTotalTokens = streamingUsage.total_tokens;
          } else if (iterationPromptTokens || iterationCompletionTokens) {
            iterationTotalTokens = iterationPromptTokens + iterationCompletionTokens;
          }
        }
      }

      totalPromptTokens += iterationPromptTokens;
      totalCompletionTokens += iterationCompletionTokens;
      totalTokens += iterationTotalTokens || (iterationPromptTokens + iterationCompletionTokens);
      conversationState.recordUsage(
        `iteration-${iteration}`,
        iterationPromptTokens,
        iterationCompletionTokens,
        iterationTotalTokens || (iterationPromptTokens + iterationCompletionTokens)
      );

      const toolCalls = assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0
        ? assistantMessage.tool_calls
        : [];

      if (toolCalls.length === 0) {
        delete (assistantMessage as any).tool_calls;
      }

      const elapsed = (options?.startAt) ? (performance.now() - options.startAt) / 1000 : 0;
      const responseText = (assistantMessage.content.length !== 0) ? assistantMessage.content.substring(0, 100) : JSON.stringify(assistantMessage).substring(0, 200);

      console.log(`assistant: [elapsed: ${elapsed}] [tt: ${totalPromptTokens}] ${responseText}`);

      // Add the complete assistant message
      messages.push(assistantMessage);
      conversationState.recordMessage('assistant', assistantMessage.content || '', 'assistant');

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
        let pendingEnvelopeReminder = false;

        if (!controlEnvelope) {
          console.warn('⚠️ Assistant invoked tools without providing a control envelope; synthesizing one with phase="action".');
          controlEnvelope = {
            phase: 'action',
            control: { allowed_tools: toolCalls.map((call: any) => call.function?.name).filter((n: string | undefined): n is string => !!n) },
            envelope: { type: 'text', content: '' }
          } as PhaseGatedEnvelope;
          lastPhase = 'action';
          pendingEnvelopeReminder = true;
        }

        if (controlEnvelope.phase !== 'action') {
          console.warn('⚠️ Assistant invoked tools while in phase="' + controlEnvelope.phase + '". Coercing to phase="action" for execution.');
          controlEnvelope.phase = 'action';
          lastPhase = 'action';
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

        await this.executeTools(session, toolCalls, messages, conversationState);

        if (pendingEnvelopeReminder) {
          pushSystemMessage('Reminder: include the phase-gated control envelope JSON with phase="action" whenever you call tools.');
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
            continue;
          }

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
    session: Session | undefined,
    toolCalls: any,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    conversationState: ConversationStateChat
  ): Promise<void> {
    // Execute tool calls
    for (const toolCall of toolCalls) {
      const toolStartAt = performance.now();

      if (toolCall.type === 'function') {
        try {
          const functionArgs = JSON.parse(toolCall.function.arguments);
          const result = await this.mcpClient.executeTool(session!, {
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
