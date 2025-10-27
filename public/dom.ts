import type { IPCursor } from "./ip";

// Console logging
const consoleEl = document.getElementById('console') as HTMLElement;

// Session management
let sessionId: string | null = null;

// Parts list management
export let currentPartId: string = 'main';
export let allParts: Array<{ id: string; kind: string; title: string }> = [];
export let showAllParts: boolean = false;

// EditorContext getter - will be set by clippy.ts
let getCurrentEditorContext: () => any = () => null;

export function setGetCurrentEditorContext(getter: () => any): void {
  getCurrentEditorContext = getter;
}

export function getEditorContext(): any {
  return getCurrentEditorContext();
}

export function setCurrentPartId(_partId: string): void {
  currentPartId = _partId;
}

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
export function getSelectionRange(): { startElement: string | null; startOffset: number; endElement: string | null; endOffset: number } | null {
  const editorContext = getCurrentEditorContext();
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
      startElement,
      startOffset: cursor.selection.startOffset,
      endElement,
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

export function initQueue(_applyAction: (result: any) => void): void {
  applyAction = _applyAction;
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
let applyAction: ((result: any) => void) | undefined = undefined;
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
      const result = await runAction(cmd.action, cmd.range, cmd.text, cmd.content);
      if (applyAction) {
        applyAction(result);
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

// Command runner
async function runAction(action: string, range: any, text?: string, content?: string): Promise<any> {
  if (!sessionId) {
    logToConsole('No session ID available', 'error');
    return;
  }

  try {
    const body: any = {
      sessionId,
      action,
      range,
      partId: currentPartId
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
    logToConsole(`Error executing action: ${(error as Error).message}`, 'error');
    throw error;
  }
}
