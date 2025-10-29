import { Database } from '../database.js';
import OpenAI from 'openai';
import { OpenAIClient } from '../openai-client.js';
import { youAreShadow } from './chatprompt.js';
import { ConversationStateResponses } from '../openai-responsesclient.js';
import { generateEmbedding } from '../generateembedding.js';

export const CONTEXT_VALUES = [
  {
    name: "current_document",
    terms: ["current document", "active document", "document name"],
    text: `name of the document being edited`
  },
  {
    name: "last_range",
    terms: ["last range", "current range", "editing range"],
    text: `last accessed paragraph range in the document`
  }
]

export async function initContextMap(openaiClient: OpenAIClient, database: Database): Promise<number[]> {
  let successCount = 0;
  let errorCount = 0;

  for (const contextDef of CONTEXT_VALUES) {
    try {
      // Generate additional terms using OpenAI
      const additionalTerms = await generateAdditionalKeywords(openaiClient, contextDef.terms, contextDef.text);

      // Store embeddings for original terms
      for (const term of contextDef.terms) {
        const embedding = await openaiClient.generateEmbedding(term);
        await database.storeContextTerm(term, contextDef.name, embedding);
      }

      // Store embeddings for additional terms
      for (const term of additionalTerms) {
        const embedding = await openaiClient.generateEmbedding(term);
        await database.storeContextTerm(term, contextDef.name, embedding);
      }

      console.log(`✓ Stored context mapping for [${contextDef.name}] with terms: [${contextDef.terms.join(', ')}]`);
      successCount++;
    } catch (error) {
      console.error(`✗ Failed to store context mapping for [${contextDef.name}]: ${error}`);
      errorCount++;
    }
  }

  return [successCount, errorCount];
}

async function generateAdditionalKeywords(openaiClient: OpenAIClient, originalTerms: string[], contextText: string): Promise<string[]> {
  try {
    const systemPrompt = youAreShadow;

    const userPrompt = `Given these original terms: [${originalTerms.join(', ')}] and this context description:
${contextText}

Generate 4-6 additional terms representing different ways a user might refer to this context. Focus on:
- Natural language variations
- Common synonyms and related phrases
- Different ways users might ask for this information
- Casual and formal variations

Examples:
- For "current document": "this document", "working document", "doc I'm editing", "my document"
- For "last file": "recent file", "previous file", "the file", "what file"

Return only the terms as a comma-separated list, no explanations.`;

    const conversationState = new ConversationStateResponses(systemPrompt, userPrompt);
    const { response } = await openaiClient.chatWithMCPTools(undefined, [], conversationState, userPrompt, {
      requireEnvelope: false
    });

    // Parse the response to extract terms
    const additionalTerms = response
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    console.log(`🔍 Generated context terms for [${originalTerms.join(', ')}]: [${additionalTerms.join(', ')}]`);
    return additionalTerms;

  } catch (error) {
    console.warn(`⚠️ Failed to generate context terms for [${originalTerms.join(', ')}]: ${error}`);
    return []; // Return empty array on error, continue with original terms only
  }
}

export async function getContext(database: Database, openaiClient: OpenAI, args: { terms: string[] }): Promise<string> {
  const result: Record<string, any> = {};

  console.log("getContext: " + JSON.stringify(args))

  for (const term of args.terms) {
    // Generate embedding for the term
    const embedding = await generateEmbedding(openaiClient, [term]);

    // Find matching context names by embedding similarity
    const matches = await database.findContextByEmbedding(embedding, 1);

    if (matches.length > 0 && matches[0].similarity > 0.7) {
      // Found a matching context name, load its value
      const contextName = matches[0].contextName;
      const contextValues = await database.loadContext(contextName, 1);

      if (contextValues.length > 0) {
        result[term] = {
          contextName: contextName,
          value: contextValues[0].value,
          modifiedAt: contextValues[0].modifiedAt,
          matchedTerm: matches[0].term,
          similarity: matches[0].similarity
        };
      } else {
        result[term] = null;
      }
    } else {
      result[term] = null;
    }
  }

  return JSON.stringify({
    context: result,
    message: "Context retrieved successfully"
  }, null, 2);
}

export async function setContext(database: Database, openaiClient: OpenAI, args: { keywords: string[], value: string }): Promise<string> {
  try {
    console.log("setContext: " + JSON.stringify(args));

    // Generate embedding for the terms
    const embedding = await generateEmbedding(openaiClient, args.keywords);

    // Find matching context name by embedding similarity
    const matches = await database.findContextByEmbedding(embedding, 1);

    if (matches.length === 0 || matches[0].similarity < 0.7) {
      return JSON.stringify({
        success: false,
        message: `No matching context found for terms: ${args.keywords.join(', ')}. Available contexts can be found using get_context.`,
        terms: args.keywords
      }, null, 2);
    }

    const contextName = matches[0].contextName;

    // Store the context value
    await database.storeContext(contextName, args.value);

    console.log(`✓ Stored context [${contextName}] = "${args.value}"`);

    return JSON.stringify({
      success: true,
      message: "Context value stored successfully",
      contextName: contextName,
      value: args.value,
      matchedTerm: matches[0].term,
      similarity: matches[0].similarity
    }, null, 2);
  } catch (error: any) {
    console.error('❌ Error setting context:', error);
    return JSON.stringify({
      success: false,
      error: error.message
    }, null, 2);
  }
}
