import OpenAI from 'openai';
import { parsePhaseEnvelope, PhaseGatedEnvelope, Phase, validatePhaseProgression } from './phase-envelope.js';
import { ChatResult, getOpenAI } from './openai-client.js';
import { Stream } from 'openai/core/streaming.js';
import { VMSpec } from '../skills/skilldef.js';
import { SkillVMContext, TotalUsage } from '../skills/skillvmcontext.js';

export class SkilledAIClient {
  async chatWithSkills(
    vmCtx: SkillVMContext,
    userMessage: string,
  ): Promise<ChatResult> {

    // Add user message to conversation state
    vmCtx.addUserMessage(userMessage);

    // Get or create conversation
    const requireEnvelope = true;
    let lastPhase = vmCtx.lastPhase;

    console.log(`💬 Conversation with ${vmCtx.messages.length} messages`);

    // Loop to handle multiple function calls
    let maxIterations = 100;
    let iteration = 0;
    let invalidEnvelopeCount = 0;
    let totals: TotalUsage = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0
    }

    while (iteration < maxIterations) {
      const response = await vmCtx.vm.executeStep(vmCtx, async (spec: VMSpec) => {
        return getOpenAI().chat.completions.create({
          model: 'gpt-4.1',
          messages: vmCtx.messages,
          tools: spec.tools,
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

      let assistantMessage = {
        role: 'assistant' as const,
        content: '',
        tool_calls: [] as any[]
      };

      await this.readResponseStream(vmCtx, iteration, response.stream, assistantMessage, totals);

      const toolCalls = assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0
        ? assistantMessage.tool_calls
        : [];

      if (toolCalls.length === 0) {
        delete (assistantMessage as any).tool_calls;
      }

      const elapsed = vmCtx.elapsed();
      const responseText = (assistantMessage.content.length !== 0) ? assistantMessage.content.substring(0, 100) : JSON.stringify(assistantMessage).substring(0, 200);

      console.log(`assistant: [elapsed: ${elapsed}] [tt: ${totals.totalPromptTokens}] ${responseText}`);

      // Add the complete assistant message
      vmCtx.pushAssistantMessage(assistantMessage.content);

      //this.process
      const rawContent = (assistantMessage.content || '').trim();
      let controlEnvelope: PhaseGatedEnvelope | null = null;

      if (rawContent.length > 0) {
        try {
          controlEnvelope = parsePhaseEnvelope(rawContent);
          if (requireEnvelope) {
            const transitionIssue = validatePhaseProgression(lastPhase, controlEnvelope.phase);
            if (transitionIssue) {
              vmCtx.pushSystemMessage(`Phase transition error: ${transitionIssue} Respond again with a valid phase-gated control envelope JSON.`);
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

            vmCtx.respondToToolCallsWithError(toolCalls, `Rejected tool call: ${error?.message || String(error)} `);

            vmCtx.pushSystemMessage(`Your previous reply was not valid phase-gated control envelope JSON. Error: ${error?.message || String(error)}. Respond again using only the required JSON structure.`);
            continue;
          } else {
            controlEnvelope = null;
          }
        }
      }

      if (toolCalls.length > 0) {
        let pendingEnvelopeReminder = false;

        const res = this.validateToolCall(vmCtx, lastPhase, controlEnvelope, toolCalls);
        lastPhase = res.lastPhase!;
        pendingEnvelopeReminder = res.pendingEnvelopeReminder;
        invalidEnvelopeCount = invalidEnvelopeCount;

        if (res.status === "continue") {
          continue;
        }

        await this.executeTools(vmCtx, toolCalls);

        if (pendingEnvelopeReminder) {
          vmCtx.pushSystemMessage('Reminder: include the phase-gated control envelope JSON with phase="action" whenever you call tools.');
        }

        iteration++;
        continue;
      } else if (toolCalls.length === 0) {
        if (requireEnvelope) {
          if (!controlEnvelope) {
            vmCtx.pushSystemMessage('All responses must include the control envelope JSON. Provide the envelope.');
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error('Assistant did not provide the control envelope JSON.');
            }
            continue;
          }

          if (controlEnvelope.phase !== 'final') {
            vmCtx.pushSystemMessage('Continue working until you can respond with a phase="final" control envelope JSON summarizing the outcome.');
            invalidEnvelopeCount++;
            if (invalidEnvelopeCount > 5) {
              throw new Error('Assistant failed to reach the final phase with a valid envelope.');
            }
            continue;
          }

          // Update last phase
          vmCtx.lastPhase = lastPhase;

          return {
            response: JSON.stringify(controlEnvelope, null, 2),
            conversationId: '',
            usage: {
              promptTokens: totals.totalPromptTokens,
              completionTokens: totals.totalCompletionTokens,
              totalTokens: totals.totalTokens || (totals.totalPromptTokens + totals.totalCompletionTokens)
            }
          };
        } else {
          if (rawContent.length === 0) {
            continue;
          }

          vmCtx.lastPhase = lastPhase;

          return {
            response: rawContent,
            conversationId: '',
            usage: {
              promptTokens: totals.totalPromptTokens,
              completionTokens: totals.totalCompletionTokens,
              totalTokens: totals.totalTokens || (totals.totalPromptTokens + totals.totalCompletionTokens)
            }
          };
        }
      }

      iteration++;
    }

    // Update last phase even if max iterations reached
    vmCtx.lastPhase = lastPhase;

    return {
      response: 'Max iterations reached without final response',
      conversationId: '',
      usage: {
        promptTokens: totals.totalPromptTokens,
        completionTokens: totals.totalCompletionTokens,
        totalTokens: totals.totalTokens || (totals.totalPromptTokens + totals.totalCompletionTokens)
      }
    };
  }

  private async readResponseStream(
    conversationState: SkillVMContext,
    iteration: number,
    response: Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {
      _request_id?: string | null;
    }, assistantMessage: {
      role: 'assistant',
      content: string,
      tool_calls: any[]
    },
    totals: TotalUsage): Promise<void> {
    let iterationPromptTokens = 0;
    let iterationCompletionTokens = 0;
    let iterationTotalTokens = 0;

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

    totals.totalPromptTokens += iterationPromptTokens;
    totals.totalCompletionTokens += iterationCompletionTokens;
    totals.totalTokens += iterationTotalTokens || (iterationPromptTokens + iterationCompletionTokens);
    conversationState.recordUsage(
      `iteration-${iteration}`,
      iterationPromptTokens,
      iterationCompletionTokens,
      iterationTotalTokens || (iterationPromptTokens + iterationCompletionTokens)
    );
  }

  private validateToolCall(
    conversationState: SkillVMContext,
    lastPhase: Phase | null,
    controlEnvelope: PhaseGatedEnvelope | null,
    toolCalls: any[]): {
      status: "continue" | "verified",
      lastPhase: Phase | null;
      pendingEnvelopeReminder: boolean;
      invalidEnvelopeCount: number;
    } {
    let pendingEnvelopeReminder: boolean = false;
    let invalidEnvelopeCount = 0;

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
      conversationState.respondToToolCallsWithError(toolCalls, 'Rejected tool call: control.allow_tool_use is false.');

      conversationState.pushSystemMessage('control.allow_tool_use is false; do not invoke tools in the same response. Provide a new envelope.');
      invalidEnvelopeCount++;
      if (invalidEnvelopeCount > 5) {
        throw new Error('Assistant attempted to invoke tools while explicitly disallowing them.');
      }
      return { status: "continue", lastPhase, pendingEnvelopeReminder, invalidEnvelopeCount }
    }

    if (disallowed.length > 0) {
      conversationState.respondToToolCallsWithError(toolCalls, `Rejected tool call: ${disallowed.join(', ')} not listed in control.allowed_tools.`);

      conversationState.pushSystemMessage(`The tools ${disallowed.join(', ')} are not listed in control.allowed_tools. Update the envelope and resend.`);
      invalidEnvelopeCount++;
      if (invalidEnvelopeCount > 5) {
        throw new Error('Assistant repeatedly attempted to invoke tools not present in control.allowed_tools.');
      }
      return { status: "continue", lastPhase, pendingEnvelopeReminder, invalidEnvelopeCount }
    }

    return { status: "verified", lastPhase, pendingEnvelopeReminder, invalidEnvelopeCount }
  }

  private async executeTools(
    vmCtx: SkillVMContext,
    toolCalls: any
  ): Promise<void> {
    // Execute tool calls
    for (const toolCall of toolCalls) {
      const toolStartAt = performance.now();

      if (toolCall.type !== 'function') {
        console.log(`executeTools: ${toolCall.function.name} not a function`);
        continue;
      }

      try {
        const functionArgs = JSON.parse(toolCall.function.arguments);
        const result = await vmCtx.vm.executeTool(vmCtx, {
          name: toolCall.function.name,
          arguments: functionArgs
        });

        vmCtx.pushToolMessage(
          toolCall.id,
          result
        );
      } catch (error) {
        const errText = `Error executing ${toolCall.function.name}: ${error}`;
        vmCtx.pushToolMessage(
          toolCall.id,
          errText
        );
        continue;
      }

      console.log(`executeTools: ${toolCall.function.name} elapsed: ${(performance.now() - toolStartAt) / 1000}`);
    }
  }
}
