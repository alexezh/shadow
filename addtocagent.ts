import type { ShadowMessageId, ShadowMessage, StartWritingArgs, DurablePositionId } from "./shadowmessage.ts";
import type { IShadow, IShadowTextBody } from "./ishadow.ts";
import {
  type IShadowAgent,
  updateWeight,
} from "./ishadowagent.ts";
import {
  type PValue,
  type TypeArgs,
} from "./shadowmessage.ts";

/**
 * monitors edits and suggests to add TOC
 */
export class AddTocAgent implements IShadowAgent {
  private readonly body: IShadowTextBody;
  private readonly shadow: IShadow;
  public weight: PValue = 0.0 as PValue;
  private rejectDelta = -0.3;
  private acceptDelta = 0.3;
  private suggestionDistance = 300;
  private startPosName: DurablePositionId | null = null;

  public get emit(): ShadowMessageId[] {
    return ["addtoc.display"];
  }

  public constructor(shadow: IShadow, body: IShadowTextBody) {
    this.body = body;
    this.shadow = shadow;

    // we want to track amount of new text a user has entered
  }

  public onAction(action: ShadowMessage): PValue {
    let weight = this.weight;
    if (action.id === "addtoc.reject") {
      weight = updateWeight(weight, this.rejectDelta);
    } else if (action.id === "addtoc.accept") {
      weight = updateWeight(weight, this.acceptDelta);
    } else if (action.id === "typing.startwriting") {
      //this.body.addDurablePosition((action.args as StartWritingArgs).cp);
    } else if (action.id === "user.type") {
      if (this.startPosName) {
        // let dist = this.body.getNormalizedDistance(
        //   this.body.getDurablePosition(this.startPosName),
        //   (action.args as TypeArgs).cp
        // );
        // if (dist > this.suggestionDistance) {
        //   this.shadow.invokeAction({ id: "addtoc.display" });
        // }
      }
    }

    this.weight = weight;
    return this.weight;
  }
}
