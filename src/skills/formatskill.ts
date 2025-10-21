import { SkillDef } from "../skilldef";

export const TEXT_PROPERTY_REFERENCE = `
Supported formatting properties (use \`prop\` names exactly as listed).

Character-level properties (map closely to Word font.* and CSS text attributes):
- \`fontFamily\` — font family name (e.g., "Times New Roman"); maps to Word font.name.
- \`fontSize\` — size in points (number or string like "12pt"); maps to Word font.size.
- \`color\` — text color in hex (e.g., "#1a1a1a"); maps to CSS color / Word font.color.
- \`backgroundColor\` — highlight color in hex or Word highlight names (e.g., "#ffff00" or "yellow"); maps to Word font.highlightColor.
- \`bold\` — true/false; maps to Word font.bold.
- \`italic\` — true/false; maps to Word font.italic.
- \`underline\` — one of "none", "single", "double", "dotted", "thick", etc.; maps to Word font.underline.
- \`strikethrough\` — true/false; maps to Word font.strikeThrough.
- \`doubleStrikethrough\` — true/false; maps to Word font.doubleStrikeThrough.
- \`allCaps\` — true/false; maps to Word font.allCaps.
- \`smallCaps\` — true/false; maps to Word font.smallCaps.
- \`superscript\` — true/false; maps to Word font.superscript.
- \`subscript\` — true/false; maps to Word font.subscript.
- \`shadow\` — true/false; maps to Word font.shadow.
- \`outline\` — true/false; maps to Word font.outline.
- \`emboss\` — true/false; maps to Word font.emboss.
- \`engrave\` — true/false; maps to Word font.engrav.
- \`spacing\` — tracking adjustment in points (number); maps to Word font.spacing.
- \`scaling\` — percentage scaling (number); maps to Word font.scaling.
- \`kerning\` — kerning size in points (number); maps to Word font.kerning.
- \`highlightPattern\` — Word-specific highlight pattern keywords when needed (e.g., "checkerboard").

Paragraph layout properties (map to Word paragraph.* / paragraphFormat and CSS block attributes):
- \`alignment\` — one of "left", "right", "center", "justify", "distribute"; maps to Word paragraph.alignment.
- \`indentLeft\` — left indent in points; maps to paragraph.leftIndent.
- \`indentRight\` — right indent in points; maps to paragraph.rightIndent.
- \`indentFirstLine\` — first-line indent in points (negative for hanging); maps to paragraph.firstLineIndent.
- \`spacingBefore\` — spacing before paragraph in points; maps to paragraph.spaceBefore.
- \`spacingAfter\` — spacing after paragraph in points; maps to paragraph.spaceAfter.
- \`lineSpacing\` — line spacing value (e.g., 1.0, 1.5, 2.0 or explicit points); maps to paragraph.lineSpacing.
- \`lineSpacingRule\` — choose "single", "1.5", "double", "multiple", "atLeast", "exactly"; maps to paragraph.lineSpacingRule.
- \`keepWithNext\` — true/false; keep paragraph with next.
- \`keepLinesTogether\` — true/false; prevent widows/orphans.
- \`pageBreakBefore\` — true/false; insert page break before paragraph.
- \`widowControl\` — true/false; enable widow/orphan control.
- \`outlineLevel\` — integer 0-9; maps to paragraph.outlineLevel.
- \`tabStops\` — array of { position: number, alignment: "left"|"center"|"right"|"decimal" }. 
- \`bidi\` — true/false; enable right-to-left paragraph order.
- \`numbering\` — object describing list configuration (e.g., { level: 0, style: "decimal", restart: true }).
`;

