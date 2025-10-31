import type { Database } from "../database";
import type { YDoc } from "../om/YDoc";
import type { SkillVM } from "../skills/skillvm";
import type { ContentChangeRecord, GetChangesResponse } from "./messages";

export interface Session {
  id: string;
  createdAt: Date;
  pendingChanges: Array<GetChangesResponse>;
  changeResolvers: Array<(changes: GetChangesResponse[]) => void>;
  doc: YDoc;
  readonly database: Database;
  readonly vm: SkillVM;
  currentPartId: string;
  sendConsole(html: string): void;
  sendUpdate(sessionId: string, partId: string, changeRecords: ContentChangeRecord[]): void;
}

