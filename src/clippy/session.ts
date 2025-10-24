import type { YDoc } from "../om/YDoc";
import type { WRange } from "../om/YNode";

export interface Session {
  id: string;
  createdAt: Date;
  pendingChanges: Array<ActionResult>;
  changeResolvers: Array<(changes: any[]) => void>;
  doc: YDoc;
}

export interface ChangeRecord {
  id: string;
  html: string;
}

export interface ActionResult {
  changes: ChangeRecord[];
  newPosition?: { element: string; offset: number };
  newRange?: WRange;
}