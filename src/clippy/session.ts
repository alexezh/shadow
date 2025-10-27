import type { YDoc } from "../om/YDoc";
import type { WRange } from "../om/YNode";

export interface Session {
  id: string;
  createdAt: Date;
  pendingChanges: Array<GetChangesResponse>;
  changeResolvers: Array<(changes: GetChangesResponse[]) => void>;
  doc: YDoc;
  currentPartId: string;
  sendConsole(html: string): void;
}

export interface PromptRequest {
  sessionId: string;
  prompt: string;
  partId?: string;
  docId?: string;
  selectionRange?: unknown;
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
  newRange?: WRange;
}
