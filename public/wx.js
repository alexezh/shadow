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

// Command runner
async function runAction(action, range) {
  if (!sessionId) {
    logToConsole('No session ID available', 'error');
    return;
  }

  try {
    const response = await fetch('/api/runAction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        action,
        range
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    logToConsole(`Command '${action}' executed successfully`);
    return result;
  } catch (error) {
    logToConsole(`Error executing command: ${error.message}`, 'error');
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

  return {
    startElement: element.id,
    startOffset: cursor.position.offset,
    endElement: element.id,
    endOffset: cursor.position.offset
  };
}

buttons.bold.addEventListener('click', async () => {
  buttons.bold.classList.toggle('active');
  const range = getSelectionRange();
  if (range) {
    await runAction('bold', range);
  }
  logToConsole('Bold toggled');
});

buttons.italic.addEventListener('click', async () => {
  buttons.italic.classList.toggle('active');
  const range = getSelectionRange();
  if (range) {
    await runAction('italic', range);
  }
  logToConsole('Italic toggled');
});

buttons.bullet.addEventListener('click', async () => {
  const range = getSelectionRange();
  if (range) {
    await runAction('bullet', range);
  }
  logToConsole('Bullet list clicked');
});

buttons.number.addEventListener('click', async () => {
  const range = getSelectionRange();
  if (range) {
    await runAction('number', range);
  }
  logToConsole('Numbered list clicked');
});

// IP Cursor (Insertion Point) management
class IPCursor {
  constructor(documentEl) {
    this.documentEl = documentEl;
    this.cursorEl = null;
    this.position = { node: null, offset: 0 };
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
    });

    // Mouse move to continuously position cursor while mouse is down
    let isMouseDown = false;

    this.documentEl.addEventListener('mousedown', () => {
      isMouseDown = true;
    });

    document.addEventListener('mouseup', () => {
      isMouseDown = false;
    });

    this.documentEl.addEventListener('mousemove', (e) => {
      if (isMouseDown) {
        this.positionAtClick(e);
      }
    });

    // Disable context menu
    this.documentEl.addEventListener('contextmenu', (e) => {
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
      logToConsole('Document focused');
    });

    this.documentEl.addEventListener('blur', () => {
      this.hide();
    });
  }

  positionAtClick(e) {
    // Get the clicked position
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!range) return;

    this.position.node = range.startContainer;
    this.position.offset = range.startOffset;

    this.updateCursorPosition();
    this.show();

    logToConsole(`Cursor positioned at offset ${this.position.offset}`);
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

    // Handle arrow keys
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.moveLeft();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.moveRight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moveUp();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moveDown();
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.moveToLineStart();
    } else if (e.key === 'End') {
      e.preventDefault();
      this.moveToLineEnd();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // Regular character input
      e.preventDefault();
      this.insertCharacter(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      this.deleteBackward();
    } else if (e.key === 'Delete') {
      e.preventDefault();
      this.deleteForward();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.handleEnter();
    }
  }

  async handleEnter() {
    if (!this.position.node) return;

    // Get the range for the split action
    const range = getSelectionRange();
    if (range) {
      await runAction('split', range);
      logToConsole('Enter pressed - split paragraph');
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
    logToConsole(`Moved right to offset ${this.position.offset}`);
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
      logToConsole('Moved up');
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
      logToConsole('Moved down');
    }
  }

  moveToLineStart() {
    // Simplified: move to start of current text node
    this.position.offset = 0;
    this.updateCursorPosition();
    logToConsole('Moved to line start');
  }

  moveToLineEnd() {
    // Simplified: move to end of current text node
    if (this.position.node) {
      this.position.offset = this.position.node.textContent?.length || 0;
    }
    this.updateCursorPosition();
    logToConsole('Moved to line end');
  }

  insertCharacter(char) {
    if (!this.position.node) return;

    // If we're at a text node, insert the character
    if (this.position.node.nodeType === Node.TEXT_NODE) {
      const text = this.position.node.textContent || '';
      const newText = text.slice(0, this.position.offset) + char + text.slice(this.position.offset);
      this.position.node.textContent = newText;
      this.position.offset++;
    } else {
      // Create a new text node
      const textNode = document.createTextNode(char);
      this.position.node.appendChild(textNode);
      this.position.node = textNode;
      this.position.offset = 1;
    }

    this.updateCursorPosition();
    logToConsole(`Inserted: ${char}`);
  }

  deleteBackward() {
    if (!this.position.node || this.position.offset === 0) {
      logToConsole('Cannot delete: at start');
      return;
    }

    if (this.position.node.nodeType === Node.TEXT_NODE) {
      const text = this.position.node.textContent || '';
      const newText = text.slice(0, this.position.offset - 1) + text.slice(this.position.offset);
      this.position.node.textContent = newText;
      this.position.offset--;

      this.updateCursorPosition();
      logToConsole('Deleted backward');
    }
  }

  deleteForward() {
    if (!this.position.node) return;

    if (this.position.node.nodeType === Node.TEXT_NODE) {
      const text = this.position.node.textContent || '';
      if (this.position.offset >= text.length) {
        logToConsole('Cannot delete: at end');
        return;
      }

      const newText = text.slice(0, this.position.offset) + text.slice(this.position.offset + 1);
      this.position.node.textContent = newText;

      this.updateCursorPosition();
      logToConsole('Deleted forward');
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
      applyChanges(changes);
      logToConsole(`Applied ${changes.length} changes`);
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
  // Save current cursor position
  const cursor = window.ipCursor;
  const savedPosition = cursor ? {
    elementId: cursor.position.node ? findElementId(cursor.position.node) : null,
    offset: cursor.position.offset
  } : null;

  // Apply each change
  for (const change of changes) {
    const element = document.getElementById(change.id);
    if (element) {
      // Special case: replacing entire doc-content
      if (change.id === 'doc-content') {
        element.innerHTML = change.html;
        logToConsole(`Replaced document content`);
      } else {
        element.outerHTML = change.html;
        logToConsole(`Updated element ${change.id}`);
      }
    }
  }

  // Restore cursor position if possible
  if (savedPosition && savedPosition.elementId) {
    const element = document.getElementById(savedPosition.elementId);
    if (element && cursor) {
      // Find first text node in element
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null
      );
      const textNode = walker.nextNode();
      if (textNode) {
        cursor.position.node = textNode;
        cursor.position.offset = Math.min(savedPosition.offset, textNode.textContent.length);
        cursor.updateCursorPosition();
      }
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

// Document loading
async function loadDocument() {
  try {
    logToConsole('Fetching document from server...');
    const response = await fetch('/api/getdoc');

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    sessionId = data.sessionId;

    const docContent = document.getElementById('doc-content');
    docContent.innerHTML = data.html;

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

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Click on icon to expand
    this.iconEl.addEventListener('click', () => {
      this.expand();
    });

    // Click on collapsed float to expand
    this.floatEl.addEventListener('click', (e) => {
      if (!this.isExpanded && e.target === this.floatEl) {
        this.expand();
      }
    });

    // Enable/disable send button based on text input and auto-expand height
    this.textboxEl.addEventListener('input', () => {
      const hasText = this.textboxEl.value.trim().length > 0;
      this.sendBtn.disabled = !hasText;

      // Auto-expand textarea height
      this.autoExpandTextarea();
    });

    // Send on button click
    this.sendBtn.addEventListener('click', () => {
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
  }

  autoExpandTextarea() {
    // Reset height to auto to get the correct scrollHeight
    this.textboxEl.style.height = 'auto';

    // Calculate number of lines (max 10)
    const lineHeight = 20; // matches CSS line-height
    const maxLines = 10;
    const maxHeight = lineHeight * maxLines;

    const newHeight = Math.min(this.textboxEl.scrollHeight, maxHeight);
    this.textboxEl.style.height = `${newHeight}px`;
  }

  positionBelowCursor() {
    const cursor = window.ipCursor;
    if (!cursor || !cursor.cursorEl) return;

    const cursorRect = cursor.cursorEl.getBoundingClientRect();

    // Position below and slightly to the right of cursor
    this.floatEl.style.left = `${cursorRect.left + 10}px`;
    this.floatEl.style.top = `${cursorRect.bottom + 10}px`;
    this.floatEl.style.display = 'block';
  }

  expand() {
    this.isExpanded = true;
    this.floatEl.classList.remove('collapsed');
    this.floatEl.classList.add('expanded');
    this.textboxEl.focus();
    logToConsole('Clippy expanded');
  }

  collapse() {
    this.isExpanded = false;
    this.floatEl.classList.remove('expanded');
    this.floatEl.classList.add('collapsed');
    this.textboxEl.value = '';
    this.textboxEl.style.height = 'auto';
    this.sendBtn.disabled = true;
    logToConsole('Clippy collapsed');
  }

  async sendQuestion() {
    const question = this.textboxEl.value.trim();
    if (!question) return;

    logToConsole(`Clippy: ${question}`);

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
    this.positionBelowCursor();
  }

  hide() {
    this.floatEl.style.display = 'none';
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
