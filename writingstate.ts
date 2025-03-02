import { ShadowAction } from "./action";
import { IShadowState, PValue, updateWeight } from "./ishadowstate";

export class WritingState implements IShadowState {
  public weight: PValue = 0 as PValue;
  private triggerLevel = 0.8;

  private typeDelta = 0.01;
  private formatDelta = -0.01;
  private moveDelta = -0.01;

  public constructor() {

  }

  public onAction(action: ShadowAction): PValue {
    let weight = this.weight;
    if (action.name === "editor.type") {
      weight = updateWeight(weight, this.typeDelta);
    } else if (action.name === "editor.format") {
      weight = updateWeight(weight, this.formatDelta);
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
