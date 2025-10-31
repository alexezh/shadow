import type { ToolDef } from "./tooldef.js";

export type VMOp = {
  code: "next" | "call",
  target: string;
}

export type VMSpec = {
  tools?: ToolDef[];
  ops: VMOp[];
}

export type SkillStepDef = {
  step: string;
  text: string;
  spec?: VMSpec;
}

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
