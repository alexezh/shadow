import { youAreShadow } from "./rootskill.js";
import { Database } from "../database.js";
import { OpenAIClient, ConversationState } from "../openai/openai-client.js";
import { CORE_SKILLS } from "./coreskills.js";
import { initRuleModel } from "../fact/initRuleModel.js";
import { ConversationStateResponses } from "../openai/openai-responsesclient.js";

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
  const userPrompt = `You are designing the definitive instruction manual for an assistant that must pick exactly one skill (or "none") for any user request.

Skill catalog (JSON source of truth):
${skillsJson}

Author clear, self-contained instructions that do NOT reference the JSON after generation and contain no markdown fences.

Requirements:
1. Begin with a one-sentence purpose statement.
2. Provide a "Skill catalog" section that lists every skill by name, each with:
   - When to use it (bullet or short clause)
   - When not to use it / common confusions
   Keep each entry concise (<=3 sentences).
3. Write a numbered decision process that the assistant must follow every time:
   - Parse the user request, extract intent, entities, media type, timing clues.
   - Compare the request against the catalog, ignoring raw JSON fields like \`keywords\` or \`test_keywords\`; rely on the descriptions you just wrote instead.
   - Describe how to resolve multiple matches (e.g., choose the skill with the tightest fit; if none clearly applies, return "none").
   - Remind that the assistant MUST answer only with the skill name or "none".
4. Include a short tie-break / fallback note for ambiguous prompts.
5. Keep the entire manual under 400 words, plain text only.

Return only the finished manual.`;

  const conversationState = new ConversationStateResponses(systemPrompt, userPrompt);
  const { response } = await openaiClient.chatWithMCPTools(undefined, [], conversationState, userPrompt, {
    requireEnvelope: false
  });

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

    const conversationState = new ConversationStateResponses(systemPrompt, userPrompt);
    const { response } = await openaiClient.chatWithMCPTools(undefined, [], conversationState, userPrompt, {
      requireEnvelope: false
    });

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
