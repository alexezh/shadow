# Shadow Object Model (OM)

## Overview

The Object Model provides a structured representation of rich text documents with efficient change tracking through hash-based caching.

## Core Classes

### Data Structures

**WStr** - String engine with formatting
- Maintains text content with embedded `\n` characters
- Array of int property IDs, one per character
- Methods: `getText()`, `append()`, `insert()`, `delete()`, `setPropIdRange()`
- Hash caching for change detection

**WPropSet** - CSS property set
- Map of `string -> any` for CSS properties
- Example: `{'font-weight': 'bold', 'font-style': 'italic'}`
- Hash caching based on sorted key-value pairs

**WPropStore** - Property storage and deduplication
- Map of `int ID -> WPropSet`
- `getOrCreateId(propSet)` - finds existing or creates new entry based on hash
- Enables property sharing across multiple characters

### Document Tree

**WNode** - Abstract base class for all tree nodes
- Every node has a unique ID
- Abstract methods: `computeHash()`, `hasChildren()`, `getChildren()`
- Hash caching: `getHash()` returns cached value, `invalidateHash()` clears cache
- Hash invalidated automatically on any structural change

**Node Types:**

- **WPara** - Paragraph (leaf node)
  - Points to `WStr` for content
  - No children
  - Hash combines ID + WStr hash

- **WBody** - Document body (container)
  - Array of child `WNode`s
  - Methods: `addChild()`, `insertChild()`, `removeChild()`
  - Hash combines ID + all children hashes
  - Default ID: 'body'

- **WTable** - Table (container)
  - Array of `WRow` children
  - Same interface as WBody

- **WRow** - Table row (container)
  - Array of `WCell` children

- **WCell** - Table cell (container)
  - Can contain any node type (paragraphs, nested tables, etc.)

### Document Container

**WDoc** - Top-level document class
- Contains a `WBody` root node
- Contains a `WPropStore` for all properties
- Maintains `Map<string, WNode>` for fast ID lookup
- Methods:
  - `getBody()` - returns root WBody
  - `getPropStore()` - returns property store
  - `getNodeById(id)` - O(1) lookup by ID
  - `updateTree(nodeId, newNode)` - replace subtree, maintains ID map
  - `getHash()` - returns document-wide hash

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
- For `WPara`: wraps each character in `<span>` with inline style from WPropSet
- Converts `\n` to `<br>` tags
- Preserves element IDs in HTML output
- Returns HTML string

## HTML Parsing

**loadHtml(html, propStore)** - Parse HTML to OM
- Uses cheerio to parse HTML
- Converts HTML elements to WNode hierarchy:
  - `<p>` → WPara with WStr
  - `<div>` → WBody
  - `<table>` → WTable
  - `<tr>` → WRow
  - `<td>`, `<th>` → WCell
- Parses inline styles from `style` attributes
- Recognizes formatting tags: `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<span>`
- Converts to WPropSet and stores in WPropStore
- Uses `getOrCreateId()` to deduplicate properties
- Generates IDs if not present in HTML
- Returns root WNode (typically WBody)

## Hash-Based Change Detection

All nodes, strings, and property sets cache their hash values:

1. **First call**: `getHash()` computes hash via `computeHash()` and caches it
2. **Subsequent calls**: Returns cached value (O(1))
3. **On modification**: `invalidateHash()` clears cache
4. **Next getHash()**: Recomputes and caches again

**Hash invalidation propagates upward:**
- Modifying WStr invalidates its hash
- WPara's hash depends on WStr, so it recomputes
- Parent's hash depends on children, so it recomputes
- Document hash reflects entire tree state

**Use cases:**
- Detect if node changed since last render
- Skip HTML generation for unchanged subtrees
- Efficient dirty-checking for UI updates

## Example Usage

```typescript
// Create document
const propStore = new WPropStore();
const doc = new WDoc(propStore);

// Create formatted text
const str = new WStr('Hello World');
const boldPropSet = new WPropSet();
boldPropSet.set('font-weight', 'bold');
const boldId = propStore.create(boldPropSet);
str.setPropIdRange(0, 5, boldId); // "Hello" is bold

// Add paragraph
const para = new WPara('p1', str);
doc.getBody().addChild(para);

// Generate HTML
const html = makeHtml(doc.getBody(), propStore);
// <body id="body"><p id="p1"><span style="font-weight:bold">Hello</span> World</p></body>

// Load HTML back
const html2 = '<p id="p2">New paragraph</p>';
const newNode = loadHtml(html2, propStore);

// Update tree
doc.updateTree('p1', newNode); // Replace p1 with p2

// Check if document changed
const hash1 = doc.getHash();
doc.getBody().addChild(new WPara('p3', new WStr('More text')));
const hash2 = doc.getHash();
console.log(hash1 !== hash2); // true - document changed
```

## Design Principles

1. **Immutable IDs**: Node IDs never change after creation
2. **Hash-based equality**: Two nodes with same hash have identical content
3. **Lazy computation**: Hashes computed only when needed
4. **Automatic invalidation**: Mutations invalidate caches automatically
5. **Property deduplication**: Same formatting uses same property ID
6. **Efficient lookup**: O(1) node access by ID via WDoc
7. **Subtree replacement**: updateTree() maintains invariants 

