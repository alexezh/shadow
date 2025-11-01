import type { CommentThread } from "./editor-context.js";
import { logToConsole } from "./dom.js";

/**
 * Chat message in a conversation
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  html?: string;
  timestamp: Date;
}

export interface ChatWindowOptions {
  partId: string;
  sessionId: string;
  initialMessages?: ChatMessage[];
  inline?: boolean;  // If true, render inline in provided container
  containerEl?: HTMLElement;  // For inline mode, use this container
}

/**
 * Chat window for a comment thread or chat part
 */
export class ChatWindow {
  private containerEl: HTMLElement;
  private shadowRoot: ShadowRoot;
  private messagesEl: HTMLElement;
  private inputEl: HTMLTextAreaElement | HTMLDivElement;
  private sendBtn: HTMLButtonElement;
  private partId: string;
  private sessionId: string;
  private messages: ChatMessage[];
  private inline: boolean;

  constructor(options: ChatWindowOptions | string, sessionId?: string, initialMessages?: ChatMessage[]) {
    // Support both old and new constructor signatures
    if (typeof options === 'string') {
      this.partId = options;
      this.sessionId = sessionId!;
      this.messages = initialMessages || [];
      this.inline = false;
      this.containerEl = document.createElement('div');
    } else {
      this.partId = options.partId;
      this.sessionId = options.sessionId;
      this.messages = options.initialMessages || [];
      this.inline = options.inline || false;
      this.containerEl = options.containerEl || document.createElement('div');
    }

    if (!this.inline) {
      // Floating window mode
      this.containerEl.className = 'chat-window-host';
      this.containerEl.style.position = 'fixed';
      this.containerEl.style.right = '20px';
      this.containerEl.style.bottom = '20px';
      this.containerEl.style.width = '400px';
      this.containerEl.style.height = '600px';
      this.containerEl.style.zIndex = '1000';

      // Create shadow root for style isolation
      this.shadowRoot = this.containerEl.attachShadow({ mode: 'open' });
    } else {
      // Inline mode - use existing shadow root or create new one
      this.shadowRoot = this.containerEl.shadowRoot || this.containerEl.attachShadow({ mode: 'open' });
    }

    // Create chat window inside shadow root
    this.createChatWindow();

    this.messagesEl = this.shadowRoot.querySelector('.chat-messages') as HTMLElement;
    if (this.inline) {
      this.inputEl = this.shadowRoot.querySelector('.chat-input-inline') as HTMLDivElement;
    } else {
      this.inputEl = this.shadowRoot.querySelector('.chat-input') as HTMLTextAreaElement;
    }
    this.sendBtn = this.shadowRoot.querySelector('.chat-send-btn') as HTMLButtonElement;

    this.setupEventListeners();
    this.renderMessages();

    if (!this.inline) {
      document.body.appendChild(this.containerEl);
    }
  }

