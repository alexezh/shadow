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