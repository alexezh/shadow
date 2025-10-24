import { YNode, WRange } from './YNode.js';

/**
 * WBody - Document body containing child nodes
 */
export class YBody extends YNode {
  private children: YNode[];

  constructor(id: string = 'body', children?: YNode[]) {
    super(id);
    this.children = children || [];
  }

  hasChildren(): boolean {
    return true;
  }

  /**
   * Get all children
   */
  getChildren(): YNode[];
  /**
   * Get children in range with optional depth control
   * @param range Optional range to filter children
   * @param shallow If true, only return direct children; if false, return all descendants
   */
  getChildren(range?: WRange, shallow?: boolean): IterableIterator<YNode>;
  getChildren(range?: WRange, shallow: boolean = true): YNode[] | IterableIterator<YNode> {
    if (!range) {
      return this.children;
    }

    // Return iterator
    return this.getChildrenIterator(range, shallow);
  }

  /**
   * Get iterator for children in range
   */
  private *getChildrenIterator(range: WRange, shallow: boolean): IterableIterator<YNode> {
    // Find start and end indices
    let startIndex = -1;
    let endIndex = this.children.length;

    // Find start node index
    for (let i = 0; i < this.children.length; i++) {
      if (this.children[i].getId() === range.startElement) {
        startIndex = i;
        break;
      }
    }

    // If start element not found, yield nothing
    if (startIndex === -1) {
      return;
    }

    // Find end node index
    for (let i = startIndex; i < this.children.length; i++) {
      if (this.children[i].getId() === range.endElement) {
        endIndex = i + 1; // Include the end element
        break;
      }
    }

    // Yield children in range
    for (let i = startIndex; i < endIndex; i++) {
      const child = this.children[i];
      yield child;

      // If deep, yield all descendants
      if (!shallow) {
        yield* this.getDescendantsIterator(child);
      }
    }
  }

  /**
   * Get iterator for all descendants of a node
   */
  private *getDescendantsIterator(node: YNode): IterableIterator<YNode> {
    const children = node.getChildren();
    if (children) {
      for (const child of children) {
        yield child;
        yield* this.getDescendantsIterator(child);
      }
    }
  }

  addChild(node: YNode): void {
    this.children.push(node);
    this.invalidateHash();

    // Update node map if doc is set
    const doc = this.getDoc();
    if (doc) {
      doc.addNodeToMapPublic(node);
    }
  }

  insertChild(index: number, node: YNode): void {
    this.children.splice(index, 0, node);
    this.invalidateHash();

    // Update node map if doc is set
    const doc = this.getDoc();
    if (doc) {
      doc.addNodeToMapPublic(node);
    }
  }

  removeChild(index: number): YNode | undefined {
    const result = this.children.splice(index, 1)[0];
    this.invalidateHash();

    // Update node map if doc is set
    const doc = this.getDoc();
    if (doc && result) {
      doc.removeNodeFromMapPublic(result);
    }

    return result;
  }

  /**
   * Compute a 32-bit hash value for this body
   */
  protected computeHash(): number {
    let hash = 0;

    // Hash the ID
    for (let i = 0; i < this.id.length; i++) {
      const char = this.id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & 0x7FFFFFFF;
    }

    // Hash all children
    for (const child of this.children) {
      hash = ((hash << 5) - hash) + child.getHash();
      hash = hash & 0x7FFFFFFF;
    }

    return hash;
  }
}
