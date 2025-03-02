import type { ShadowAction } from "./action";
import type { IShadowState, StateName } from "./ishadowstate";

export interface IShadow {
  processAction(action: ShadowAction);
  addState(stateName: StateName, state: IShadowState);
  getState(stateName: StateName): IShadowState;
}
