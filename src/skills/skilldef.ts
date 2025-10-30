import type { ToolDef } from "./tooldef.js";

export type SkillDef = {
  name: string;
  keywords: string[];
  text: string;
  contextMessage?: {
    role: 'user';
    content: string;
  }
  test_keywords?: string[];
  tools?: ToolDef[];
  childSkill?: {
    step: string;
    text: string;
    tools?: ToolDef[];
  }[];
}
