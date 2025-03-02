import { ShadowAction } from "./action";
import { IShadowState, PValue, updateWeight } from "./ishadowstate";

export class FormattingState implements IShadowState {
  weight: PValue = 0 as PValue;
  private typeDelta = -0.01;
  private formatDelta = 0.01;

  onAction(action: ShadowAction): PValue {
    let weight = this.weight;

    if (action.name === "editor.format") {
      weight = updateWeight(weight, this.formatDelta);
    } else if (action.name === "editor.type") {
      weight = updateWeight(weight, this.typeDelta);
    }

    this.weight = weight;

    return this.weight;
  }

}