  /**
   * Create the chat window DOM structure inside shadow root
   */
  private createChatWindow(): void {
    // Clear shadow root
    this.shadowRoot.innerHTML = '';

    // Add styles to shadow root
    const style = document.createElement('style');
    if (this.inline) {
      // Inline mode styles - messages on top, prompt on bottom
      style.textContent = `
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .chat-window {
          width: 100%;
          height: 100%;
          background: #fff;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 12px;
        }

        .chat-message {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .chat-message-user {
          align-items: flex-end;
        }

        .chat-message-assistant {
          align-items: flex-start;
        }

        .chat-message-bubble {
          max-width: 80%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.5;
          word-wrap: break-word;
        }

        .chat-message-user .chat-message-bubble {
          background: #3b82f6;
          color: white;
        }

        .chat-message-assistant .chat-message-bubble {
          background: #f3f4f6;
          color: #1f2937;
        }

        .chat-input-area {
          border-top: 1px solid #e5e7eb;
          padding: 16px;
          display: flex;
          flex-direction: row;
          gap: 8px;
          align-items: flex-end;
          background: #fff;
        }

        .chat-input-inline {
          flex: 1;
          min-height: 44px;
          max-height: 200px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 8px 12px;
          overflow-y: auto;
          font-family: inherit;
          font-size: 13px;
          line-height: 1.5;
        }

        .chat-input-inline:focus {
          outline: 2px solid #3b82f6;
          outline-offset: -2px;
        }

        .chat-input-inline:empty:before {
          content: 'Type your message...';
          color: #9ca3af;
        }

        .chat-send-btn {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }

        .chat-send-btn:hover {
          background: #2563eb;
        }

        .chat-send-btn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
      `;
    } else {
      // Floating window mode styles
      style.textContent = `
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .chat-window {
          width: 100%;
          height: 100%;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 12px;
        }

        .chat-message {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .chat-message-user {
          align-items: flex-end;
        }

        .chat-message-assistant {
          align-items: flex-start;
        }

        .chat-message-bubble {
          max-width: 80%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.5;
          word-wrap: break-word;
        }

        .chat-message-user .chat-message-bubble {
          background: #3b82f6;
          color: white;
        }

        .chat-message-assistant .chat-message-bubble {
          background: #f3f4f6;
          color: #1f2937;
        }

        .chat-input-area {
          border-top: 1px solid #e5e7eb;
          padding: 16px;
          display: flex;
          flex-direction: row;
          gap: 8px;
          align-items: flex-end;
          background: #fff;
        }

        .chat-input {
          flex: 1;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 8px 12px;
          font-family: inherit;
          font-size: 13px;
          resize: none;
          min-height: 40px;
          max-height: 100px;
        }

        .chat-send-btn {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }

        .chat-send-btn:hover {
          background: #2563eb;
        }

        .chat-send-btn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
      `;
    }

    const windowEl = document.createElement('div');
    windowEl.className = 'chat-window';

    // Header (only for floating mode)
    if (!this.inline) {
      const header = document.createElement('div');
      header.className = 'chat-header';
      header.style.padding = '16px';
      header.style.borderBottom = '1px solid #e5e7eb';
      header.style.display = 'flex';
      header.style.justifyContent = 'space-between';
      header.style.alignItems = 'center';
      header.style.background = '#f9fafb';
      header.innerHTML = `
        <span style="font-weight: 600; font-size: 14px;">Chat - ${this.partId.substring(0, 12)}</span>
        <button class="chat-close-btn" style="border: none; background: none; cursor: pointer; font-size: 20px; color: #6b7280; padding: 0; width: 24px; height: 24px;">&times;</button>
      `;
      windowEl.appendChild(header);
    }

    // Messages container - always on top
    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'chat-messages';
    windowEl.appendChild(messagesContainer);

    // Input area - always on bottom
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';

    if (this.inline) {
      // Inline mode: use contenteditable div
      const inputDiv = document.createElement('div');
      inputDiv.className = 'chat-input-inline';
      inputDiv.contentEditable = 'true';
      inputDiv.setAttribute('role', 'textbox');
      inputDiv.setAttribute('aria-label', 'Type your message');
      inputArea.appendChild(inputDiv);
    } else {
      // Floating mode: use textarea
      const textarea = document.createElement('textarea');
      textarea.className = 'chat-input';
      textarea.placeholder = 'Type a message...';
      inputArea.appendChild(textarea);
    }

    // Send button
    const sendBtn = document.createElement('button');
    sendBtn.className = 'chat-send-btn';
    sendBtn.innerHTML = '↑'; // Up arrow like clippy
    sendBtn.setAttribute('aria-label', 'Send');
    inputArea.appendChild(sendBtn);

    windowEl.appendChild(inputArea);

    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(windowEl);
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Close button (floating mode only)
    if (!this.inline) {
      const closeBtn = this.shadowRoot.querySelector('.chat-close-btn') as HTMLButtonElement;
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          this.close();
        });
      }
    }

    // Send button
    this.sendBtn.addEventListener('click', () => {
      this.sendMessage();
    });

    // Enter key to send (Shift+Enter for new line)
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize (textarea only)
    if (!this.inline && this.inputEl instanceof HTMLTextAreaElement) {
      this.inputEl.addEventListener('input', () => {
        this.inputEl.style.height = 'auto';
        this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 100) + 'px';
      });
    }

    // Auto-focus the input when chat loads (inline mode)
    if (this.inline) {
      setTimeout(() => {
        this.inputEl.focus();
      }, 100);
    }
  }

  /**
   * Render all messages
   */
  private renderMessages(): void {
    this.messagesEl.innerHTML = '';

    for (const message of this.messages) {
      const messageEl = this.createMessageElement(message);
      this.messagesEl.appendChild(messageEl);
    }

    // Scroll to bottom
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /**
   * Create a message element
   */
  private createMessageElement(message: ChatMessage): HTMLElement {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message chat-message-${message.role}`;
    messageEl.style.display = 'flex';
    messageEl.style.flexDirection = 'column';
    messageEl.style.gap = '4px';

    if (message.role === 'user') {
      messageEl.style.alignItems = 'flex-end';
    } else {
      messageEl.style.alignItems = 'flex-start';
    }

    // Message bubble
    const bubble = document.createElement('div');
    bubble.className = 'chat-message-bubble';
    bubble.style.maxWidth = '80%';
    bubble.style.padding = '10px 14px';
    bubble.style.borderRadius = '12px';
    bubble.style.fontSize = '13px';
    bubble.style.lineHeight = '1.5';
    bubble.style.wordWrap = 'break-word';

    if (message.role === 'user') {
      bubble.style.background = '#3b82f6';
      bubble.style.color = 'white';
    } else if (message.role === 'assistant') {
      bubble.style.background = '#f3f4f6';
      bubble.style.color = '#1f2937';
    } else {
      bubble.style.background = '#fef3c7';
      bubble.style.color = '#92400e';
    }

    // Render HTML if available, otherwise use plain content
    bubble.innerHTML = message.html || message.content;

    // Timestamp
    const timestamp = document.createElement('div');
    timestamp.className = 'chat-message-timestamp';
    timestamp.style.fontSize = '10px';
    timestamp.style.color = '#9ca3af';
    timestamp.style.padding = '0 4px';
    timestamp.textContent = this.formatTimestamp(message.timestamp);

    messageEl.appendChild(bubble);
    messageEl.appendChild(timestamp);

    return messageEl;
  }

  /**
   * Format timestamp for display
   */
  private formatTimestamp(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Send a message using the sendPrompt pattern
   */
  private async sendMessage(): Promise<void> {
    // Get content from either textarea or contenteditable div
    const content = this.inline
      ? (this.inputEl as HTMLDivElement).textContent?.trim() || ''
      : (this.inputEl as HTMLTextAreaElement).value.trim();

    if (!content) return;

    // Add user message to chat immediately
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: content,
      timestamp: new Date()
    };

    this.messages.push(userMessage);
    this.renderMessages();

    // Clear input
    if (this.inline) {
      (this.inputEl as HTMLDivElement).textContent = '';
    } else {
      (this.inputEl as HTMLTextAreaElement).value = '';
      this.inputEl.style.height = 'auto';
    }

    // Disable send button while processing
    this.sendBtn.disabled = true;
    const originalContent = this.sendBtn.innerHTML;
    this.sendBtn.innerHTML = '⋯'; // Ellipsis for loading

    try {
      // Send prompt to server using executecommand API
      const payload = {
        sessionId: this.sessionId,
        prompt: content,
        partId: this.partId,
        docId: this.sessionId
      };

      logToConsole(`Sending chat message to part ${this.partId}: ${content}`, 'info');

      const response = await fetch('/api/executeprompt', {
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

      // After sending, fetch updated chat messages from the server
      // The server should have added both user message and assistant response
      await this.refreshMessages();

      logToConsole(`Chat message sent successfully`, 'info');
    } catch (error) {
      logToConsole(`Error sending chat message: ${(error as Error).message}`, 'error');

      // Show error message in chat
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'system',
        content: `Error: ${(error as Error).message}`,
        timestamp: new Date()
      };
      this.messages.push(errorMessage);
      this.renderMessages();
    } finally {
      // Re-enable send button
      this.sendBtn.disabled = false;
      this.sendBtn.innerHTML = originalContent;
    }
  }

  /**
   * Refresh messages from server
   */
  private async refreshMessages(): Promise<void> {
    try {
      const messages = await fetchChatMessages(this.sessionId, this.partId);
      this.messages = messages;
      this.renderMessages();
    } catch (error) {
      logToConsole(`Error refreshing chat messages: ${(error as Error).message}`, 'error');
    }
  }

  /**
   * Add a message to the chat
   */
  public addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.renderMessages();
  }

  /**
   * Show the chat window
   */
  public show(): void {
    this.containerEl.style.display = 'block';
  }

  /**
   * Hide the chat window
   */
  public hide(): void {
    this.containerEl.style.display = 'none';
  }

  /**
   * Close and remove the chat window
   */
  public close(): void {
    this.containerEl.remove();
  }

  /**
   * Get all messages
   */
  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }
}

/**
 * Fetch chat messages from the server
 */
export async function fetchChatMessages(sessionId: string, chatId: string): Promise<ChatMessage[]> {
  try {
    const url = `/api/getchat?sessionId=${encodeURIComponent(sessionId)}&chatId=${encodeURIComponent(chatId)}`;
    logToConsole(`Fetching chat from: ${url}`, 'info');
    const response = await fetch(url);

    if (!response.ok) {
      logToConsole(`Failed to fetch chat ${chatId}: ${response.statusText}`, 'error');
      return [];
    }

    const data = await response.json();
    logToConsole(`Fetched chat ${chatId}: ${data.messages.length} messages`, 'info');

    // Convert API response to ChatMessage array
    const messages: ChatMessage[] = data.messages.map((m: any) => ({
      id: m.messageId,
      role: m.role,
      content: '', // Content extracted from HTML
      html: m.html,
      timestamp: new Date() // TODO: Add timestamp to API response
    }));

    return messages;
  } catch (error) {
    logToConsole(`Error fetching chat ${chatId}: ${(error as Error).message}`, 'error');
    return [];
  }
}

/**
 * Create a chat window from a comment thread
 */
export function createChatFromThread(thread: CommentThread, sessionId: string): ChatWindow {
  const messages: ChatMessage[] = thread.comments.map((comment, index) => ({
    id: comment.id,
    role: 'user' as const,
    content: `<strong>${comment.author}:</strong> ${comment.text}`,
    timestamp: comment.timestamp
  }));

  // Use thread ID as part ID for thread-based chats
  const chat = new ChatWindow(thread.id, sessionId, messages);
  chat.show();

  return chat;
}

/**
 * Create a chat window from a part ID (fetches messages from server)
 */
export async function createChatFromPartId(sessionId: string, partId: string, inline: boolean = false, containerEl?: HTMLElement): Promise<ChatWindow | null> {
  const messages = await fetchChatMessages(sessionId, partId);
  if (messages.length === 0) {
    logToConsole(`No messages found for chat part ${partId}`, 'warn');
  }

  if (inline && containerEl) {
    const chat = new ChatWindow({
      partId,
      sessionId,
      initialMessages: messages,
      inline: true,
      containerEl
    });
    return chat;
  } else {
    const chat = new ChatWindow(partId, sessionId, messages);
    chat.show();
    return chat;
  }
}
