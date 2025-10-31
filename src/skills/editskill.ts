import { SkillDef } from "./skilldef";
import { applyFormatStep } from "./formatskill.js";
import { getToolDef } from "./tooldef.js";

const chunkHtml = `
 - For large or complex HTML structures (sections, subsections, large tables, or cells), break them into manageable parts:
 - Use make_id to generate a unique partid for each HTML part
  - If the HTML part is larger than ~1000 tokens, break it into chunks:
      * Call store_content(partid, docid, html, chunkIndex=0, eos=false) for the first chunk",
    - If the HTML part is under ~1000 tokens, store it in a single call:",
      * Call store_htmlpart(partid, docid, html, chunkIndex=0, eos=true)",
    - In the parent HTML, embed a reference comment: <!-- htmlpart:include id=\\\"<partid>\\\" scope=\\\"section|subsection|table|cell\\\" target=\\\"<target-id>\\\" required=\\\"true\\\" -->",
    - Example for a large table cell: <!-- htmlpart:include id=\\\"a1b2c3\\\" scope=\\\"cell\\\" target=\\\"t-outer:r-12:c-2\\\" required=\\\"true\\\" -->",
  For the main document content, use store_htmlpart(partid='0', docid, html, chunkIndex=<n>, eos=<bool>) with the docid retrieved from context and sequential chunkIndex.",
  `

