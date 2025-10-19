import { RuleDef } from "./ruledef";

const ChunkSegment = `
ATTENTION: When producing large markdown or html, NEVER write placeholders like "[continued]".
Instead, you MUST call the tool store_asset repeatedly using chunk encoding:
- Max 1000 tokens in content per call.
- Use the same "chunkId" for the whole document.
- Start with "chunkIndex = 0", then increment by 1 each call.
- Set eos on the last chunk.

`;


export const createRule: RuleDef = {
  name: "create_document",
  keywords: ['create document'],
  test_keywords: [
    'create document',
    'write new document',
    'generate content',
    'compose document',
    'draft new file'
  ],
  text: `
**create document · step pipeline**

Represent document creation as sequential JSON step cards. Emit only the active card in envelope.metadata.step_card using:
{
  "step": "<current step>",
  "goal": "<target outcome>",
  "keywords": ["create document", "<step keyword>"],
  "done_when": "<exit condition>"
}

Pipeline order:
1. blueprint_semantics — gather blueprint and semantic context
2. outline_plan — persist an outline to guide chunking
3. compose_html — stream formatted HTML content
4. finalize_history — verify output and record completion

Execution rules:
- First, call get_instructions with keywords ["create document"] to get the rule_id for this pipeline.
- For each step, call get_instructions(rule_id=<id>, step=<step_name>) to retrieve that step's JSON guidance. The response contains detailed actions plus a "completion_format" with the next step's prompt.
- Perform only the actions listed for the active step. Once done_when is satisfied, respond using the completion_format JSON (including next_prompt) before moving on.
- Advance to the next step only after emitting the completion JSON. Clear the step card when finalize_history completes.
- Always list the tool names you invoke in control.allowed_tools and set phase="action" while executing tool calls.
- Pause and ask the user when additional context is required before continuing.

${ChunkSegment}
`,
  childRules: [
    {
      step: 'blueprint',
      text: `
{
  "step": "blueprint_semantics",
  "goal": "Align blueprint and semantic context with the requested document before writing.",
  "done_when": "A blueprint matching the request is stored (or confirmed) and primary keywords are recorded in context.",
  "actions": [
    "Load recent history with load_history to avoid duplicating a document the user already confirmed.",
    "Set or retrieve the document name via set_context(['document_name'], value) or get_context when unspecified.",
    "Assemble a keyword set covering tone, genre, length, audience, timeframe, and notable entities; record it using set_context(['document_keywords'], <keywords>).",
    "Call load_asset(kind='blueprint', keywords=<assembled keywords>).",
    "If the loaded blueprint metadata conflicts with the request, regenerate it using get_instructions(['create blueprint']) and persist the result with store_asset(kind='blueprint') using the new keyword set.",
    "Capture any semantic outline or styling notes from the blueprint so later steps can reference them."
  ],
  "completion_format": {
    "status": "blueprint_semantics-complete",
    "next_step": "outline_plan",
    "next_prompt": "Call get_instructions(rule_id=<rule_id>, step='outline') to create and store the section plan.",
    "handoff": {
      "document_keywords": ["<keyword1>", "<keyword2>"],
      "blueprint_reference": "<stored blueprint identifier or 'none'>"
    }
  }
}
`
    },
    {
      step: 'outline',
      text: `
{
  "step": "outline_plan",
  "goal": "Produce and store the structural outline that will guide chunking.",
  "done_when": "A structure asset capturing ordered sections/subsections is stored and referenced in context.",
  "actions": [
    "Review the blueprint and user request to confirm required sections.",
    "Draft a concise JSON outline listing sections, subsections, and key notes.",
    "Store the outline via store_asset(kind='structure', keywords including the document name and type, content=<json>).",
    "Record structure metadata with set_context(['structure_keywords'], <keywords>) so the compose step can reference it."
  ],
  "completion_format": {
    "status": "outline_plan-complete",
    "next_step": "compose_html",
    "next_prompt": "Call get_instructions(rule_id=<rule_id>, step='compose') to stream the HTML content.",
    "handoff": {
      "outline_asset": "<structure asset reference>",
      "section_order": ["<section 1>", "<section 2>"]
    }
  }
}
`
    },
    {
      step: 'compose',
      text: `
{
  "step": "compose_html",
  "goal": "Write and stream the HTML content according to the outline and blueprint styles.",
  "done_when": "All sections are streamed via store_asset(kind='html') with eos on the final chunk.",
  "actions": [
    "Plan chunk groups using the stored outline; decide how many chunks each section requires.",
    "For each section, write HTML paragraphs, tables, and lists with deterministic IDs (generate them when absent).",
    "For large or complex HTML structures (sections, subsections, large tables, or cells), break them into manageable parts:",
    "  - Use make_id to generate a unique partid for each HTML part",
    "  - If the HTML part is larger than ~1000 tokens, break it into chunks:",
    "    * Call store_htmlpart(partid, docid, html, chunkIndex=0, eos=false) for the first chunk",
    "    * Call store_htmlpart(partid, docid, html, chunkIndex=1, eos=false) for subsequent chunks",
    "    * Call store_htmlpart(partid, docid, html, chunkIndex=N, eos=true) for the final chunk",
    "  - If the HTML part is under ~1000 tokens, store it in a single call:",
    "    * Call store_htmlpart(partid, docid, html, chunkIndex=0, eos=true)",
    "  - In the parent HTML, embed a reference comment: <!-- htmlpart:include id=\\"<partid>\\" mime=\\"text/html\\" scope=\\"section|subsection|table|cell\\" target=\\"<target-id>\\" required=\\"true\\" -->",
    "  - Example for a large table cell: <!-- htmlpart:include id=\\"a1b2c3\\" mime=\\"text/html\\" scope=\\"cell\\" target=\\"t-outer:r-12:c-2\\" required=\\"true\\" -->",
    "For the main document content, use store_asset(kind='html', chunkId=<id>, chunkIndex=<n>, eos=<bool>) with consistent chunkId and sequential chunkIndex.",
    "List the tool being used in control.allowed_tools before each call and set phase='action'."
  ],
  "completion_format": {
    "status": "compose_html-complete",
    "next_step": "finalize_history",
    "next_prompt": "Call get_instructions(rule_id=<rule_id>, step='finalize') to verify storage and record history.",
    "handoff": {
      "chunk_count": "<number of chunks streamed>",
      "last_chunk_id": "<chunkId used>",
      "htmlparts_stored": "<number of HTML parts stored>"
    }
  }
}
`
    },
    {
      step: 'finalize',
      text: `
{
  "step": "finalize_history",
  "goal": "Verify stored content and record completion details.",
  "done_when": "A history entry summarizing the document creation is stored and context is updated.",
  "actions": [
    "Optionally reload representative sections with load_asset or get_contentrange to confirm the stored output.",
    "Summarize blueprint usage, chunk statistics, and any outstanding follow-up tasks.",
    "Call store_history with the summary and update set_context(['last_action'], 'document created') plus any other relevant context."
  ],
  "completion_format": {
    "status": "finalize_history-complete",
    "next_step": null,
    "next_prompt": "Present the final summary to the user and offer follow-up options.",
    "handoff": {
      "history_entry": "<store_history payload>",
      "outstanding_questions": "<list or 'none'>"
    }
  }
}
`
    }
  ]
}