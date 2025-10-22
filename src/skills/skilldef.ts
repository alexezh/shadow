import { ChatCompletionTool } from "openai/resources/chat/completions";

export type SkillDef = {
  name: string;
  keywords: string[];
  text: string;
  test_keywords?: string[];
  tools?: ChatCompletionTool[];
  childSkill?: {
    step: string;
    text: string;
    tools?: ChatCompletionTool[];
  }[];
}
