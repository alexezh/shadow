# Shadow Object Model (OM)

## Overview

The Object Model provides a structured representation of rich text documents with efficient change tracking through hash-based caching and automatic node map synchronization.

## Core Classes

### Data Structures

**YStr** - String engine with formatting
- Maintains text content with embedded `\n` characters
- Array of `YPropSet` references, one per character
- Methods: `text` (getter), `length` (getter), `append(text, props)`, `insert()`, `delete()`, `getPropsAt()`, `setPropsRange()`
- Hash caching for change detection
- Hash combines text content + all property set hashes

**YPropSet** - Immutable CSS property set
- Immutable plain object storage of `string -> any` for CSS properties
- Example: `YPropSet.create({'font-weight': 'bold', 'font-style': 'italic'})`
- Private constructor - created only via `YPropSet.create(props)`
- `YPropSet.create()` automatically deduplicates via YPropCache singleton
- Hash caching based on sorted key-value pairs using FNV-1a algorithm
- Methods: `get(key)`, `has(key)`, `entries()`, `getHash()`
- No mutation methods - create new YPropSet for modifications

**YPropCache** - Global property set cache (singleton)
- Singleton instance: `YPropCache.instance`
- Stores `Map<number, WeakRef<YPropSet>>` for automatic garbage collection
- `getOrCreate(propSet)` - finds existing or creates new entry based on hash
- `update(set, func)` - creates new YPropSet by copying and modifying properties
- `add(propSet)` - manually adds propSet to cache
- Enables property sharing across multiple characters
- WeakRef allows unused property sets to be garbage collected

### Document Tree

**YNode** - Abstract base class for all tree nodes
- Every node has a unique ID string
- Stores `YPropSet` for element-level properties (e.g., table cell width, alignment)
- Parent document reference: `doc` field set automatically
- Parent container reference: `parent` field points to parent YTextContainer
- Getters: `id`, `doc`, `parent`, `props`
- Methods: `setParent()`, `setProps()`
- Abstract methods: `computeHash()`, `hasChildren()`, `getChildren()`
- Hash caching: `getHash()` returns cached value, `invalidateHash()` clears cache
- Hash invalidated automatically on any structural change

**YTextContainer** - Base class for container nodes (extends YNode)
- Array of child `YNode`s
- Methods: `addChild()`, `insertChild()`, `removeChild()`, `spliceChildren()`, `insertAfter()`, `indexOf()`
- Automatically updates parent document's node map on add/remove via `doc.linkNodeInternal()` and `doc.unlinkNodeInternal()`
- Supports range queries: `getChildrenRange(range, shallow)` returns iterator
- Hash combines ID + all children hashes + props hash

**Node Types:**

- **YPara** - Paragraph (leaf node, extends YNode)
  - Constructor: `new YPara(id, props, str?)`
  - Points to `YStr` for content
  - Stores paragraph-level properties in `props` (e.g., text-align, margin)
  - Last character in YStr is always `\n` (end-of-paragraph marker)
  - EOP marker stores paragraph props in special `--data-para` property
  - Methods: `splitParagraph(pos)`, `deleteRange(startAt, count)`
  - Getter: `length` returns YStr length
  - No children
  - Hash combines ID + YStr hash + props hash

- **YBody** - Document body (extends YTextContainer)
  - Constructor: `new YBody(id = 'body', props, children?)`
  - Default ID: 'body'
  - Can contain paragraphs, tables, or any block-level nodes

- **YTable** - Table (extends YTextContainer)
  - Constructor: `new YTable(id, props, children?)`
  - Array of `YRow` children
  - Stores table-level properties (e.g., border, width)

- **YRow** - Table row (extends YTextContainer)
  - Constructor: `new YRow(id, props, children?)`
  - Array of `YCell` children
  - Stores row-level properties (e.g., height, background-color)

- **YCell** - Table cell (extends YTextContainer)
  - Constructor: `new YCell(id, props, children?)`
  - Can contain any node type (paragraphs, nested tables, etc.)
  - Stores cell-level properties (e.g., colspan, rowspan, width, align)

### Document Container

**YDoc** - Top-level document class
- Contains a `YBody` root node
- Maintains `Map<string, YNode>` for fast ID lookup
- Methods:
  - `getBody()` - returns root YBody
  - `getNodeById(id)` - O(1) lookup by ID
  - `updateTree(nodeId, newNode)` - replace subtree, maintains ID map
  - `rebuildNodeMap()` - rebuild entire node map (rarely needed)
  - `linkNodeInternal(parent, node)` - add node and descendants to map (called by containers)
  - `unlinkNodeInternal(node)` - remove node and descendants from map (called by containers)
  - `getHash()` - returns document-wide hash

