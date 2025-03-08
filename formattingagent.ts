import type { ShadowMessage } from "./shadowmessage.ts";
import { type IShadowAgent, type PValue, updateWeight } from "./ishadowagent.ts";

export class FormattingAgent implements IShadowAgent {
  weight: PValue = 0 as PValue;
  private typeDelta = -0.01;
  private formatDelta = 0.01;

  public onAction(action: ShadowMessage): PValue {
    let weight = this.weight;

    if (action.id === "user.format") {
      weight = updateWeight(weight, this.formatDelta);
    } else if (action.id === "user.type") {
      weight = updateWeight(weight, this.typeDelta);
    }

    this.weight = weight;

    return this.weight;
  }
}
