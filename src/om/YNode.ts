import type { YDoc, YDocPart } from "./YDoc";
import { YPropSet } from "./YPropSet";
import { YRange } from "./YRange";

export function getSelectionKind(range: YRange): "point" | "range" {
  if (range.startOffset === range.endOffset && range.startElement === range.endElement) {
    return "point"
  } else {
    return "range";
  }
}

/**
 * WNode - Root type for document tree
 */
export abstract class YNode {
  protected _id: string;
  protected cachedHash: number | null = null;
  protected _doc: YDocPart | null = null; // Reference to parent WDoc
  protected _parent: YTextContainer | null = null;
  protected _props: YPropSet;

  public get id(): string {
    return this._id;
  }
  public get doc(): YDocPart | null {
    return this._doc;
  }
  public get parent(): YTextContainer | null {
    return this._parent;
  }
  public get props(): YPropSet {
    return this._props;
  }

  constructor(id: string, props: YPropSet) {
    this._id = id;
    this._props = props;
  }

  /**
   * Set the parent document reference
   */
  setParent(doc: YDocPart | null, parent: YTextContainer | null): void {
    this._doc = doc;
    this._parent = parent;
  }

  setProps(props: YPropSet): void {
    this._props = props;
    this.invalidateHash();
  }

  /**
   * Returns a 32-bit hash value for this node (cached)
   */
  getHash(): number {
    if (this.cachedHash === null) {
      this.cachedHash = this.computeHash();
    }
    return this.cachedHash;
  }

  /**
   * Invalidate cached hash (call when node changes)
   */
  protected invalidateHash(): void {
    this.cachedHash = null;
  }

  /**
   * Compute the hash value (implemented by subclasses)
   */
  protected abstract computeHash(): number;

  /**
   * Check if this node has children
   */
  abstract hasChildren(): boolean;

  /**
   * Get children if this node supports them
   */
  abstract getChildren(): YNode[] | null;
}

export class YTextContainer extends YNode {
  protected children: YNode[];

  constructor(id: string, props: YPropSet, children?: YNode[]) {
    super(id, props);
    this.children = children || [];
  }

  hasChildren(): boolean {
    return true;
  }

  getChildren(): YNode[] {
    return this.children;
  }

  /**
   * Get children in range with optional depth control
   * @param range Optional range to filter children
   * @param shallow If true, only return direct children; if false, return all descendants
   */
  getChildrenRange(
    range: {
      startElement?: string;
      endElement?: string;
    }
    , shallow?: boolean): IterableIterator<YNode>;
  getChildrenRange(
    range: {
      startElement?: string;
      endElement?: string;
    }
    , shallow: boolean = true): YNode[] | IterableIterator<YNode> {
    if (!range) {
      return this.children;
    }

    // Return iterator
    return this.getChildrenIterator(range, shallow);
  }

  /**
   * Get iterator for children in range
   */
  private *getChildrenIterator(
    range: {
      startElement?: string;
      endElement?: string;
    },
    shallow: boolean): IterableIterator<YNode> {
    // Find start and end indices
    let startIndex = -1;

    if (range.startElement) {
      // Find start node index
      for (let i = 0; i < this.children.length; i++) {
        if (this.children[i].id === range.startElement) {
          startIndex = i;
          break;
        }
      }
    } else {
      startIndex = 0;
    }

    // If start element not found, yield nothing
    if (startIndex === -1) {
      return;
    }

    // Yield children in range
    for (let i = startIndex; ; i++) {
      const child = this.children[i];
      yield child;

      if (range.endElement) {
        if (child.id === range.endElement) {
          break;
        }
      }

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

  spliceChildren(idx: number, deleteCount: number, ...added: YNode[]): void {
    for (let i = 0; i < deleteCount; i++) {
      this.doc?.unlinkNodeInternal(this.children[idx + i]);
    }
    this.children.splice(idx, deleteCount, ...added);
    for (let node of added) {
      this.doc?.linkNodeInternal(this, node)
    }
  }

  indexOf(node: YNode): number {
    return this.children.indexOf(node);
  }

  insertAfter(sibling: YNode | undefined, ...nodes: YNode[]): boolean {
    let idx = 0;
    if (sibling) {
      idx = this.children.indexOf(sibling);
      if (idx < 0) {
        return false;
      }
    }

    this.children.splice(0, 0, ...nodes);
    for (let node of nodes) {
      this.doc?.linkNodeInternal(this, node);
    }

    return true;
  }
  addChild(node: YNode): void {
    this.children.push(node);
    this.invalidateHash();

    // Update node map if doc is set
    const doc = this.doc;
    if (doc) {
      doc.linkNodeInternal(this, node);
    }
  }

  insertChild(index: number, node: YNode): void {
    this.children.splice(index, 0, node);
    this.invalidateHash();

    // Update node map if doc is set
    const doc = this.doc;
    if (doc) {
      doc.linkNodeInternal(this, node);
    }
  }

  removeChild(index: number): YNode | undefined {
    const result = this.children.splice(index, 1)[0];
    this.invalidateHash();

    // Update node map if doc is set
    const doc = this._doc;
    if (doc && result) {
      doc.unlinkNodeInternal(result);
    }

    return result;
  }

  /**
   * Compute a 32-bit hash value for this cell
   */
  protected computeHash(): number {
    let hash = 0;

    // Hash the ID
    for (let i = 0; i < this._id.length; i++) {
      const char = this._id.charCodeAt(i);
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