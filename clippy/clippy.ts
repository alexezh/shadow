import { IPCursor } from "./ip.js"
import {
  queueCommand,
  initQueue,
  logToConsole,
  setSessionId,
  getSessionId,
  allParts,
  showAllParts,
  setAllParts,
  setShowAllParts,
} from "./dom.js"
import { getSelectionRange } from "./dom.js"
import { VirtualDocument, vdomCache } from "./vdom.js"
import { EditorContext, CommentThreadRef } from "./editor-context.js"
import { renderCommentThreads, fetchCommentThreads } from "./comments.js"
import { ActionResult, type AgentChange, ContentChangeRecord, CreatePartRequest, CreatePartResponse, type GetDocResponse, PromptRequest } from "../src/server/messages.js"

// Toolbar button handlers
const buttons = {
  bold: document.getElementById('btn-bold') as HTMLButtonElement,
  italic: document.getElementById('btn-italic') as HTMLButtonElement,
  bullet: document.getElementById('btn-bullet') as HTMLButtonElement,
  number: document.getElementById('btn-number') as HTMLButtonElement
};

interface StyleRule {
  selector: string;
  properties: Record<string, string>;
}

buttons.bold.addEventListener('click', async (e) => {
  e.preventDefault();
  buttons.bold.blur(); // Remove focus from button

  buttons.bold.classList.toggle('active');
  const range = getSelectionRange();
  if (range) {
    queueCommand('bold', range);
  }

  // Refocus document to restore keyboard handling
  const docContent = document.getElementById('doc-content');
  if (docContent) {
    docContent.focus();
  }
  //logToConsole('Bold toggled');
});

buttons.italic.addEventListener('click', async (e) => {
  e.preventDefault();
  buttons.italic.blur(); // Remove focus from button

  buttons.italic.classList.toggle('active');
  const range = getSelectionRange();
  if (range) {
    queueCommand('italic', range);
  }

  // Refocus document to restore keyboard handling
  const docContent = document.getElementById('doc-content');
  if (docContent) {
    docContent.focus();
  }
  //logToConsole('Italic toggled');
});

buttons.bullet.addEventListener('click', async (e) => {
  e.preventDefault();
  buttons.bullet.blur(); // Remove focus from button

  const range = getSelectionRange();
  if (range) {
    queueCommand('bullet', range);
  }

  // Refocus document to restore keyboard handling
  const docContent = document.getElementById('doc-content');
  if (docContent) {
    docContent.focus();
  }
  //logToConsole('Bullet list clicked');
});

buttons.number.addEventListener('click', async (e) => {
  e.preventDefault();
  buttons.number.blur(); // Remove focus from button

  const range = getSelectionRange();
  if (range) {
    queueCommand('number', range);
  }

  // Refocus document to restore keyboard handling
  const docContent = document.getElementById('doc-content');
  if (docContent) {
    docContent.focus();
  }
  //logToConsole('Numbered list clicked');
});

