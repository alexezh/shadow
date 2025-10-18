export type RuleDef = {
  keywords: string[];
  text: string;
  childRules?: {
    step: string;
    text: string;
  }[];
}
