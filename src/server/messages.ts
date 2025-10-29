import type { YRange } from "../om/YRange";

export interface PromptRequest {
  sessionId: string;
  prompt: string;
  partId?: string;
  docId?: string;
  selection?: YRange;
}

export type CommentThreadRef = {
  threadId: string;
  comments: { commentPartId: string, paraId: string }[];
}

export type GetDocResponse = {
  sessionId: string,
  partId: string,
  html: string,
  styles: any
  comments?: CommentThreadRef[]
};

export type GetChangesResponse = { kind: "console" | "action", data: ActionResult | ConsoleResult };

export interface ConsoleResult {
  html: string;
}

export interface ContentChangeRecord {
  id: string;
  html: string | null;
  prevId?: string;
  op: "inserted" | "changed" | "deleted"
}

export interface ActionResult {
  changes: ContentChangeRecord[];
  newPosition?: { element: string; offset: number };
  newRange?: YRange;
}