let pollDelay = 10000;
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

    pollDelay = 10000;
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
        } else if (resp.kind === 'agent') {
          // Action result - apply changes
          const actionResult = resp.data as AgentChange;

          if (actionResult.changes && actionResult.changes.length > 0) {
            applyChanges(actionResult.changes);
          }
        }
      }
    }

    // Continue polling
    setTimeout(async () => {
      await pollChanges();
    }, 0);
  } catch (error) {
    logToConsole(`Error polling changes: ${(error as Error).message}`, 'error');
    // Retry after delay
    setTimeout(pollChanges, pollDelay);
    pollDelay *= 2;
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

    const headers: Record<string, string> = {};
    const response = await fetch('/api/getdoc', { headers });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as GetDocResponse;
    setSessionId(data.sessionId);

    const docContent = document.getElementById('doc-content') as HTMLElement;
    if (!docContent) return;

    // Create virtual document for main part
    const partId = 'main';
    const commentThreadRefs: CommentThreadRef[] = data.comments || [];
    const vdom = new VirtualDocument(partId, data.html, data.styles || [], commentThreadRefs);
    vdom.applyToDOM(docContent, 'doc-styles');

    // Initialize editor context
    vdom.initializeEditorContext(docContent);
    currentEditorContext = vdom.editorContext;

    // Store in cache
    vdomCache.set(partId, vdom);
    vdomCache.setCurrentPartId(partId);
    setCurrentPartId(partId);

    // Load comment threads if any
    if (commentThreadRefs.length > 0 && currentEditorContext) {
      const sessionId = getSessionId();
      if (sessionId) {
        const threads = await fetchCommentThreads(sessionId, partId, commentThreadRefs);
        for (const thread of threads) {
          currentEditorContext.setCommentThread(thread);
        }
        renderCommentThreads(currentEditorContext);
      }
    }

    logToConsole(`Document loaded, session: ${getSessionId()}`, 'info');

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
      logToConsole("floaty mouse down");
    });

    // Click on icon to expand
    this.iconEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.expand();
    });

    // Click on float: expand if collapsed, prevent propagation if expanded
    this.floatEl.addEventListener('click', (e) => {
      if (!this.isExpanded) {
        e.stopPropagation();
        this.expand();
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
  }

  positionBelowCursor(): void {
    const cursor = currentEditorContext?.cursor;
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

  expand(): void {
    logToConsole("floaty expand");
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

    // Restore focus to document to re-enable keyboard input
    const docContent = document.getElementById('doc-content');
    if (docContent) {
      docContent.focus();
    }

    //logToConsole('Clippy collapsed');
  }

  async sendQuestion(): Promise<void> {
    const question = this.textboxEl.value.trim();
    if (!question) return;

    //logToConsole(`Clippy: ${question}`);

    try {
      const sessionId = getSessionId();
      const selectionRange = getSelectionRange();
      const payload: PromptRequest = {
        sessionId: sessionId!,
        prompt: question,
        partId: currentPartId,
      };

      if (selectionRange) {
        payload.selection = selectionRange;
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

      // Restore editor context
      currentEditorContext = vdom.editorContext;
    } else {
      // Fetch from server
      const response = await fetch(`/api/getpart?sessionId=${getSessionId()}&partId=${partId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Create new virtual document
      const commentThreadRefs: CommentThreadRef[] = data.commentThreadRefs || [];
      vdom = new VirtualDocument(partId, data.html, data.styles || [], commentThreadRefs);
      vdom.applyToDOM(docContent, 'doc-styles');

      // Initialize editor context
      vdom.initializeEditorContext(docContent);
      currentEditorContext = vdom.editorContext;

      // Load comment threads if any
      if (commentThreadRefs.length > 0 && currentEditorContext) {
        const sessionId = getSessionId();
        if (sessionId) {
          const threads = await fetchCommentThreads(sessionId, partId, commentThreadRefs);
          for (const thread of threads) {
            currentEditorContext.setCommentThread(thread);
          }
        }
      }

      // Store in cache
      vdomCache.set(partId, vdom);
      logToConsole(`Fetched and cached part: ${partId}`, 'info');
    }

    // Render comments for this part
    if (currentEditorContext) {
      renderCommentThreads(currentEditorContext);
    }

    // Update current part ID
    setCurrentPartId(partId);
    vdomCache.setCurrentPartId(partId);

    // Re-render parts list to update active state
    renderPartsList();

    logToConsole(`Switched to part: ${partId}`, 'info');

    // Reinitialize cursor for new content
    if (currentEditorContext?.cursor) {
      currentEditorContext.cursor.position = { node: null, offset: 0 };
      currentEditorContext.cursor.selection.clear();
      docContent.focus();
    }
  } catch (error) {
    logToConsole(`Error loading part: ${(error as Error).message}`, 'error');
  }
}

async function createPart(kind: "chat" | "draft"): Promise<void> {
  if (!getSessionId()) return;

  try {
    // Get current selection range to copy to new part
    const selectionRange = getSelectionRange();

    const request: CreatePartRequest = {
      sessionId: getSessionId()!,
      kind: kind,
      selectionRange: selectionRange
    };

    const response = await fetch('/api/createpart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as CreatePartResponse;
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
  loadDocument();

  // Initialize Clippy after a short delay to ensure editor context is ready
  setTimeout(() => {
    const clippyFloat = new ClippyFloat();

    // Store clippy in editor context when available
    if (currentEditorContext) {
      currentEditorContext.clippyFloat = clippyFloat;
    }

    // Show Clippy when cursor becomes visible
    const checkCursor = setInterval(() => {
      const cursor = currentEditorContext?.cursor;
      if (cursor && cursor.visible) {
        clippyFloat.show();
        clearInterval(checkCursor);
      }
    }, 100);

    // Load parts list
    loadParts();
  }, 500);
});
