import { SkillDef } from "./skilldef";

const ChunkSegment = `
ATTENTION: When producing large markdown or html, NEVER write placeholders like "[continued]".
Instead, you MUST call the tool store_asset repeatedly using chunk encoding:
- Max 1000 tokens in content per call.
- Use the same "chunkId" for the whole document.
- Start with "chunkIndex = 0", then increment by 1 each call.
- Set eos on the last chunk.

`;

export const createBlueprintSkill: SkillDef =
{
  name: "create_blueprint",
  keywords: ['create blueprint'],
  test_keywords: [
    'create blueprint',
    'extract formatting',
    'analyze document style',
    'capture layout'
  ],
  text: `
**create blueprint · two-phase plan**

Goal: capture both the semantic map and the visual blueprint for the current document so it can be reused later.

Phase 1 — Semantic outline
1. Inspect the document (load snippets if needed) and identify the major sections, subsections, tables, and key entities.
2. For each block, record a concise descriptor and the paragraph span (use {startId:<id>, endId:<id>}).
3. Write the outline as Markdown (headings, bullet list, etc.) and store it via store_asset(kind="semantic", keywords=[document_name, "semantic"]).

Phase 2 — Layout blueprint
1. For every semantic block, note typography, spacing, alignment, list/numbering style, table structure, and any media placements.
2. Describe reusable patterns (“resume header table”, “two-column body”, etc.) and mention which document types they suit.
3. Stream the blueprint as Markdown or HTML using the chunk rules above, via store_asset(kind="blueprint", chunkId=N, keywords=[document_name, "blueprint", <layout summary>]).

Guidelines:
- Keep entries declarative and reusable (what the formatting is, not how to recreate each paragraph).
- Mention special cases (e.g., color accents, alternating row fills).
- Do NOT leave placeholders; always chunk with store_asset when the content exceeds the limit.

${ChunkSegment}
`
}

export const useBlueprintSkill: SkillDef =
{
  name: "use_blueprint",
  keywords: ['use blueprint'],
  test_keywords: [
    'use blueprint',
    'apply formatting',
    'apply style template',
    'format with blueprint'
  ],
  text: `
**use blueprint · execution checklist**

Use this skill only when the user wants to change document-wide style, layout, or apply a saved template—not for isolated word/phrase formatting.

1. Interpret the user’s styling intent. Combine prompt cues and existing context to derive keywords (document type, tone, color scheme, layout hints).
2. Call load_asset(kind="blueprint", keywords=<derived keywords>). If nothing matches, report the miss and stop.
3. Review the returned blueprint. If adjustments are required, revise the Markdown/HTML and persist it with store_asset(kind="blueprint", keywords=<same set>) using chunking rules.
4. Apply the blueprint:
   - Generate or update the document draft as HTML, respecting blueprint directives (ids, sections, table structures).
   - Store the rendered HTML via store_asset(kind="html", chunkId, chunkIndex, eos) in 1000-token chunks.

Notes:
- Never guess at formatting beyond what the blueprint specifies; ask the user for clarification if the style is incomplete.
- Reuse existing blueprint terms so future lookups succeed.
`
}
