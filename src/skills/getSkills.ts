import OpenAI from "openai";
import { Database } from "../database.js";
import { SkillDef } from "./skilldef.js";
import { CORE_SKILLS } from "./coreskills.js";


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
    // If step is requested, find it in childRules
    if (args.step && skill.childSkill) {
      const childRule = skill.childSkill.find(cr => cr.step === args.step);
      if (!childRule) {
        return JSON.stringify({
          error: `Step "${args.step}" not found in instruction "${args.name}"`,
          available_steps: skill.childSkill.map(cr => cr.step)
        }, null, 2);
      }
      console.log(`getSkills: [name: ${args.name}][step: ${args.step}][found child rule]`);
      return "\n[CONTEXT]\n" + childRule.text + "\n[/CONTEXT]\n";
    }

    // Return the full rule info
    console.log(`getSkills: [name: ${args.name}][has_steps: ${!!skill.childSkill}]`);
    return JSON.stringify({
      name: skill.name,
      keywords: skill.keywords,
      has_steps: !!skill.childSkill && skill.childSkill.length > 0,
      steps: skill.childSkill?.map(cr => cr.step) || [],
      instruction: skill.text
    }, null, 2);
  } catch (error) {
    // If not JSON, return as plain text (for selectskill and other text-only instructions)
    console.log(`getSkills: [name: ${args.name}][plain text]`);
    return "\n[CONTEXT]\n" + skill.text + "\n[/CONTEXT]\n";
  }
}
