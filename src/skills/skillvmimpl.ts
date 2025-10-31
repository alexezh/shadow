import type { Database } from "../database.js";
import { ExecutePromptContext } from "../openai/executepromptcontext.js";
import { retryWithBackoff } from "../openai/retrywithbackoff.js";
import { MCPToolCall, ToolDispatcher } from "../openai/tooldispatcher.js";
import { Session } from "../server/session.js";
import { getSkills } from "./getSkills.js";
import { type SkillStepDef, type SkillDef, type VMSpec, type VMOp, getSpec } from "./skilldef.js";
import type { CompletionStream, SkillVM } from "./skillvm.js";
import { SkillVMContext } from "./skillvmcontext.js";

/**
 * as we run through skills, we build stack of things
 */
export class SkillVMImpl implements SkillVM {
  private stack: { spec: VMSpec, id: string }[] = [];
  private dispatcher: ToolDispatcher;
  private session: Session;
  public promptContext?: ExecutePromptContext;

  public constructor(session: Session, dispatcher: ToolDispatcher) {
    this.dispatcher = dispatcher;
    this.session = session;
  }

  private get currentSpec(): VMSpec {
    return this.stack[this.stack.length - 1].spec;
  }

  createContext(skill: SkillDef,
    promptCtx: ExecutePromptContext,
    initialUserMessage: string): SkillVMContext {
    this.promptContext = promptCtx;
    this.stack.length = 0;
    const spec = getSpec(skill);
    this.stack.push({ id: spec.id!, spec });
    return new SkillVMContext(this, skill, initialUserMessage);
  }

  public async executeStep(
    ctx: SkillVMContext,
    func: (skill: VMSpec) => Promise<CompletionStream>): Promise<{ spec: VMSpec, stream: CompletionStream }> {
    const spec = this.currentSpec;
    const stream = await retryWithBackoff(async () => {
      return func(spec);
    });

    return {
      spec, stream
    }
  }

  public async executeTool(vmCtx: SkillVMContext, toolCall: MCPToolCall): Promise<string> {
    if (toolCall.name === "get_skills") {
      const { skill, step, result } = await getSkills(this.session.database, toolCall.arguments);
      if (!skill) {
        return result;
      }

      const newSpec = getSpec(skill, step);
      this.transition(newSpec);
      //this.stack.push({ id: newSpec.id!, spec: newSpec! })
      return result;
    } else {
      const result = await this.dispatcher.executeTool(this.session, toolCall);
      return result;
    }
  }

  private transition(newSpec: VMSpec): void {
    let curSpec = this.currentSpec;
    let curOp: VMOp | undefined;
    for (let op of curSpec.ops) {
      if (op.target === "*") {
        curOp = op;
      }
    }

    if (!curOp) {
      console.log("transition: cannot find op:" + curSpec.id)
      throw "cannot file op";
    }

    if (curOp.code === "call") {
      this.stack.push({ id: newSpec.id!, spec: newSpec })
    } else {
      this.stack.pop();
      this.stack.push({ id: newSpec.id!, spec: newSpec })
    }
  }
}
