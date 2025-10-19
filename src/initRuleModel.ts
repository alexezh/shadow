import { Database } from "./database.js";
import { Example, Literal, Rule, RuleSet, TrainedModel, TrainingExamples, trainRuleReliabilities, predictLabel } from "./factmodel.js";
import { CORE_SKILLS } from "./skills/coreskills.js";

export function normalizeIdentifier(value: string, fallback: string): string {
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

export async function testRuleModel(database: Database): Promise<{ total: number, passed: number, failed: number }> {
  console.log('\n=== Testing Rule Model ===\n');

  const modelJson = await database.loadRuleModel('instructions');
  if (!modelJson) {
    console.error('❌ No rule model found. Run initRuleModel first.');
    return { total: 0, passed: 0, failed: 0 };
  }

  const model: TrainedModel = JSON.parse(modelJson);
  const instructions = await database.getAllInstructions();

  // Build a map from keywords to expected label
  const keywordsToLabel = new Map<string, string>();
  instructions.forEach((record, index) => {
    let keywords: string[] = [];
    try {
      keywords = JSON.parse(record.keywords) as string[];
    } catch {
      keywords = [];
    }

    const baseLabel = keywords.length > 0
      ? normalizeIdentifier(keywords[0], `instruction_${index + 1}`)
      : `instruction_${index + 1}`;

    // Find the actual label (with suffix if needed)
    let label = baseLabel;
    let suffix = 1;
    const labelSet = new Set(model.labels);
    while (labelSet.has(label)) {
      const candidateLabel = suffix === 1 ? baseLabel : `${baseLabel}_${suffix}`;
      if (model.rules.find(r => r.label === candidateLabel &&
        JSON.stringify(r.meta?.keywords) === JSON.stringify(keywords))) {
        label = candidateLabel;
        break;
      }
      suffix++;
      if (suffix > 10) { // Safety limit
        label = baseLabel;
        break;
      }
    }

    keywordsToLabel.set(JSON.stringify(keywords), label);
  });

  let total = 0;
  let passed = 0;
  let failed = 0;

  // Test each rule's test_keywords
  for (const ruleDef of CORE_SKILLS) {
    if (!ruleDef.test_keywords || ruleDef.test_keywords.length === 0) {
      continue;
    }

    // Find expected label for this rule
    const expectedLabel = keywordsToLabel.get(JSON.stringify(ruleDef.keywords));
    if (!expectedLabel) {
      console.warn(`⚠️  No label found for rule: [${ruleDef.keywords.join(', ')}]`);
      continue;
    }

    console.log(`\nTesting rule: [${ruleDef.keywords.join(', ')}] (expected label: ${expectedLabel})`);

    for (const testKeyword of ruleDef.test_keywords) {
      total++;

      // Split test keyword into individual words and create facts
      const words = testKeyword.toLowerCase().split(/\s+/);
      const facts: Record<string, number> = {};

      words.forEach(word => {
        const factName = normalizeIdentifier(word, 'unknown');
        facts[factName] = 1;
      });

      // Predict using the model
      const result = predictLabel(model, facts);

      // Get the top predicted label
      const sortedPredictions = Object.entries(result.posteriors)
        .sort(([, a], [, b]) => (b as number) - (a as number));

      const topLabel = sortedPredictions.length > 0 ? sortedPredictions[0][0] : '';
      const topProbability = sortedPredictions.length > 0 ? sortedPredictions[0][1] : 0;

      if (topLabel === expectedLabel) {
        console.log(`  ✓ "${testKeyword}" → ${topLabel} (${(topProbability as number).toFixed(3)})`);
        passed++;
      } else {
        console.log(`  ✗ "${testKeyword}" → ${topLabel} (${(topProbability as number).toFixed(3)}) | expected: ${expectedLabel}`);
        console.log(`    Top 3: ${sortedPredictions.slice(0, 3).map(([l, p]) => `${l}:${(p as number).toFixed(3)}`).join(', ')}`);
        failed++;
      }
    }
  }

  console.log(`\n=== Test Results ===`);
  console.log(`Total: ${total}`);
  console.log(`Passed: ${passed} (${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%)`);
  console.log(`Failed: ${failed} (${total > 0 ? ((failed / total) * 100).toFixed(1) : 0}%)`);

  return { total, passed, failed };
}
