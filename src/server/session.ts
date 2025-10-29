import type { YDoc } from "../om/YDoc";
import type { YRange } from "../om/YRange";
import { GetChangesResponse } from "./messages";

export interface Session {
  id: string;
  createdAt: Date;
  pendingChanges: Array<GetChangesResponse>;
  changeResolvers: Array<(changes: GetChangesResponse[]) => void>;
  doc: YDoc;
  currentPartId: string;
  sendConsole(html: string): void;
}

