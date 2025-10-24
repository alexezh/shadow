import type { WDoc } from "../om/WDoc";

export interface Session {
  id: string;
  createdAt: Date;
  pendingChanges: Array<{ id: string; html: string }>;
  changeResolvers: Array<(changes: any[]) => void>;
  doc: WDoc;
}
