export type RuleDef = {
  name: string;
  keywords: string[];
  text: string;
  test_keywords?: string[];
  childRules?: {
    step: string;
    text: string;
  }[];
}
