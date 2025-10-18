import OpenAI from "openai";
import { youAreShadow } from "./chatprompt.js";
import { Database } from "./database.js";
import { generateEmbedding, OpenAIClient } from "./openai-client.js";
import { TrainedModel, Literal, Rule, RuleSet, TrainingExamples, Example, trainRuleReliabilities, predictLabel, forwardPass } from "./rulemodel.js";

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
export const CORE_RULES = [
  {
    keywords: ['edit document', 'format document'],
    text: `
**edit document · step pipeline**

Represent editing as sequential JSON step cards. Emit only the active card in envelope.metadata.step_card using:
{
  "step": "<current step>",
  "goal": "<what this step accomplishes>",
  "keywords": ["edit document", "<step keyword>"],
  "done_when": "<exit condition>"
}

Pipeline order:
1. structure — gather document structure and styling context
2. selection — lock the exact range to modify
3. revise_text — apply the textual edits
4. apply_formatting — ensure formatting matches the blueprint or request

Execution rules:
- For each step, immediately call get_instructions with the step keywords. The response is JSON containing detailed actions plus a "completion_format" with the next step's prompt.
- Perform only the actions for the current step. When "done_when" is satisfied, respond using the JSON specified in "completion_format", including the embedded "next_prompt".
- Advance to the next step only after emitting that completion JSON. Clear the step card when the final step completes.
- If a step requires clarification or missing context, pause the pipeline, ask the user, and resume from the same step after the answer.
- Whenever a step requires tool usage, add each tool name (for example, "get_instructions") to control.allowed_tools and set phase="action" for that response before making the call.


`
  },
  {
    keywords: ['edit document', 'structure step'],
    text: `
{
  "step": "structure",
  "goal": "Cache the document structure and capture blueprint metadata before any edits.",
  "done_when": "A structure asset exists (loaded or newly stored) and blueprint availability is noted in context.",
  "actions": [
    "Ensure the document name is available via set_context(['document_name'], value) or retrieve it with get_context.",
    "Attempt load_asset(kind='structure', keywords=[document_name, 'structure']).",
    "If missing, read the document with get_contentrange in manageable chunks to map sections and subsections without reordering paragraphs.",
    "Build JSON describing contiguous paragraph ranges with levels (1-3) and titles (3-7 word noun phrases).",
    "Store the structure with store_asset(kind='structure', keywords=[document_name, 'structure'], content=<json>).",
    "Load any existing blueprint via load_asset(kind='blueprint') using known styling keywords; if absent, note that formatting will revert to defaults later."
  ],
  "completion_format": {
    "status": "structure-complete",
    "next_step": "selection",
    "next_prompt": "Call get_instructions(['edit document', 'selection step']) to lock the exact range for editing.",
    "handoff": {
      "structure_keywords": ["<document_name>", "structure"],
      "blueprint_status": "record whether a blueprint was found"
    }
  }
}
`
  },
  {
    keywords: ['edit document', 'selection step'],
    text: `
{
  "step": "selection",
  "goal": "Pinpoint the precise paragraphs or cells that must change.",
  "done_when": "start_id and end_id are stored in context as the active selection.",
  "actions": [
    "Check get_context(['selection']) for an existing range.",
    "If the user describes new text, gather synonyms and call find_ranges(name, format, keywords) with useful context_lines.",
    "Map structure titles to paragraph IDs when references come from the cached structure.",
    "Persist the resolved range via set_context(['selection'], '<start_id>:<end_id>').",
    "Ask the user for clarification instead of guessing when multiple matches exist."
  ],
  "completion_format": {
    "status": "selection-complete",
    "next_step": "revise_text",
    "next_prompt": "Call get_instructions(['edit document', 'revise step']) to plan the textual change for the selected range.",
    "handoff": {
      "range": "<start_id>:<end_id>",
      "notes": "summarize why this range was chosen"
    }
  }
}
`
  },
  {
    keywords: ['edit document', 'revise step'],
    text: `
{
  "step": "revise_text",
  "goal": "Apply the requested textual update within the confirmed range.",
  "done_when": "Updated HTML for the range is stored via store_asset and context reflects the change.",
  "actions": [
    "Read the active range with get_contentrange(name, format, start_para, end_para).",
    "Draft replacement HTML that preserves paragraph or cell IDs (e.g., {#p-123}).",
    "Stream updates through store_asset(kind='html') with scope='paragraph' or 'cell', consistent chunkId/chunkIndex/eos, and relevant keywords (document name, section, intent).",
    "Update set_context(['last_action'], summary) and refresh set_context(['selection']) to describe the post-edit range."
  ],
  "completion_format": {
    "status": "revise_text-complete",
    "next_step": "apply_formatting",
    "next_prompt": "Call get_instructions(['edit document', 'format step']) to restore styling based on the blueprint and user guidance.",
    "handoff": {
      "updated_range": "<start_id>:<end_id>",
      "change_summary": "brief description of modifications"
    }
  }
}
`
  },
  {
    keywords: ['edit document', 'format step'],
    text: `
{
  "step": "apply_formatting",
  "goal": "Ensure the revised content conforms to blueprint or requested styling.",
  "done_when": "Formatting matches expectations or the blueprint is updated to capture new styling rules.",
  "actions": [
    "Load the relevant blueprint with load_asset(kind='blueprint') using styling keywords gathered earlier.",
    "Compare revised paragraphs to blueprint directives; adjust classes, inline styles, or annotations as needed.",
    "If new styling rules emerge, update the blueprint and persist it with store_asset(kind='blueprint') using the same keywords.",
    "Restream any formatting tweaks via store_asset(kind='html') if adjustments were required.",
    "Log completion via set_context(['last_action'], 'applied formatting')."
  ],
  "completion_format": {
    "status": "apply_formatting-complete",
    "next_step": null,
    "next_prompt": "Summarize the edits for the user and record history with store_history.",
    "handoff": {
      "formatted_range": "<start_id>:<end_id>",
      "blueprint_changes": "list of blueprint updates or 'none'"
    }
  }
}
`
  },
  {
    keywords: ['create document', 'blueprint step'],
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
    "next_prompt": "Call get_instructions(['create document', 'outline step']) to create and store the section plan.",
    "handoff": {
      "document_keywords": ["<keyword1>", "<keyword2>"],
      "blueprint_reference": "<stored blueprint identifier or 'none'>"
    }
  }
}
`
  },
  {
    keywords: ['create document', 'outline step'],
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
    "next_prompt": "Call get_instructions(['create document', 'compose step']) to stream the HTML content.",
    "handoff": {
      "outline_asset": "<structure asset reference>",
      "section_order": ["<section 1>", "<section 2>"]
    }
  }
}
`
  },
  {
    keywords: ['create document', 'compose step'],
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
    "  - Store each part separately using store_htmlpart(partid, docid, html)",
    "  - In the parent HTML, embed a reference comment: <!-- htmlpart:include id=\\"<partid>\\" mime=\\"text/html\\" scope=\\"section|subsection|table|cell\\" target=\\"<target-id>\\" required=\\"true\\" -->",
    "  - Example for a large table cell: <!-- htmlpart:include id=\\"a1b2c3\\" mime=\\"text/html\\" scope=\\"cell\\" target=\\"t-outer:r-12:c-2\\" required=\\"true\\" -->",
    "For each chunk, call store_asset(kind='html', chunkId=<id>, chunkIndex=<n>, eos=<bool>, scope set to the appropriate unit, and keywords referencing the document name and section).",
    "Keep each chunk under ~1000 tokens, maintain a consistent chunkId, and increment chunkIndex sequentially.",
    "List the tool being used in control.allowed_tools before each call and set phase='action'."
  ],
  "completion_format": {
    "status": "compose_html-complete",
    "next_step": "finalize_history",
    "next_prompt": "Call get_instructions(['create document', 'finalize step']) to verify storage and record history.",
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
    keywords: ['create document', 'finalize step'],
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
  },
  // todo: load summaries of X last documents
  // - store HTML version using store_asset(kind: "html") API
  // - create an HTML version of the document only after the markdown draft is ready. apply blueprint formatting when one was successfully loaded.
  {
    keywords: ['create document'],
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
- Start each step by calling get_instructions with ["create document", "<step keyword>"]; the response contains JSON guidance and a completion_format for the next step.
- Perform only the actions listed for the active step. Once done_when is satisfied, respond using the completion_format JSON (including next_prompt) before moving on.
- Advance to the next step only after emitting the completion JSON. Clear the step card when finalize_history completes.
- Always list the tool names you invoke in control.allowed_tools and set phase="action" while executing tool calls.
- Pause and ask the user when additional context is required before continuing.

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