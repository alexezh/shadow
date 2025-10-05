import OpenAI from "openai";
import { youAreShadow } from "./chatprompt.js";
import { Database } from "./database.js";
import { generateEmbedding, OpenAIClient } from "./openai-client.js";

export const INITIAL_RULES = [
  {
    terms: ['edit document', 'format document'],
    text: `
**to edit a document:**
If user has not specified the name, use get_context API to retrieve the document name
If a user specified the name, store it using set_context(["document_name]) API call.
editing is done by ranges identified by paragraph ids. paragraph ids specified as {id=xyz} at the end of paragraph
use get_context tool with terms like ["last_range"] or ["last_file_name"] to retrieve the current editing context
use find_ranges to locate range given some text as references. If a user asks "find xyz", invoke find_range with list of 
variations to search for.

`
  },
  // todo: load summaries of X last documents
  {
    terms: ['create document'],
    text: `
**to create a document:**
load recent history using load_history API. check if user is repeating the request.
make document name and store it using set_context(["document_name]) API call.
- create a text version of requested document, store the text version using store_asset(kind: "text") API. 
- lookup blueprint using load_asset(kind: "blueprint") API providing set of terms describing kind of document to create.
 - such as if a user asked to make cool looking, specify "cool" as one of terms.
- create an HTML version of the document using formatting described in the blueprint. 
- store HTML version using store_asset(kind: "html") API 
`
  },
  {
    terms: ['use blueprint'],
    text: `
**to use blueprint:**
blueprint is a description (guidelines) for formatting the document. It describes what formatting such as colors
to apply to different parts of the document
To load blueprint, call get_asset(kind="blueprint") API providing set of terms describing kind of formatting to use.
 - such as if a user asked to make cool looking, specify "cool" as one of terms.
If a user asked to update formatting for for document
- change blueprint following instructions
- store blueprint using store_asset(kind="blueprint") API providing set of terms describing blueprint
- create an HTML version of the document using formatting described in the blueprint. 
- store HTML version using store_asset(kind: "html") API 
`
  },
  {
    terms: ['image', 'add'],
    text: `
**to add an image:**
use add_image. 
`
  },
];

export async function initInstructions(openaiClient: OpenAIClient, database: Database): Promise<number[]> {
  let successCount = 0;
  let errorCount = 0;

  for (const rule of INITIAL_RULES) {
    try {
      // Generate additional terms using OpenAI
      const additionalTerms = await generateAdditionalTerms(openaiClient, rule.terms, rule.text);

      const dataId = await database.storeInstruction(rule.text);
      for (const t of rule.terms) {
        const embedding = await openaiClient.generateEmbedding(t);
        await database.storeInstructionEmbedding(t, dataId, embedding);
      }

      for (const t of additionalTerms) {
        const embedding = await openaiClient.generateEmbedding(t);
        await database.storeInstructionEmbedding(t, dataId, embedding);
      }

      console.log(`✓ Stored rule for [${rule.terms.join(', ')}]`);
      successCount++;
    } catch (error) {
      console.error(`✗ Failed to store rule for [${rule.terms.join(', ')}]: ${error}`);
      errorCount++;
    }
  }

  return [successCount, errorCount]
}

async function generateAdditionalTerms(openaiClient: OpenAIClient, originalTerms: string[], instructionText: string): Promise<string[]> {
  try {
    const systemPrompt = youAreShadow;

    const userPrompt = `Given these original terms: [${originalTerms.join(', ')}] and this instruction text:
${instructionText}

Generate 4-6 additional terms representing different tasks or actions a user might want to accomplish using this instruction. Focus on:
- Specific user goals and intentions
- Different ways users might describe what they want to do
- Variations of the same task with different wording
- Common user language for these operations

Examples:
- If instruction is about editing: "modify text", "change content", "update paragraph", "revise document"
- If instruction is about images: "insert picture", "upload photo", "place image", "attach file"

Return only the task-oriented terms as a comma-separated list, no explanations.`;

    const response = await openaiClient.chatWithMCPTools([], systemPrompt, userPrompt);

    // Parse the response to extract terms
    const additionalTerms = response
      .split(',')

    console.log(`🔍 Generated task terms for [${originalTerms.join(', ')}]: [${additionalTerms.join(', ')}]`);
    return additionalTerms;

  } catch (error) {
    console.warn(`⚠️ Failed to generate task terms for [${originalTerms.join(', ')}]: ${error}`);
    return []; // Return empty array on error, continue with original terms only
  }
}

export async function getInstructions(database: Database,
  openaiClient: OpenAI,
  args: { terms: string[] }): Promise<string> {
  console.log("getInstructions: " + JSON.stringify(args))

  // Look up instructions for each term individually
  const allMatches: Array<{ text: string, similarity: number, matchedTerm: string }> = [];

  for (const term of args.terms) {
    const embedding = await generateEmbedding(openaiClient, [term]);
    const matches = await database.getInstructions(embedding, 3); // Get top 3 for each term

    for (const match of matches) {
      allMatches.push({
        text: match.text,
        similarity: match.similarity,
        matchedTerm: term
      });
    }
  }

  if (allMatches.length === 0) {
    return `No instructions found for terms: ${args.terms.join(', ')}`;
  }

  // Sort by similarity and deduplicate by text content
  const sortedMatches = allMatches.sort((a, b) => b.similarity - a.similarity);
  const uniqueTexts = new Map<string, { text: string, similarity: number, matchedTerm: string }>();

  for (const match of sortedMatches) {
    if (!uniqueTexts.has(match.text)) {
      uniqueTexts.set(match.text, match);
    }
  }

  // Take top 2 unique instructions
  const bestMatches = Array.from(uniqueTexts.values()).slice(0, 2);

  console.log(`getInstructions: [terms: ${args.terms}] [found: ${bestMatches.length}] [terms: ${bestMatches.map(x => x.matchedTerm)}]`)

  return "\n[CONTEXT]\n" + bestMatches.map(x => x.text).join('\n\n') + "\n[/CONTEXT]\n";
}

