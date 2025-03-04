import { type ActionArgs, type TimeValue } from "./ishadowagent";

export type ActionName = "none" |
  // logged when a user typed non-trivial amount of text
  // the exact logic for some events will be defined by lower level models
  "editor.type" |
  "editor.moveip" |
  "editor.format" |
  "editor.startwriting" |
  "editor.endwriting" |
  // user applied suggestion from grammar checker
  "editor.correct" |
  "editor.inserttable" |
  "editor.insertpicture" |
  "sectionsummary.display" |
  // TODO: need similarity for actions; such as reject for section should change
  // weight for reject for other similar agents
  "sectionsummary.reject" |
  "sectionsummary.accept"

export class ShadowAction<T extends ActionArgs = ActionArgs> {
  public readonly name: ActionName = "none";
  public readonly args?: T;
  public readonly invokedTime?: TimeValue;

  constructor(name: ActionName, args?: T) {
    this.name = name;
    this.args = args;
  }

  // original states
}
