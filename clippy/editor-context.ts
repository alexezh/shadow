import type { PromptRequest, PromptResponse } from "../src/server/messages.js";
import { getSelectionRange, getSessionId, logToConsole } from "./dom.js";
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
  public clippyFloat = new ClippyFloat(); // ClippyFloat type
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

  public showFloaty(): void {
    this.clippyFloat.show(this);
  }

  public positionBelowCursor(): void {
    this.clippyFloat.positionBelowCursor(this);
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
    }
  }
}


// Clippy floating assistant
class ClippyFloat {
  private floatEl: HTMLElement;
  private iconEl: HTMLElement;
  private textboxEl: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private isExpanded: boolean;
  private isVisible: boolean;

  constructor() {
    this.floatEl = document.getElementById('clippy-float') as HTMLElement;
    this.iconEl = document.getElementById('clippy-icon') as HTMLElement;
    this.textboxEl = document.getElementById('clippy-textbox') as HTMLTextAreaElement;
    this.sendBtn = document.getElementById('clippy-send') as HTMLButtonElement;
    this.isExpanded = false;
    this.isVisible = false;

    this.setupEventListeners();
  }

  setupEventListeners(): void {
    // Prevent mousedown on clippy from affecting document selection
    this.floatEl.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      logToConsole("floaty mouse down");
    });

    // Click on icon to expand
    this.iconEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.expand(getCurrentEditorContext());
    });

    // Click on float: expand if collapsed, prevent propagation if expanded
    this.floatEl.addEventListener('click', (e) => {
      if (!this.isExpanded) {
        e.stopPropagation();
        this.expand(getCurrentEditorContext());
      } else {
        // Prevent clicks inside the expanded prompt from closing it
        e.stopPropagation();
      }
    });

    // Enable/disable send button based on text input
    this.textboxEl.addEventListener('input', () => {
      const hasText = this.textboxEl.value.trim().length > 0;
      this.sendBtn.disabled = !hasText;
    });

    // Send on button click
    this.sendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sendPrompt(getCurrentEditorContext());
    });

    // Send on Enter key in textbox (Shift+Enter for new line)
    this.textboxEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !this.sendBtn.disabled) {
        e.preventDefault();
        this.sendPrompt(getCurrentEditorContext());
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isExpanded) {
        this.collapse(getCurrentEditorContext());
      }
    });

    // Click outside to collapse
    document.addEventListener('click', (e) => {
      if (this.isExpanded && !this.floatEl.contains(e.target as Node)) {
        this.collapse(getCurrentEditorContext());
      }
    });
  }

  positionBelowCursor(editorContext: EditorContext | null): void {
    const cursor = editorContext?.cursor;
    if (!cursor || !cursor.cursorEl || !cursor.visible) return;

    const cursorRect = cursor.cursorEl.getBoundingClientRect();

    // Check if cursor has a valid position (not at 0,0 or collapsed)
    if (cursorRect.left === 0 && cursorRect.top === 0 && cursorRect.width === 0 && cursorRect.height === 0) {
      // Cursor not positioned yet, defer to next frame
      requestAnimationFrame(() => {
        const retryRect = cursor.cursorEl.getBoundingClientRect();
        if (retryRect.left !== 0 || retryRect.top !== 0 || retryRect.width !== 0 || retryRect.height !== 0) {
          this.floatEl.style.left = `${retryRect.left + 2}px`;
          this.floatEl.style.top = `${retryRect.bottom + 2}px`;
        }
      });
      return;
    }

    // Position very close to cursor - just 2px below and 2px to the right
    this.floatEl.style.left = `${cursorRect.left + 2}px`;
    this.floatEl.style.top = `${cursorRect.bottom + 2}px`;

    //logToConsole(`Clippy positioned at (${cursorRect.left + 2}, ${cursorRect.bottom + 2})`);
  }

  expand(editorContext: EditorContext | null): void {
    logToConsole("floaty expand");
    this.isExpanded = true;
    this.floatEl.classList.remove('collapsed');
    this.floatEl.classList.add('expanded');

    // Reposition close to cursor when expanded
    this.positionBelowCursor(editorContext);

    // Focus the textbox after a short delay to ensure it's visible
    setTimeout(() => {
      this.textboxEl.focus();
    }, 50);

    //logToConsole('Clippy expanded');
  }

  collapse(editorContext: EditorContext | null): void {
    this.isExpanded = false;
    this.floatEl.classList.remove('expanded');
    this.floatEl.classList.add('collapsed');
    this.textboxEl.value = '';
    this.sendBtn.disabled = true;

    // Reposition and show the icon
    this.show(editorContext);

    // Restore focus to document to re-enable keyboard input
    const docContent = document.getElementById('doc-content');
    if (docContent) {
      docContent.focus();
    }

    //logToConsole('Clippy collapsed');
  }

  async sendPrompt(editorContext: EditorContext | null): Promise<void> {
    if (!editorContext) return;

    const prompt = this.textboxEl.value.trim();
    if (!prompt) return;

    //logToConsole(`Clippy: ${question}`);

    try {
      const sessionId = getSessionId();
      const selectionRange = getSelectionRange(editorContext);
      const payload: PromptRequest = {
        sessionId: sessionId!,
        prompt: prompt,
        partId: editorContext.partId
      };

      if (selectionRange) {
        payload.selection = selectionRange;
      }

      if (sessionId) {
        payload.docId = sessionId;
      }

      // Send command to server
      const response = await fetch('/api/executeprompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json() as PromptResponse;
      if (result.response) {
        logToConsole(`Response: ${result.response}`, 'info');
      }
    } catch (error) {
      logToConsole(`Error: ${(error as Error).message}`, 'error');
    }

    this.textboxEl.value = '';
    this.sendBtn.disabled = true;
    this.collapse(editorContext);
  }

  show(editorContext: EditorContext | null): void {
    if (!editorContext) return;

    if (!this.isExpanded) {
      // Only show collapsed icon when not expanded
      this.isVisible = true;
      this.floatEl.style.display = 'block';
      this.positionBelowCursor(editorContext);
    }
  }

  hide(): void {
    if (!this.isExpanded) {
      // Only hide when collapsed
      this.isVisible = false;
      this.floatEl.style.display = 'none';
    }
  }
}