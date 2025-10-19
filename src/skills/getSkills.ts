import OpenAI from "openai";
import { Database } from "../database";
import { SkillDef } from "../skilldef";


export async function getSkills(database: Database,
  openaiClient: OpenAI,
  args: { name: string; step?: string; }): Promise<string> {
  console.log("getSkills: " + JSON.stringify(args));

  const instruction = await database.getSkillsByName(args.name);
  if (!instruction) {
    return JSON.stringify({
      error: `Instruction with name "${args.name}" not found`
    }, null, 2);
  }

  // Try to parse as RuleDef
  try {
    const ruleDef = JSON.parse(instruction.text) as SkillDef;

    // If step is requested, find it in childRules
    if (args.step && ruleDef.childRules) {
      const childRule = ruleDef.childRules.find(cr => cr.step === args.step);
      if (!childRule) {
        return JSON.stringify({
          error: `Step "${args.step}" not found in instruction "${args.name}"`,
          available_steps: ruleDef.childRules.map(cr => cr.step)
        }, null, 2);
      }
      console.log(`getSkills: [name: ${args.name}][step: ${args.step}][found child rule]`);
      return "\n[CONTEXT]\n" + childRule.text + "\n[/CONTEXT]\n";
    }

    // Return the full rule info
    console.log(`getSkills: [name: ${args.name}][has_steps: ${!!ruleDef.childRules}]`);
    return JSON.stringify({
      name: instruction.name,
      keywords: ruleDef.keywords,
      has_steps: !!ruleDef.childRules && ruleDef.childRules.length > 0,
      steps: ruleDef.childRules?.map(cr => cr.step) || [],
      instruction: ruleDef.text
    }, null, 2);
  } catch (error) {
    // If not JSON, return as plain text (for selectskill and other text-only instructions)
    console.log(`getSkills: [name: ${args.name}][plain text]`);
    return "\n[CONTEXT]\n" + instruction.text + "\n[/CONTEXT]\n";
  }
}
