import { OpenAI } from "openai/client";
import type { Phase } from "../openai/phase-envelope";
import type { TokenUsage } from "../openai/openai-client";
import type { SkillVM } from "./skillvm";
import { SkillDef } from "./skilldef";

export type TotalUsage = {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
}

export class SkillVMContext {
  public messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  public lastPhase: Phase | null;
  public createdAt: Date;
  public executionStartAt: number = 0;
  public readonly vm: SkillVM;

  // Context tracking
  public promptTokens: number = 0;
  public completionTokens: number = 0;
  public totalTokens: number = 0;
  public messageChars: number = 0;
  public messageCount: number = 0;

  constructor(vm: SkillVM, skill: SkillDef, initialUserMessage: string) {
    this.vm = vm;
    if (skill.contextMessage?.content) {
      this.messages = [
        { role: 'system', content: skill.text },
        { role: 'developer', content: skill.contextMessage?.content },
        { role: 'user', content: initialUserMessage }
      ];

    } else {
      this.messages = [
        { role: 'system', content: skill.text },
        { role: 'user', content: initialUserMessage }
      ];
    }
    this.lastPhase = null;
    this.createdAt = new Date();

    // Record initial messages
    this.recordMessage('system', skill.text);
    this.recordMessage('user', initialUserMessage);
  }

  public elapsed(): number {
    return (performance.now() - this.executionStartAt) / 1000
  }
  pushSystemMessage(content: string): void {
    this.messages.push({ role: 'system', content });
    this.recordMessage('system', content);
  };

  pushToolMessage(toolCallId: string, content: string): void {
    this.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      content
    });
    this.recordMessage('tool', content);
  };

  pushAssistantMessage(content: string): void {
    this.messages.push({
      role: 'assistant',
      content
    });
    this.recordMessage('assistant', content);
  };

  private recordMessage(role: string, content: string): void {
    const length = content ? content.length : 0;
    this.messageChars += length;
    this.messageCount += 1;
  }

  respondToToolCallsWithError(toolCalls: any[], reason: string) {
    if (!toolCalls || toolCalls.length === 0) {
      return;
    }

    for (const toolCall of toolCalls) {
      if (!toolCall?.id) {
        console.warn(`⚠️ Unable to respond to tool call without id (tool=${toolCall?.function?.name || 'unknown'})`);
        continue;
      }

      console.warn(`respondToToolCallsWithError: (tool=${toolCall?.function?.name || 'unknown'}) (reason=${reason})`);

      this.pushToolMessage(
        toolCall.id,
        JSON.stringify({
          success: false,
          error: reason
        }, null, 2),
      );
    }
  };

  recordUsage(tag: string, promptTokens: number, completionTokens: number, totalTokens?: number): void {
    if (!promptTokens && !completionTokens && !totalTokens) {
      return;
    }
    const resolvedTotal = totalTokens ?? (promptTokens + completionTokens);
    this.promptTokens += promptTokens;
    this.completionTokens += completionTokens;
    this.totalTokens += resolvedTotal;
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
    this.recordMessage('user', content);
  }
}
