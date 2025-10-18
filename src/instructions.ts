import OpenAI from "openai";
import { youAreShadow } from "./chatprompt.js";
import { Database } from "./database.js";
import { generateEmbedding, OpenAIClient } from "./openai-client.js";
import { TrainedModel, Literal, Rule, RuleSet, TrainingExamples, Example, trainRuleReliabilities, predictLabel, forwardPass } from "./rulemodel.js";
import { CORE_RULES } from "./corerules.js";

export async function initInstructions(openaiClient: OpenAIClient, database: Database): Promise<number[]> {
  let successCount = 0;
  let errorCount = 0;

  for (const rule of CORE_RULES) {
    try {
      // Generate additional terms using OpenAI
      const additionalKeywords = await generateAdditionalKeywords(openaiClient, rule.keywords, rule.text);

      // Combine original and additional terms as keywords
      const allKeywords = [...rule.keywords, ...additionalKeywords];

      // Store instruction with keywords and text
      const instructionId = await database.storeInstruction(allKeywords, rule.text);

      // Store embeddings for each keyword
      for (const keyword of allKeywords) {
        const embedding = await openaiClient.generateEmbedding(keyword);
        await database.storeInstructionEmbedding(instructionId, embedding);
      }

      console.log(`✓ Stored rule for [${rule.keywords.join(', ')}] with ${allKeywords.length} keywords`);
      successCount++;
    } catch (error) {
      console.error(`✗ Failed to store rule for [${rule.keywords.join(', ')}]: ${error} `);
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

async function generateAdditionalKeywords(openaiClient: OpenAIClient, originalTerms: string[], instructionText: string): Promise<string[]> {
  try {
    const systemPrompt = youAreShadow;

    const userPrompt = `Given these original terms: [${originalTerms.join(', ')}] and this instruction text:
${instructionText}

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

    console.log(`🔍 Generated task terms for [${originalTerms.join(', ')}]: [${additionalTerms.join(', ')}]`);
    return additionalTerms;

  } catch (error) {
    console.warn(`⚠️ Failed to generate task terms for [${originalTerms.join(', ')}]: ${error} `);
    return []; // Return empty array on error, continue with original terms only
  }
}

export async function getInstructions(database: Database,
  openaiClient: OpenAI,
  args: { keywords: string[] }): Promise<string> {
  console.log("getInstructions: " + JSON.stringify(args))

  // Look up instructions for each term individually
  const keywordMatches: Array<{ text: string, similarity: number, terms: string[] }> = [];

  for (const term of args.keywords) {
    const embedding = await generateEmbedding(openaiClient, [term]);
    const matches = await database.getInstructions(embedding, 3); // Get top 3 for each term

    for (const match of matches) {
      keywordMatches.push({
        text: match.text,
        similarity: match.similarity,
        terms: match.terms
      });
    }
  }

  if (keywordMatches.length === 0) {
    return `No instructions found for terms: ${args.keywords.join(', ')} `;
  }

  // instantiate rule model and lookup weights
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