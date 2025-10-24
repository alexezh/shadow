export type WRange = {
  startElement: string;
  startOffset: number;
  endElement: string;
  endOffset: number;
}

/**
 * WNode - Root type for document tree
 */
export abstract class YNode {
  protected id: string;
  protected cachedHash: number | null = null;
  protected doc: any | null = null; // Reference to parent WDoc

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Set the parent document reference
   */
  setDoc(doc: any): void {
    this.doc = doc;
  }

  /**
   * Get the parent document reference
   */
  getDoc(): any | null {
    return this.doc;
  }

  getId(): string {
    return this.id;
  }

  setId(id: string): void {
    this.id = id;
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
