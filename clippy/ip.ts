import {
  findElementId,
  getSelectionRange,
  queueCommand,
  logToConsole,
} from "./dom.js"
import type { EditorContext } from "./editor-context.js";

// IP Cursor (Insertion Point) management
export class IPCursor {
  private editorContext: EditorContext;
  private documentEl: HTMLElement;
  public cursorEl!: HTMLSpanElement;
  public position: { node: Node | null; offset: number };
  public selection: Selection;
  public visible: boolean;
  private blinkInterval: number | null;

  constructor(documentEl: HTMLElement, editorContext: EditorContext) {
    this.editorContext = editorContext;
    this.documentEl = documentEl;
    this.position = { node: null, offset: 0 };
    this.selection = new Selection();
    this.visible = false;
    this.blinkInterval = null;

    this.createCursor();
    this.setupEventListeners();
  }

  createCursor(): void {
    this.cursorEl = document.createElement('span');
    this.cursorEl.id = 'ip-cursor';
    this.cursorEl.style.position = 'absolute';
    this.cursorEl.style.width = '2px';
    this.cursorEl.style.height = '20px';
    this.cursorEl.style.backgroundColor = '#000';
    this.cursorEl.style.pointerEvents = 'none';
    this.cursorEl.style.zIndex = '1000';
    this.cursorEl.style.display = 'none';
    document.body.appendChild(this.cursorEl);
  }

  setupEventListeners(): void {
    // Mouse down to position cursor (not on release)
    let isMouseDown = false;
    let isShiftDown = false;
    let selectionAnchor: { node: Node | null; offset: number } | null = null;

    this.documentEl.addEventListener('mousedown', (e) => {
      // Prevent browser default selection
      e.preventDefault();

      isMouseDown = true;
      isShiftDown = e.shiftKey;

      // Get position at click
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (!range || !range.startContainer) return;

      if (isShiftDown && this.position.node) {
        // Extend selection from current position to click
        selectionAnchor = { node: this.position.node, offset: this.position.offset };
        this.selection.set(
          selectionAnchor.node,
          selectionAnchor.offset,
          range.startContainer,
          range.startOffset
        );
        this.position.node = range.startContainer;
        this.position.offset = range.startOffset;
        this.updateCursorPosition();
        this.highlightSelection();
      } else {
        // Clear selection and start new selection anchor
        this.selection.clear();
        selectionAnchor = { node: range.startContainer, offset: range.startOffset };
        this.position.node = range.startContainer;
        this.position.offset = range.startOffset;
        this.updateCursorPosition();
      }

      // Show cursor but hide Clippy during mouse operations
      this.visible = true;
      this.cursorEl.style.display = 'block';
      this.startBlinking();

      if (this.editorContext?.clippyFloat) {
        this.editorContext.clippyFloat.hide();
      }
    });

    document.addEventListener('mouseup', () => {
      isMouseDown = false;
      isShiftDown = false;
      selectionAnchor = null;

      // Restore Clippy on mouse button release
      if (this.editorContext?.clippyFloat) {
        this.editorContext.clippyFloat.show();
      }
    });

    this.documentEl.addEventListener('mousemove', (e) => {
      if (isMouseDown && selectionAnchor) {
        // Prevent browser default selection
        e.preventDefault();

        // Create/extend selection while dragging
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (range && range.startContainer) {
          this.position.node = range.startContainer;
          this.position.offset = range.startOffset;

          // Update selection from anchor to current position
          this.selection.set(
            selectionAnchor.node,
            selectionAnchor.offset,
            this.position.node,
            this.position.offset
          );

          this.updateCursorPosition();
          this.highlightSelection();
        }
      }
    });

    // Disable context menu and double-click menu
    this.documentEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    this.documentEl.addEventListener('dblclick', (e) => {
      e.preventDefault();

      // Select word at double-click position
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (!range || !range.startContainer) return;

      const node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE && node.textContent) {
        const text = node.textContent;
        const offset = range.startOffset;

        // Find word boundaries
        const wordBoundary = /[\s\p{P}]/u;

        // Find start of word
        let start = offset;
        while (start > 0 && !wordBoundary.test(text[start - 1])) {
          start--;
        }

        // Find end of word
        let end = offset;
        while (end < text.length && !wordBoundary.test(text[end])) {
          end++;
        }

        // Set selection to the word
        if (start !== end) {
          this.selection.set(node, start, node, end);
          this.position.node = node;
          this.position.offset = end;
          this.updateCursorPosition();
          this.highlightSelection();
          this.show();
        }
      }
    });

