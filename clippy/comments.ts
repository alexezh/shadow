import { CommentThread, Comment, EditorContext } from "./editor-context.js";
import { logToConsole, getSessionId } from "./dom.js";
import { createChatFromThread } from "./chat.js";
import type { GetThreadResponse } from "../src/server/messages.js";

/**
 * Render comment threads floating next to their paragraphs
 */
export function renderCommentThreads(editorContext: EditorContext): void {
  // Remove any existing floating comment threads
  const existingThreads = document.querySelectorAll('.comment-thread-float');
  existingThreads.forEach(el => el.remove());

  const threads = editorContext.vdom.getAllCommentThreads();

  logToConsole(`Rendering ${threads.length} comment threads`, 'info');

  if (threads.length === 0) {
    return;
  }

  // Render each thread floating next to its paragraph
  for (const thread of threads) {
    logToConsole(`Rendering thread ${thread.id} for paragraph ${thread.paragraphId}`, 'info');
    const paragraph = document.getElementById(thread.paragraphId);
    if (!paragraph) {
      logToConsole(`Paragraph ${thread.paragraphId} not found for thread ${thread.id}`, 'warn');
      continue;
    }

    const threadEl = createFloatingCommentThreadElement(thread);
    document.body.appendChild(threadEl);

    // Position thread next to paragraph
    positionThreadNextToParagraph(threadEl, paragraph);
    logToConsole(`Thread ${thread.id} positioned at left=${threadEl.style.left}, top=${threadEl.style.top}`, 'info');
  }

  // Reposition threads on window resize
  window.addEventListener('resize', () => {
    for (const thread of threads) {
      const paragraph = document.getElementById(thread.paragraphId);
      const threadEl = document.getElementById(`thread-float-${thread.id}`);
      if (paragraph && threadEl) {
        positionThreadNextToParagraph(threadEl as HTMLElement, paragraph);
      }
    }
  });
}

/**
 * Create a comment thread element
 */
function createCommentThreadElement(thread: CommentThread): HTMLElement {
  const threadEl = document.createElement('div');
  threadEl.className = 'comment-thread' + (thread.resolved ? ' comment-resolved' : '');
  threadEl.id = `thread-${thread.id}`;

  // Thread header
  const headerEl = document.createElement('div');
  headerEl.className = 'comment-thread-header';
  headerEl.innerHTML = `
    <span>Thread</span>
    <span class="comment-thread-id">${thread.paragraphId.substring(0, 8)}</span>
    ${thread.resolved ? '<span style="color: #10b981;">✓ Resolved</span>' : ''}
  `;
  threadEl.appendChild(headerEl);

  // Comments
  for (const comment of thread.comments) {
    const commentEl = createCommentElement(comment);
    threadEl.appendChild(commentEl);
  }

  // Click on thread to scroll to paragraph
  threadEl.addEventListener('click', () => {
    scrollToParagraph(thread.paragraphId);
  });

  return threadEl;
}

/**
 * Create a comment element
 */
function createCommentElement(comment: Comment): HTMLElement {
  const commentEl = document.createElement('div');
  commentEl.className = 'comment';

  const authorEl = document.createElement('div');
  authorEl.className = 'comment-author';
  const timestamp = formatTimestamp(comment.timestamp);
  authorEl.innerHTML = `${comment.author}<span class="comment-timestamp">${timestamp}</span>`;

  const textEl = document.createElement('div');
  textEl.className = 'comment-text';
  textEl.textContent = comment.text;

  commentEl.appendChild(authorEl);
  commentEl.appendChild(textEl);

  return commentEl;
}

/**
 * Create a menu for a comment thread
 */
