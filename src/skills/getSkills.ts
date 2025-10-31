import type { Database } from "../database.js";
import { CORE_SKILLS } from "./coreskills.js";
import type { SkillStepDef, SkillDef } from "./skilldef.js";


export async function getSkills(
  database: Database,
  args: { name: string; step?: string; }): Promise<{ skill?: SkillDef, step?: SkillStepDef, result: string }> {
  console.log("getSkills: " + JSON.stringify(args));

  let skill = CORE_SKILLS.find((x) => x.name === args.name);
  if (!skill) {
    skill = await database.getSkillsByName(args.name);
    if (!skill) {
      return {
        result: JSON.stringify({
          error: `Instruction with name "${args.name}" not found`
        }, null, 2)
      };
    }
  }

  // Try to parse as RuleDef
  try {
    // If step is requested, find it in childRules
    if (args.step && skill.childSkill) {
      const step = skill.childSkill.find(cr => cr.name === args.step);
      if (!step) {
        return {
          result: JSON.stringify({
            error: `Step "${args.step}" not found in instruction "${args.name}"`,
            available_steps: skill.childSkill.map(cr => cr.name)
          }, null, 2)
        };
      }
      console.log(`getSkills: [name: ${args.name}][step: ${args.step}][found child rule]`);
      return {
        skill: skill,
        step: step,
        result: "\n[CONTEXT]\n" + step.text + "\n[/CONTEXT]\n"
      }
    }

    // Return the full rule info
    console.log(`getSkills: [name: ${args.name}][has_steps: ${!!skill.childSkill}]`);
    return {
      skill: skill,
      result: JSON.stringify({
        name: skill.name,
        keywords: skill.keywords,
        has_steps: !!skill.childSkill && skill.childSkill.length > 0,
        steps: skill.childSkill?.map(cr => cr.name) || [],
        instruction: skill.text
      }, null, 2)
    }
  } catch (error) {
    // If not JSON, return as plain text (for selectskill and other text-only instructions)
    console.log(`getSkills: [name: ${args.name}][plain text]`);
    return { result: "\n[CONTEXT]\n" + skill.text + "\n[/CONTEXT]\n" };
  }
}
