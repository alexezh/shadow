import OpenAI from 'openai';
import { MCPLocalClient } from './mcp-client.js';
import { Database } from './database.js';
import { ChatCompletionTool } from 'openai/resources/index.js';
import { parsePhaseEnvelope, PhaseGatedEnvelope, Phase, validatePhaseProgression } from './phase-envelope.js';

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

interface ConversationState {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  systemPrompt: string;
  lastPhase: Phase | null;
  createdAt: Date;
}

export class OpenAIClient {
  private client: OpenAI;
  private mcpClient: MCPLocalClient;
  private conversations: Map<string, ConversationState>;

  constructor(database: Database, apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY
    });
    this.mcpClient = new MCPLocalClient(database, this.client);
    this.conversations = new Map();
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

  /**
   * Get or create a conversation by ID
   */
  private getOrCreateConversation(conversationId: string | undefined, systemPrompt: string, userMessage: string): {
    conversationId: string;
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    lastPhase: Phase | null;
    isNew: boolean;
  } {
    if (conversationId && this.conversations.has(conversationId)) {
      const state = this.conversations.get(conversationId)!;
      // Add new user message to existing conversation
      state.messages.push({ role: 'user', content: userMessage });
      return {
        conversationId,
        messages: state.messages,
        lastPhase: state.lastPhase,
        isNew: false
      };
    }

    // Create new conversation
    const newId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];

    this.conversations.set(newId, {
      messages,
      systemPrompt,
      lastPhase: null,
      createdAt: new Date()
    });

    return { conversationId: newId, messages, lastPhase: null, isNew: true };
  }

  /**
   * Update conversation state
   */
  private updateConversation(conversationId: string, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], lastPhase: Phase | null): void {
    const state = this.conversations.get(conversationId);
    if (state) {
      state.messages = messages;
      state.lastPhase = lastPhase;
    }
  }

  /**
   * Clear a conversation by ID
   */
  clearConversation(conversationId: string): boolean {
    return this.conversations.delete(conversationId);
  }

  /**
   * Clear all conversations
   */
  clearAllConversations(): void {
    this.conversations.clear();
  }

  /**
   * Get conversation IDs
   */
  getConversationIds(): string[] {
    return Array.from(this.conversations.keys());
  }

  async chatWithMCPTools(
    mcpTools: Array<ChatCompletionTool>,
    systemPrompt: string,
    userMessage: string,
    options?: { conversationId?: string; skipCurrentPrompt?: boolean, requireEnvelope?: boolean }
  ): Promise<{ response: string; conversationId: string }> {

    // Set the current prompt in the MCP client for history tracking
    if (options?.skipCurrentPrompt) {
      this.mcpClient.setCurrentPrompt(userMessage);
    }

    // Get or create conversation
    const requireEnvelope = options?.requireEnvelope ?? false;
    const conv = this.getOrCreateConversation(options?.conversationId, systemPrompt, userMessage);
    const messages = conv.messages;
    let lastPhase = conv.lastPhase;

    if (conv.isNew) {
      console.log(`💬 Started new conversation: ${conv.conversationId}`);
    } else {
      console.log(`💬 Continuing conversation: ${conv.conversationId} (${messages.length} messages)`);
    }

    const respondToToolCallsWithError = (toolCalls: any[], reason: string) => {
      if (!toolCalls || toolCalls.length === 0) {
        return;
      }

      for (const toolCall of toolCalls) {
        if (!toolCall?.id) {
          console.warn(`⚠️ Unable to respond to tool call without id (tool=${toolCall?.function?.name || 'unknown'})`);
          continue;
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            success: false,
            error: reason
          }, null, 2)
        });
      }
    };

    // Loop to handle multiple function calls
    let maxIterations = 100;
    let iteration = 0;
    let invalidEnvelopeCount = 0;

    while (iteration < maxIterations) {
      const response = await retryWithBackoff(async () => {
        return this.client.chat.completions.create({
          model: 'gpt-4.1',
          messages,
          tools: mcpTools,
          stream: true,
          tool_choice: 'auto',
          max_tokens: 1500,
          //max_completion_tokens: 1500,
          temperature: 0.7
        });
      });

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
      }

      const toolCalls = assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0
        ? assistantMessage.tool_calls
        : [];

      if (toolCalls.length === 0) {
        delete (assistantMessage as any).tool_calls;
      }

      if (assistantMessage.content.length !== 0) {
        console.log("assistant:" + assistantMessage.content.substring(0, 100));
      } else {
        console.log("assistant:" + JSON.stringify(assistantMessage).substring(0, 200));
      }
      // Add the complete assistant message
      messages.push(assistantMessage);

      const rawContent = (assistantMessage.content || '').trim();
      let controlEnvelope: PhaseGatedEnvelope | null = null;

      if (rawContent.length > 0) {
        try {
          controlEnvelope = parsePhaseEnvelope(rawContent);
          if (requireEnvelope) {
            const transitionIssue = validatePhaseProgression(lastPhase, controlEnvelope.phase);
            if (transitionIssue) {
              messages.push({
                role: 'system',
                content: `Phase transition error: ${transitionIssue} Respond again with a valid phase-gated control envelope JSON.`
              });
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
              throw new Error(`Assistant failed to provide a valid phase-gated control envelope JSON after multiple attempts: ${error?.message || String(error)}`);
            }

            respondToToolCallsWithError(toolCalls, `Rejected tool call: ${error?.message || String(error)}`);

            messages.push({
              role: 'system',
              content: `Your previous reply was not valid phase-gated control envelope JSON. Error: ${error?.message || String(error)}. Respond again using only the required JSON structure.`
            });
            continue;
          } else {
            controlEnvelope = null;
          }
        }
      } else if (toolCalls && toolCalls.length > 0) {
        if (requireEnvelope) {
          invalidEnvelopeCount++;
          if (invalidEnvelopeCount > 5) {
            throw new Error('Assistant attempted to call tools repeatedly without providing the control envelope JSON.');
          }

          respondToToolCallsWithError(toolCalls, 'Rejected tool call: control envelope JSON missing.');

          messages.push({
            role: 'system',
            content: 'Every response must include the phase-gated control envelope JSON before invoking tools. Provide the envelope and retry.'
          });
          continue;
        }
      }

      if (toolCalls.length > 0) {
        if (!requireEnvelope) {
          respondToToolCallsWithError(toolCalls, 'Tool calls are disabled for this request. Respond with plain text only.');

          messages.push({
            role: 'system',
            content: 'Tool usage is disabled for this request; respond with plain text only.'
          });
          continue;
        }

        if (requireEnvelope) {
          if (!controlEnvelope) {
            respondToToolCallsWithError(toolCalls, 'Rejected tool call: control envelope JSON missing.');

            messages.push({
              role: 'system',
              content: 'You must include the control envelope JSON in every response. Try again.'
            });
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error('Assistant failed to provide a control envelope JSON alongside tool calls.');
            }
            continue;
          }

          if (controlEnvelope.phase !== 'action') {
            respondToToolCallsWithError(toolCalls, 'Rejected tool call: phase must be "action" when invoking tools.');

            messages.push({
              role: 'system',
              content: 'When invoking tools, set phase="action" in the control envelope JSON and list the tools in control.allowed_tools. Retry now.'
            });
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error('Assistant repeatedly invoked tools without using the action phase.');
            }
            continue;
          }

          const allowedTools = controlEnvelope.control.allowed_tools ?? [];
          const allowToolUse = controlEnvelope.control.allow_tool_use;
          let disallowed = toolCalls
            .map(toolCall => toolCall.function?.name || '')
            .filter(name => name.length > 0 && allowedTools.length > 0 && !allowedTools.includes(name));

          disallowed = [];

          if (allowToolUse === false) {
            respondToToolCallsWithError(toolCalls, 'Rejected tool call: control.allow_tool_use is false.');

            messages.push({
              role: 'system',
              content: 'control.allow_tool_use is false; do not invoke tools in the same response. Provide a new envelope.'
            });
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error('Assistant attempted to invoke tools while explicitly disallowing them.');
            }
            continue;
          }

          if (disallowed.length > 0) {
            respondToToolCallsWithError(toolCalls, `Rejected tool call: ${disallowed.join(', ')} not listed in control.allowed_tools.`);

            messages.push({
              role: 'system',
              content: `The tools ${disallowed.join(', ')} are not listed in control.allowed_tools. Update the envelope and resend.`
            });
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error('Assistant repeatedly attempted to invoke tools not present in control.allowed_tools.');
            }
            continue;
          }
        }
      }

      if (toolCalls.length === 0) {
        if (requireEnvelope) {
          if (!controlEnvelope) {
            messages.push({
              role: 'system',
              content: 'All responses must include the control envelope JSON. Provide the envelope.'
            });
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error('Assistant did not provide the control envelope JSON.');
            }
            continue;
          }

          if (controlEnvelope.phase !== 'final') {
            messages.push({
              role: 'system',
              content: 'Continue working until you can respond with a phase="final" control envelope JSON summarizing the outcome.'
            });
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error('Assistant failed to reach the final phase with a valid envelope.');
            }
            continue;
          }

          // Update conversation state before returning
          this.updateConversation(conv.conversationId, messages, lastPhase);

          return {
            response: JSON.stringify(controlEnvelope, null, 2),
            conversationId: conv.conversationId
          };
        } else {
          if (rawContent.length === 0) {
            continue;
          }

          this.updateConversation(conv.conversationId, messages, lastPhase);

          return {
            response: rawContent,
            conversationId: conv.conversationId
          };
        }
      }

      await this.executeTools(toolCalls, messages);

      iteration++;
    }

    // Update conversation state even if max iterations reached
    this.updateConversation(conv.conversationId, messages, lastPhase);

    return {
      response: 'Max iterations reached without final response',
      conversationId: conv.conversationId
    };
  }

  private async executeTools(toolCalls: any, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): Promise<void> {
    // Execute tool calls
    for (const toolCall of toolCalls) {
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
        } catch (error) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error executing ${toolCall.function.name}: ${error}`
          });
        }
      }
    }

  }
}
