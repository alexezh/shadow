import { SkillDef } from "./skilldef";

export const rewriteSkill: SkillDef = {
  name: "rewrite_recent_change",
  keywords: ['rewrite recent change'],
  test_keywords: [
    'adjust what you just changed',
    'tweak the last update',
    'rewrite the revised paragraph',
    'soften the change you made',
    'undo parts of the latest edit'
  ],
  text: `
**rewrite recent change · focused pipeline**

Use this skill when the user wants to adjust or rethink a change that was just made—whether it came from an earlier LLM response or from manual edits tracked in context/history. Skip broad document analysis (no structure step).

Represent the workflow as sequential JSON step cards. Emit only the active card in envelope.metadata.step_card:
{
  "step": "<current step>",
  "goal": "<target outcome>",
  "keywords": ["rewrite recent change", "<step keyword>"],
  "done_when": "<exit condition>"
}

Pipeline order:
1. confirm_range — locate the exact text span that was recently modified
2. rewrite_text — produce the requested rewrite within that range
3. finalize_rewrite — confirm the update and capture follow-up notes

Execution rules:
- Anchor the rewrite to the most recent change. Prefer existing context (selection, last_action) or the latest stored history entry before searching wider.
- After emitting a step completion JSON, remain in phase="analysis" and immediately follow the provided next_prompt until the pipeline ends.
- Use tools sparingly: read only the necessary range, rewrite it, then restream the updated content with consistent IDs.
- Only send phase="final" after finalize_rewrite sets next_step to null.
`,
  childSkill: [
    {
      name: "confirm_range",
      text: `
{
  "step": "confirm_range",
  "goal": "Lock the exact range that needs to be rewritten based on the most recent change.",
  "done_when": "start_id and end_id are stored in context for the rewrite.",
  "actions": [
    "Check get_context(['selection']) and get_context(['last_action']) for the previous edit range.",
    "If not available, inspect load_history({ limit: 5 }) to identify the latest stored edit and recover its range metadata.",
    "When no history indicates a range, ask the user to specify which portion to revisit and resolve it with find_ranges if needed.",
    "Persist the resolved span via set_context(['selection'], '<start_id>:<end_id>')."
  ],
  "completion_format": {
    "status": "confirm_range-complete",
    "next_step": "rewrite_text",
    "next_prompt": "Call get_skills({ \\"name\\": \\"rewrite_recent_change\\", \\"step\\": \\"rewrite_text\\" }) to draft the replacement passage.",
    "handoff": {
      "selection": "<start_id>:<end_id>",
      "source": "where the range came from (context, history, user input)"
    }
  }
}
`
    },
    {
      name: "rewrite_text",
      text: `
{
  "step": "rewrite_text",
  "goal": "Produce the new wording for the confirmed range while honoring the user's adjustments.",
  "done_when": "Updated HTML for the range is stored and captures the requested tone or corrections.",
  "actions": [
    "Retrieve the active content with get_contentrange(name, 'html', start_id, end_id) to reference the latest text.",
    "Draft the replacement passage incorporating the user's instructions (e.g., tone shifts, emphasis changes, removals).",
    "Stream the rewrite via store_asset(kind='html', scope='paragraph' or 'cell') with consistent chunkId/chunkIndex/eos, preserving existing IDs.",
    "Update set_context(['last_action'], 'rewrite applied') to note the adjustment."
  ],
  "completion_format": {
    "status": "rewrite_text-complete",
    "next_step": "finalize_rewrite",
    "next_prompt": "Call get_skills({ \\"name\\": \\"rewrite_recent_change\\", \\"step\\": \\"finalize_rewrite\\" }) to confirm the rewrite and share the summary.",
    "handoff": {
      "updated_range": "<start_id>:<end_id>",
      "rewrite_summary": "short description of the new wording"
    }
  }
}
`
    },
    {
      name: "finalize_rewrite",
      text: `
{
  "step": "finalize_rewrite",
  "goal": "Confirm the rewrite, capture any follow-up tasks, and close the workflow.",
  "done_when": "Summary is prepared, history/context are updated, and no further rewrite steps remain.",
  "actions": [
    "Restate what changed and why (tone shift, length change, emphasis).",
  ],
  "completion_format": {
    "status": "finalize_rewrite-complete",
    "next_step": null,
    "next_prompt": "Present the summary to the user in phase=\\"final\\" and note any follow-up suggestions.",
    "handoff": {
      "follow_up": "list of outstanding considerations or 'none'"
    }
  }
}
`
    }
  ]
};