**Automatic Node Map Synchronization:**
- When `YTextContainer` calls `addChild()`/`insertChild()`:
  1. Adds node to children array
  2. Gets doc reference via `this.doc`
  3. Calls `doc.linkNodeInternal(this, node)` to update map
  4. Node and all descendants automatically added to map
  5. Doc and parent references set on added nodes

- When containers call `removeChild()`:
  1. Removes node from children array
  2. Gets doc reference via `this.doc`
  3. Calls `doc.unlinkNodeInternal(node)` to update map
  4. Node and all descendants automatically removed from map

**updateTree()** behavior:
1. Finds old node by ID
2. Removes old node and descendants from ID map
3. Replaces node in parent's children array
4. Adds new node and descendants to ID map
5. Automatically invalidates parent hashes

## HTML Generation

**HtmlWriter** - HTML accumulator
- Methods: `writeOpenTag()`, `writeCloseTag()`, `writeText()`, `getString()`
- Builds HTML string efficiently

**makeHtml(node, propStore)** - Convert OM to HTML
- Recursively traverses node tree
- For `YPara`: wraps each character in `<span>` with inline style from YPropSet
- Converts `\n` to `<br>` tags
- Preserves element IDs in HTML output
- Returns HTML string

## HTML Parsing

**loadHtml(html, styleStore?)** - Parse HTML to OM
- Uses cheerio to parse HTML
- Extracts CSS from `<style>` tags into optional styleStore
- Converts HTML elements to YNode hierarchy:
  - `<p>` → YPara with YStr
  - `<div>` with text → YPara (empty divs ignored)
  - `<div>` with mixed content → Multiple YPara nodes as needed
  - `<table>` → YTable
  - `<tbody>` → Transparent (children added to parent table)
  - `<tr>` → YRow
  - `<td>`, `<th>` → YCell
- **Property extraction strategy:**
  - Accumulates properties in plain `{[key: string]: any}` objects during parsing
  - Extracts from `style` attribute and common HTML attributes (align, width, height, bgcolor, border, colspan, rowspan)
  - Creates immutable `YPropSet` via `YPropSet.create(props)` only when needed
  - Automatic deduplication via YPropCache singleton
- Recognizes formatting tags: `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<span>`, `<br>`
- Inline elements accumulated into YStr with per-character YPropSet
- Generates 31-bit IDs if not present in HTML using `make31BitId()`
- Returns root YNode (typically YBody)

## Hash-Based Change Detection

All nodes, strings, and property sets cache their hash values:

1. **First call**: `getHash()` computes hash via `computeHash()` and caches it
2. **Subsequent calls**: Returns cached value (O(1))
3. **On modification**: `invalidateHash()` clears cache
4. **Next getHash()**: Recomputes and caches again

**Hash invalidation propagates upward:**
- Modifying YStr invalidates its hash
- YPara's hash depends on YStr, so it recomputes
- Parent's hash depends on children, so it recomputes
- Document hash reflects entire tree state

**Use cases:**
- Detect if node changed since last render
- Skip HTML generation for unchanged subtrees
- Efficient dirty-checking for UI updates

## Clippy UI Architecture

### Files
- **public/clippy.html** - Main editor UI
- **public/clippy.js** - Client-side editor logic
- **src/clippy/http-server.ts** - HTTP server handling requests
- **src/clippy/handleRunAction.ts** - Action handlers (backspace, delete, type, split)
- **src/clippy/session.ts** - Session and action result interfaces

### Editing Flow

**Client Side (clippy.js):**
1. User types/presses keys → events added to command queue
2. Queue processor checks if queue not empty and no operation running
3. Takes all queued commands and batches them
4. Sends `runaction` request to server with action type and range
5. Receives response with:
   - Array of `{id: string, html: string}` changes
   - New IP position: `{element: string, offset: number}`
   - New selection range (optional)
6. Updates DOM with returned HTML blocks
7. Positions cursor at new IP or selection

**Action Types:**
- `type` - Insert text at cursor
- `backspace` - Delete character before cursor OR merge paragraphs if at start
- `delete` - Delete character at cursor OR merge paragraphs if at end
- `split` - Split paragraph at cursor (Enter key)

**Selection Handling:**
- Shift+Arrow keys create/modify selection
- Backspace with selection: delete entire selected range
- Delete with selection: delete entire selected range
- Type with selection: replace selection with typed text

