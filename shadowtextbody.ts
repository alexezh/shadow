import { IShadowTextBody, NormalizedDistance, TextVersion } from "./ishadow";
import { ShadowCp } from "./ishadowagent";

export class ShadowTextBody implements IShadowTextBody {
  addDurablePosition(name: string, pos: ShadowCp) {
    throw new Error("Method not implemented.");
  }
  removeDurablePosition(name: string) {
    throw new Error("Method not implemented.");
  }
  getDurablePosition(name: string): ShadowCp {
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