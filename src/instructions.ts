import OpenAI from "openai";
import { youAreShadow } from "./chatprompt.js";
import { Database } from "./database.js";
import { generateEmbedding, OpenAIClient } from "./openai-client.js";
import { TrainedModel, Literal, Rule, RuleSet, TrainingExamples, Example, trainRuleReliabilities, predictLabel, forwardPass } from "./rulemodel.js";
import { CORE_RULES } from "./corerules.js";
import { yToId } from "./affineperm.js";
import { RuleDef } from "./ruledef.js";

export async function initInstructions(openaiClient: OpenAIClient, database: Database): Promise<number[]> {
  let successCount = 0;
  let errorCount = 0;

  // Store only parent rules with their childRules intact
  for (const ruleDef of CORE_RULES) {
    try {
      // Generate additional terms using OpenAI, passing the whole ruleDef as JSON
      const ruleJson = JSON.stringify(ruleDef);
      const additionalKeywords = await generateAdditionalKeywords(openaiClient, ruleDef.keywords, ruleJson);

      // Combine original and additional terms as keywords
      const allKeywords = [...ruleDef.keywords, ...additionalKeywords];

      // Store instruction with keywords and complete rule JSON (including childRules)
      const instructionId = await database.storeInstruction(allKeywords, ruleJson);

      // Store embeddings for each keyword
      for (const keyword of allKeywords) {
        const embedding = await openaiClient.generateEmbedding(keyword);
        await database.storeInstructionEmbedding(instructionId, embedding);
      }

      console.log(`✓ Stored rule for [${ruleDef.keywords.join(', ')}] with ${allKeywords.length} keywords`);
      successCount++;
    } catch (error) {
      console.error(`✗ Failed to store rule for [${ruleDef.keywords.join(', ')}]: ${error} `);
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

function normalizeIdentifier(value: string, fallback: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized.length > 0 ? sanitized : fallback;
}

export async function initRuleModel(database: Database): Promise<void> {
  const start = performance.now();
  const instructions = await database.getAllInstructions();

  if (instructions.length === 0) {
    const emptyModel: TrainedModel = {
      version: "noisyor-1.0",
      labels: [],
      priors: {},
      rules: [],
      train_meta: {
        objective: "multiclass-log-loss",
        epochs: 0,
        optimizer: "adam",
        lr: 0,
        l2_c: 0,
        seed: 0,
        train_size: 0,
        val_size: 0,
        timestamp_utc: new Date().toISOString(),
        best_val_logloss: 0
      }
    };

    await database.storeRuleModel('instructions', JSON.stringify(emptyModel, null, 2));
    return;
  }

  const labels: string[] = [];
  const labelSet = new Set<string>();
  const rules: Rule[] = [];
  const examples: Example[] = [];

  instructions.forEach((record, index) => {
    let keywords: string[] = [];
    try {
      keywords = JSON.parse(record.keywords) as string[];
    } catch {
      keywords = [];
    }

    const literals: Literal[] = [];
    const factsInRule = new Set<string>();
    const exampleFacts: Record<string, number> = {};

    keywords.forEach((keyword, idx) => {
      const factName = normalizeIdentifier(keyword, `keyword_${index + 1}_${idx + 1}`);
      if (factsInRule.has(factName)) {
        return;
      }
      factsInRule.add(factName);
      literals.push({ fact: factName, positive: true });
      exampleFacts[factName] = 1;
    });

    if (literals.length === 0) {
      const fallbackFact = `instruction_${index + 1}`;
      factsInRule.add(fallbackFact);
      literals.push({ fact: fallbackFact, positive: true });
      exampleFacts[fallbackFact] = 1;
    }

    const baseLabel = keywords.length > 0
      ? normalizeIdentifier(keywords[0], `instruction_${index + 1}`)
      : `instruction_${index + 1}`;
    let label = baseLabel;
    let suffix = 1;
    while (labelSet.has(label)) {
      label = `${baseLabel}_${++suffix}`;
    }
    labelSet.add(label);
    labels.push(label);

    const rule: Rule = {
      id: `R${index + 1}`,
      label,
      literals,
      init_c: 0.9,
      enabled: true,
      meta: {
        keywords,
        instruction_text: record.text
      }
    };

    rules.push(rule);

    examples.push({
      id: `ex_${index + 1}`,
      label,
      facts: exampleFacts,
      weight: 1
    });
  });

  const priors: Record<string, number> = {};
  if (labels.length > 0) {
    const uniform = 1 / labels.length;
    labels.forEach(label => {
      priors[label] = uniform;
    });
  }

  const ruleSet: RuleSet = {
    rules,
    labels,
    priors
  };

  const trainingData: TrainingExamples = {
    examples
  };

  const model: TrainedModel = await trainRuleReliabilities(ruleSet, trainingData, trainingData, {
    epochs: 1,
    batchSize: Math.max(1, examples.length),
    lr: 0.05,
    calibrate: false,
    earlyStopPatience: 1,
    seed: 42
  });

  await database.storeRuleModel('instructions', JSON.stringify(model, null, 2));

  const end = performance.now();
  console.log(`initRuleModel: duration: ${end - start}`);
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

export async function getInstructions(database: Database,
  openaiClient: OpenAI,
  args: { keywords: string[]; rule_id?: string; step?: string }): Promise<string> {
  console.log("getInstructions: " + JSON.stringify(args))

  // If rule_id and step are provided, look up the specific child rule
  if (args.rule_id && args.step) {
    return getInstructionById(database, args)
  }

  // Try direct lookup in database first
  const directMatch = await database.findInstructionByKeywords(args.keywords);
  if (directMatch) {
    console.log(`getInstructions: [keywords: ${args.keywords}][direct match][rule_id: ${directMatch.id}]`);

    // Parse the stored JSON to get the RuleDef
    let ruleDef: RuleDef;
    try {
      const storedRule = JSON.parse(directMatch.text);
      ruleDef = storedRule as RuleDef;
    } catch (error) {
      // If not valid JSON, treat as plain text (backward compatibility)
      return "\n[CONTEXT]\n" + directMatch.text + "\n[/CONTEXT]\n";
    }

    // Return rule with rule_id for root rules
    return JSON.stringify({
      rule_id: directMatch.id.toString(),
      keywords: ruleDef.keywords,
      has_steps: !!ruleDef.childRules && ruleDef.childRules.length > 0,
      steps: ruleDef.childRules?.map(cr => cr.step) || [],
      instruction: ruleDef.text
    }, null, 2);
  }

  // Fall back to embedding-based search
  return await getInstructionsFuzzy(database,
    openaiClient,
    args);

}

async function getInstructionById(database: Database, args: { keywords: string[]; rule_id?: string; step?: string }): Promise<string> {
  const ruleId = args.rule_id ? yToId(args.rule_id) : undefined;
  const instruction = ruleId ? await database.getInstructionById(ruleId) : undefined;

  if (!instruction) {
    return JSON.stringify({
      error: `Rule ID "${args.rule_id}" not found`,
      available_rule_ids: "Use get_instructions with keywords first to get a rule_id"
    }, null, 2);
  }

  // Parse the stored JSON to get the RuleDef
  let ruleDef: RuleDef;
  try {
    const storedRule = JSON.parse(instruction.text);
    ruleDef = storedRule as RuleDef;
  } catch (error) {
    return JSON.stringify({
      error: `Failed to parse rule JSON for ID "${args.rule_id}"`
    }, null, 2);
  }

  const childRule = ruleDef.childRules?.find((x) => x.step === args.step);
  if (!childRule) {
    return JSON.stringify({
      error: `Step "${args.step}" not found in rule "${args.rule_id}"`,
      available_steps: ruleDef.childRules?.map(cr => cr.step) || []
    }, null, 2);
  }

  console.log(`getInstructions: [rule_id: ${args.rule_id}][step: ${args.step}][found child rule]`);
  return "\n[CONTEXT]\n" + childRule.text + "\n[/CONTEXT]\n";
}

async function getInstructionsFuzzy(database: Database,
  openaiClient: OpenAI,
  args: { keywords: string[]; rule_id?: string; step?: string }): Promise<string> {
  const keywordMatches: Array<{ text: string, similarity: number, terms: string[] }> = [];

  for (const term of args.keywords) {
    const embedding = await generateEmbedding(openaiClient, [term]);
    const matches = await database.getInstructions(embedding, 3);

    for (const match of matches) {
      keywordMatches.push({
        text: match.text,
        similarity: match.similarity,
        terms: match.terms
      });
    }
  }

  if (keywordMatches.length === 0) {
    return JSON.stringify({
      error: `No instructions found for terms: ${args.keywords.join(', ')}`
    }, null, 2);
  }

  // Use rule model if available
  const modelJson = await database.loadRuleModel('instructions');
  if (!modelJson) {
    // Fallback to similarity-based matching if no model exists
    const sortedMatches = keywordMatches.sort((a, b) => b.similarity - a.similarity);
    const uniqueTexts = new Map<string, { text: string, similarity: number, terms: string[] }>();
    for (const match of sortedMatches) {
      if (!uniqueTexts.has(match.text)) {
        uniqueTexts.set(match.text, match);
      }
    }
    const bestMatches = Array.from(uniqueTexts.values()).slice(0, 2);
    console.log(`getInstructions (fallback): [terms: ${args.keywords}][found: ${bestMatches.length}]`)
    return "\n[CONTEXT]\n" + bestMatches.map(x => x.text).join('\n\n') + "\n[/CONTEXT]\n";
  }

  const model: TrainedModel = JSON.parse(modelJson);

  // Build facts dictionary from user keywords
  const facts: Record<string, number> = {};
  for (const keyword of args.keywords) {
    const factName = normalizeIdentifier(keyword, 'unknown');
    facts[factName] = 1;
  }

  // Use rule model to predict best instructions
  const result = predictLabel(model, facts);

  // Get top 2 labels by probability
  const sortedLabels = Object.entries(result.posteriors)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 2)
    .map(([label]) => label);

  // Find instruction texts for these labels
  const bestMatches: Array<{ text: string, label: string, probability: number }> = [];
  for (const label of sortedLabels) {
    const rule = model.rules.find(r => r.label === label);
    if (rule && rule.meta && rule.meta.instruction_text) {
      bestMatches.push({
        text: rule.meta.instruction_text as string,
        label: label,
        probability: result.posteriors[label]
      });
    }
  }

  console.log(`getInstructions: [terms: ${args.keywords}][found: ${bestMatches.length}][labels: ${bestMatches.map(x => x.label + ':' + x.probability.toFixed(3))}]`)

  return "\n[CONTEXT]\n" + bestMatches.map(x => x.text).join('\n\n') + "\n[/CONTEXT]\n";
}

async function getInstructionsBestMatch(database: Database,
  openaiClient: OpenAI,
  args: { keywords: string[] }): Promise<string> {
  console.log("getInstructions: " + JSON.stringify(args))

  // Look up instructions for each term individually
  const allMatches: Array<{ text: string, similarity: number, terms: string[] }> = [];

  for (const term of args.keywords) {
    const embedding = await generateEmbedding(openaiClient, [term]);
    const matches = await database.getInstructions(embedding, 3); // Get top 3 for each term

    for (const match of matches) {
      allMatches.push({
        text: match.text,
        similarity: match.similarity,
        terms: match.terms
      });
    }
  }

  if (allMatches.length === 0) {
    return `No instructions found for terms: ${args.keywords.join(', ')} `;
  }

  // Sort by similarity and deduplicate by text content
  const sortedMatches = allMatches.sort((a, b) => b.similarity - a.similarity);
  const uniqueTexts = new Map<string, { text: string, similarity: number, terms: string[] }>();

  for (const match of sortedMatches) {
    if (!uniqueTexts.has(match.text)) {
      uniqueTexts.set(match.text, match);
    }
  }

  // Take top 2 unique instructions
  const bestMatches = Array.from(uniqueTexts.values()).slice(0, 2);

  console.log(`getInstructions: [terms: ${args.keywords}][found: ${bestMatches.length}][terms: ${bestMatches.map(x => x.text.substring(0, 100))}]`)

  return "\n[CONTEXT]\n" + bestMatches.map(x => x.text).join('\n\n') + "\n[/CONTEXT]\n";
}