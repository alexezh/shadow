import type { IShadowTextBody, NormalizedDistance, TextVersion } from "./ishadow.ts";
import type { GlobalCp, CellObjectId, ShadowRevisionId, WireCp, DurablePositionId } from "./shadowmessage.ts";

export enum EditOpKind {
  AddChar,
  RemoveChar,
  AddPara,
  MergePara,
  SplitPara,
  DeletePara
}

export type EditOp = {
  kind: EditOpKind,
  paraId: CellObjectId,
  cp: WireCp,
  count: number;
}

export class ShadowTextBodyMock implements IShadowTextBody {
  getEditRange(rev: ShadowRevisionId): { start: GlobalCp, end: GlobalCp } {
    return { start: 22 as GlobalCp, end: 33 as GlobalCp };
  }

  addDurablePosition(pos: GlobalCp): DurablePositionId {
    throw new Error("Method not implemented.");
  }
  removeDurablePosition(name: DurablePositionId): void {
    throw new Error("Method not implemented.");
  }
  getDurablePosition(name: DurablePositionId): GlobalCp {
    throw new Error("Method not implemented.");
  }
  getCharacterDistance(pos1: GlobalCp, pos2: GlobalCp): number {
    throw new Error("Method not implemented.");
  }
  getNormalizedDistance(pos1: GlobalCp, pos2: GlobalCp): NormalizedDistance {
    throw new Error("Method not implemented.");
  }
  getTextVersion(): TextVersion {
    throw new Error("Method not implemented.");
  }
  getChangeStats(ver: TextVersion): number {
    throw new Error("Method not implemented.");
  }

}