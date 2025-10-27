import type { MCPFunctionTool } from "../mcptools.js";

export type SkillDef = {
  name: string;
  keywords: string[];
  text: string;
  test_keywords?: string[];
  tools?: MCPFunctionTool[];
  childSkill?: {
    step: string;
    text: string;
    tools?: MCPFunctionTool[];
  }[];
}
