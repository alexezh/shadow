// Console logging
const consoleEl = document.getElementById('console');

// Session management
let sessionId = null;
// Parts list management
export let currentPartId = 'main';
export let allParts = [];
export let showAllParts = false;

export function setAllParts(_parts) {
  allParts = _parts;
}

export function setShowAllParts(_show) {
  showAllParts = _show;
}

export function setSessionId(_sessionId) {
  sessionId = _sessionId;
}

export function getSessionId() {
  return sessionId;
}

export function logToConsole(message, type = 'info') {
  const line = document.createElement('div');
  line.className = `console-line ${type}`;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

// Find element ID for a node
export function findElementId(node) {
  let element = node;
  if (element.nodeType === Node.TEXT_NODE) {
    element = element.parentElement;
  }

  while (element && !element.id) {
    element = element.parentElement;
  }

  return element ? element.id : null;
}

// Get current selection range
export function getSelectionRange() {
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

export function initQueue(_applyAction) {
  applyAction = _applyAction;
}

// Add command to queue
export function queueCommand(action, range, text, content) {
  commandQueue.push({ action, range, text, content });
  processQueue();
}

// Command queue
let commandQueue = [];
let applyAction = undefined;
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
      applyAction(result);
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
async function runAction(action, range, text, content) {
  if (!sessionId) {
    logToConsole('No session ID available', 'error');
    return;
  }

  try {
    const body = {
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
    logToConsole(`Error executing action: ${error.message}`, 'error');
    throw error;
  }
}
