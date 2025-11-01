import { IPCursor } from "./ip.js";
import type { VirtualDocument } from "./vdom.js";

/**
 * Comment in a comment thread
 */
export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: Date;
}

/**
 * Comment thread attached to a paragraph
 */
export interface CommentThread {
  id: string;
  paragraphId: string;
  comments: Comment[];
  resolved: boolean;
}

/**
 * Reference to a comment thread for a paragraph
 * Matches server definition from src/server/messages.ts
 */
export interface CommentThreadRef {
  threadId: string;
  paraId: string;
  comments: string[];
}

// Global editor context for current document
let currentEditorContext: EditorContext | null = null;

export function setCurrentEditorContext(ctx: EditorContext): void {
  currentEditorContext = ctx;
}

export function getCurrentEditorContext(): EditorContext | null {
  return currentEditorContext;
}

/**
 * EditorContext - Holds editor-specific state for a document instance
 */
export class EditorContext {
  public cursor: IPCursor | null;
  public clippyFloat: any; // ClippyFloat type
  public documentEl: HTMLElement;
  public vdom: VirtualDocument;

  public get partId(): string {
    return this.vdom.partId;
  }

  /**
   * Get the shadow root for this document
   */
  public getShadowRoot(): ShadowRoot | null {
    return this.vdom.getShadowRoot();
  }

  constructor(documentEl: HTMLElement, vdom: VirtualDocument) {
    this.vdom = vdom;
    this.cursor = null;
    this.clippyFloat = null;
    this.documentEl = documentEl;
  }

  /**
   * Initialize cursor for this editor context
   */
  initializeCursor(): void {
    if (!this.cursor) {
      this.cursor = new IPCursor(this.documentEl, this);
    }
  }

  /**
   * Dispose of this editor context
   */
  dispose(): void {
    // Clean up cursor
    if (this.cursor) {
      this.cursor.hide();
      this.cursor = null;
    }

    // Clean up clippy
    if (this.clippyFloat) {
      this.clippyFloat.hide();
      this.clippyFloat = null;
    }
  }
}
