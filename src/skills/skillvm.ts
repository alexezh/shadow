import type { OpenAI } from "openai/client";
import type { Stream } from "openai/core/streaming";
import type { SkillDef } from "./skilldef";
import type { MCPToolCall } from "../openai/tooldispatcher";
import type { SkillVMContext } from "./skillvmcontext";

export type CompletionStream = Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {
  _request_id?: string | null;
}

export interface SkillVM {
  // todo: merge prompt and context
  createContext(systemPrompt: string, initialUserMessage: string, contextMessage?: {
    role: 'user';
    content: string;
  }): SkillVMContext;
  executeStep(
    ctx: SkillVMContext,
    func: (skill: SkillDef) => Promise<CompletionStream>): Promise<{ skill: SkillDef, stream: CompletionStream }>;
  executeTool(toolCall: MCPToolCall): Promise<string>;
}
