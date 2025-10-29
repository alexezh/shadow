import { CommentThread, Comment, EditorContext } from "./editor-context.js";
import { logToConsole, getSessionId } from "./dom.js";

/**
 * Render comment threads floating next to their paragraphs
 */
export function renderCommentThreads(editorContext: EditorContext): void {
  // Remove any existing floating comment threads
  const existingThreads = document.querySelectorAll('.comment-thread-float');
  existingThreads.forEach(el => el.remove());

  const threads = editorContext.getAllCommentThreads();

  if (threads.length === 0) {
    return;
  }

  // Render each thread floating next to its paragraph
  for (const thread of threads) {
    const paragraph = document.getElementById(thread.paragraphId);
    if (!paragraph) continue;

    const threadEl = createFloatingCommentThreadElement(thread);
    document.body.appendChild(threadEl);

    // Position thread next to paragraph
    positionThreadNextToParagraph(threadEl, paragraph);
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
  headerEl.innerHTML = `
    <span>Thread</span>
    ${thread.resolved ? '<span style="color: #10b981;">✓ Resolved</span>' : ''}
  `;
  threadEl.appendChild(headerEl);

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
 * Fetch comment threads for a document part
 */
export async function fetchCommentThreads(
  partId: string,
  commentThreadRefs: Array<{ threadId: string; paraId: string; comments: string[] }>
): Promise<CommentThread[]> {
  const threads: CommentThread[] = [];

  try {
    // Process each comment thread reference
    for (const ref of commentThreadRefs) {
      // Convert comment strings to Comment objects
      const comments = ref.comments.map((commentText: string, index: number) => ({
        id: `${ref.threadId}-comment-${index}`,
        author: 'User', // TODO: Extract author from comment text or metadata
        text: commentText,
        timestamp: new Date() // TODO: Extract timestamp from metadata
      }));

      const thread: CommentThread = {
        id: ref.threadId,
        paragraphId: ref.paraId,
        comments: comments,
        resolved: false // TODO: Get resolved status from server
      };
      threads.push(thread);
    }

    logToConsole(`Loaded ${threads.length} comment threads for part ${partId}`, 'info');
  } catch (error) {
    logToConsole(`Error fetching comment threads: ${(error as Error).message}`, 'error');
  }

  return threads;
}
