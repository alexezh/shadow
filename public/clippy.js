// Console logging
const consoleEl = document.getElementById('console');

function logToConsole(message, type = 'info') {
  const line = document.createElement('div');
  line.className = `console-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// Toolbar button handlers
const buttons = {
  bold: document.getElementById('btn-bold'),
  italic: document.getElementById('btn-italic'),
  bullet: document.getElementById('btn-bullet'),
  number: document.getElementById('btn-number')
};

// Session management
let sessionId = null;

// Command queue
let commandQueue = [];
let isProcessingQueue = false;

// Queue processor
async function processQueue() {
  if (isProcessingQueue || commandQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  try {
    // Take all queued commands
    const commands = commandQueue.splice(0);

    for (const cmd of commands) {
      const result = await runAction(cmd.action, cmd.range, cmd.text, cmd.content);

      if (result && result.result) {
        // Apply changes from result
        if (result.result.changes && result.result.changes.length > 0) {
          applyChanges(result.result.changes);
        }

        // Update cursor position
        if (result.result.newPosition) {
          updateCursorPosition(result.result.newPosition);
        }

        // Update selection if present
        if (result.result.newRange) {
          updateSelection(result.result.newRange);
        }
      }
    }
  } finally {
    isProcessingQueue = false;

    // Process any new commands that arrived
    if (commandQueue.length > 0) {
      setTimeout(processQueue, 0);
    }
  }
}

// Add command to queue
function queueCommand(action, range, text, content) {
  commandQueue.push({ action, range, text, content });
  processQueue();
}

// Command runner
async function runAction(action, range, text, content) {
  if (!sessionId) {
    logToConsole('No session ID available', 'error');
    return;
  }

  try {
    const body = {
      sessionId,
      action,
      range
    };

    if (text !== undefined) {
      body.text = text;
    }

    if (content !== undefined) {
      body.content = content;
    }

    const response = await fetch('/api/runaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    //logToConsole(`Action '${action}' executed successfully`);
    return result;
  } catch (error) {
    logToConsole(`Error executing action: ${error.message}`, 'error');
    throw error;
  }
}

// Get current selection range
function getSelectionRange() {
  const cursor = window.ipCursor;
  if (!cursor || !cursor.position.node) {
    return null;
  }

  // Find the element ID for the current node
  let element = cursor.position.node;
  if (element.nodeType === Node.TEXT_NODE) {
    element = element.parentElement;
  }

  // Walk up to find an element with an ID
  while (element && !element.id) {
    element = element.parentElement;
  }

  if (!element) {
    return null;
  }

  // Check if there's a selection
  if (cursor.selection.active) {
    const startElement = findElementId(cursor.selection.startNode);
    const endElement = findElementId(cursor.selection.endNode);

    return {
      startElement,
      startOffset: cursor.selection.startOffset,
      endElement,
      endOffset: cursor.selection.endOffset
    };
  }

  return {
    startElement: element.id,
    startOffset: cursor.position.offset,
    endElement: element.id,
    endOffset: cursor.position.offset
  };
}

// Update cursor position from server response
function updateCursorPosition(newPosition) {
  const cursor = window.ipCursor;
  if (!cursor) return;

  const element = document.getElementById(newPosition.element);
  if (!element) return;

  // Find first text node in element
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  );
  const textNode = walker.nextNode();

  if (textNode) {
    cursor.position.node = textNode;
    cursor.position.offset = Math.min(newPosition.offset, textNode.textContent.length);
    cursor.updateCursorPosition();
    cursor.selection.clear();
  }
}

// Update selection from server response
function updateSelection(newRange) {
  const cursor = window.ipCursor;
  if (!cursor) return;

  const startElement = document.getElementById(newRange.startElement);
  const endElement = document.getElementById(newRange.endElement);

  if (!startElement || !endElement) return;

  // Find text nodes
  const walker1 = document.createTreeWalker(startElement, NodeFilter.SHOW_TEXT, null);
  const startNode = walker1.nextNode();

  const walker2 = document.createTreeWalker(endElement, NodeFilter.SHOW_TEXT, null);
  const endNode = walker2.nextNode();

  if (startNode && endNode) {
    cursor.selection.set(startNode, newRange.startOffset, endNode, newRange.endOffset);
  }
}

buttons.bold.addEventListener('click', async () => {
  buttons.bold.classList.toggle('active');
  const range = getSelectionRange();
  if (range) {
    queueCommand('bold', range);
  }
  //logToConsole('Bold toggled');
});

buttons.italic.addEventListener('click', async () => {
  buttons.italic.classList.toggle('active');
  const range = getSelectionRange();
  if (range) {
    queueCommand('italic', range);
  }
  //logToConsole('Italic toggled');
});

buttons.bullet.addEventListener('click', async () => {
  const range = getSelectionRange();
  if (range) {
    queueCommand('bullet', range);
  }
  //logToConsole('Bullet list clicked');
});

buttons.number.addEventListener('click', async () => {
  const range = getSelectionRange();
  if (range) {
    queueCommand('number', range);
  }
  //logToConsole('Numbered list clicked');
});

// Selection management
class Selection {
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

// IP Cursor (Insertion Point) management
class IPCursor {
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

// Change polling
async function pollChanges() {
  if (!sessionId) {
    logToConsole('No session ID, skipping poll', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/getchanges?sessionId=${sessionId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const changes = await response.json();

    if (changes && changes.length > 0) {
      for (const change of changes) {
        // Apply changes
        if (change.changes && change.changes.length > 0) {
          applyChanges(change.changes);
        }

        // Update cursor position
        if (change.newPosition) {
          updateCursorPosition(change.newPosition);
        }

        // Update selection if present
        if (change.newRange) {
          updateSelection(change.newRange);
        }
      }

      //logToConsole(`Applied ${changes.length} change sets`);
    }

    // Continue polling
    pollChanges();
  } catch (error) {
    logToConsole(`Error polling changes: ${error.message}`, 'error');
    // Retry after delay
    setTimeout(pollChanges, 2000);
  }
}

// Apply changes to document
function applyChanges(changes) {
  // Apply each change based on operation type
  for (const change of changes) {
    const element = document.getElementById(change.id);

    switch (change.op) {
      case 'deleted':
        // Remove element from DOM
        if (element) {
          element.remove();
          //logToConsole(`Deleted element ${change.id}`);
        } else {
          logToConsole(`Warning: Cannot delete element ${change.id} - not found`, 'warn');
        }
        break;

      case 'changed':
        // Update existing element
        if (element) {
          // Special case: replacing entire doc-content
          if (change.id === 'doc-content') {
            element.innerHTML = change.html;
            logToConsole(`Replaced document content`);
          } else {
            element.outerHTML = change.html;
            //logToConsole(`Updated element ${change.id}`);
          }
        } else {
          logToConsole(`Warning: Cannot update element ${change.id} - not found`, 'warn');
        }
        break;

      case 'inserted':
        // Insert new element
        if (element) {
          logToConsole(`Warning: Element ${change.id} already exists, skipping insert`, 'warn');
        } else {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = change.html;
          const newElement = tempDiv.firstChild;

          if (newElement) {
            // Use prevId to find where to insert
            if (change.prevId) {
              const prevElement = document.getElementById(change.prevId);
              if (prevElement && prevElement.parentElement) {
                // Insert right after prevElement
                prevElement.parentElement.insertBefore(newElement, prevElement.nextSibling);
                //logToConsole(`Inserted new element ${change.id} after ${change.prevId}`);
              } else {
                logToConsole(`Warning: prevId ${change.prevId} not found, appending to body`, 'warn');
                // Fallback: append to body
                const docContent = document.getElementById('doc-content');
                if (docContent && docContent.firstChild) {
                  docContent.firstChild.appendChild(newElement);
                }
              }
            } else {
              // No prevId - append to body
              const docContent = document.getElementById('doc-content');
              if (docContent && docContent.firstChild) {
                docContent.firstChild.appendChild(newElement);
                logToConsole(`Inserted new element ${change.id} at end`);
              }
            }
          }
        }
        break;

      default:
        logToConsole(`Warning: Unknown operation ${change.op} for element ${change.id}`, 'warn');
        break;
    }
  }
}

// Find element ID for a node
function findElementId(node) {
  let element = node;
  if (element.nodeType === Node.TEXT_NODE) {
    element = element.parentElement;
  }

  while (element && !element.id) {
    element = element.parentElement;
  }

  return element ? element.id : null;
}

// Apply styles to document
function applyStyles(styles) {
  // Find or create style element
  let styleEl = document.getElementById('doc-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'doc-styles';
    document.head.appendChild(styleEl);
  }

  // Convert styles array to CSS string
  const cssRules = styles.map(style => {
    const props = Object.entries(style.properties)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n');
    return `${style.selector} {\n${props}\n}`;
  });

  styleEl.textContent = cssRules.join('\n\n');
}

// Document loading
async function loadDocument() {
  try {
    logToConsole('Fetching document from server...');

    // Check if we have a sessionId stored (e.g., from previous page load)
    const storedSessionId = localStorage.getItem('sessionId');
    const headers = {};
    if (storedSessionId) {
      headers['XSessionId'] = storedSessionId;
    }

    const response = await fetch('/api/getdoc', { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    sessionId = data.sessionId;

    // Store sessionId for future use
    localStorage.setItem('sessionId', sessionId);

    const docContent = document.getElementById('doc-content');
    docContent.innerHTML = data.html;

    // Apply styles if provided
    if (data.styles && data.styles.length > 0) {
      applyStyles(data.styles);
      logToConsole(`Loaded ${data.styles.length} styles`);
    }

    logToConsole(`Document loaded, session: ${sessionId}`, 'info');

    // Initialize IP cursor after document is loaded
    const cursor = new IPCursor(docContent);
    window.ipCursor = cursor;

    // Focus the document to show cursor
    docContent.focus();

    // Start polling for changes
    pollChanges();
  } catch (error) {
    logToConsole(`Error loading document: ${error.message}`, 'error');
    document.getElementById('doc-content').innerHTML =
      '<div style="color: #d32f2f;">Failed to load document</div>';
  }
}

// Clippy floating assistant
class ClippyFloat {
  constructor() {
    this.floatEl = document.getElementById('clippy-float');
    this.iconEl = document.getElementById('clippy-icon');
    this.textboxEl = document.getElementById('clippy-textbox');
    this.sendBtn = document.getElementById('clippy-send');
    this.isExpanded = false;
    this.isVisible = false;

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Click on icon to expand
    this.iconEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.expand();
    });

    // Click on collapsed float to expand
    this.floatEl.addEventListener('click', (e) => {
      if (!this.isExpanded) {
        e.stopPropagation();
        this.expand();
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
      this.sendQuestion();
    });

    // Send on Enter key in textbox (Shift+Enter for new line)
    this.textboxEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !this.sendBtn.disabled) {
        e.preventDefault();
        this.sendQuestion();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isExpanded) {
        this.collapse();
      }
    });

    // Click outside to collapse
    document.addEventListener('click', (e) => {
      if (this.isExpanded && !this.floatEl.contains(e.target)) {
        this.collapse();
      }
    });

    // Prevent clicks inside the prompt from closing
    this.floatEl.addEventListener('click', (e) => {
      if (this.isExpanded) {
        e.stopPropagation();
      }
    });
  }

  positionBelowCursor() {
    const cursor = window.ipCursor;
    if (!cursor || !cursor.cursorEl || !cursor.visible) return;

    const cursorRect = cursor.cursorEl.getBoundingClientRect();

    // Check if cursor has a valid position (not at 0,0)
    if (cursorRect.left === 0 && cursorRect.top === 0) {
      logToConsole('Warning: Cursor at invalid position (0,0)', 'warn');
      return;
    }

    // Position very close to cursor - just 2px below and 2px to the right
    this.floatEl.style.left = `${cursorRect.left + 2}px`;
    this.floatEl.style.top = `${cursorRect.bottom + 2}px`;

    logToConsole(`Clippy positioned at (${cursorRect.left + 2}, ${cursorRect.bottom + 2})`);
  }

  expand() {
    this.isExpanded = true;
    this.floatEl.classList.remove('collapsed');
    this.floatEl.classList.add('expanded');

    // Reposition close to cursor when expanded
    this.positionBelowCursor();

    // Focus the textbox after a short delay to ensure it's visible
    setTimeout(() => {
      this.textboxEl.focus();
    }, 50);

    //logToConsole('Clippy expanded');
  }

  collapse() {
    this.isExpanded = false;
    this.floatEl.classList.remove('expanded');
    this.floatEl.classList.add('collapsed');
    this.textboxEl.value = '';
    this.sendBtn.disabled = true;

    // Reposition and show the icon
    this.show();

    //logToConsole('Clippy collapsed');
  }

  async sendQuestion() {
    const question = this.textboxEl.value.trim();
    if (!question) return;

    //logToConsole(`Clippy: ${question}`);

    try {
      // Send command to server
      const response = await fetch('/api/executecommand', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: sessionId,
          prompt: question
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (result.result) {
        logToConsole(`Response: ${result.result}`, 'info');
      }
    } catch (error) {
      logToConsole(`Error: ${error.message}`, 'error');
    }

    this.textboxEl.value = '';
    this.sendBtn.disabled = true;
    this.collapse();
  }

  show() {
    if (!this.isExpanded) {
      // Only show collapsed icon when not expanded
      this.isVisible = true;
      this.floatEl.style.display = 'block';
      this.positionBelowCursor();
    }
  }

  hide() {
    if (!this.isExpanded) {
      // Only hide when collapsed
      this.isVisible = false;
      this.floatEl.style.display = 'none';
    }
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  loadDocument();

  // Initialize Clippy after a short delay to ensure cursor is ready
  setTimeout(() => {
    window.clippyFloat = new ClippyFloat();

    // Show Clippy when cursor becomes visible
    const checkCursor = setInterval(() => {
      const cursor = window.ipCursor;
      if (cursor && cursor.visible) {
        window.clippyFloat.show();
        clearInterval(checkCursor);
      }
    }, 100);
  }, 500);
});
