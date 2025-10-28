import { Session } from "../server/session";

export async function replaceContentRange(session: Session,
  args: {
    docid: string;
    format: string;
    start_para?: string;
    end_para?: string;
    content: string;
  }): Promise<string> {
  // TODO: Implement content range replacement
  return "replaceContentRange not yet implemented";
}