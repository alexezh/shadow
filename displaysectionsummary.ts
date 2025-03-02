import { ShadowAction } from "./action";
import { IShadow } from "./IShadow";
import { IShadowState, PValue } from "./ishadowstate";

/**
 * display summary for section when a user typed enoigh data to make decision
 */
export class DisplaySectionSummaryState implements IShadowState {
  weight: PValue;
  private editor: IShadowState;

  public constructor(shadow: IShadow) {
    this.editor = shadow.getState("editor.editing");
  }

  onAction(action: ShadowAction): PValue {
    return 0 as PValue;
  }

}