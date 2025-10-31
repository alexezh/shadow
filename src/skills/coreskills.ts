import { SkillDef } from "./skilldef.js";
import { editSkill } from "./editskill.js";
import { createSkill } from "./createskill.js";
import { createBlueprintSkill, useBlueprintSkill } from "./blueprintskill.js";

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
  createBlueprintSkill,
  useBlueprintSkill,
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
