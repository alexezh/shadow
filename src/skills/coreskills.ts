import OpenAI from "openai";
import { youAreShadow } from "../chatprompt.js";
import { Database } from "../database.js";
import { generateEmbedding, OpenAIClient } from "../openai-client.js";
import { TrainedModel, Literal, Rule, RuleSet, TrainingExamples, Example, trainRuleReliabilities, predictLabel, forwardPass } from "../factmodel.js";
import { SkillDef } from "../skilldef.js";
import { editSkill } from "./editskill.js";
import { createSkill } from "./createskill.js";

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

export const CORE_SKILLS: SkillDef[] = [
  editSkill,
  createSkill,

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
    name: "use_blueprint",
    keywords: ['use blueprint'],
    test_keywords: [
      'use blueprint',
      'apply formatting',
      'apply style template',
      'format with blueprint'
    ],
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
    name: "edit_image",
    keywords: ['image', 'add'],
    test_keywords: [
      'add image',
      'insert image',
      'insert picture',
      'add photo'
    ],
    text: `
**to add an image:**
- Get the current selection using get_context(['selection']) to retrieve the start_id where the image should be inserted
- Invoke insert_object(start_id, "image", "<url to image>") to insert the image at the specified location
- The start_id should be a paragraph ID from the document structure
`
  },
  {
    name: "edit_comment",
    keywords: ['comment', 'edit'],
    test_keywords: [
      'add comment',
      'edit comment',
      'list comments',
      'reply to comment',
      'delete comment'
    ],
    text: `
**to work with comments:**

To add a comment:
- Get the current selection using get_context(['selection'])
- Invoke comment(selection, "add", "<comment text>") to add a comment to the selected range

To list comment threads:
- Use comment("list") which returns a list of threads
- Each thread shows the thread_id, the text of the first comment and the number of replies

To list comments in a specific thread:
- Use comment("list_thread", <thread_id>) to see all comments in that thread

To reply to a thread:
- Use comment("reply", <thread_id>, "<reply text>") to add a reply to an existing thread

To delete a comment:
- Use comment("delete", <thread_id>) to remove a specific comment
`
  },
];