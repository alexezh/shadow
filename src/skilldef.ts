export type SkillDef = {
  name: string;
  keywords: string[];
  text: string;
  test_keywords?: string[];
  childSkill?: {
    step: string;
    text: string;
  }[];
}
