import { ShadowAction } from "./action";
import type { IShadow } from "./IShadow";
import { IShadowState, PValue, updateWeight } from "./ishadowstate";

/**
 * detects sequence of moves and edits
 */
export class CorrectingState implements IShadowState {
  public weight: PValue = 0 as PValue;
  private triggerLevel = 0.8;

  private readonly editing: IShadowState;
  private typeDelta = 0.01;
  private correctDelta = 0.01;
  private moveDelta = -0.01;

  public constructor(shadow: IShadow) {
    this.editing = shadow.getState("editor.editing");
  }

  public onAction(action: ShadowAction): PValue {
    let weight = this.weight;
    if (action.name === "editor.type") {
      weight = updateWeight(weight, this.typeDelta);
    } else if (action.name === "editor.correct") {
      weight = updateWeight(weight, this.correctDelta);
    } else if (action.name === "editor.moveip") {
      weight = updateWeight(weight, this.moveDelta);
    }

    if (weight > this.triggerLevel) {
      //this.
    }

    this.weight = weight;
    return this.weight;
  }
}
