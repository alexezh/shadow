import { SkillDef } from "./skilldef";
import { applyFormatStep } from "./formatskill.js";

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
  text: `
**edit document · step pipeline**

IMPORTANT: Use this skill ONLY when the user explicitly requests text changes, content modifications, or rewrites. Do NOT use this skill for formatting-only requests (bold, color, font changes, etc.) - use format_text skill instead.

Represent editing as sequential JSON step cards. Emit only the active card in envelope.metadata.step_card using:
{
  "step": "<current step>",
  "goal": "<what this step accomplishes>",
  "keywords": ["edit document", "<step keyword>"],
  "done_when": "<exit condition>"
}

Pipeline order:
1. structure — gather document structure and styling context
2. selection — lock the exact range to modify or confirm a previously produced selection
3a. revise_text — rewrite the confirmed selection using replaceContentRange
3b. replace_text — locate and update new ranges when no selection exists
4. apply_formatting — ensure formatting matches the blueprint or request

Execution rules:
- CRITICAL: Once a skill pipeline starts, you MUST complete ALL steps in order (structure → selection → {revise_text | replace_text} → apply_formatting) before switching to any other skill. Do NOT call get_skills with a different skill name until this pipeline is fully complete.
- For each step, call get_skills({ "name": "edit_text", "step": "<step_name>" }) to retrieve that step's JSON guidance. The response contains detailed actions plus a "completion_format" with the next step's prompt.
- Perform only the actions for the current step. When "done_when" is satisfied, emit the completion_format JSON in the envelope.
- IMMEDIATELY after emitting the completion JSON, execute the next_prompt instruction to proceed to the next step. Do NOT wait for user input between steps.
- Continue through all pipeline steps automatically until the final step completes or you need to pause for user input.
- If a step requires clarification or missing context, pause the pipeline, ask the user, and resume from the same step after the answer.
- Whenever a step requires tool usage, add each tool name (for example, "get_skills") to control.allowed_tools and set phase="action" for that response before making the call.
- Branching guidance:
  * If the prompt references content produced in the immediately prior step (e.g., "rewrite the paragraph you just drafted"), assume the active selection is valid. Use getContentRange with that selection to confirm the text, then continue directly to revise_text.
  * If the prompt describes replacing arbitrary document passages without a known selection, continue to replace_text. Attempt literal replacements with find_text first; escalate to structure-aware editing only when section-level semantics are required.


`,
  childSkill: [
    {
      step: "structure",
      text: `
{
  "step": "structure",
  "goal": "Cache the document structure and capture blueprint metadata before any edits.",
  "done_when": "A structure asset exists (loaded or newly stored) and blueprint availability is noted in context.",
  "actions": [
    "Ensure the document name is available via set_context(['document_name'], value) or retrieve it with get_context.",
    "Attempt load_asset(kind='structure', keywords=[document_name, 'structure']).",
    "If missing, read the document with getContentRange in manageable chunks to map sections and subsections without reordering paragraphs.",
    "Build JSON describing contiguous paragraph ranges with levels (1-3) and titles (3-7 word noun phrases).",
    "Store the structure with store_asset(kind='structure', keywords=[document_name, 'structure'], content=<json>).",
    "Load any existing blueprint via load_asset(kind='blueprint') using known styling keywords; if absent, note that formatting will revert to defaults later."
  ],
  "completion_format": {
    "status": "structure-complete",
    "next_step": "selection",
    "next_prompt": "Call get_skills({ \"name\": \"edit_text\", \"step\": \"selection\" }) to lock the exact range for editing.",
    "handoff": {
      "structure_keywords": ["<document_name>", "structure"],
      "blueprint_status": "record whether a blueprint was found"
    }
  }
}
`
    },
    {
      step: 'selection',
      text: `
{
  "step": "selection",
  "goal": "Pinpoint the precise paragraphs or cells that must change and decide whether to rewrite the existing selection or locate a new range.",
  "done_when": "start_id and end_id are stored in context as the active selection together with edit_mode ∈ {'revise_text','replace_text'}.",
  "actions": [
    "Check get_context(['selection']) for an existing range.",
    "If the prompt references content produced in the previous step, reuse the stored selection, confirm it with getContentRange, and set edit_mode='revise_text'.",
    "If the user requests a replacement, run find_ranges with the exact phrase first; if no match, retry with regex patterns; if still missing, fall back to a semantic keyword search.",
    "Map structure titles to paragraph IDs when references come from the cached structure.",
    "When all find_ranges strategies fail and the document has not been loaded yet, read from the beginning with getContentRange to inspect the text manually.",
    "Persist the resolved range via set_context(['selection'], '<range_id>: <start_id> <end_id>') and set edit_mode via set_context(['edit_mode'], '<revise_text|replace_text>').",
    "Ask the user for clarification instead of guessing when multiple matches exist."
  ],
  "completion_format": {
    "status": "selection-complete",
    "next_step": "<set to 'revise_text' when reuse applies, otherwise 'replace_text'>",
    "next_prompt": "If next_step is 'revise_text', call get_skills({ \"name\": \"edit_text\", \"step\": \"revise\" }) to rewrite the confirmed selection; otherwise call get_skills({ \"name\": \"edit_text\", \"step\": \"replace_text\" }) to locate and update new ranges.",
    "handoff": {
      "range": "<start_id>:<end_id>",
      "edit_mode": "<revise_text|replace_text>",
      "notes": "summarize why this range was chosen and the intended branch"
    }
  }
}
`
    },
    {
      step: 'revise',
      text: `
{
  "step": "revise_text",
  "goal": "Rewrite the previously selected content produced in the earlier step.",
  "done_when": "replaceContentRange completes for the stored selection and the updated range is reflected in context.",
  "actions": [
    "Confirm edit_mode=='revise_text' and read the active selection from context.",
    "Call getContentRange with that selection to capture the current text for reference.",
    "Draft the replacement content, preserving inline IDs and anchors when possible.",
    "Invoke replaceContentRange({ range: selection, content: <updated html/text> }) to overwrite the selection in a single call.",
    "Update set_context(['last_action'], summary) and refresh set_context(['selection']) to describe the post-edit range."
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
      step: 'replace_text',
      text: `
{
  "step": "replace_text",
  "goal": "Locate and update document regions when no prior selection exists.",
  "done_when": "All targeted ranges are updated via replaceContentRange or updateContentRange and context notes the changes.",
  "actions": [
    "Confirm edit_mode=='replace_text' and capture user intents/phrases from the prompt.",
    "Attempt literal replacements first by calling find_text with each quoted or clearly delimited phrase; when a match is unique, call replaceContentRange for that range.",
    "If the request requires semantic understanding (e.g., \\"update the risk section\\") and the user-provided excerpt exceeds 10000 characters, attempt get_asset('structure') to load the cached outline.",
    "When no structure asset is available, pause and return to the structure step to build it before continuing.",
    "Once structure data exists, map the described sections to paragraph or cell IDs, fetch them with getContentRange, and apply updates with updateContentRange while preserving IDs.",
    "Record updated ranges via set_context(['selection']) and summarize the adjustments in set_context(['last_action'])."
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
      step: 'format',
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