function createThreadMenu(thread: CommentThread): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'thread-menu';
  menu.style.display = 'none';
  menu.style.position = 'absolute';
  menu.style.top = '32px';
  menu.style.right = '8px';
  menu.style.background = '#fff';
  menu.style.border = '1px solid #e5e7eb';
  menu.style.borderRadius = '6px';
  menu.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
  menu.style.padding = '4px';
  menu.style.zIndex = '101';
  menu.style.minWidth = '120px';

  // Chat option
  const chatOption = document.createElement('button');
  chatOption.className = 'thread-menu-item';
  chatOption.textContent = 'Chat';
  chatOption.style.width = '100%';
  chatOption.style.padding = '8px 12px';
  chatOption.style.border = 'none';
  chatOption.style.background = 'none';
  chatOption.style.cursor = 'pointer';
  chatOption.style.textAlign = 'left';
  chatOption.style.fontSize = '13px';
  chatOption.style.borderRadius = '4px';
  chatOption.style.transition = 'background 0.2s';
  chatOption.addEventListener('mouseenter', () => {
    chatOption.style.background = '#f3f4f6';
  });
  chatOption.addEventListener('mouseleave', () => {
    chatOption.style.background = 'none';
  });
  chatOption.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.style.display = 'none';
    const sessionId = getSessionId();
    if (sessionId) {
      createChatFromThread(thread, sessionId);
    }
  });

  // Draft option
  const draftOption = document.createElement('button');
  draftOption.className = 'thread-menu-item';
  draftOption.textContent = 'Draft';
  draftOption.style.width = '100%';
  draftOption.style.padding = '8px 12px';
  draftOption.style.border = 'none';
  draftOption.style.background = 'none';
  draftOption.style.cursor = 'pointer';
  draftOption.style.textAlign = 'left';
  draftOption.style.fontSize = '13px';
  draftOption.style.borderRadius = '4px';
  draftOption.style.transition = 'background 0.2s';
  draftOption.addEventListener('mouseenter', () => {
    draftOption.style.background = '#f3f4f6';
  });
  draftOption.addEventListener('mouseleave', () => {
    draftOption.style.background = 'none';
  });
  draftOption.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.style.display = 'none';
    // TODO: Implement draft functionality
    logToConsole('Draft functionality not yet implemented', 'info');
  });

  menu.appendChild(chatOption);
  menu.appendChild(draftOption);

  return menu;
}

/**
 * Create a floating comment thread element
 */
function createFloatingCommentThreadElement(thread: CommentThread): HTMLElement {
  const threadEl = document.createElement('div');
  threadEl.className = 'comment-thread-float' + (thread.resolved ? ' comment-resolved' : '');
  threadEl.id = `thread-float-${thread.id}`;
  threadEl.style.position = 'absolute';
  threadEl.style.width = '280px';
  threadEl.style.background = '#fff';
  threadEl.style.border = '1px solid #e5e7eb';
  threadEl.style.borderRadius = '8px';
  threadEl.style.padding = '12px';
  threadEl.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
  threadEl.style.zIndex = '100';
  threadEl.style.fontSize = '13px';

  // Thread header
  const headerEl = document.createElement('div');
  headerEl.style.display = 'flex';
  headerEl.style.justifyContent = 'space-between';
  headerEl.style.alignItems = 'center';
  headerEl.style.marginBottom = '8px';
  headerEl.style.fontSize = '11px';
  headerEl.style.fontWeight = '600';
  headerEl.style.color = '#6b7280';

  const headerLeft = document.createElement('span');
  headerLeft.textContent = 'Thread';

  const headerRight = document.createElement('div');
  headerRight.style.display = 'flex';
  headerRight.style.alignItems = 'center';
  headerRight.style.gap = '8px';

  if (thread.resolved) {
    const resolvedSpan = document.createElement('span');
    resolvedSpan.style.color = '#10b981';
    resolvedSpan.textContent = '✓ Resolved';
    headerRight.appendChild(resolvedSpan);
  }

  // Menu button
  const menuBtn = document.createElement('button');
  menuBtn.className = 'thread-menu-btn';
  menuBtn.textContent = '⋯';
  menuBtn.style.border = 'none';
  menuBtn.style.background = 'none';
  menuBtn.style.cursor = 'pointer';
  menuBtn.style.fontSize = '16px';
  menuBtn.style.color = '#6b7280';
  menuBtn.style.padding = '2px 6px';
  menuBtn.style.borderRadius = '4px';
  menuBtn.style.lineHeight = '1';
  menuBtn.style.transition = 'background 0.2s';
  menuBtn.addEventListener('mouseenter', () => {
    menuBtn.style.background = '#f3f4f6';
  });
  menuBtn.addEventListener('mouseleave', () => {
    menuBtn.style.background = 'none';
  });

  headerRight.appendChild(menuBtn);

  headerEl.appendChild(headerLeft);
  headerEl.appendChild(headerRight);
  threadEl.appendChild(headerEl);

  // Create menu
  const menu = createThreadMenu(thread);
  threadEl.appendChild(menu);

  // Toggle menu on button click
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!threadEl.contains(e.target as Node)) {
      menu.style.display = 'none';
    }
  });

  // Comments
  for (const comment of thread.comments) {
    const commentEl = createFloatingCommentElement(comment);
    threadEl.appendChild(commentEl);
  }

  // Click on thread to scroll to paragraph
  threadEl.addEventListener('click', () => {
    scrollToParagraph(thread.paragraphId);
  });

  return threadEl;
}

