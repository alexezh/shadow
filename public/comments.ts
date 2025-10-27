import { CommentThread, Comment, EditorContext } from "./editor-context.js";
import { logToConsole, getSessionId } from "./dom.js";

/**
 * Render comment threads to the comments sidebar
 */
export function renderCommentThreads(editorContext: EditorContext): void {
  const commentsBody = document.getElementById('comments-body');
  if (!commentsBody) return;

  // Clear existing comments
  commentsBody.innerHTML = '';

  const threads = editorContext.getAllCommentThreads();

  if (threads.length === 0) {
    commentsBody.innerHTML = '<div style="color: #92400e; font-size: 12px; padding: 10px;">No comments</div>';
    return;
  }

  // Render each thread
  for (const thread of threads) {
    const threadEl = createCommentThreadElement(thread);
    commentsBody.appendChild(threadEl);
  }
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
  commentThreadRefs: Array<{ paragraphId: string; threadId: string }>
): Promise<CommentThread[]> {
  const threads: CommentThread[] = [];

  try {
    // Fetch each comment thread using getpart API
    for (const ref of commentThreadRefs) {
      const response = await fetch(`/api/getpart?sessionId=${getSessionId()}&partId=${ref.threadId}`);
      if (!response.ok) {
        logToConsole(`Failed to fetch comment thread ${ref.threadId}`, 'error');
        continue;
      }

      const data = await response.json();

      // Parse comment data from response
      // Expected format: { html: string, comments: Comment[] }
      if (data.comments && Array.isArray(data.comments)) {
        const thread: CommentThread = {
          id: ref.threadId,
          paragraphId: ref.paragraphId,
          comments: data.comments.map((c: any) => ({
            id: c.id || '',
            author: c.author || 'Unknown',
            text: c.text || '',
            timestamp: c.timestamp ? new Date(c.timestamp) : new Date()
          })),
          resolved: data.resolved || false
        };
        threads.push(thread);
      }
    }

    logToConsole(`Loaded ${threads.length} comment threads for part ${partId}`, 'info');
  } catch (error) {
    logToConsole(`Error fetching comment threads: ${(error as Error).message}`, 'error');
  }

  return threads;
}
