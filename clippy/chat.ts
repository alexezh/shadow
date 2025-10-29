import { CommentThread } from "./editor-context.js";
import { logToConsole } from "./dom.js";

/**
 * Chat message in a conversation
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

/**
 * Chat window for a comment thread
 */
export class ChatWindow {
  private windowEl: HTMLElement;
  private messagesEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private threadId: string;
  private messages: ChatMessage[];

  constructor(threadId: string, initialMessages: ChatMessage[] = []) {
    this.threadId = threadId;
    this.messages = initialMessages;
    this.windowEl = this.createChatWindow();
    this.messagesEl = this.windowEl.querySelector('.chat-messages') as HTMLElement;
    this.inputEl = this.windowEl.querySelector('.chat-input') as HTMLTextAreaElement;
    this.sendBtn = this.windowEl.querySelector('.chat-send-btn') as HTMLButtonElement;

    this.setupEventListeners();
    this.renderMessages();
  }

  /**
   * Create the chat window DOM structure
   */
  private createChatWindow(): HTMLElement {
    const windowEl = document.createElement('div');
    windowEl.className = 'chat-window';
    windowEl.style.position = 'fixed';
    windowEl.style.right = '20px';
    windowEl.style.bottom = '20px';
    windowEl.style.width = '400px';
    windowEl.style.height = '600px';
    windowEl.style.background = '#fff';
    windowEl.style.border = '1px solid #e5e7eb';
    windowEl.style.borderRadius = '12px';
    windowEl.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.15)';
    windowEl.style.display = 'flex';
    windowEl.style.flexDirection = 'column';
    windowEl.style.zIndex = '1000';
    windowEl.style.overflow = 'hidden';

    // Header
    const header = document.createElement('div');
    header.className = 'chat-header';
    header.style.padding = '16px';
    header.style.borderBottom = '1px solid #e5e7eb';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.background = '#f9fafb';
    header.innerHTML = `
      <span style="font-weight: 600; font-size: 14px;">Chat - Thread ${this.threadId.substring(0, 8)}</span>
      <button class="chat-close-btn" style="border: none; background: none; cursor: pointer; font-size: 20px; color: #6b7280; padding: 0; width: 24px; height: 24px;">&times;</button>
    `;

    // Messages container
    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'chat-messages';
    messagesContainer.style.flex = '1';
    messagesContainer.style.overflowY = 'auto';
    messagesContainer.style.padding = '16px';
    messagesContainer.style.display = 'flex';
    messagesContainer.style.flexDirection = 'column';
    messagesContainer.style.gap = '12px';

    // Input area
    const inputArea = document.createElement('div');
    inputArea.className = 'chat-input-area';
    inputArea.style.padding = '16px';
    inputArea.style.borderTop = '1px solid #e5e7eb';
    inputArea.style.display = 'flex';
    inputArea.style.gap = '8px';
    inputArea.innerHTML = `
      <textarea class="chat-input" placeholder="Type a message..." style="
        flex: 1;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 8px 12px;
        font-family: inherit;
        font-size: 13px;
        resize: none;
        min-height: 40px;
        max-height: 100px;
      "></textarea>
      <button class="chat-send-btn" style="
        border: none;
        background: #3b82f6;
        color: white;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 13px;
        cursor: pointer;
        font-weight: 500;
      ">Send</button>
    `;

    windowEl.appendChild(header);
    windowEl.appendChild(messagesContainer);
    windowEl.appendChild(inputArea);

    document.body.appendChild(windowEl);

    return windowEl;
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Close button
    const closeBtn = this.windowEl.querySelector('.chat-close-btn') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => {
      this.close();
    });

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

    // Auto-resize textarea
    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 100) + 'px';
    });
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

    bubble.innerHTML = message.content;

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
   * Send a message
   */
  private sendMessage(): void {
    const content = this.inputEl.value.trim();
    if (!content) return;

    const message: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: content,
      timestamp: new Date()
    };

    this.messages.push(message);
    this.renderMessages();
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';

    // TODO: Send message to server
    logToConsole(`Chat message sent: ${content}`, 'info');

    // Simulate assistant response (placeholder)
    setTimeout(() => {
      const response: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'This is a placeholder response. Integration with AI assistant coming soon.',
        timestamp: new Date()
      };
      this.messages.push(response);
      this.renderMessages();
    }, 1000);
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
    this.windowEl.style.display = 'flex';
  }

  /**
   * Close the chat window
   */
  public close(): void {
    this.windowEl.remove();
  }

  /**
   * Get all messages
   */
  public getMessages(): ChatMessage[] {
    return [...this.messages];
  }
}

/**
 * Create a chat window from a comment thread
 */
export function createChatFromThread(thread: CommentThread): ChatWindow {
  const messages: ChatMessage[] = thread.comments.map((comment, index) => ({
    id: comment.id,
    role: 'user' as const,
    content: `<strong>${comment.author}:</strong> ${comment.text}`,
    timestamp: comment.timestamp
  }));

  const chat = new ChatWindow(thread.id, messages);
  chat.show();

  return chat;
}
