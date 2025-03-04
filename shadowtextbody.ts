import { DurablePositionId, IShadowTextBody, NormalizedDistance, TextVersion } from "./ishadow";
import { ShadowCp } from "./ishadowagent";

export class ShadowTextBody implements IShadowTextBody {
  addDurablePosition(pos: ShadowCp): DurablePositionId {
    throw new Error("Method not implemented.");
  }
  removeDurablePosition(name: DurablePositionId): void {
    throw new Error("Method not implemented.");
  }
  getDurablePosition(name: DurablePositionId): ShadowCp {
    throw new Error("Method not implemented.");
  }
  getCharacterDistance(pos1: ShadowCp, pos2: ShadowCp): number {
    throw new Error("Method not implemented.");
  }
  getNormalizedDistance(pos1: ShadowCp, pos2: ShadowCp): NormalizedDistance {
    throw new Error("Method not implemented.");
  }
  getTextVersion(): TextVersion {
    throw new Error("Method not implemented.");
  }
  getChangeStats(ver: TextVersion): number {
    throw new Error("Method not implemented.");
  }

}