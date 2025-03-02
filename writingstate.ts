import { ShadowAction } from "./action";
import { IShadowState, PValue } from "./ishadowstate";

export class ShadowWritingState implements IShadowState {
  public weight: PValue = 0 as PValue;
  private typeDelta = 0.01;
  private formatDelta = -0.01;
  private moveDelta = -0.01;

  public onAction(action: ShadowAction): PValue {
    if (action.name === "editor.type") { }
    return this.weight;
  }
}
