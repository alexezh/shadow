import { IPCursor } from "./ip.js"
import {
  queueCommand,
  initQueue,
  logToConsole,
  setSessionId,
  getSessionId,
  currentPartId,
  allParts,
  showAllParts,
  setAllParts,
  setShowAllParts,
  setCurrentPartId
} from "./dom.js"
import { getSelectionRange } from "./dom.js"
import { VirtualDocument, vdomCache } from "./vdom.js"

// Toolbar button handlers
const buttons = {
  bold: document.getElementById('btn-bold') as HTMLButtonElement,
  italic: document.getElementById('btn-italic') as HTMLButtonElement,
  bullet: document.getElementById('btn-bullet') as HTMLButtonElement,
  number: document.getElementById('btn-number') as HTMLButtonElement
};

interface ActionResult {
  result?: {
    changes?: ChangeRecord[];
    newPosition?: { element: string; offset: number };
    newRange?: { startElement: string; startOffset: number; endElement: string; endOffset: number };
  };
}

interface ChangeRecord {
  id: string;
  html: string | null;
  op: 'inserted' | 'changed' | 'ContentChangeRecord';
  prevId?: string;
}

interface StyleRule {
  selector: string;
  properties: Record<string, string>;
}

function applyAction(result: ActionResult): void {
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

// Update cursor position from server response
function updateCursorPosition(newPosition: { element: string; offset: number }): void {
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

  if (textNode && textNode.textContent) {
    cursor.position.node = textNode;
    cursor.position.offset = Math.min(newPosition.offset, textNode.textContent.length);
    cursor.updateCursorPosition();
    cursor.selection.clear();
  }
}

// Update selection from server response
function updateSelection(newRange: { startElement: string; startOffset: number; endElement: string; endOffset: number }): void {
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

// Change polling
async function pollChanges(): Promise<void> {
  if (!getSessionId()) {
    logToConsole('No session ID, skipping poll', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/getchanges?sessionId=${getSessionId()}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responses = await response.json();

    if (responses && responses.length > 0) {
      for (const resp of responses) {
        if (resp.kind === 'console') {
          // Console message - display in console
          const consoleEl = document.getElementById('console');
          if (consoleEl) {
            const div = document.createElement('div');
            div.innerHTML = resp.data.html;
            consoleEl.appendChild(div);
            consoleEl.scrollTop = consoleEl.scrollHeight;
          }
        } else if (resp.kind === 'action') {
          // Action result - apply changes
          const actionResult = resp.data;

          if (actionResult.changes && actionResult.changes.length > 0) {
            applyChanges(actionResult.changes);
          }

          // Update cursor position
          if (actionResult.newPosition) {
            updateCursorPosition(actionResult.newPosition);
          }

          // Update selection if present
          if (actionResult.newRange) {
            updateSelection(actionResult.newRange);
          }
        }
      }
    }

    // Continue polling
    pollChanges();
  } catch (error) {
    logToConsole(`Error polling changes: ${(error as Error).message}`, 'error');
    // Retry after delay
    setTimeout(pollChanges, 2000);
  }
}

// Apply changes to document
function applyChanges(changes: ChangeRecord[]): void {
  // Apply each change based on operation type
  for (const change of changes) {
    const element = document.getElementById(change.id);

    switch (change.op) {
      case 'ContentChangeRecord':
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
            element.innerHTML = change.html || '';
            logToConsole(`Replaced document content`);
          } else {
            element.outerHTML = change.html || '';
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
          tempDiv.innerHTML = change.html || '';
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

  // Update the cached virtual document after changes
  const currentPartId = vdomCache.getCurrentPartId();
  if (currentPartId) {
    const vdom = vdomCache.get(currentPartId);
    if (vdom) {
      const docContent = document.getElementById('doc-content') as HTMLElement;
      if (docContent) {
        vdom.captureFromDOM(docContent);
        vdomCache.set(currentPartId, vdom);
      }
    }
  }
}

// Apply styles to document
function applyStyles(styles: StyleRule[]): void {
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
async function loadDocument(): Promise<void> {
  try {
    logToConsole('Fetching document from server...');

    // Check if we have a sessionId stored (e.g., from previous page load)
    // const storedSessionId = localStorage.getItem('sessionId');
    const headers: Record<string, string> = {};
    // if (storedSessionId) {
    //   headers['XSessionId'] = storedSessionId;
    // }

    const response = await fetch('/api/getdoc', { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    setSessionId(data.sessionId);

    // Store sessionId for future use
    // const currentSessionId = getSessionId();
    // if (currentSessionId) {
    //   localStorage.setItem('sessionId', currentSessionId);
    // }

    const docContent = document.getElementById('doc-content') as HTMLElement;
    if (!docContent) return;

    // Create virtual document for main part
    const partId = 'main';
    const vdom = new VirtualDocument(partId, data.html, data.styles || []);
    vdom.applyToDOM(docContent, 'doc-styles');

    // Store in cache
    vdomCache.set(partId, vdom);
    vdomCache.setCurrentPartId(partId);
    setCurrentPartId(partId);

    logToConsole(`Document loaded, session: ${getSessionId()}`, 'info');

    // Initialize IP cursor after document is loaded
    const cursor = new IPCursor(docContent);
    window.ipCursor = cursor;

    // Focus the document to show cursor
    docContent.focus();

    // Start polling for changes
    pollChanges();
  } catch (error) {
    logToConsole(`Error loading document: ${(error as Error).message}`, 'error');
    const docContent = document.getElementById('doc-content');
    if (docContent) {
      docContent.innerHTML = '<div style="color: #d32f2f;">Failed to load document</div>';
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
    });

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
      if (this.isExpanded && !this.floatEl.contains(e.target as Node)) {
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

  positionBelowCursor(): void {
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

    //logToConsole(`Clippy positioned at (${cursorRect.left + 2}, ${cursorRect.bottom + 2})`);
  }

  expand(): void {
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

  collapse(): void {
    this.isExpanded = false;
    this.floatEl.classList.remove('expanded');
    this.floatEl.classList.add('collapsed');
    this.textboxEl.value = '';
    this.sendBtn.disabled = true;

    // Reposition and show the icon
    this.show();

    //logToConsole('Clippy collapsed');
  }

  async sendQuestion(): Promise<void> {
    const question = this.textboxEl.value.trim();
    if (!question) return;

    //logToConsole(`Clippy: ${question}`);

    try {
      const sessionId = getSessionId();
      const selectionRange = getSelectionRange();
      const payload: Record<string, any> = {
        sessionId,
        prompt: question,
        partId: currentPartId
      };

      if (selectionRange) {
        payload.selectionRange = selectionRange;
      }

      if (sessionId) {
        payload.docId = sessionId;
      }

      // Send command to server
      const response = await fetch('/api/executecommand', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (result.result) {
        logToConsole(`Response: ${result.result}`, 'info');
      }
    } catch (error) {
      logToConsole(`Error: ${(error as Error).message}`, 'error');
    }

    this.textboxEl.value = '';
    this.sendBtn.disabled = true;
    this.collapse();
  }

  show(): void {
    if (!this.isExpanded) {
      // Only show collapsed icon when not expanded
      this.isVisible = true;
      this.floatEl.style.display = 'block';
      this.positionBelowCursor();
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

async function loadParts(): Promise<void> {
  if (!getSessionId()) return;

  try {
    const response = await fetch(`/api/getparts?sessionId=${getSessionId()}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    setAllParts(data.parts || []);
    renderPartsList();
  } catch (error) {
    logToConsole(`Error loading parts: ${(error as Error).message}`, 'error');
  }
}

function renderPartsList(): void {
  const partsListEl = document.getElementById('parts-list');
  const moreBtn = document.getElementById('parts-more-btn');

  if (!partsListEl) return;

  partsListEl.innerHTML = '';

  const displayLimit = showAllParts ? allParts.length : 3;
  const partsToShow = allParts.slice(0, displayLimit);

  partsToShow.forEach(part => {
    const li = document.createElement('li');
    li.className = 'part-item';
    if (part.id === currentPartId) {
      li.classList.add('active');
    }

    li.innerHTML = `
      <span class="part-item-kind">${part.kind}</span>
      <span class="part-item-title">${part.title}</span>
    `;

    li.addEventListener('click', () => {
      selectPart(part.id);
    });

    partsListEl.appendChild(li);
  });

  // Show/hide more button
  if (moreBtn) {
    if (allParts.length > 3 && !showAllParts) {
      moreBtn.style.display = 'block';
      moreBtn.textContent = `more (${allParts.length - 3})`;
    } else if (showAllParts && allParts.length > 3) {
      moreBtn.style.display = 'block';
      moreBtn.textContent = 'less';
    } else {
      moreBtn.style.display = 'none';
    }
  }
}

async function selectPart(partId: string): Promise<void> {
  if (partId === currentPartId) return;

  const docContent = document.getElementById('doc-content') as HTMLElement;
  if (!docContent) return;

  try {
    // Save current document state to cache
    const oldPartId = vdomCache.getCurrentPartId();
    if (oldPartId) {
      const currentVdom = vdomCache.get(oldPartId);
      if (currentVdom) {
        // Capture current DOM state before switching
        currentVdom.captureFromDOM(docContent);
        vdomCache.set(oldPartId, currentVdom);
        logToConsole(`Cached part: ${oldPartId}`, 'info');
      }
    }

    // Check if new part is already in cache
    let vdom = vdomCache.get(partId);

    if (vdom) {
      // Load from cache
      logToConsole(`Loading part from cache: ${partId}`, 'info');
      vdom.applyToDOM(docContent, 'doc-styles');
    } else {
      // Fetch from server
      const response = await fetch(`/api/getpart?sessionId=${getSessionId()}&partId=${partId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Create new virtual document
      vdom = new VirtualDocument(partId, data.html, data.styles || []);
      vdom.applyToDOM(docContent, 'doc-styles');

      // Store in cache
      vdomCache.set(partId, vdom);
      logToConsole(`Fetched and cached part: ${partId}`, 'info');
    }

    // Update current part ID
    setCurrentPartId(partId);
    vdomCache.setCurrentPartId(partId);

    // Re-render parts list to update active state
    renderPartsList();

    logToConsole(`Switched to part: ${partId}`, 'info');

    // Reinitialize cursor for new content
    if (window.ipCursor) {
      window.ipCursor.position = { node: null, offset: 0 };
      window.ipCursor.selection.clear();
      docContent.focus();
    }
  } catch (error) {
    logToConsole(`Error loading part: ${(error as Error).message}`, 'error');
  }
}

async function createPart(kind: string): Promise<void> {
  if (!getSessionId()) return;

  try {
    const response = await fetch('/api/createpart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: getSessionId(),
        kind: kind
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    logToConsole(`Created ${kind} part: ${data.partId}`, 'info');

    // Reload parts list
    await loadParts();

    // Select the new part
    await selectPart(data.partId);
  } catch (error) {
    logToConsole(`Error creating part: ${(error as Error).message}`, 'error');
  }
}

// Parts toolbar button handlers
const addDraftBtn = document.getElementById('btn-add-draft');
const addChatBtn = document.getElementById('btn-add-chat');
const moreBtn = document.getElementById('parts-more-btn');

if (addDraftBtn) {
  addDraftBtn.addEventListener('click', () => {
    createPart('draft');
  });
}

if (addChatBtn) {
  addChatBtn.addEventListener('click', () => {
    createPart('chat');
  });
}

if (moreBtn) {
  moreBtn.addEventListener('click', () => {
    setShowAllParts(!showAllParts);
    renderPartsList();
  });
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  initQueue(applyAction);
  loadDocument();

  // Initialize Clippy after a short delay to ensure cursor is ready
  setTimeout(() => {
    window.clippyFloat = new ClippyFloat();

    // Show Clippy when cursor becomes visible
    const checkCursor = setInterval(() => {
      const cursor = window.ipCursor;
      if (cursor && cursor.visible) {
        window.clippyFloat?.show();
        clearInterval(checkCursor);
      }
    }, 100);

    // Load parts list
    loadParts();
  }, 500);
});
