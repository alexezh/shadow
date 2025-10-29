import { mcpTools } from "./mcptools.js";
import { OpenAIClient, ConversationState } from "./openai-client.js";
import { SessionImpl } from './server/sessionimpl.js';
import { makeDefaultDoc } from './server/loaddoc.js';
import { loadHtml } from './om/loadHtml.js';
import * as fs from 'fs';
import * as path from 'path';
import { ConversationStateResponses } from "./openai-responsesclient.js";

/*
  get document text
  extract default formatting
  default paragraph - 80%
  default table
  get format??? keep of remake??
  i know if a user changed after rewrite; so we can change the rule
  need json file for simplicity

  how to handle small variations of layout. === treat the same 
  6 columns vs 7 columns - question is what 
*/

export async function importDoc(filename: string, openaiClient: OpenAIClient): Promise<void> {
  try {
    console.log(`🔄 Importing document: ${filename}`);

    // Load the HTML file
    const contentDir = path.join(process.cwd(), 'content');
    const htmlFilePath = path.join(contentDir, filename);

    if (!fs.existsSync(htmlFilePath)) {
      console.error(`❌ File not found: ${htmlFilePath}`);
      return;
    }

    const htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');

    // Create a temporary session with the document loaded
    const doc = makeDefaultDoc();
    const rootNode = loadHtml(htmlContent);

    // Clear default content and add loaded content
    const body = doc.getBody();
    while (body.getChildren().length > 0) {
      body.removeChild(0);
    }

    if (rootNode.hasChildren()) {
      const children = rootNode.getChildren();
      if (children) {
        for (const child of children) {
          body.addChild(child);
        }
      }
    } else {
      body.addChild(rootNode);
    }

    const session = new SessionImpl(filename, doc);

    const systemPrompt = `You are Shadow, a word processing software agent responsible for working with documents.

-read document text using get_contentrange method. Use 'text' as format. Assume that user specified file name in a prompt.
-split document into sections and subsections if any.
-Use markdown headers as well as semantic of the document; add sections when needed even if there is no section in markdown.
-For each section and subsections generate short summary and 3-7 keywords and invoke store_asset passing:
  level: level of section (aka 1,2,3)
  start_para: id of first paragraph
  end_para: id of the last paragraph
  summary: summary of section
- Treat each table as section. Store summary for table in the same format

  paragraph ids specified as {id=xyz} at the end of paragraph

The user wants to import: ${filename}`;

    const userMessage = `Import the document "${filename}" into the document library`;

    const conversationState = new ConversationStateResponses(systemPrompt, userMessage);
    const result = await openaiClient.chatWithMCPTools(session, mcpTools, conversationState, userMessage);
    const response = result.response;
    console.log('🤖 Shadow:', response);

  } catch (error) {
    console.error('❌ Error importing document:', error);
  }
}
