import { RuleDef } from "./ruledef";

export const editRule: RuleDef =
{
  name: "edit_text",
  keywords: ['edit document', 'format document'],
  test_keywords: [
    'edit document',
    'modify text',
    'change paragraph',
    'update content',
    'format document'
  ],
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
- First, call get_instructions with keywords ["edit document"] to get the rule_id for this pipeline.
- For each step, call get_instructions(rule_id=<id>, step=<step_name>) to retrieve that step's JSON guidance. The response contains detailed actions plus a "completion_format" with the next step's prompt.
- Perform only the actions for the current step. When "done_when" is satisfied, respond using the JSON specified in "completion_format", including the embedded "next_prompt".
- Advance to the next step only after emitting that completion JSON. Clear the step card when the final step completes.
- If a step requires clarification or missing context, pause the pipeline, ask the user, and resume from the same step after the answer.
- Whenever a step requires tool usage, add each tool name (for example, "get_instructions") to control.allowed_tools and set phase="action" for that response before making the call.


`,
  childRules: [
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
    "If missing, read the document with get_contentrange in manageable chunks to map sections and subsections without reordering paragraphs.",
    "Build JSON describing contiguous paragraph ranges with levels (1-3) and titles (3-7 word noun phrases).",
    "Store the structure with store_asset(kind='structure', keywords=[document_name, 'structure'], content=<json>).",
    "Load any existing blueprint via load_asset(kind='blueprint') using known styling keywords; if absent, note that formatting will revert to defaults later."
  ],
  "completion_format": {
    "status": "structure-complete",
    "next_step": "selection",
    "next_prompt": "Call get_instructions(rule_id=<rule_id>, step='selection') to lock the exact range for editing.",
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
    "next_prompt": "Call get_instructions(rule_id=<rule_id>, step='revise') to plan the textual change for the selected range.",
    "handoff": {
      "range": "<start_id>:<end_id>",
      "notes": "summarize why this range was chosen"
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
    "next_prompt": "Call get_instructions(rule_id=<rule_id>, step='format') to restore styling based on the blueprint and user guidance.",
    "handoff": {
      "updated_range": "<start_id>:<end_id>",
      "change_summary": "brief description of modifications"
    }
  }
}
`
    },
    {
      step: 'format',
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
    }
  ]
}
