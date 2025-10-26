/**
 * VirtualDocument - Represents a document instance with its own content and styles
 */
export class VirtualDocument {
  public partId: string;
  public html: string;
  public styles: Array<{ selector: string; properties: Record<string, string> }>;

  constructor(partId: string, html: string = '', styles: Array<{ selector: string; properties: Record<string, string> }> = []) {
    this.partId = partId;
    this.html = html;
    this.styles = styles;
  }

  /**
   * Apply this virtual document to the DOM
   */
  applyToDOM(containerEl: HTMLElement, styleElId: string = 'doc-styles'): void {
    // Update content
    containerEl.innerHTML = this.html;

    // Update styles
    this.applyStyles(styleElId);
  }

  /**
   * Apply styles to a style element
   */
  private applyStyles(styleElId: string): void {
    let styleEl = document.getElementById(styleElId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleElId;
      document.head.appendChild(styleEl);
    }

    // Convert styles array to CSS string
    const cssRules = this.styles.map(style => {
      const props = Object.entries(style.properties)
        .map(([key, value]) => `  ${key}: ${value};`)
        .join('\n');
      return `${style.selector} {\n${props}\n}`;
    });

    styleEl.textContent = cssRules.join('\n\n');
  }

  /**
   * Capture current DOM state into this virtual document
   */
  captureFromDOM(containerEl: HTMLElement): void {
    this.html = containerEl.innerHTML;
  }

  /**
   * Clone this virtual document
   */
  clone(): VirtualDocument {
    return new VirtualDocument(
      this.partId,
      this.html,
      this.styles.map(s => ({
        selector: s.selector,
        properties: { ...s.properties }
      }))
    );
  }
}

/**
 * VirtualDocumentCache - Manages multiple VirtualDocument instances
 */
export class VirtualDocumentCache {
  private cache: Map<string, VirtualDocument>;
  private currentPartId: string | null;

  constructor() {
    this.cache = new Map();
    this.currentPartId = null;
  }

  /**
   * Get a virtual document from cache
   */
  get(partId: string): VirtualDocument | undefined {
    return this.cache.get(partId);
  }

  /**
   * Store a virtual document in cache
   */
  set(partId: string, vdom: VirtualDocument): void {
    this.cache.set(partId, vdom);
  }

  /**
   * Check if a virtual document exists in cache
   */
  has(partId: string): boolean {
    return this.cache.has(partId);
  }

  /**
   * Remove a virtual document from cache
   */
  remove(partId: string): boolean {
    return this.cache.delete(partId);
  }

  /**
   * Clear all cached documents
   */
  clear(): void {
    this.cache.clear();
    this.currentPartId = null;
  }

  /**
   * Get current part ID
   */
  getCurrentPartId(): string | null {
    return this.currentPartId;
  }

  /**
   * Set current part ID
   */
  setCurrentPartId(partId: string): void {
    this.currentPartId = partId;
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get all cached part IDs
   */
  getAllPartIds(): string[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * Global virtual document cache instance
 */
export const vdomCache = new VirtualDocumentCache();
