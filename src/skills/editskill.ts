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
1. selection — lock the exact range to modify or confirm a previously produced selection
2a. revise_text — rewrite the confirmed selection using replaceContentRange
2b. replace_text — locate and update new ranges when no selection exists
3. apply_formatting — ensure formatting matches the blueprint or request

Execution rules:
- CRITICAL: Once a skill pipeline starts, you MUST complete ALL steps in order (selection → {revise_text | replace_text} → apply_formatting) before switching to any other skill. Do NOT call get_skills with a different skill name until this pipeline is fully complete.
- For each step, call get_skills({ "name": "edit_text", "step": "<step_name>" }) to retrieve that step's JSON guidance. The response contains detailed actions plus a "completion_format" with the next step's prompt.
- Perform only the actions for the current step. When "done_when" is satisfied, emit the completion_format JSON in the envelope.
- IMMEDIATELY after emitting the completion JSON, execute the next_prompt instruction to proceed to the next step. Do NOT wait for user input between steps.
- Continue through all pipeline steps automatically until the final step completes or you need to pause for user input.
- If a step requires clarification or missing context, pause the pipeline, ask the user, and resume from the same step after the answer.
- Whenever a step requires tool usage, add each tool name (for example, "get_skills") to control.allowed_tools and set phase="action" for that response before making the call.
- Branching guidance:
  * Always treat **ctx.selection** as the authoritative last range or cursor. If the prompt references content produced in the immediately prior step (e.g., "rewrite the paragraph you just drafted") and no new target is supplied, reuse **ctx.selection**. Use getContentRange with that selection to confirm the text, then continue directly to revise_text.
  * If the prompt describes replacing arbitrary document passages without a known selection, continue to replace_text. Attempt literal replacements with find_text first.


`,
  childSkill: [

    {
      name: 'selection',
      spec: {
        tools: [
          getToolDef("get_contentrange"),
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
  "goal": "Pinpoint the precise paragraphs or cells that must change and decide whether to rewrite the existing selection or locate a new range.",
  "done_when": "start_id and end_id are resolved for the active selection, edit_mode ∈ {'revise_text','replace_text'} is set, and ctx.selection reflects that choice.",
  "actions": [
    "Read **ctx.selection** (passed in the call) before doing anything else; it contains the last confirmed range or cursor.",
    "If the prompt references work just produced or gives no explicit target, reuse **ctx.selection**. Confirm the range with getContentRange and set edit_mode='revise_text'.",
    "When **ctx.selection** represents a single cursor (start_id=end_id with matching offsets) and the user says \"rewrite this\", expand the range to the containing paragraph before rewriting.",
    "If the user requests a replacement, run find_ranges with the exact phrase first; if no match, retry with regex patterns; if still missing, fall back to a semantic keyword search.",
    "When all find_ranges strategies fail and the document has not been loaded yet, read from the beginning with getContentRange to inspect the text manually.",
    "Ask the user for clarification instead of guessing when multiple matches exist."
  ],
  "completion_format": {
    "status": "selection-complete",
    "next_step": "<set to 'revise_text' when reuse applies, otherwise 'replace_text'>",
    "next_prompt": "If next_step is 'revise_text', call get_skills({ \"name\": \"edit_text\", \"step\": \"revise\" }) to rewrite the confirmed selection; otherwise call get_skills({ \"name\": \"edit_text\", \"step\": \"replace_text\" }) to locate and update new ranges.",
    "handoff": {
      "range": "<start_id>:<end_id>",
      "edit_mode": "<revise_text|replace_text>"
    }
  }
}
`
    },
    {
      name: 'revise',
      spec: {
        tools: [
          getToolDef("get_contentrange"),
          getToolDef("replace_contentrange"),
          getToolDef("make_id"),
          getToolDef("store_htmlpart")
        ],
        ops: [{
          code: "next",
          target: "*"
        }]
      },
      text: `
{
  "step": "revise_text",
  "goal": "Rewrite the previously selected content produced in the earlier step.",
  "done_when": "replace-contentrange completes for the stored selection and the updated range is reflected in context.",
  "actions": [
    "Confirm edit_mode=='revise_text' and read the active selection from context.",
    "Call get_contentrange with that selection to capture the current text for reference.",
    "Draft the replacement content, preserving inline IDs and anchors when possible.",
    "Invoke replace-contentrange({ range: selection, content: <updated html/text> }) to overwrite the selection in a single call.",
    ${chunkHtml}
  ],
  "completion_format": {
    "status": "revise_text-complete",
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
  "done_when": "All targeted ranges are updated via replaceContentRange or updateContentRange and context notes the changes.",
  "actions": [
    "Confirm edit_mode=='replace_text' and capture user intents/phrases from the prompt.",
    "Attempt literal replacements first by calling find_text with each quoted or clearly delimited phrase; when a match is unique, call replaceContentRange for that range.",
    "If literal replacement fails, use semantic keyword search to find the relevant sections.",
    "For each matched region, fetch content with getContentRange and chunk large blocks (sections, tables, long lists) before storing. Write each chunk incrementally via replace_contentrange, using the last_id returned from the previous call as the new start anchor.",
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
    "allowed_tools": ["format_range"],
    "next_step": null,
    "next_prompt": "Summarize the edits for the user and record history with store_history.",
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
