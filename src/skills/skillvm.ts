import type { OpenAI } from "openai/client";
import type { Stream } from "openai/core/streaming";
import type { SkillStepDef, SkillDef, VMSpec } from "./skilldef";
import type { MCPToolCall } from "../openai/tooldispatcher";
import type { SkillVMContext } from "./skillvmcontext";

export type CompletionStream = Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {
  _request_id?: string | null;
}

// export type VMStep = {
//   skill: SkillDef;
//   step?: SkillStepDef;
// }

export interface SkillVM {
  // todo: merge prompt and context
  createContext(skill: SkillDef, initialUserMessage: string): SkillVMContext;
  executeStep(
    ctx: SkillVMContext,
    func: (step: VMSpec) => Promise<CompletionStream>): Promise<{ spec: VMSpec, stream: CompletionStream }>;
  executeTool(
    ctx: SkillVMContext,
    toolCall: MCPToolCall): Promise<string>;
}
