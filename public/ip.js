import {
  findElementId,
  getSelectionRange,
  queueCommand,
  logToConsole
} from "./dom.js"

// IP Cursor (Insertion Point) management
export class IPCursor {
  constructor(documentEl) {
    this.documentEl = documentEl;
    this.cursorEl = null;
    this.position = { node: null, offset: 0 };
    this.selection = new Selection();
    this.visible = false;
    this.blinkInterval = null;

    this.createCursor();
    this.setupEventListeners();
  }

  createCursor() {
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

  setupEventListeners() {
    // Mouse down to position cursor (not on release)
    this.documentEl.addEventListener('mousedown', (e) => {
      this.positionAtClick(e);

      // Hide Clippy on mouse button press
      if (window.clippyFloat) {
        window.clippyFloat.hide();
      }
    });

    // Mouse move to continuously position cursor while mouse is down
    let isMouseDown = false;

    this.documentEl.addEventListener('mousedown', () => {
      isMouseDown = true;
    });

    document.addEventListener('mouseup', () => {
      isMouseDown = false;

      // Restore Clippy on mouse button release
      if (window.clippyFloat) {
        window.clippyFloat.show();
      }
    });

    this.documentEl.addEventListener('mousemove', (e) => {
      if (isMouseDown) {
        this.positionAtClick(e);
      }
    });

    // Disable context menu and double-click menu
    this.documentEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    this.documentEl.addEventListener('dblclick', (e) => {
      e.preventDefault();
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

  positionAtClick(e) {
    // Get the clicked position
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    const clickedParagraph = e.target && e.target.closest ? e.target.closest('p[id]') : null;

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

  updateCursorPosition() {
    if (!this.position.node) return;

    // Create a range at the current position
    const range = document.createRange();
    range.setStart(this.position.node, this.position.offset);
    range.setEnd(this.position.node, this.position.offset);

    // Get the bounding rect of the range
    const rect = range.getBoundingClientRect();

    // Position the cursor
    this.cursorEl.style.left = `${rect.left}px`;
    this.cursorEl.style.top = `${rect.top}px`;
    this.cursorEl.style.height = `${rect.height || 20}px`;

    // Update Clippy position if it exists and is visible
    if (window.clippyFloat && this.visible) {
      window.clippyFloat.positionBelowCursor();
    }
  }

  show() {
    this.visible = true;
    this.cursorEl.style.display = 'block';
    this.startBlinking();
  }

  hide() {
    this.visible = false;
    this.cursorEl.style.display = 'none';
    this.stopBlinking();
  }

  startBlinking() {
    this.stopBlinking();
    this.blinkInterval = setInterval(() => {
      if (this.cursorEl.style.visibility === 'hidden') {
        this.cursorEl.style.visibility = 'visible';
      } else {
        this.cursorEl.style.visibility = 'hidden';
      }
    }, 500);
  }

  stopBlinking() {
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
      this.blinkInterval = null;
    }
    this.cursorEl.style.visibility = 'visible';
  }

  handleKeyDown(e) {
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
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (shiftKey) {
        this.extendSelectionRight();
      } else {
        this.selection.clear();
        this.moveRight();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (shiftKey) {
        this.extendSelectionUp();
      } else {
        this.selection.clear();
        this.moveUp();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (shiftKey) {
        this.extendSelectionDown();
      } else {
        this.selection.clear();
        this.moveDown();
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.selection.clear();
      this.moveToLineStart();
    } else if (e.key === 'End') {
      e.preventDefault();
      this.selection.clear();
      this.moveToLineEnd();
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
      this.handlePaste(e);
    }
  }

  extendSelectionLeft() {
    if (!this.selection.active) {
      // Start selection from current position
      this.selection.set(
        this.position.node,
        this.position.offset,
        this.position.node,
        this.position.offset
      );
    }

    // Save old position
    const oldNode = this.position.node;
    const oldOffset = this.position.offset;

    // Move cursor left
    this.moveLeft();

    // Update selection end
    this.selection.endNode = this.position.node;
    this.selection.endOffset = this.position.offset;

    // Highlight the selection visually
    this.highlightSelection();

    //logToConsole(`Extended selection left: ${this.selection.startOffset}-${this.selection.endOffset}`);
  }

  extendSelectionRight() {
    if (!this.selection.active) {
      // Start selection from current position
      this.selection.set(
        this.position.node,
        this.position.offset,
        this.position.node,
        this.position.offset
      );
    }

    // Save old position
    const oldNode = this.position.node;
    const oldOffset = this.position.offset;

    // Move cursor right
    this.moveRight();

    // Update selection end
    this.selection.endNode = this.position.node;
    this.selection.endOffset = this.position.offset;

    // Highlight the selection visually
    this.highlightSelection();

    //logToConsole(`Extended selection right: ${this.selection.startOffset}-${this.selection.endOffset}`);
  }

  extendSelectionUp() {
    if (!this.selection.active) {
      this.selection.set(
        this.position.node,
        this.position.offset,
        this.position.node,
        this.position.offset
      );
    }

    this.moveUp();
    this.selection.endNode = this.position.node;
    this.selection.endOffset = this.position.offset;

    // Highlight the selection visually
    this.highlightSelection();

    //logToConsole('Extended selection up');
  }

  extendSelectionDown() {
    if (!this.selection.active) {
      this.selection.set(
        this.position.node,
        this.position.offset,
        this.position.node,
        this.position.offset
      );
    }

    this.moveDown();
    this.selection.endNode = this.position.node;
    this.selection.endOffset = this.position.offset;

    // Highlight the selection visually
    this.highlightSelection();

    //logToConsole('Extended selection down');
  }

  highlightSelection() {
    if (!this.selection.active) return;

    try {
      // Use browser's native selection to highlight
      const browserSel = window.getSelection();
      browserSel.removeAllRanges();

      const range = document.createRange();
      range.setStart(this.selection.startNode, this.selection.startOffset);
      range.setEnd(this.selection.endNode, this.selection.endOffset);

      browserSel.addRange(range);
    } catch (e) {
      logToConsole(`Error highlighting selection: ${e.message}`, 'error');
    }
  }

  deleteSelection(callback) {
    const range = this.selection.getRange();
    if (!range) return;

    queueCommand('delete', range);
    this.selection.clear();

    // Execute callback after delete completes
    if (callback) {
      setTimeout(callback, 50);
    }
  }

  async handleEnter() {
    if (!this.position.node) return;

    // Get the range for the split action
    let range = getSelectionRange();
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

  async handlePaste(e) {
    if (!this.position.node) return;

    try {
      // Try to read clipboard data
      const clipboardData = e.clipboardData || window.clipboardData;

      if (!clipboardData) {
        // Use Clipboard API if available
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          this.processPaste(text);
        } else {
          logToConsole('Clipboard access not available', 'error');
        }
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
      logToConsole(`Paste error: ${error.message}`, 'error');
    }
  }

  processPaste(content) {
    const range = getSelectionRange();
    if (range) {
      queueCommand('paste', range, undefined, content);
      logToConsole('Pasted content');
    }
  }

  moveLeft() {
    if (!this.position.node) return;

    if (this.position.offset > 0) {
      this.position.offset--;
    } else {
      // Move to previous text node
      const prevNode = this.getPreviousTextNode(this.position.node);
      if (prevNode) {
        this.position.node = prevNode;
        this.position.offset = prevNode.textContent.length;
      } else {
        // At the very beginning, can't move further left
        return;
      }
    }

    this.updateCursorPosition();
    logToConsole(`Moved left to offset ${this.position.offset}`);
  }

  moveRight() {
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

  moveUp() {
    // Get current cursor position
    const range = document.createRange();
    range.setStart(this.position.node, this.position.offset);
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

  moveDown() {
    // Get current cursor position
    const range = document.createRange();
    range.setStart(this.position.node, this.position.offset);
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

  moveToLineStart() {
    // Simplified: move to start of current text node
    this.position.offset = 0;
    this.updateCursorPosition();
    //logToConsole('Moved to line start');
  }

  moveToLineEnd() {
    // Simplified: move to end of current text node
    if (this.position.node) {
      this.position.offset = this.position.node.textContent?.length || 0;
    }
    this.updateCursorPosition();
    //logToConsole('Moved to line end');
  }

  insertCharacter(char) {
    if (!this.position.node) return;

    const range = getSelectionRange();
    if (range) {
      queueCommand('type', range, char);
      //logToConsole(`Inserted: ${char}`);
    }
  }

  deleteBackward() {
    if (!this.position.node) return;

    const range = getSelectionRange();
    if (range) {
      queueCommand('backspace', range);
      //logToConsole('Deleted backward');
    }
  }

  deleteForward() {
    if (!this.position.node) return;

    const range = getSelectionRange();
    if (range) {
      queueCommand('delete', range);
      //logToConsole('Deleted forward');
    }
  }

  getPreviousTextNode(node) {
    // Simple implementation: walk backwards in tree
    const walker = document.createTreeWalker(
      this.documentEl,
      NodeFilter.SHOW_TEXT,
      null
    );

    walker.currentNode = node;
    return walker.previousNode();
  }

  getNextTextNode(node) {
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
  constructor() {
    this.active = false;
    this.startNode = null;
    this.startOffset = 0;
    this.endNode = null;
    this.endOffset = 0;
  }

  set(startNode, startOffset, endNode, endOffset) {
    this.active = true;
    this.startNode = startNode;
    this.startOffset = startOffset;
    this.endNode = endNode;
    this.endOffset = endOffset;
  }

  clear() {
    this.active = false;
    this.startNode = null;
    this.startOffset = 0;
    this.endNode = null;
    this.endOffset = 0;

    // Clear browser selection
    const browserSel = window.getSelection();
    if (browserSel) {
      browserSel.removeAllRanges();
    }
  }

  getRange() {
    if (!this.active) return null;

    const startElement = findElementId(this.startNode);
    const endElement = findElementId(this.endNode);

    return {
      startElement,
      startOffset: this.startOffset,
      endElement,
      endOffset: this.endOffset
    };
  }
}
