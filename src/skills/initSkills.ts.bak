import { youAreShadow } from "../chatprompt.js";
import { Database } from "../database.js";
import { OpenAIClient } from "../openai-client.js";
import { CORE_SKILLS } from "./coreskills.js";
import { initRuleModel } from "../initRuleModel.js";

export async function initInstructions(openaiClient: OpenAIClient, database: Database): Promise<number[]> {
  let successCount = 0;
  let errorCount = 0;

  // Generate and store the skill selection instruction
  const skillSelectionText = await initInstructions2(openaiClient);
  try {
    const selectionId = await database.storeSkill({ name: 'selectskill', keywords: ['select', 'skill'], text: skillSelectionText });
    console.log(`✓ Stored skill selection instruction with id ${selectionId}`);
  } catch (error) {
    console.error(`✗ Failed to store skill selection instruction: ${error}`);
    errorCount++;
  }
  return [successCount, errorCount];
}

async function initLegacy(openaiClient: OpenAIClient, database: Database): Promise<number[]> {
  let successCount = 0;
  let errorCount = 0;

  // Store only parent rules with their childRules intact
  for (const skill of CORE_SKILLS) {
    try {
      // Generate additional terms using OpenAI, passing the whole ruleDef as JSON
      const additionalKeywords = await generateAdditionalKeywords(openaiClient, skill.keywords, JSON.stringify(skill));

      // Combine original and additional terms as keywords
      const allKeywords = [...skill.keywords, ...additionalKeywords];
      const extSkill = { ...skill }
      extSkill.keywords = allKeywords;

      // Store instruction with keywords, complete rule JSON (including childRules), and name
      const instructionId = await database.storeSkill(extSkill);

      // Store embeddings for each keyword
      for (const keyword of allKeywords) {
        const embedding = await openaiClient.generateEmbedding(keyword);
        await database.storeInstructionEmbedding(instructionId, embedding);
      }

      console.log(`✓ Stored rule [${skill.name}] for [${skill.keywords.join(', ')}] with ${allKeywords.length} keywords`);
      successCount++;
    } catch (error) {
      console.error(`✗ Failed to store rule for [${skill.keywords.join(', ')}]: ${error} `);
      errorCount++;
    }
  }

  try {
    await initRuleModel(database);
    console.log('✓ Stored rule model based on current instructions');
  } catch (error) {
    console.error(`✗ Failed to initialize rule model: ${error}`);
  }

  return [successCount, errorCount]
}

export async function initInstructions2(openaiClient: OpenAIClient): Promise<string> {
  const skillsJson = JSON.stringify(CORE_SKILLS, null, 2);

  const systemPrompt = youAreShadow;
  const userPrompt = `You are provided with the full skill catalog for the system as JSON:
${skillsJson}

Write clear instructions for an assistant that receives arbitrary user prompts and must decide which single skill (by its \`name\`) best satisfies the request.

The instructions should explain:
- include a complete, human-readable list of all skills with their names, keywords, and purpose taken from the provided JSON (the instructions must stand alone without needing the JSON)
- provide extended explanation of each skill to allow better matching
- how to interpret user intent from the input
- how to compare the intent against the available skills
- how to choose the most appropriate skill name (or decide that none apply)
- that the assistant's response must be exactly the chosen skill name when a match exists, otherwise respond with "none"
- ignore "keyword" and "text_keyword" fields in JSON

Return only the instruction text.`;

  const { response, conversationId } = await openaiClient.chatWithMCPTools([], systemPrompt, userPrompt, {
    requireEnvelope: false
  });
  openaiClient.clearConversation(conversationId);

  return response.trim();
}

async function generateAdditionalKeywords(openaiClient: OpenAIClient, originalTerms: string[], ruleJson: string): Promise<string[]> {
  try {
    const systemPrompt = youAreShadow;

    const userPrompt = `Given these original terms: [${originalTerms.join(', ')}] and this rule definition (as JSON):
${ruleJson}

Generate 4 - 6 additional keywords representing different tasks or actions a user might want to accomplish using this instruction.
Focus on:
- Specific user goals and intentions
  - Different ways users might describe what they want to do
  - Variations of the same task with different wording
    - Common user language for these operations

Examples:
  - If instruction is about editing: "modify text", "change content", "update paragraph", "revise document"
    - If instruction is about images: "insert picture", "upload photo", "place image", "attach file"

Return only the task - oriented terms as a comma - separated list, no explanations.`;

    const { response, conversationId } = await openaiClient.chatWithMCPTools([], systemPrompt, userPrompt, {
      requireEnvelope: false
    });
    openaiClient.clearConversation(conversationId);

    // Parse the response to extract terms
    const additionalTerms = response
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    console.log(`🔍 Generated task terms for [${originalTerms.join(', ')}]: [${additionalTerms.join(', ')}]`);
    return additionalTerms;

  } catch (error) {
    console.warn(`⚠️ Failed to generate task terms for [${originalTerms.join(', ')}]: ${error} `);
    return []; // Return empty array on error, continue with original terms only
  }
}