export const editSkill: SkillDef =
{
  name: "edit_text",
  keywords: ['edit document', 'change text', 'modify content'],
  test_keywords: [
    'edit document',
    'modify text',
    'change paragraph',
    'update content',
    'rewrite section'
  ],
  spec: {
    tools: [
      getToolDef("get_skills"),
      getToolDef("get_contentrange"),
      getToolDef("find_ranges")
    ], ops: [{
      code: "next",
      target: "*"
    }]
  },
  text: `
**edit document · step pipeline**

IMPORTANT: Use this skill ONLY when the user explicitly requests text changes, content modifications, or rewrites. DO NOT use this skill for formatting-only requests (bold, color, font changes, etc.) - use format_text skill instead.

Represent editing as sequential JSON step cards. Emit only the active card in envelope.metadata.step_card using:
{
  "step": "<current step>",
  "goal": "<what this step accomplishes>",
  "keywords": ["edit document", "<step keyword>"],
  "done_when": "<exit condition>"
}

Pipeline order:
0. structure (optional) — gather document structure and styling context when needed
1. selection — lock the exact range to modify or confirm a previously produced selection
2a. insert_text — insert new content at the stored cursor/location when the user requests additions
2b. replace_text — locate and update existing ranges when content must change in place
3. apply_formatting — ensure formatting matches the blueprint or request

Execution rules:
- CRITICAL: Once a skill pipeline starts, you MUST complete ALL steps in order (structure? → selection → {insert_text | replace_text} → apply_formatting) before switching to any other skill. Do NOT call get_skills with a different skill name until this pipeline is fully complete.
- Skip the structure step when the necessary outline already exists in **ctx** or the prompt.
- For each step, call get_skills({ "name": "edit_text", "step": "<step_name>" }) to retrieve that step's JSON guidance. The response contains detailed actions plus a "completion_format" with the next step's prompt.
- Perform only the actions for the current step. When "done_when" is satisfied, emit the completion_format JSON in the envelope.
- IMMEDIATELY after emitting the completion JSON, execute the next_prompt instruction to proceed to the next step. Do NOT wait for user input between steps.
- Continue through all pipeline steps automatically until the final step completes or you need to pause for user input.
- If a step requires clarification or missing context, pause the pipeline, ask the user, and resume from the same step after the answer.
- Whenever a step requires tool usage, add each tool name (for example, "get_skills") to control.allowed_tools and set phase="action" for that response before making the call.
- Branching guidance:
  * Always treat **ctx.selection** as the authoritative last range or cursor. If the prompt references content produced in the immediately prior step (e.g., "rewrite the paragraph you just drafted") and no new target is supplied, reuse **ctx.selection**. Use get_contentrange with that selection to confirm the text, then continue directly to replace_text.
  * If the prompt describes replacing arbitrary document passages without a known selection, continue to replace_text. Attempt literal replacements with find_text first.


`,
  childSkill: [

    {
      name: 'selection',
      spec: {
        tools: [
          getToolDef("get_skills"),
          getToolDef("find_ranges")
        ],
        ops: [{
          code: "next",
          target: "*"
        }]
      },
      text: `
{
  "step": "selection",
  "goal": "Pinpoint the precise paragraphs or cells that must change and decide whether to insert new material or replace existing content.",
  "done_when": "start_id and end_id are resolved for the active selection, edit_mode ∈ {'insert_text','replace_text'} is set, and ctx.selection reflects that choice.",
  "actions": [
    "Read **ctx.selection** (passed in the call) before doing anything else; it contains the last confirmed range or cursor.",
    "If the user explicitly requests to insert or add new content (without replacing existing text), keep the selection empty (or convert a cursor to an empty range) and set edit_mode='insert_text'.",
    "If the prompt references work just produced or gives no explicit target, reuse **ctx.selection** and default to edit_mode='replace_text'. Confirm the range with get_contentrange so you understand what will change.",
    "When **ctx.selection** represents a single cursor (start_id=end_id with matching offsets) and the user says \"rewrite this\", expand the range to the containing paragraph before switching to replace_text.",
    "If the user requests a replacement and no range is supplied, run find_ranges with the exact phrase first; if no match, retry with regex patterns; if still missing, fall back to a semantic keyword search.",
    "When all find_ranges strategies fail and the document has not been loaded yet, read from the beginning with getContentRange to inspect the text manually.",
    "Ask the user for clarification instead of guessing when multiple matches exist."
  ],
  "completion_format": {
    "status": "selection-complete",
    "next_step": "<set to 'insert_text' when adding new content, otherwise 'replace_text'>",
    "next_prompt": "If next_step is 'insert_text', call get_skills({ \"name\": \"edit_text\", \"step\": \"insert_text\" }) to add the requested material; otherwise call get_skills({ \"name\": \"edit_text\", \"step\": \"replace_text\" }) to update the existing range.",
    "handoff": {
      "range": "<start_id>:<end_id>",
      "edit_mode": "<insert_text|replace_text>"
    }
  }
}
`
    },
    {
      name: 'insert_text',
      spec: {
        tools: [
          getToolDef("get_skills"),
          getToolDef("get_contentrange"),
          getToolDef("replace_contentrange"),
          getToolDef("make_id"),
        ],
        ops: [{
          code: "next",
          target: "*"
        }]
      },
      text: `
{
  "step": "insert_text",
  "goal": "Insert the requested content at the stored cursor or immediately after the selected range.",
  "done_when": "replace_contentrange completes for each chunk inserted at the selection end and context reflects the new content.",
  "actions": [
    "Confirm edit_mode=='insert_text' and read the active selection from context (this selection is treated as the insertion anchor).",
    "Use the end element/offset from the selection range as the starting point for insertion.",
    "Draft the new content. Split large additions (sections, tables, long lists) into manageable chunks.",
    "For each chunk, call replace_contentrange with start and end equal to the current anchor (use the last_id returned from the previous call as the new start).",
    ${chunkHtml}
  ],
  "completion_format": {
    "status": "insert_text-complete",
    "next_step": "apply_formatting",
    "next_prompt": "Call get_skills({ \"name\": \"edit_text\", \"step\": \"format\" }) to restore styling based on the blueprint and user guidance.",
    "handoff": {
      "updated_range": "<start_id>:<end_id>",
      "change_summary": "brief description of modifications"
    }
  }
}
`
    },
    {
      name: 'replace_text',
      spec: {
        tools: [
          getToolDef("find_ranges"),
          getToolDef("get_contentrange"),
          getToolDef("replace_contentrange")
        ],
        ops: [{
          code: "next",
          target: "*"
        }]
      },
      text: `
{
  "step": "replace_text",
  "goal": "Locate and update document regions when no prior selection exists.",
  "done_when": "All targeted ranges are updated via replace_contentrange and context notes the changes.",
  "actions": [
    "Confirm edit_mode=='replace_text' and read the active selection passed via handoff.range (or ctx.selection); this range defines the portion to rewrite.",
    "If handoff.range is missing, pause and return to the selection step or ask the user for clarification instead of guessing.",
    "Fetch the current content for the selected range with get_contentrange so the rewrite starts from the existing text.",
    "Chunk large blocks (sections, tables, long lists) before writing. Stream the updated content via replace_contentrange, seeding the first call with the selection's start/end ids and using the last_id returned from each call as the anchor for the next chunk.",
    "replace_contentrange returns the parent chain (e.g., body:section:table). Persist this ancestry in ctx (e.g., ctx.parents) so subsequent chunks resume precisely at the right container.",
  ],
  "completion_format": {
    "status": "replace_text-complete",
    "next_step": "apply_formatting",
    "next_prompt": "Call get_skills({ \"name\": \"edit_text\", \"step\": \"format\" }) to restore styling based on the blueprint and user guidance.",
    "handoff": {
      "updated_ranges": ["<range_id>:<start_id>:<end_id>"],
      "change_summary": "brief description of modifications"
    }
  }
}
`
    },
    {
      name: 'format',
      spec: {
        tools: [
          getToolDef("format_range")
        ],
        ops: [{
          code: "next",
          target: "*"
        }]
      },
      text: applyFormatStep(`{
    "status": "apply_formatting-complete",
    "next_step": null,
    "next_prompt": "Summarize the edits for the user.",
    "handoff": {
      "formatted_range": "<start_id>:<end_id>",
      "applied_properties": [{"prop": "<prop>", "value": "<value>"}],
      "notes": "list unsupported instructions or 'none'"
    }
  }`
      )
    }
  ]
}
