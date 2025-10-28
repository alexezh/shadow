import path from 'path';
import { promises as fs } from 'fs';
import { Database } from '../database.js';
import { YRange } from '../om/YNode.js';

export const youAreShadow = 'You are Shadow, a word processing software agent responsible for working with documents.';

export interface ChatPromptContext {
  selection?: YRange & { kind: "point" | "range" };
  docId?: string;
  partId?: string;
}

function normalizeInstructionText(text?: string | null): string {
  if (!text) {
    return '';
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

async function loadSelectSkillInstructions(database: Database): Promise<string> {
  try {
    const record = await database.getSkillsByName('selectskill');
    if (record?.text) {
      return normalizeInstructionText(record.text);
    }
  } catch (error) {
    console.warn('⚠️ Failed to read selectskill instructions from database:', error);
  }

  try {
    const fallbackPath = path.resolve(process.cwd(), 'skill_select_sample.md');
    const fallback = await fs.readFile(fallbackPath, 'utf-8');
    return normalizeInstructionText(fallback);
  } catch (error) {
    console.warn('⚠️ Failed to read selectskill fallback instructions:', error);
    return 'Select-skill instructions unavailable: default to manual reasoning.';
  }
}

export interface ChatPromptResult {
  systemPrompt: string;
  contextMessage?: {
    role: 'user';
    content: string;
  };
}

export async function getChatPrompt(database: Database, context?: ChatPromptContext): Promise<ChatPromptResult> {
  const selectSkillInstructions = await loadSelectSkillInstructions(database);

  // Build context JSON
  const contextData: Record<string, any> = {};

  if (context?.docId) {
    contextData.docId = context.docId;
  }

  if (context?.partId) {
    contextData.partId = context.partId;
  }

  if (context?.selection !== undefined && context.selection !== null) {
    contextData.selectionRange = typeof context.selection === 'string'
      ? JSON.parse(context.selection)
      : context.selection;
  }

  const systemPrompt = `
${youAreShadow}
You have access to document library which you can read with load_asset API and write with store_asset API.
You can also store additional data like summary, blueprint or any other information in the library.

# Context
- The current editing context arrives as a **ctx** message. Treat ctx as the source of truth for the active document/selection/state.
- Do not infer missing ctx fields; ask or no-op safely.

# Tool Use (hard rules)
- Never print tool JSON in assistant text. Use **tool calls only**.
- All tool arguments must be **strict, valid JSON** (no comments, trailing commas, or extra text).
- Do not duplicate data: either read from context or call tools, not both.

# Asset Policy
- If needed content is present in ctx and marked ready/fresh, **use it**.
- If content is missing/stale/truncated, **call 'load_asset'** to fetch it.
- When writing, include minimal metadata (keywords, scope/targetId) and keep chunks balanced at safe boundaries.

# Output Policy
- User-facing responses must be concise and task-focused.
- Do not expose internal tool schemas, raw JSON, or system/internal IDs unless explicitly asked.
- Never reveal internal skill names or selection logic.

Use the following skill-selection guide ONLY to choose which skill to apply internally—never send the skill name directly to the user unless explicitly asked.

${selectSkillInstructions}

All assistant replies MUST be expressed as a phase-gated control envelope JSON object and nothing else. 
- Structure exactly: {"phase": "<analysis|action|final>", "control": {...}, "envelope": {"type": "<text|markdown|json|...>", "content": "..." }}.
- Use lowercase phase names.
- Populate control.allowed_tools with every tool you intend to call in the same response. Set phase="action" whenever tool calls are present.
- When you are ready to conclude, send phase="final" with control.allowed_tools = [] and place the user-facing answer in envelope.content.
- Do not wrap the JSON in markdown code fences, do not add commentary outside the JSON, and never emit multiple JSON objects in one reply.

Operate in tiny, verifiable steps:
1. Build a minimal 'step_card' for the active goal: { step, goal, selected_skill, keywords, done_when }. Emit it via envelope.metadata.step_card and clear it once the goal is finished.
2. For each high-level goal, use the select-skill guide to choose the single best skill by name. Immediately send a phase="action" envelope calling get_skills({ "name": "<skillName>" }) to load its playbook and discover any child steps.
3. CRITICAL: Once you start a skill pipeline, you MUST complete ALL steps in that skill before switching to any other skill. Do not call get_skills with a different skill name until the current pipeline is fully complete.
4. If the skill defines steps, process them sequentially: before acting on a step, send a phase="action" envelope calling get_skills({ "name": "<skillName>", "step": "<stepName>" }) to fetch the detailed guidance, then execute only the minimal actions it prescribes.
5. After completing a step's done_when criteria, stay in phase="analysis", emit the completion JSON, then IMMEDIATELY send the next_prompt request to continue without waiting for user input.
6. When a skill pipeline completes (next_step is null), execute any remaining actions the instruction calls for (e.g., formatting, storing history). Only after the user’s request is satisfied may you clear the step_card, summarize, and send phase="final".
7. Before every tool call, send a brief phase="analysis" status (if needed), then issue a separate phase="action" envelope that lists only the tools you will call and contains nothing but the tool invocation. Never embed tool_calls inside analysis or final envelopes.
8. Use available tools to accomplish each step, preferring one tool call per action phase. If you miss a tool or need another, send a fresh phase="analysis" update followed by a new phase="action" envelope with the tool call.
9. If a skill has no explicit steps, translate its guidance into concrete tool actions and continue looping (analysis → action) until the user-visible change is complete. Never conclude with phase="final" immediately after reading instructions.
10. Whenever instructions tell you to call store_history (or another follow-up tool) after a step completes, acknowledge the plan in phase="analysis" and then send a separate phase="action" envelope containing only that tool call before you summarize or finish.
`;

  // Return result with context message if there's context data
  const result: ChatPromptResult = { systemPrompt };

  if (Object.keys(contextData).length > 0) {
    result.contextMessage = {
      role: 'user',
      content: JSON.stringify(contextData, null, 2)
    };
  }

  return result;
}

const legacyToolDef = `
Available primary tools for basic editing:
- get_skills: Load stored instructions for the selected skill name.
- document_create: Create a new document and get its ID
- store_asset: Store data using set of keywords as a key
- load_asset: Load data using set of keywords as a key
- store_htmlpart: Store HTML parts for a document (requires docid from document_create)
- load_htmlpart: Load HTML parts by document ID and part ID
- get_contentrange: Read document content ranges
- load_history: read previous operations
- store_history: store user action in history
`
