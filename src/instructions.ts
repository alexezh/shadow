import OpenAI from "openai";
import { youAreShadow } from "./chatprompt.js";
import { Database } from "./database.js";
import { generateEmbedding, OpenAIClient } from "./openai-client.js";

const ChunkSegment = `
ATTENTION: When producing large markdown or html, NEVER write placeholders like "[continued]".
Instead, you MUST call the tool store_asset repeatedly using chunk encoding:
- Max 1000 tokens in content per call.
- Use the same "chunkId" for the whole document.
- Start with "chunkIndex = 0", then increment by 1 each call.
- Set eos on the last chunk.

`;

const MarkdownSegment = `
ATTENTION: When producing markdown".
- Split markdown info chunks with un to 1000 tokens per store_asset call. Follow chunking instructions
- Use CommonMark “directives” (remark-directive, markdown-it-container, Pandoc fenced divs).
- For each paragraph, table, cell, row, generate ID using make_id API and store it in the beginning of paragraph using {#p-<id>} syntax. Example
    ::: para {#p-x22t} 
    Here is regular Markdown paragrapjh
- For style information on paragraph use ::: directive with CSS style. Example 
    ::: para {#p-id> .lead data-sem="body" style="text-indent:1.5em"}
- For tables, use "::: table" or "::: row". Example
    ::: table {#t-<id>}
    ::: row   {#r-1}
    ::: cell  {#c-1 colspan=1 rowspan=1}
    Here is regular Markdown inside a cell — paragraphs, lists, code, etc.
    :::

    ::: cell  {#c-2}
    Here is a nested table:
    ::: table {#t-inner}
    ::: row
    ::: cell {#c-2-1} Inner p1. :::
    ::: cell {#c-2-2} Inner p2. :::
    :::
    :::
    :::
    :::
    :::
- If cell body is too big, write a reference and store content using separate store_asset call:
    ::: cell {#c-2 data-ref="asset:a1b2"}
    <!-- content is streamed via store_asset(scope="cell", targetId="c-2") -->
    :::

`
export const INITIAL_RULES = [
  {
    keywords: ['edit document', 'format document'],
    text: `
**to edit a document:**
If user has not specified the name, use get_context API to retrieve the document name
If a user specified the name, store it using set_context(["document_name]) API call.
If a user asked to update formatting, get additional instructions by calling get_instructions("use blueprint") API
editing is done by ranges identified by paragraph ids. paragraph ids specified as {id=xyz} at the end of paragraph
use get_context tool with terms like ["last_range"] or ["last_file_name"] to retrieve the current editing context
use find_ranges to locate range given some text as references. If a user asks "find xyz", invoke find_range with list of 
variations to search for.

`
  },
  // todo: load summaries of X last documents
  // - store HTML version using store_asset(kind: "html") API
  // - create an HTML version of the document only after the markdown draft is ready. apply blueprint formatting when one was successfully loaded.
  {
    keywords: ['create document'],
    text: `
**to create a document:**
load recent history using load_history API. check if user is repeating the request.
make document name and store it using set_context(["document_name]) API call.
- produce a keyword set from the prompt that captures desired formatting. Use those keywords when calling load_asset(kind: "blueprint") to request an existing layout and formatting, refine it, then persist the update with store_asset(kind: "blueprint") using the same keywords.
- compose the document directly in HTML that fulfills the user request; do not emit markdown drafts. Use blueprint for HTML formatting 
- stream the HTML via store_asset(kind: "html") using chunkId, chunkIndex, and eos for every call.
- when content grows beyond ~1000 tokens, break it into logical units (sections, subsections, paragraphs, table cells) and issue separate store_asset calls per unit, reusing chunkId for related chunks and setting scope to the appropriate unit.
- do not call get_instructions("create blueprint") unless the user explicitly requests new formatting after the document is complete.

${ChunkSegment}
`
  },
  {
    keywords: ['create blueprint'],
    text: `
**to create a blueprint**
-compute semantical structure of the document
   * Example. If document is a resume which contains person name, address and other info, output as 
        document type - resume, person: tonnie, address: xyz, content and other semantical blocks 
   * include start and stop paragraph id in markdown at the end of semantic block name using {startId:<id>, endId:<id>} syntax
   * store semantical structure as markdown using store_asset(kind="semantic")
   
-compute layout and formatting of the document as markdown focusing how different semantic elements are formatted
  * output your data in chunks of max 1500 tokens
  * store each chunk store_asset(kind="blueprint", chunkId=N).
  * include both formatting and layout information; such as title: orginized in table with top row containing xyz
  * example. if text is section header and formatted as 24Pt font, output section.header - font: 24Pt, textcolor: blue.
  * when storing blueprint, add terms describing type of documents this blueprint can be used for. Include short description of layout as one of terms.

${ChunkSegment}
`
  },
  {
    keywords: ['use blueprint'],
    text: `
  ** to use blueprint:**
  blueprint is a description(guidelines) for formatting the document.It describes what formatting such as colors
to apply to different parts of the document
produce a keyword set from the user prompt and current content that summarizes the desired styling.
Call load_asset(kind = "blueprint") with those keywords to retrieve the closest existing blueprint.
If the returned blueprint needs adjustments, update it to match the document and persist the revision with store_asset(kind = "blueprint") using the same keywords.
- create an HTML version of the document using formatting described in the blueprint once it aligns with the draft.
- store HTML version using store_asset(kind: "html") API
`
  },
  {
    keywords: ['image', 'add'],
    text: `
  ** to add an image:**
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
      const additionalTerms = await generateAdditionalKeywords(openaiClient, rule.keywords, rule.text);

      // Combine original and additional terms as keywords
      const allKeywords = [...rule.keywords, ...additionalTerms];

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

  return [successCount, errorCount]
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

    const response = await openaiClient.chatWithMCPTools([], systemPrompt, userPrompt);

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