/**
 * Create a floating comment element
 */
function createFloatingCommentElement(comment: Comment): HTMLElement {
  const commentEl = document.createElement('div');
  commentEl.style.marginBottom = '10px';
  commentEl.style.paddingBottom = '10px';
  commentEl.style.borderBottom = '1px solid #f3f4f6';

  const authorEl = document.createElement('div');
  authorEl.style.display = 'flex';
  authorEl.style.justifyContent = 'space-between';
  authorEl.style.fontSize = '11px';
  authorEl.style.fontWeight = '600';
  authorEl.style.color = '#374151';
  authorEl.style.marginBottom = '4px';
  const timestamp = formatTimestamp(comment.timestamp);
  authorEl.innerHTML = `
    <span>${comment.author}</span>
    <span style="color: #9ca3af; font-weight: 400;">${timestamp}</span>
  `;

  const textEl = document.createElement('div');
  textEl.style.fontSize = '12px';
  textEl.style.color = '#4b5563';
  textEl.style.lineHeight = '1.5';
  textEl.textContent = comment.text;

  commentEl.appendChild(authorEl);
  commentEl.appendChild(textEl);

  return commentEl;
}

/**
 * Position a thread element next to its paragraph
 */
function positionThreadNextToParagraph(threadEl: HTMLElement, paragraph: HTMLElement): void {
  const paragraphRect = paragraph.getBoundingClientRect();
  const scrollY = window.scrollY || window.pageYOffset;
  const scrollX = window.scrollX || window.pageXOffset;

  // Position to the right of the document content
  threadEl.style.left = `${paragraphRect.right + scrollX + 20}px`;
  threadEl.style.top = `${paragraphRect.top + scrollY}px`;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Scroll to a paragraph in the document
 */
function scrollToParagraph(paragraphId: string): void {
  const paragraph = document.getElementById(paragraphId);
  if (paragraph) {
    paragraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Temporarily highlight the paragraph
    paragraph.style.transition = 'background-color 0.5s';
    paragraph.style.backgroundColor = 'rgba(251, 191, 36, 0.3)';
    setTimeout(() => {
      paragraph.style.backgroundColor = '';
    }, 1500);
  }
}

/**
 * Fetch a single comment thread from the server
 */
export async function fetchCommentThread(
  sessionId: string,
  partId: string,
  threadId: string
): Promise<CommentThread | null> {
  try {
    const url = `/api/getthread?sessionId=${encodeURIComponent(sessionId)}&partId=${encodeURIComponent(partId)}&threadId=${encodeURIComponent(threadId)}`;
    logToConsole(`Fetching thread from: ${url}`, 'info');
    const response = await fetch(url);

    if (!response.ok) {
      logToConsole(`Failed to fetch thread ${threadId}: ${response.statusText}`, 'error');
      return null;
    }

    const data = await response.json() as GetThreadResponse;
    logToConsole(`Fetched thread ${threadId}: paraId=${data.paraId}, comments=${data.comments.length}`, 'info');

    // Convert API response to CommentThread
    const thread: CommentThread = {
      id: data.threadId,
      paragraphId: data.paraId,
      comments: data.comments.map((c: any) => ({
        id: c.commentId,
        author: c.author,
        text: c.html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text
        timestamp: new Date(c.timestamp)
      })),
      resolved: data.resolved
    };

    logToConsole(`Created CommentThread: id=${thread.id}, paragraphId=${thread.paragraphId}`, 'info');
    return thread;
  } catch (error) {
    logToConsole(`Error fetching thread ${threadId}: ${(error as Error).message}`, 'error');
    return null;
  }
}

/**
 * Fetch comment threads for a document part
 */
export async function fetchCommentThreads(
  sessionId: string,
  partId: string,
  commentThreadRefs: Array<{ threadId: string; paraId: string; comments: string[] }>
): Promise<CommentThread[]> {
  const threads: CommentThread[] = [];

  try {
    // Fetch each thread from the API
    for (const ref of commentThreadRefs) {
      const thread = await fetchCommentThread(sessionId, partId, ref.threadId);
      if (thread) {
        threads.push(thread);
      }
    }

    logToConsole(`Loaded ${threads.length} comment threads for part ${partId}`, 'info');
  } catch (error) {
    logToConsole(`Error fetching comment threads: ${(error as Error).message}`, 'error');
  }

  return threads;
}
