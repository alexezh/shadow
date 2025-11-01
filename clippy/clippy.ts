import {
  queueCommand,
  logToConsole,
  setSessionId,
  getSessionId,
  allParts,
  showAllParts,
  setAllParts,
  setShowAllParts,
  applyAgentChanges,
  applyAction,
} from "./dom.js"
import { getSelectionRange } from "./dom.js"
import { VirtualDocument, vdomCache } from "./vdom.js"
import { EditorContext, CommentThreadRef, getCurrentEditorContext, setCurrentEditorContext } from "./editor-context.js"
import { renderCommentThreads, fetchCommentThreads } from "./comments.js"
import { ActionResult, type AgentChange, ConsoleResult, ContentChangeRecord, CreatePartRequest, CreatePartResponse, GetChangesResponse, type GetDocPartResponse, PromptRequest } from "../src/server/messages.js"
import { createChatFromPartId } from "./chat.js"

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
  const range = getSelectionRange(getCurrentEditorContext());
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
  const range = getSelectionRange(getCurrentEditorContext());
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

  const range = getSelectionRange(getCurrentEditorContext());
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

  const range = getSelectionRange(getCurrentEditorContext());
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
    const responses = await response.json() as GetChangesResponse[];

    if (responses && responses.length > 0) {
      for (const resp of responses) {
        if (resp.kind === 'console') {
          // Console message - display in console
          const consoleEl = document.getElementById('console');
          if (consoleEl) {
            const div = document.createElement('div');
            div.innerHTML = (resp.data as ConsoleResult).html;
            consoleEl.appendChild(div);
            consoleEl.scrollTop = consoleEl.scrollHeight;
          }
        } else if (resp.kind === 'action') {
          // Action result - apply changes
          const actionResult = resp.data as ActionResult;

          const editorContext = vdomCache.get((resp.data as ActionResult).partId!)?.editorContext;
          if (!editorContext) {
            logToConsole("pollChanges: cannot find part:" + (resp.data as ActionResult).partId);
            continue;
          }

          applyAction(editorContext, actionResult);
        } else if (resp.kind === 'agent') {
          // Action result - apply changes
          const actionResult = resp.data as AgentChange;

          const editorContext = vdomCache.get((resp.data as AgentChange).partId!)?.editorContext;
          if (!editorContext) {
            logToConsole("pollChanges: cannot find part:" + (resp.data as AgentChange).partId);
            continue;
          }

          applyAgentChanges(editorContext, actionResult.changes);
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

    const data = await response.json() as GetDocPartResponse;
    setSessionId(data.sessionId);

    const docContent = document.getElementById('doc-content') as HTMLElement;
    if (!docContent) return;

    // Create virtual document for main part
    const partId = 'main';
    const commentThreadRefs: CommentThreadRef[] = data.comments || [];
    const vdom = new VirtualDocument({
      partId: data.partId,
      containerEl: docContent,
      styleElId: 'doc-styles',
      html: data.html,
      styles: data.styles || [],
      commentThreadRefs
    });

    setCurrentEditorContext(vdom.editorContext!);

    // Store in cache
    vdomCache.set(partId, vdom);

    // Load comment threads if any
    if (commentThreadRefs.length > 0 && vdom.editorContext) {
      const sessionId = getSessionId();
      if (sessionId) {
        const threads = await fetchCommentThreads(sessionId, partId, commentThreadRefs);
        for (const thread of threads) {
          vdom.setCommentThread(thread);
        }
        renderCommentThreads(vdom.editorContext);
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

  const currentContext = getCurrentEditorContext();
  partsToShow.forEach(part => {
    const li = document.createElement('li');
    li.className = 'part-item';
    if (part.id === currentContext?.partId) {
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

  const docContent = document.getElementById('doc-content') as HTMLElement;
  if (!docContent) return;

  try {
    // Check if this is a chat part
    const partInfo = allParts.find(p => p.id === partId);
    if (partInfo && partInfo.kind === 'chat') {
      // Render inline chat
      await createChatFromPartId(getSessionId()!, partId, true, docContent);
      renderPartsList();
      logToConsole(`Switched to chat part: ${partId}`, 'info');
      return;
    }

    // Check if new part is already in cache
    let vdom = vdomCache.get(partId);

    if (vdom) {
      // Load from cache
      logToConsole(`Loading part from cache: ${partId}`, 'info');

      // Re-render the cached document to the shadow root
      vdom.render();

      // Restore editor context
      setCurrentEditorContext(vdom.editorContext!);

      // Reattach clippy float to the restored context
      const clippyFloat = (window as any).__clippyFloat;
      if (clippyFloat && vdom.editorContext) {
        vdom.editorContext.clippyFloat = clippyFloat;
      }
    } else {
      // Fetch from server
      const response = await fetch(`/api/getpart?sessionId=${getSessionId()}&partId=${partId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as GetDocPartResponse;

      // Create new virtual document
      const commentThreadRefs: CommentThreadRef[] = data.comments || [];
      vdom = new VirtualDocument({
        partId: partId,
        containerEl: docContent,
        styleElId: 'doc-styles',
        html: data.html,
        styles: data.styles || [],
        commentThreadRefs
      });

      // Initialize editor context
      setCurrentEditorContext(vdom.editorContext!);

      // Attach clippy float to the new context
      const clippyFloat = (window as any).__clippyFloat;
      if (clippyFloat && vdom.editorContext) {
        vdom.editorContext.clippyFloat = clippyFloat;
      }

      // Load comment threads if any
      if (commentThreadRefs.length > 0 && vdom.editorContext) {
        const sessionId = getSessionId();
        if (sessionId) {
          const threads = await fetchCommentThreads(sessionId, partId, commentThreadRefs);
          for (const thread of threads) {
            vdom.setCommentThread(thread);
          }
        }
      }

      // Store in cache
      vdomCache.set(partId, vdom);
      logToConsole(`Fetched and cached part: ${partId}`, 'info');
    }

    // Render comments for this part
    if (vdom.editorContext) {
      renderCommentThreads(vdom.editorContext);
    }

    // Re-render parts list to update active state
    renderPartsList();

    logToConsole(`Switched to part: ${partId}`, 'info');

    // Reinitialize cursor for new content
    if (vdom.editorContext?.cursor) {
      // REVIEW: this does not make sense
      vdom.editorContext.cursor.position = { node: null, offset: 0 };
      vdom.editorContext.cursor.selection.clear();
      docContent.focus();

      // Position cursor at the first paragraph and show clippy
      setTimeout(() => {
        const shadowRoot = docContent.shadowRoot;

        // REVIEW: this does not make sense
        if (shadowRoot && vdom.editorContext?.cursor) {
          const firstPara = shadowRoot.querySelector('p[id]');
          if (firstPara) {
            // Find first text node in paragraph
            const walker = document.createTreeWalker(
              firstPara,
              NodeFilter.SHOW_TEXT,
              null
            );
            const firstTextNode = walker.nextNode();

            if (firstTextNode) {
              vdom.editorContext.cursor.position = { node: firstTextNode, offset: 0 };
              vdom.editorContext.cursor.updateCursorPosition();
              vdom.editorContext.cursor.show();
            }
          }
        }

        // Show clippy
        if (vdom.editorContext) {
          vdom.editorContext.showFloaty();
        }
      }, 100);
    }
  } catch (error) {
    logToConsole(`Error loading part: ${(error as Error).message}`, 'error');
  }
}

async function createPart(editorContext: EditorContext | null, kind: "chat" | "draft" | "prompt"): Promise<void> {
  if (!editorContext) return;

  try {
    // Get current selection range to copy to new part
    const selectionRange = getSelectionRange(editorContext);

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
    createPart(getCurrentEditorContext(), 'draft');
  });
}

if (addChatBtn) {
  addChatBtn.addEventListener('click', () => {
    createPart(getCurrentEditorContext(), 'chat');
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

    const currentEditorContext = getCurrentEditorContext();
    // TODO: review
    // Show Clippy when cursor becomes visible
    const checkCursor = setInterval(() => {
      const cursor = currentEditorContext?.cursor;
      if (cursor && cursor.visible) {
        currentEditorContext.showFloaty();
        clearInterval(checkCursor);
      }
    }, 100);

    // Load parts list
    loadParts();
  }, 500);
});

