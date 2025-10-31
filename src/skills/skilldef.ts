import type { ToolDef } from "./tooldef.js";

/**
 * next - take current item from stack and replace with new
 */
export type VMOp = {
  code: "next" | "call",
  target: string;
}

export type VMSpec = {
  id?: string;
  tools?: ToolDef[];
  ops: VMOp[];
}

export type SkillStepDef = {
  name: string;
  text: string;
  spec?: VMSpec;
}

/**
 * basic idea is following. skill defined set of steps
 * both skill and step define tools, and how to perform transition
 * 
 * when LLM loads skil, we get VMSpec and transition following instructions
 */
export type SkillDef = {
  name: string;
  keywords: string[];
  text: string;
  contextMessage?: {
    role: 'user';
    content: string;
  }
  test_keywords?: string[];
  spec?: VMSpec;
  childSkill?: SkillStepDef[];
}

export function getSpec(skill: SkillDef, step?: SkillStepDef): VMSpec {
  const newSpec = step ? step.spec : skill.spec;
  if (!newSpec?.id) {
    newSpec!.id = skill.name + "!" + step?.name;
  }
  return newSpec!;
}
