# Shadow Object Model (OM)

## Overview

The Object Model provides a structured representation of rich text documents with efficient change tracking through hash-based caching and automatic node map synchronization.

## Core Classes

### Data Structures

**YStr** - String engine with formatting
- Maintains text content with embedded `\n` characters
- Array of int property IDs, one per character
- Methods: `getText()`, `append()`, `insert()`, `delete()`, `setPropIdRange()`
- Hash caching for change detection

**YPropSet** - CSS property set
- Plain object storage of `string -> any` for CSS properties
- Example: `{'font-weight': 'bold', 'font-style': 'italic'}`
- Hash caching based on sorted key-value pairs
- Methods: `get()`, `set()`, `has()`, `delete()`, `entries()`

**YPropStore** - Property storage and deduplication
- Map of `int ID -> YPropSet`
- `getOrCreateId(propSet)` - finds existing or creates new entry based on hash
- Enables property sharing across multiple characters

### Document Tree

**YNode** - Abstract base class for all tree nodes
- Every node has a unique ID
- Parent document reference: `doc` field set automatically
- Methods: `setDoc()`, `getDoc()` - manage parent document reference
- Abstract methods: `computeHash()`, `hasChildren()`, `getChildren()`
- Hash caching: `getHash()` returns cached value, `invalidateHash()` clears cache
- Hash invalidated automatically on any structural change

**Node Types:**

- **YPara** - Paragraph (leaf node)
  - Points to `YStr` for content
  - No children
  - Hash combines ID + YStr hash

- **YBody** - Document body (container)
  - Array of child `YNode`s
  - Methods: `addChild()`, `insertChild()`, `removeChild()`
  - Automatically updates parent document's node map on add/remove
  - Supports range queries: `getChildren(range, shallow)` returns iterator
  - Hash combines ID + all children hashes
  - Default ID: 'body'

- **YTable** - Table (container)
  - Array of `YRow` children
  - Same interface as YBody
  - Auto-updates node map

- **YRow** - Table row (container)
  - Array of `YCell` children
  - Auto-updates node map

- **YCell** - Table cell (container)
  - Can contain any node type (paragraphs, nested tables, etc.)
  - Auto-updates node map

### Document Container

**YDoc** - Top-level document class
- Contains a `YBody` root node
- Contains a `YPropStore` for all properties
- Maintains `Map<string, YNode>` for fast ID lookup
- Methods:
  - `getBody()` - returns root YBody
  - `getPropStore()` - returns property store
  - `getNodeById(id)` - O(1) lookup by ID
  - `updateTree(nodeId, newNode)` - replace subtree, maintains ID map
  - `rebuildNodeMap()` - rebuild entire node map (rarely needed)
  - `addNodeToMapPublic(node)` - add node and descendants to map (called by containers)
  - `removeNodeFromMapPublic(node)` - remove node and descendants from map (called by containers)
  - `getHash()` - returns document-wide hash

**Automatic Node Map Synchronization:**
- When `YBody`, `YTable`, `YRow`, or `YCell` calls `addChild()`/`insertChild()`:
  1. Adds node to children array
  2. Gets doc reference via `this.getDoc()`
  3. Calls `doc.addNodeToMapPublic(node)` to update map
  4. Node and all descendants automatically added to map
  5. Doc reference set on added nodes

- When containers call `removeChild()`:
  1. Removes node from children array
  2. Gets doc reference via `this.getDoc()`
  3. Calls `doc.removeNodeFromMapPublic(node)` to update map
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

**loadHtml(html, propStore)** - Parse HTML to OM
- Uses cheerio to parse HTML
- Converts HTML elements to YNode hierarchy:
  - `<p>` → YPara with YStr
  - `<div>` → YBody
  - `<table>` → YTable
  - `<tr>` → YRow
  - `<td>`, `<th>` → YCell
- Parses inline styles from `style` attributes
- Recognizes formatting tags: `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<span>`
- Converts to YPropSet and stores in YPropStore
- Uses `getOrCreateId()` to deduplicate properties
- Generates IDs if not present in HTML
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
const propStore = doc.getPropStore();

// Create formatted text
const str = new YStr('Hello World');
const boldPropSet = new YPropSet();
boldPropSet.set('font-weight', 'bold');
const boldId = propStore.create(boldPropSet);
str.setPropIdRange(0, 5, boldId); // "Hello" is bold

// Add paragraph
const para = new YPara('p1', str);
doc.getBody().addChild(para); // Node map automatically updated

// Generate HTML
const html = makeHtml(doc.getBody(), propStore);
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
const newNode = loadHtml(html2, propStore);

// Update tree
doc.updateTree('p1', newNode); // Replace p1 with p2

// Check if document changed
const hash1 = doc.getHash();
doc.getBody().addChild(new YPara('p3', new YStr('More text')));
const hash2 = doc.getHash();
console.log(hash1 !== hash2); // true - document changed
```

## Design Principles

1. **Immutable IDs**: Node IDs never change after creation
2. **Hash-based equality**: Two nodes with same hash have identical content
3. **Lazy computation**: Hashes computed only when needed
4. **Automatic invalidation**: Mutations invalidate caches automatically
5. **Property deduplication**: Same formatting uses same property ID
6. **Efficient lookup**: O(1) node access by ID via YDoc
7. **Automatic map sync**: Node map stays in sync with tree structure
8. **Doc reference propagation**: All nodes have reference to parent document
9. **Queue-based editing**: All edits go through action queue, batched to server
10. **Incremental updates**: Only changed HTML blocks sent to client