**Clippy Assistant:**
- Floating icon below insertion point (IP)
- Hidden when user presses left/right mouse button
- Restored on mouse button release
- Click to expand to multi-line text prompt (up to 10 lines)
- "Ask anything" placeholder text
- Up arrow button (enabled when text present) sends command

### Action Handlers (handleRunAction.ts)

**Common Pattern:**
1. Get node from `doc.getNodeById(range.startElement)`
2. Validate node is correct type (e.g., `instanceof YPara`)
3. Perform operation on YDoc OM:
   - Modify YStr: `insert()`, `delete()`, `append()`
   - Modify tree: `addChild()`, `insertChild()`, `removeChild()`
   - Node map automatically updated by containers
4. Regenerate HTML only for affected nodes using `makeHtml()`
5. Return `ActionResult`:
   ```typescript
   {
     changes: [{id: string, html: string}],
     newPosition: {element: string, offset: number},
     newRange?: WRange
   }
   ```

**Paragraph Merging:**
- **Backspace at paragraph start** (offset === 0):
  - Append current paragraph's text to previous paragraph
  - Copy property IDs character-by-character
  - Remove current paragraph
  - Return updated HTML for merged paragraph

- **Delete at paragraph end** (offset >= length):
  - Append next paragraph's text to current paragraph
  - Copy property IDs character-by-character
  - Remove next paragraph
  - Return updated HTML for merged paragraph

**Paragraph Splitting:**
- Split text at cursor offset
- Create new YPara with second half of text
- Copy property IDs for second half
- Delete second half from original paragraph
- Insert new paragraph after current
- Return HTML for both paragraphs

## Example Usage

```typescript
// Create document
const doc = new YDoc();

// Create formatted text - accumulate properties in plain object
const boldProps = { 'font-weight': 'bold' };
const boldPropSet = YPropSet.create(boldProps); // Immutable, auto-cached

const str = new YStr();
str.append('Hello', boldPropSet); // "Hello" is bold
str.append(' World', YPropSet.create({})); // " World" has no formatting

// Add paragraph
const paraProps = { 'text-align': 'left' };
const para = new YPara('p1', YPropSet.create(paraProps), str);
doc.getBody().addChild(para); // Node map automatically updated

// Generate HTML
const html = makeHtml(doc.getBody());
// <body id="body"><p id="p1"><span style="font-weight:bold">Hello</span> World</p></body>

// Handle user action
const result = handleRunAction(session, {
  sessionId: 'session1',
  action: 'type',
  range: { startElement: 'p1', startOffset: 5, endElement: 'p1', endOffset: 5 },
  text: ' Beautiful'
});
// Returns: {
//   changes: [{id: 'p1', html: '<p id="p1">...new html...</p>'}],
//   newPosition: {element: 'p1', offset: 15}
// }

// Load HTML back
const html2 = '<p id="p2">New paragraph</p>';
const newNode = loadHtml(html2);

// Update tree
doc.updateTree('p1', newNode); // Replace p1 with p2

// Check if document changed
const hash1 = doc.getHash();
const newPara = new YPara('p3', YPropSet.create({}), new YStr());
newPara.str.append('More text', YPropSet.create({}));
doc.getBody().addChild(newPara);
const hash2 = doc.getHash();
console.log(hash1 !== hash2); // true - document changed

// Modify properties immutably
const updatedProps = YPropCache.instance.update(boldPropSet, (props) => {
  props['font-style'] = 'italic'; // Now bold + italic
});
str.setPropsRange(0, 5, updatedProps);
```

## Design Principles

1. **Immutable IDs**: Node IDs never change after creation
2. **Immutable Properties**: YPropSet is immutable - modifications create new instances
3. **Hash-based equality**: Two nodes with same hash have identical content
4. **Lazy computation**: Hashes computed only when needed, cached until invalidated
5. **Automatic invalidation**: Mutations invalidate caches automatically
6. **Property deduplication**: YPropCache ensures same properties share same YPropSet instance
7. **Weak references**: YPropCache uses WeakRef for automatic garbage collection
8. **Efficient lookup**: O(1) node access by ID via YDoc
9. **Automatic map sync**: Node map stays in sync with tree structure via linkNode/unlinkNode
10. **Doc reference propagation**: All nodes have reference to parent document and parent container
11. **Queue-based editing**: All edits go through action queue, batched to server
12. **Incremental updates**: Only changed HTML blocks sent to client
13. **Accumulate then create**: Parser accumulates props in plain objects, creates YPropSet only when needed
