import OpenAI from "openai";
import { Database } from "../database";
import { SkillDef } from "../skilldef";
import { CORE_SKILLS } from "./coreskills";


export async function getSkills(database: Database,
  openaiClient: OpenAI,
  args: { name: string; step?: string; }): Promise<string> {
  console.log("getSkills: " + JSON.stringify(args));

  let skill = CORE_SKILLS.find((x) => x.name === args.name);
  if (!skill) {
    skill = await database.getSkillsByName(args.name);
    if (!skill) {
      return JSON.stringify({
        error: `Instruction with name "${args.name}" not found`
      }, null, 2);
    }
  }

  // Try to parse as RuleDef
  try {
    const skillDef = JSON.parse(skill.text) as SkillDef;

    // If step is requested, find it in childRules
    if (args.step && skillDef.childRules) {
      const childRule = skillDef.childRules.find(cr => cr.step === args.step);
      if (!childRule) {
        return JSON.stringify({
          error: `Step "${args.step}" not found in instruction "${args.name}"`,
          available_steps: skillDef.childRules.map(cr => cr.step)
        }, null, 2);
      }
      console.log(`getSkills: [name: ${args.name}][step: ${args.step}][found child rule]`);
      return "\n[CONTEXT]\n" + childRule.text + "\n[/CONTEXT]\n";
    }

    // Return the full rule info
    console.log(`getSkills: [name: ${args.name}][has_steps: ${!!skillDef.childRules}]`);
    return JSON.stringify({
      name: skill.name,
      keywords: skillDef.keywords,
      has_steps: !!skillDef.childRules && skillDef.childRules.length > 0,
      steps: skillDef.childRules?.map(cr => cr.step) || [],
      instruction: skillDef.text
    }, null, 2);
  } catch (error) {
    // If not JSON, return as plain text (for selectskill and other text-only instructions)
    console.log(`getSkills: [name: ${args.name}][plain text]`);
    return "\n[CONTEXT]\n" + skill.text + "\n[/CONTEXT]\n";
  }
}
