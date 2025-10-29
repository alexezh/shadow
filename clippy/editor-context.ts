import { IPCursor } from "./ip.js";

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

/**
 * EditorContext - Holds editor-specific state for a document instance
 */
export class EditorContext {
  public cursor: IPCursor | null;
  public clippyFloat: any; // ClippyFloat type
  public commentThreads: Map<string, CommentThread>;
  public documentEl: HTMLElement;

  constructor(documentEl: HTMLElement) {
    this.cursor = null;
    this.clippyFloat = null;
    this.commentThreads = new Map();
    this.documentEl = documentEl;
  }

  /**
   * Initialize cursor for this editor context
   */
  initializeCursor(): void {
    if (!this.cursor) {
      this.cursor = new IPCursor(this.documentEl);
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

    // Clear comment threads
    this.commentThreads.clear();
  }
}
