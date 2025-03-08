export type ShadowMessageArgs = {};

export type ShadowMessageId =
  | "none"
  // logged when a user typed non-trivial amount of text
  // the exact logic for some events will be defined by lower level models
  | "user.type"
  // optional. logged when a user moved to different position
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

/**
* number is more compact representation of time
*/
export type TimeValue = number & {
  __tagtime: never;
};

export type PValue = number & {
  __tagprob: never;
};

/**
 * 0-1 same paragraphs, 1000 and -1000 end of document
 */
export type TextDistance = number & {
  __tagdist: never;
};

export type ShadowRevisionId = string & {
  __tagrev: never;
}

export type TypeArgs = ShadowMessageArgs & {
  rev: ShadowRevisionId;
};

export type CellObjectId = string & {
  __tagparaid: never;
}

export type WireCp = number & {
  __tagcp: never;
}

/**
 * most probably implemented as fragmented position
 * does not really matter as it is just passed to IShadowTextBody
 */
export type GlobalCp = number & {
  __tag_globalcp: never;
};

export type MoveIpArgs = ShadowMessageArgs & {
  cp: GlobalCp;
};

export type StartWritingArgs = ShadowMessageArgs & {
  cp: GlobalCp;
};

export type ShadowMessageT<TId extends ShadowMessageId, T extends ShadowMessageArgs = ShadowMessageArgs> = {
  id: TId;
  args?: T;
  invokedTime?: TimeValue;
}

export type ShadowMessage =
  ShadowMessageT<"none">
  | ShadowMessageT<"user.type", TypeArgs>
  | ShadowMessageT<"user.format">
  | ShadowMessageT<"user.moveip">
  | ShadowMessageT<"editor.startwriting", StartWritingArgs>
  | ShadowMessageT<"editor.endwriting">
  // user applied suggestion from grammar checker
  | ShadowMessageT<"editor.correct">
  | ShadowMessageT<"editor.inserttable">
  | ShadowMessageT<"editor.insertpicture">
  | ShadowMessageT<"addtoc.display">
  | ShadowMessageT<"addtoc.reject">
  | ShadowMessageT<"addtoc.accept">
  | ShadowMessageT<"sectionsummary.display">
  | ShadowMessageT<"sectionsummary.reject">
  | ShadowMessageT<"sectionsummary.accept">;