    // Keyboard input
    this.documentEl.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });

    // Make document focusable
    this.documentEl.setAttribute('tabindex', '0');
    this.documentEl.style.outline = 'none';

    // Focus handler
    this.documentEl.addEventListener('focus', () => {
      this.show();
      //logToConsole('Document focused');
    });

    this.documentEl.addEventListener('blur', () => {
      this.hide();
    });
  }

  positionAtClick(e: MouseEvent): void {
    // Get the clicked position
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    const clickedParagraph = (e.target as HTMLElement)?.closest('p[id]');

    const hasValidRange = !!(range && range.startContainer);
    const rangeElementId = hasValidRange ? findElementId(range.startContainer) : null;
    const rangeElement = rangeElementId ? document.getElementById(rangeElementId) : null;
    const rangeIsParagraph = rangeElement && rangeElement.tagName === 'P';

    if ((!hasValidRange || !rangeIsParagraph) && clickedParagraph) {
      const eosMarker = clickedParagraph.querySelector('span[data-marker="eos"]');
      const markerTextNode = eosMarker && eosMarker.firstChild ? eosMarker.firstChild : null;
      this.position.node = markerTextNode || clickedParagraph;
      this.position.offset = 0;
      this.selection.clear();
      this.updateCursorPosition();
      this.show();
      return;
    }

    if (!range) return;

    this.position.node = range.startContainer;
    this.position.offset = range.startOffset;
    this.selection.clear();

    this.updateCursorPosition();
    this.show();

    //logToConsole(`Cursor positioned at offset ${this.position.offset}`);
  }

  updateCursorPosition(): void {
    if (!this.position.node) return;

    // Create a range at the current position
    const range = document.createRange();
    range.setStart(this.position.node, this.position.offset);
    range.setEnd(this.position.node, this.position.offset);

    // Get the bounding rect of the range
    const rect = range.getBoundingClientRect();

    // Check if rect is valid (not at 0,0 or completely collapsed)
    if (rect.left === 0 && rect.top === 0 && rect.width === 0 && rect.height === 0) {
      logToConsole('Warning: Invalid cursor rect, deferring position update', 'warn');
      // Defer update to next frame when DOM might be ready
      requestAnimationFrame(() => {
        const retryRect = range.getBoundingClientRect();
        if (retryRect.left !== 0 || retryRect.top !== 0 || retryRect.width !== 0 || retryRect.height !== 0) {
          this.cursorEl.style.left = `${retryRect.left}px`;
          this.cursorEl.style.top = `${retryRect.top}px`;
          this.cursorEl.style.height = `${retryRect.height || 20}px`;

          if (this.editorContext?.clippyFloat && this.visible) {
            this.editorContext.clippyFloat.positionBelowCursor();
          }
        }
      });
      return;
    }

    // Position the cursor
    this.cursorEl.style.left = `${rect.left}px`;
    this.cursorEl.style.top = `${rect.top}px`;
    this.cursorEl.style.height = `${rect.height || 20}px`;

    // Update Clippy position if it exists and is visible
    if (this.editorContext?.clippyFloat && this.visible) {
      this.editorContext.clippyFloat.positionBelowCursor();
    }
  }

  show(): void {
    this.visible = true;
    this.cursorEl.style.display = 'block';
    this.startBlinking();

    // Show clippy at cursor position
    if (this.editorContext?.clippyFloat) {
      this.editorContext.clippyFloat.positionBelowCursor();
      this.editorContext.clippyFloat.show();
    }
  }

  hide(): void {
    this.visible = false;
    this.cursorEl.style.display = 'none';
    this.stopBlinking();

    // Hide clippy when cursor is hidden
    if (this.editorContext?.clippyFloat) {
      this.editorContext.clippyFloat.hide();
    }
  }

  startBlinking(): void {
    this.stopBlinking();
    this.blinkInterval = setInterval(() => {
      if (this.cursorEl.style.visibility === 'hidden') {
        this.cursorEl.style.visibility = 'visible';
      } else {
        this.cursorEl.style.visibility = 'hidden';
      }
    }, 500) as unknown as number;
  }

  stopBlinking(): void {
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
      this.blinkInterval = null;
    }
    this.cursorEl.style.visibility = 'visible';
  }

  handleKeyDown(e: KeyboardEvent): void {
    // Ensure cursor is visible for keyboard navigation
    if (!this.visible) {
      this.visible = true;
      this.cursorEl.style.display = 'block';
    }

    // Reset blink on any key
    this.stopBlinking();
    this.startBlinking();

    const shiftKey = e.shiftKey;

    // Handle arrow keys with selection support
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (shiftKey) {
        this.extendSelectionLeft();
      } else {
        this.selection.clear();
        this.moveLeft();
      }
      this.show();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (shiftKey) {
        this.extendSelectionRight();
      } else {
        this.selection.clear();
        this.moveRight();
      }
      this.show();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (shiftKey) {
        this.extendSelectionUp();
      } else {
        this.selection.clear();
        this.moveUp();
      }
      this.show();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (shiftKey) {
        this.extendSelectionDown();
      } else {
        this.selection.clear();
        this.moveDown();
      }
      this.show();
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.selection.clear();
      this.moveToLineStart();
      this.show();
    } else if (e.key === 'End') {
      e.preventDefault();
      this.selection.clear();
      this.moveToLineEnd();
      this.show();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // Regular character input
      e.preventDefault();

      // If selection is active, delete selection first
      if (this.selection.active) {
        this.deleteSelection(() => {
          this.insertCharacter(e.key);
        });
      } else {
        this.insertCharacter(e.key);
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      if (this.selection.active) {
        this.deleteSelection();
      } else {
        this.deleteBackward();
      }
    } else if (e.key === 'Delete') {
      e.preventDefault();
      if (this.selection.active) {
        this.deleteSelection();
      } else {
        this.deleteForward();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.handleEnter();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      this.handlePaste(e as unknown as ClipboardEvent);
    }
  }

  extendSelectionLeft(): void {
    if (!this.selection.active) {
      // Start selection from current position (anchor stays here)
      this.selection.set(
        this.position.node,
        this.position.offset,
        this.position.node,
        this.position.offset
      );
    }

    // Move cursor left
    this.moveLeft();

    // Update selection focus (the moving end)
    this.selection.focusNode = this.position.node;
    this.selection.focusOffset = this.position.offset;

    // Highlight the selection visually
    this.highlightSelection();

    //logToConsole(`Extended selection left`);
  }

  extendSelectionRight(): void {
    if (!this.selection.active) {
      // Start selection from current position (anchor stays here)
      this.selection.set(
        this.position.node,
        this.position.offset,
        this.position.node,
        this.position.offset
      );
    }

    // Move cursor right
    this.moveRight();

    // Update selection focus (the moving end)
    this.selection.focusNode = this.position.node;
    this.selection.focusOffset = this.position.offset;

    // Highlight the selection visually
    this.highlightSelection();

    //logToConsole(`Extended selection right`);
  }

  extendSelectionUp(): void {
    if (!this.selection.active) {
      // Start selection from current position (anchor stays here)
      this.selection.set(
        this.position.node,
        this.position.offset,
        this.position.node,
        this.position.offset
      );
    }

    // Move cursor up
    this.moveUp();

    // Update selection focus (the moving end)
    this.selection.focusNode = this.position.node;
    this.selection.focusOffset = this.position.offset;

    // Highlight the selection visually
    this.highlightSelection();

    //logToConsole('Extended selection up');
  }

  extendSelectionDown(): void {
    if (!this.selection.active) {
      // Start selection from current position (anchor stays here)
      this.selection.set(
        this.position.node,
        this.position.offset,
        this.position.node,
        this.position.offset
      );
    }

    // Move cursor down
    this.moveDown();

    // Update selection focus (the moving end)
    this.selection.focusNode = this.position.node;
    this.selection.focusOffset = this.position.offset;

    // Highlight the selection visually
    this.highlightSelection();

    //logToConsole('Extended selection down');
  }

  highlightSelection(): void {
    if (!this.selection.active) return;

    try {
      const ordered = this.selection['getOrderedRange']();
      if (!ordered.startNode || !ordered.endNode) return;

      const range = document.createRange();
      range.setStart(ordered.startNode, ordered.startOffset);
      range.setEnd(ordered.endNode, ordered.endOffset);

      // Use CSS Custom Highlight API if available (persists when focus is lost)
      if (CSS.highlights) {
        const highlight = new Highlight(range);
        CSS.highlights.set(this.selection['highlightName'], highlight);
      } else {
        // Fallback to browser's native selection (disappears on blur)
        const browserSel = window.getSelection();
        if (!browserSel) return;
        browserSel.removeAllRanges();
        browserSel.addRange(range);
      }
    } catch (e) {
      logToConsole(`Error highlighting selection: ${(e as Error).message}`, 'error');
    }
  }

  deleteSelection(callback?: () => void): void {
    const range = this.selection.getRange();
    if (!range) return;

    queueCommand('delete', range);
    this.selection.clear();

    // Execute callback after delete completes
    if (callback) {
      setTimeout(callback, 50);
    }
  }

  async handleEnter(): Promise<void> {
    if (!this.position.node) return;

    // Get the range for the split action
    let range = getSelectionRange(this.editorContext);
    if (!range) {
      const elementId = findElementId(this.position.node);
      if (elementId) {
        range = {
          startElement: elementId,
          startOffset: this.position.offset,
          endElement: elementId,
          endOffset: this.position.offset
        };
      }
    }
    if (range) {
      queueCommand('split', range);
      //logToConsole('Enter pressed - split paragraph');
    }
  }

  async handlePaste(e: ClipboardEvent): Promise<void> {
    if (!this.position.node) return;

    try {
      // Try to read clipboard data
      const clipboardData = e.clipboardData || (window as any).clipboardData;

      if (!clipboardData) {
        // Use Clipboard API if available
        if (navigator.clipboard) {
          try {
            // Try to read HTML first using the modern Clipboard API
            if (navigator.clipboard.read) {
              const items = await navigator.clipboard.read();
              for (const item of items) {
                // Try HTML first
                if (item.types.includes('text/html')) {
                  const blob = await item.getType('text/html');
                  const html = await blob.text();
                  this.processPaste(html);
                  return;
                }
                // Fall back to plain text
                if (item.types.includes('text/plain')) {
                  const blob = await item.getType('text/plain');
                  const text = await blob.text();
                  this.processPaste(text);
                  return;
                }
              }
            } else if (navigator.clipboard.readText) {
              // Fallback to readText if read() is not available
              const text = await navigator.clipboard.readText();
              this.processPaste(text);
              return;
            }
          } catch (err) {
            logToConsole(`Clipboard read error: ${(err as Error).message}`, 'error');
          }
        }
        logToConsole('Clipboard access not available', 'error');
        return;
      }

      // Try to get HTML first, fall back to plain text
      const html = clipboardData.getData('text/html');
      const text = clipboardData.getData('text/plain');

      const content = html || text;
      if (content) {
        this.processPaste(content);
      } else {
        logToConsole('No clipboard content available', 'warn');
      }
    } catch (error) {
      logToConsole(`Paste error: ${(error as Error).message}`, 'error');
    }
  }

  processPaste(content: string): void {
    const range = getSelectionRange(this.editorContext);
    if (range) {
      queueCommand('paste', range, undefined, content);
      logToConsole('Pasted content');
    }
  }

  moveLeft(): void {
    if (!this.position.node) return;

    if (this.position.offset > 0) {
      this.position.offset--;
    } else {
      // Move to previous text node
      const prevNode = this.getPreviousTextNode(this.position.node);
      if (prevNode) {
        this.position.node = prevNode;
        this.position.offset = prevNode.textContent?.length || 0;
      } else {
        // At the very beginning, can't move further left
        return;
      }
    }

    this.updateCursorPosition();
    logToConsole(`Moved left to offset ${this.position.offset}`);
  }

  moveRight(): void {
    if (!this.position.node) return;

    const maxOffset = this.position.node.textContent?.length || 0;

    if (this.position.offset < maxOffset) {
      this.position.offset++;
    } else {
      // Move to next text node
      const nextNode = this.getNextTextNode(this.position.node);
      if (nextNode) {
        this.position.node = nextNode;
        this.position.offset = 0;
      }
    }

    this.updateCursorPosition();
    //logToConsole(`Moved right to offset ${this.position.offset}`);
  }

  moveUp(): void {
    // Get current cursor position
    const range = document.createRange();
    range.setStart(this.position.node!, this.position.offset);
    const rect = range.getBoundingClientRect();

    // Move up one line (approximately)
    const x = rect.left;
    const y = rect.top - 20;

    const newRange = document.caretRangeFromPoint(x, y);
    if (newRange) {
      this.position.node = newRange.startContainer;
      this.position.offset = newRange.startOffset;
      this.updateCursorPosition();
      //logToConsole('Moved up');
    }
  }

  moveDown(): void {
    // Get current cursor position
    const range = document.createRange();
    range.setStart(this.position.node!, this.position.offset);
    const rect = range.getBoundingClientRect();

    // Move down one line (approximately)
    const x = rect.left;
    const y = rect.bottom + 2;

    const newRange = document.caretRangeFromPoint(x, y);
    if (newRange) {
      this.position.node = newRange.startContainer;
      this.position.offset = newRange.startOffset;
      this.updateCursorPosition();
      //logToConsole('Moved down');
    }
  }

  moveToLineStart(): void {
    // Simplified: move to start of current text node
    this.position.offset = 0;
    this.updateCursorPosition();
    //logToConsole('Moved to line start');
  }

  moveToLineEnd(): void {
    // Simplified: move to end of current text node
    if (this.position.node) {
      this.position.offset = this.position.node.textContent?.length || 0;
    }
    this.updateCursorPosition();
    //logToConsole('Moved to line end');
  }

  insertCharacter(char: string): void {
    if (!this.position.node) return;

    const range = getSelectionRange(this.editorContext);
    if (range) {
      queueCommand('type', range, char);
      //logToConsole(`Inserted: ${char}`);
    }
  }

  deleteBackward(): void {
    if (!this.position.node) return;

    const range = getSelectionRange(this.editorContext);
    if (range) {
      queueCommand('backspace', range);
      //logToConsole('Deleted backward');
    }
  }

  deleteForward(): void {
    if (!this.position.node) return;

    const range = getSelectionRange(this.editorContext);
    if (range) {
      queueCommand('delete', range);
      //logToConsole('Deleted forward');
    }
  }

  getPreviousTextNode(node: Node): Node | null {
    // Simple implementation: walk backwards in tree
    const walker = document.createTreeWalker(
      this.documentEl,
      NodeFilter.SHOW_TEXT,
      null
    );

    walker.currentNode = node;
    return walker.previousNode();
  }

  getNextTextNode(node: Node): Node | null {
    // Simple implementation: walk forwards in tree
    const walker = document.createTreeWalker(
      this.documentEl,
      NodeFilter.SHOW_TEXT,
      null
    );

    walker.currentNode = node;
    return walker.nextNode();
  }
}

