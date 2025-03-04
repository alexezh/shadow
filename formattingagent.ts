import { ShadowAction } from "./action";
import { IShadowAgent, PValue, updateWeight } from "./ishadowagent";

export class FormattingAgent implements IShadowAgent {
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