import { type ActionArgs, type TimeValue } from "./ishadowstate";

export type ActionName = "none" |
  // logged when a user typed non-trivial amount of text
  // the exact logic for some events will be defined by lower level models
  "editor.type" |
  "editor.moveip" |
  "editor.format" |
  // user applied suggestion from grammar checker
  "editor.correct" |
  "editor.inserttable" |
  "editor.insertpicture" |
  "ai.summary" |
  // agent suggesting toc
  "ai.toc" |
  // "ai.suggest.struggle" |
  // agent which detects that user is struggling and might need help to rewrite
  "ai.accept.struggle" |
  "ai.reject.struggle" |
  // agent which detects that a user accepts grammar suggestions of certain tyoe
  // and suggests to fix them all
  "ai.fixall" |
  // grammar 
  "ai.grammar" |
  "ai.rewrite";

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