// Selection management
export class Selection {
  public active: boolean;
  public anchorNode: Node | null;
  public anchorOffset: number;
  public focusNode: Node | null;
  public focusOffset: number;
  private highlightName: string = 'editor-selection';

  // Legacy properties for compatibility
  public get startNode(): Node | null {
    const ordered = this.getOrderedRange();
    return ordered.startNode;
  }

  public get startOffset(): number {
    const ordered = this.getOrderedRange();
    return ordered.startOffset;
  }

  public get endNode(): Node | null {
    const ordered = this.getOrderedRange();
    return ordered.endNode;
  }

  public get endOffset(): number {
    const ordered = this.getOrderedRange();
    return ordered.endOffset;
  }

  public set startNode(node: Node | null) {
    this.anchorNode = node;
  }

  public set startOffset(offset: number) {
    this.anchorOffset = offset;
  }

  public set endNode(node: Node | null) {
    this.focusNode = node;
  }

  public set endOffset(offset: number) {
    this.focusOffset = offset;
  }

  constructor() {
    this.active = false;
    this.anchorNode = null;
    this.anchorOffset = 0;
    this.focusNode = null;
    this.focusOffset = 0;

    // Initialize CSS highlight styles
    this.initHighlightStyles();
  }

  private initHighlightStyles(): void {
    // Check if CSS highlights API is supported
    if (!CSS.highlights) {
      console.warn('CSS Custom Highlights API not supported');
      return;
    }

    // Add CSS rule for the highlight if not already present
    const styleId = 'selection-highlight-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        ::highlight(${this.highlightName}) {
          background-color: rgba(180, 215, 255, 0.5);
          color: inherit;
        }
      `;
      document.head.appendChild(style);
    }
  }

  set(anchorNode: Node | null, anchorOffset: number, focusNode: Node | null, focusOffset: number): void {
    this.active = true;
    this.anchorNode = anchorNode;
    this.anchorOffset = anchorOffset;
    this.focusNode = focusNode;
    this.focusOffset = focusOffset;
  }

  /**
   * Get the ordered range (start before end) regardless of selection direction
   */
  private getOrderedRange(): { startNode: Node | null; startOffset: number; endNode: Node | null; endOffset: number } {
    if (!this.anchorNode || !this.focusNode) {
      return {
        startNode: this.anchorNode,
        startOffset: this.anchorOffset,
        endNode: this.focusNode,
        endOffset: this.focusOffset
      };
    }

    // If same node, compare offsets
    if (this.anchorNode === this.focusNode) {
      if (this.anchorOffset <= this.focusOffset) {
        return {
          startNode: this.anchorNode,
          startOffset: this.anchorOffset,
          endNode: this.focusNode,
          endOffset: this.focusOffset
        };
      } else {
        return {
          startNode: this.focusNode,
          startOffset: this.focusOffset,
          endNode: this.anchorNode,
          endOffset: this.anchorOffset
        };
      }
    }

    // Different nodes - use compareDocumentPosition
    const position = this.anchorNode.compareDocumentPosition(this.focusNode);

    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      // focusNode comes after anchorNode
      return {
        startNode: this.anchorNode,
        startOffset: this.anchorOffset,
        endNode: this.focusNode,
        endOffset: this.focusOffset
      };
    } else {
      // focusNode comes before anchorNode
      return {
        startNode: this.focusNode,
        startOffset: this.focusOffset,
        endNode: this.anchorNode,
        endOffset: this.anchorOffset
      };
    }
  }

  clear(): void {
    this.active = false;
    this.anchorNode = null;
    this.anchorOffset = 0;
    this.focusNode = null;
    this.focusOffset = 0;

    // logToConsole("sel clear");

    // Clear CSS highlight
    if (CSS.highlights) {
      CSS.highlights.delete(this.highlightName);
    }

    // Clear browser selection (fallback for browsers without CSS highlights)
    const browserSel = window.getSelection();
    if (browserSel) {
      browserSel.removeAllRanges();
    }
  }

  getRange(): { startElement: string | null; startOffset: number; endElement: string | null; endOffset: number } | null {
    if (!this.active) return null;

    const ordered = this.getOrderedRange();
    const startElement = findElementId(ordered.startNode);
    const endElement = findElementId(ordered.endNode);

    return {
      startElement,
      startOffset: ordered.startOffset,
      endElement,
      endOffset: ordered.endOffset
    };
  }
}
