import { DurablePositionId, IShadowTextBody, NormalizedDistance, TextVersion } from "./ishadow.ts";
import type { GlobalCp } from "./ishadowagent.ts";

export class ShadowTextBody implements IShadowTextBody {
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