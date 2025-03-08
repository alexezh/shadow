import type { TimeValue } from "./ishadowagent";

export type ShadowMessageArgs = {};

export type ShadowMessageId =
  | "none"
  // logged when a user typed non-trivial amount of text
  // the exact logic for some events will be defined by lower level models
  | "user.type"
  | "user.moveip"
  | "user.format"
  | "editor.startwriting"
  | "editor.endwriting"
  // user applied suggestion from grammar checker
  | "editor.correct"
  | "editor.inserttable"
  | "editor.insertpicture"
  | "addtoc.display"
  | "addtoc.reject"
  | "addtoc.accept"
  | "sectionsummary.display"
  // TODO: need similarity for actions; such as reject for section should change
  // weight for reject for other similar agents
  | "sectionsummary.reject"
  | "sectionsummary.accept";

export class ShadowMessage<T extends ShadowMessageArgs = ShadowMessageArgs> {
  public readonly id: ShadowMessageId = "none";
  public readonly args?: T;
  public readonly invokedTime?: TimeValue;

  constructor(name: ShadowMessageId, args?: T) {
    this.id = name;
    this.args = args;
  }

  // original states
}
