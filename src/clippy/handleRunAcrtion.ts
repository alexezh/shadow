import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Session } from './session.js';

export type RunActionRequest = {
  sessionId: string;
  action: string;
  range: {
    startElement: string;
    startOffset: number;
    endElement: string;
    endOffset: number;
  }
}

export function handleRunAction(session: Session, req: RunActionRequest): Array<{ id: string; html: string }> {
  // Process command and generate changes
  // For now, just acknowledge the command
  // In a real implementation, this would:
  // 1. Find the element by range.startElement
  // 2. Apply the formatting (bold, italic, etc.) or split paragraph
  // 3. Generate new HTML
  // 4. Queue the change for this session

  let changes = [];

  if (req.action === 'split') {
    // Split paragraph at cursor position
    // For now, create two paragraphs
    const newId = `p_${Date.now()}`;
    changes = [
      {
        id: req.range.startElement,
        html: `<p id="${req.range.startElement}">First part</p>`
      },
      {
        id: newId,
        html: `<p id="${newId}">Second part</p>`
      }
    ];
  } else {
    // Other formatting commands
    changes = [
      {
        id: req.range.startElement,
        html: `<p id="${req.range.startElement}">Modified content (${req.action})</p>`
      }
    ];
  }

  // Queue changes for this session
  session.pendingChanges.push(...changes);
}