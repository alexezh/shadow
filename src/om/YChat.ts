import { make31BitId } from "../make31bitid";
import { YBody } from "./YBody";

export class YChat {
  public messages: YChatMessage[] = [];
}

export class YChatMessage {
  public body: YBody;
  public id: string;

  public constructor(body: YBody) {
    this.body = body;
    this.id = make31BitId();
  }
}