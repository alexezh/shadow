import type { YRange } from "../om/YRange";

export interface PromptRequest {
  sessionId: string;
  prompt: string;
  partId?: string;
  docId?: string;
  selection?: YRange;
}

export type GetThreadRequest = {
  docId: string;
  partId: string;
  threadId: string;
}

export type GetThreadResponse = {
  threadId: string;
  paraId: string;
  resolved: boolean;
  comments: Array<{
    commentId: string;
    author: string;
    html: string;
    timestamp: string;
  }>;
}

export type CommentThreadRef = {
  threadId: string;
  paraId: string;
  comments: string[];
}

export type GetDocPartResponse = {
  sessionId: string,
  partId: string,
  html: string,
  styles: any
  comments?: CommentThreadRef[]
};

export type GetChangesResponse = {
  kind: "console" | "action" | "agent",
  sessionId?: string;
  partId?: string;
  data: ActionResult | ConsoleResult | AgentChange
};

export interface ConsoleResult {
  html: string;
}

export interface ContentChangeRecord {
  id: string;
  html: string | null;
  prevId?: string;
  op: "inserted" | "changed" | "deleted"
}

export interface AgentChange {
  partId: string;
  sessionId: string;
  changes: ContentChangeRecord[];
}

export interface ActionResult {
  partId: string;
  changes: ContentChangeRecord[];
  newPosition?: { element: string; offset: number };
  newRange?: YRange;
}

export type CreatePartRequest = {
  sessionId: string,
  kind: "draft" | "chat",
  selectionRange: YRange | null
}

export type CreatePartResponse = {
  sessionId: string,
  partId: string;
}

export type GetChatRequest = {
  docId: string;
  chatId: string;
}

export type GetChatResponse = {
  chatId: string;
  messages: Array<{
    messageId: string;
    role: 'user' | 'assistant' | 'system';
    html: string;
  }>;
}

export type CreateChatRequest = {
  docId: string;
}

export type CreateChatResponse = {
  chatId: string;
}
