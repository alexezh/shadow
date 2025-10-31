import type { Database } from "../database.js";
import { retryWithBackoff } from "../openai/retrywithbackoff.js";
import { MCPToolCall, ToolDispatcher } from "../openai/tooldispatcher.js";
import { Session } from "../server/session.js";
import { getSkills } from "./getSkills.js";
import type { SkillStepDef, SkillDef } from "./skilldef.js";
import type { CompletionStream, SkillVM } from "./skillvm.js";
import { SkillVMContext } from "./skillvmcontext.js";

/**
 * as we run through skills, we build stack of things
 */
export class SkillVMImpl implements SkillVM {
  private stack: VMStep[] = [];
  private dispatcher: ToolDispatcher;
  private session: Session;

  public constructor(session: Session, dispatcher: ToolDispatcher) {
    this.dispatcher = dispatcher;
    this.session = session;
  }

  private get currentStep(): VMStep {
    return this.stack[this.stack.length - 1];
  }

  createContext(systemPrompt: string, initialUserMessage: string, contextMessage?: {
    role: 'user';
    content: string;
  }): SkillVMContext {
    return new SkillVMContext(systemPrompt, initialUserMessage, contextMessage);
  }

  //private currentSkill
  public pushStep(skill: SkillDef, step?: SkillStepDef): void {
    this.stack.push({ skill, step })
  }

  public popStep(): void {
    this.stack.pop();
  }

  public async executeStep(
    ctx: SkillVMContext,
    func: (skill: SkillDef) => Promise<CompletionStream>): Promise<{ skill: SkillDef, stream: CompletionStream }> {
    const skill = this.currentStep;
    const stream = await retryWithBackoff(async () => {
      return func(this.currentStep);
    });

    return {
      skill, stream
    }
  }

  public async executeTool(toolCall: MCPToolCall): Promise<string> {
    if (toolCall.name === "get_skill") {
      const getRes = await getSkills(this.session.database, toolCall.arguments);
      if (!getRes.skill) {
        return getRes.result;
      }

      this.stack.push({ skill: getRes.skill, step: getRes.step })
      return getRes.result;
    } else {
      const result = await this.dispatcher.executeTool(this.session, toolCall);
      return result;
    }
  }

  private transition(curSkill: SkillDef, nextSkill: SkillDef): void {

  }
}
