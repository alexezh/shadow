import type { YRange } from "../src/om/YRange.js";
import type { ActionResult, ContentChangeRecord } from "../src/server/messages.js";
import type { EditorContext } from "./editor-context.js";
import { vdomCache } from "./vdom.js";

// Console logging
const consoleEl = document.getElementById('console') as HTMLElement;

/**
 * Get element by ID, checking both document and shadow DOM
 * @param id Element ID to find
 * @param shadowRoot Optional shadow root to search within
 * @returns HTMLElement or null
 */
function getElementByIdInContext(id: string, shadowRoot?: ShadowRoot | null): HTMLElement | null {
  if (shadowRoot) {
    return shadowRoot.querySelector(`#${CSS.escape(id)}`);
  }
  return document.getElementById(id);
}


// Session management
let sessionId: string | null = null;

// Parts list management
export let allParts: Array<{ id: string; kind: string; title: string }> = [];
export let showAllParts: boolean = false;

export function setAllParts(_parts: Array<{ id: string; kind: string; title: string }>): void {
  allParts = _parts;
}

export function setShowAllParts(_show: boolean): void {
  showAllParts = _show;
}

export function setSessionId(_sessionId: string): void {
  sessionId = _sessionId;
}

export function getSessionId(): string | null {
  return sessionId;
}