export const formatSkill: SkillDef = {
  name: "format_text",
  keywords: ['format text'],
  test_keywords: [
    'format text',
    'apply formatting',
    'change font',
    'make text bold',
    'highlight paragraph'
  ],
  text: `
**format text · two-step pipeline**

Goal: identify the exact range to format, then apply character-level formatting properties in a single, auditable call.

Represent the workflow with JSON step cards. Emit only the active card in envelope.metadata.step_card using:
{
  "step": "<current step>",
  "goal": "<target outcome>",
  "keywords": ["format text", "<step keyword>"],
  "done_when": "<exit condition>"
}

Pipeline order:
1. select_range — lock the specific paragraphs or cells that require formatting
2. apply_format — apply the requested formatting properties via the format_range tool

Execution rules:
- Start with the select_range step every time. Use the find_ranges tool to convert the user request into concrete start/end IDs.
- After emitting a step completion JSON, remain in phase="analysis" and immediately follow the provided next_prompt.
- The apply_format step must make exactly one call to format_range with properties expressed as an array of { "prop": "<name>", "value": <value> }.
- Only send phase="final" once apply_format finishes and there are no further next steps.
- Ask the user for clarification whenever the selection or desired style is ambiguous.
`,
  childSkill: [
    {
      step: "select_range",
      text: `
{
  "step": "select_range",
  "goal": "Identify the precise text range that requires formatting.",
  "done_when": "start_id and end_id for the target content are captured in context.",
  "actions": [
    "Ensure the document name is available via set_context(['document_name'], value) or get_context.",
    "Derive search keywords from the user request (topic, section name, distinctive phrases).",
    "Call find_ranges with { name: <document>, format: 'text', keywords: [...], context_lines: 2 } to locate candidate ranges.",
    "If multiple matches exist, summarize the options and ask the user to disambiguate before proceeding.",
    "Persist the resolved range via set_context(['selection'], '<range_id>: <start_id> <end_id>')."
  ],
  "completion_format": {
    "status": "select_range-complete",
    "next_step": "apply_format",
    "next_prompt": "Call get_skills({ \\"name\\": \\"format_text\\", \\"step\\": \\"apply_format\\" }) to map the desired styles into format_ranges properties.",
    "handoff": {
      "selection": "<start_id>:<end_id>",
      "keywords_used": ["<keyword1>", "<keyword2>"]
    }
  }
}
`
    },
    {
      step: "apply_format",
      text: applyFormatStep(`{
    "status": "apply_format-complete",
    "next_step": null,
    "next_prompt": "Summarize the formatting changes, confirm any exclusions, and close with phase=\\"final\\".",
    "handoff": {
      "applied_properties": [{"prop": "<prop>", "value": "<value>"}],
      "notes": "list unsupported instructions or 'none'"
    }
  }`
      )
    }
  ]
};

export function applyFormatStep(completionFormat: string): string {
  return `
{
  "step": "apply_format",
  "goal": "Apply the requested character formatting to the confirmed range.",
  "done_when": "format_range executes successfully with the desired {prop,value} pairs.",
  "actions": [
    "Re-evaluate the user's formatting request; map each change to a property from the supported list.",
    "When mapping CSS-like requests, use the same property names (e.g., color, backgroundColor, fontSize). For Word-specific styling, use the dedicated names (e.g., allCaps, smallCaps, superscript).",
    "Translate paragraph layout instructions (indentation, alignment, spacing, widows/orphans) into the paragraph-level properties listed in the reference and ensure they apply to the whole paragraph span.",
    "Construct the payload for format_range: { docid: <document_id>, ranges: [{ range_id: <range_id>, properties: [{ \\"prop\\": \\"color\\", \\"value\\": \\"#ff6600\\" }, ...] }] }.",
    "Send a brief phase='analysis' plan if needed, then issue a dedicated phase='action' envelope that lists only 'format_range' and calls it once.",
    "If any requested property is unsupported, explain the limitation, skip that property, and note it in the final summary.",
    "When the upcoming next_prompt instructs you to call store_history, issue that call in a dedicated phase='action' response that lists 'store_history' before delivering the final summary."
  ],
  "property_reference": ${JSON.stringify(TEXT_PROPERTY_REFERENCE)},
  "completion_format": ${completionFormat}
}
`;
}
