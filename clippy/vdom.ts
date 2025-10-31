import { EditorContext, CommentThreadRef, CommentThread } from "./editor-context.js";

/**
 * VirtualDocument - Represents a document instance with its own content and styles
 * Uses Shadow DOM for style encapsulation
 */
export class VirtualDocument {
  public partId: string;
  public html: string;
  public styles: Array<{ selector: string; properties: Record<string, string> }>;
  public editorContext: EditorContext | null;
  public commentThreadRefs: CommentThreadRef[];
  private shadowRoot: ShadowRoot | null = null;
  public readonly commentThreads = new Map<string, CommentThread>();

  constructor(args: {
    partId: string,
    containerEl: HTMLElement,
    styleElId: string,
    html: string,
    styles: Array<{ selector: string; properties: Record<string, string> }>,
    commentThreadRefs: CommentThreadRef[]
  }
  ) {
    this.partId = args.partId;
    this.html = args.html;
    this.styles = args.styles;
    this.editorContext = null;
    this.commentThreadRefs = args.commentThreadRefs;


    if (!this.editorContext) {
      // Pass the shadow root's content element to EditorContext
      const contentEl = this.shadowRoot ? (this.shadowRoot.firstElementChild as HTMLElement) : args.containerEl;
      this.editorContext = new EditorContext(args.containerEl, this);
      this.editorContext.initializeCursor();
    }

    this.attachToDOM(args.containerEl, args.styleElId);
  }

  /**
   * Apply this virtual document to the DOM using Shadow DOM
   */
  private attachToDOM(containerEl: HTMLElement, styleElId: string = 'doc-styles'): void {
    // Create shadow root if it doesn't exist
    if (!this.shadowRoot) {
      this.shadowRoot = containerEl.attachShadow({ mode: 'open' });
    }

    // Create a wrapper div for the content
    const contentWrapper = document.createElement('div');
    contentWrapper.id = 'shadow-content';
    contentWrapper.innerHTML = this.html;

    // Create style element inside shadow root
    const styleEl = document.createElement('style');
    styleEl.id = styleElId;

    // Convert styles array to CSS string
    const cssRules = this.styles.map(style => {
      const props = Object.entries(style.properties)
        .map(([key, value]) => `  ${key}: ${value};`)
        .join('\n');
      return `${style.selector} {\n${props}\n}`;
    });
    styleEl.textContent = cssRules.join('\n\n');

    // Clear shadow root and add style + content
    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(styleEl);
    this.shadowRoot.appendChild(contentWrapper);

    // Apply comment thread markers to paragraphs
    this.applyCommentMarkers(contentWrapper);
  }

  /**
   * Apply comment markers to paragraphs that have comments
   */
  private applyCommentMarkers(containerEl: HTMLElement): void {
    for (const ref of this.commentThreadRefs) {
      // Query within shadow DOM using containerEl as root
      const paragraph = containerEl.querySelector(`#${CSS.escape(ref.paraId)}`);
      if (paragraph) {
        paragraph.classList.add('has-comments');
        paragraph.setAttribute('data-thread-id', ref.threadId);
      }
    }
  }

  /**
   * Get comment thread by ID
   */
  getCommentThread(threadId: string): CommentThread | undefined {
    return this.commentThreads.get(threadId);
  }

  /**
   * Add or update a comment thread
   */
  setCommentThread(thread: CommentThread): void {
    this.commentThreads.set(thread.id, thread);
  }

  /**
   * Remove a comment thread
   */
  removeCommentThread(threadId: string): void {
    this.commentThreads.delete(threadId);
  }

  /**
   * Get all comment threads
   */
  getAllCommentThreads(): CommentThread[] {
    return Array.from(this.commentThreads.values());
  }

  /**
   * Get comment threads for a specific paragraph
   */
  getCommentThreadsForParagraph(paragraphId: string): CommentThread[] {
    return Array.from(this.commentThreads.values())
      .filter(thread => thread.paragraphId === paragraphId);
  }

  /**
   * Clear all comment threads
   */
  clearCommentThreads(): void {
    this.commentThreads.clear();
  }

  /**
   * Dispose of this virtual document and its editor context
   */
  dispose(): void {
    if (this.editorContext) {
      this.editorContext.dispose();
      this.editorContext = null;
    }
    this.shadowRoot = null;
    // Clear comment threads
    this.commentThreads.clear();
  }
}

/**
 * VirtualDocumentCache - Manages multiple VirtualDocument instances
 */
export class VirtualDocumentCache {
  private cache: Map<string, VirtualDocument>;

  constructor() {
    this.cache = new Map();
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