export function logToConsole(message: string, type: 'info' | 'error' | 'warn' = 'info'): void {
  const line = document.createElement('div');
  line.className = `console-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// Find element ID for a node
export function findElementId(node: Node | null): string | null {
  if (!node) return null;

  let element: Node | null = node;
  if (element.nodeType === Node.TEXT_NODE) {
    element = element.parentElement;
  }

  while (element && !(element as HTMLElement).id) {
    element = (element as HTMLElement).parentElement;
  }

  return element ? (element as HTMLElement).id : null;
}

// Get current selection range
export function getSelectionRange(editorContext: EditorContext | null): YRange | null {
  if (!editorContext) {
    return null;
  }

  const cursor = editorContext?.cursor;
  if (!cursor || !cursor.position.node) {
    return null;
  }

  // Find the element ID for the current node
  let element: Node | null = cursor.position.node;
  if (element!.nodeType === Node.TEXT_NODE) {
    element = element!.parentElement;
  }

  // Walk up to find an element with an ID
  while (element && !(element as HTMLElement).id) {
    element = (element as HTMLElement).parentElement;
  }

  if (!element) {
    return null;
  }

  // Check if there's a selection
  if (cursor.selection.active) {
    const startElement = findElementId(cursor.selection.startNode);
    const endElement = findElementId(cursor.selection.endNode);

    return {
      startElement: startElement!,
      startOffset: cursor.selection.startOffset,
      endElement: endElement!,
      endOffset: cursor.selection.endOffset
    };
  }

  return {
    startElement: (element as HTMLElement).id,
    startOffset: cursor.position.offset,
    endElement: (element as HTMLElement).id,
    endOffset: cursor.position.offset
  };
}

// Add command to queue
export function queueCommand(action: string, range: any, text?: string, content?: string): void {
  commandQueue.push({ action, range, text, content });
  processQueue();
}

// Command queue
interface QueueCommand {
  action: string;
  range: any;
  text?: string;
  content?: string;
}

let commandQueue: QueueCommand[] = [];
let isProcessingQueue: boolean = false;

// Queue processor
async function processQueue(): Promise<void> {
  if (isProcessingQueue || commandQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  try {
    // Take all queued commands
    const commands = commandQueue.splice(0);

    for (const cmd of commands) {
      const result = await sendRunAction(cmd.action, cmd.range, cmd.text, cmd.content);
      const vdom = vdomCache.get(result.partId);
      if (!vdom) {
        logToConsole("processQueue: cannot find part: " + result.partId);
        continue;
      }
      applyAction(vdom.editorContext!, result);
    }
  } finally {
    isProcessingQueue = false;

    // Process any new commands that arrived
    if (commandQueue.length > 0) {
      setTimeout(processQueue, 0);
    }
  }
}

// Command runner
async function sendRunAction(partId: string, action: string, range: any, text?: string, content?: string): Promise<any> {
  if (!sessionId) {
    logToConsole('No session ID available', 'error');
    return;
  }

  try {
    const body: any = {
      sessionId,
      action,
      range,
      partId: partId
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

    const result = await response.json() as ActionResult;
    //logToConsole(`Action '${action}' executed successfully`);
    return result;
  } catch (error) {
    logToConsole(`Error executing action: ${(error as Error).message}`, 'error');
    throw error;
  }
}

export function applyAction(editorCtx: EditorContext, result: ActionResult): void {
  if (result) {
    // Apply changes from result
    if (result.changes && result.changes.length > 0) {
      applyChanges(editorCtx, result.changes);
    }

    // Update cursor position
    if (result.newPosition) {
      updateCursorPosition(editorCtx, result.newPosition);
    }

    // Update selection if present
    if (result.newRange) {
      updateSelection(editorCtx, result.newRange);
    }
  }
}

export function applyAgentChanges(editorCtx: EditorContext, changes: ContentChangeRecord[]): void {
  if (!changes || changes.length === 0) {
    return
  }
  applyChanges(editorCtx, changes);
}

// Apply changes to document
function applyChanges(editorCtx: EditorContext, changes: ContentChangeRecord[]): void {
  const shadowRoot = editorCtx.getShadowRoot();

  // Apply each change based on operation type
  for (const change of changes) {
    const element = getElementByIdInContext(change.id, shadowRoot);

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
          // Special case: replacing entire shadow-content
          if (change.id === 'shadow-content') {
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
              const prevElement = getElementByIdInContext(change.prevId, shadowRoot);
              if (prevElement && prevElement.parentElement) {
                // Insert right after prevElement
                prevElement.parentElement.insertBefore(newElement, prevElement.nextSibling);
                //logToConsole(`Inserted new element ${change.id} after ${change.prevId}`);
              } else {
                logToConsole(`Warning: prevId ${change.prevId} not found, inserting at beginning`, 'warn');
                // Fallback: insert as first paragraph
                const contentWrapper = shadowRoot?.querySelector('#shadow-content');
                if (contentWrapper && contentWrapper.firstChild) {
                  const firstChild = contentWrapper.firstChild.firstChild;
                  if (firstChild) {
                    contentWrapper.firstChild.insertBefore(newElement, firstChild);
                  } else {
                    contentWrapper.firstChild.appendChild(newElement);
                  }
                }
              }
            } else {
              // No prevId - insert as first paragraph
              const contentWrapper = shadowRoot?.querySelector('#shadow-content');
              if (contentWrapper && contentWrapper.firstChild) {
                const firstChild = contentWrapper.firstChild.firstChild;
                if (firstChild) {
                  contentWrapper.firstChild.insertBefore(newElement, firstChild);
                  logToConsole(`Inserted new element ${change.id} at beginning`);
                } else {
                  contentWrapper.firstChild.appendChild(newElement);
                  logToConsole(`Inserted new element ${change.id} (no children)`);
                }
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

  // Note: Virtual document cache updates are handled at a higher level
}

// Update cursor position from server response
export function updateCursorPosition(editorCtx: EditorContext, newPosition: { element: string; offset: number }): void {
  const cursor = editorCtx.cursor;
  if (!cursor) return;

  const shadowRoot = editorCtx.getShadowRoot();
  const element = getElementByIdInContext(newPosition.element, shadowRoot);
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
export function updateSelection(
  editorCtx: EditorContext,
  newRange: { startElement: string; startOffset: number; endElement: string; endOffset: number }): void {
  const cursor = editorCtx.cursor;
  if (!cursor) return;

  const shadowRoot = editorCtx.getShadowRoot();
  const startElement = getElementByIdInContext(newRange.startElement, shadowRoot);
  const endElement = getElementByIdInContext(newRange.endElement, shadowRoot);

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
