import { Database } from "./database.js";
import { assembleHtml, handleEditPart, handleListParts } from "./arch/htmlparts.js";
import { initRuleModel, testRuleModel } from "./fact/initRuleModel.js";
import { makeHtml } from "./arch/makeHtml.js";
import { initContextMap } from "./skills/context.js";
import { initInstructions } from "./skills/initSkills.js";
import * as fs from 'fs';
import * as path from 'path';
import { skilledWorker } from "./skills/skilledworker.js";
import { loadDoc } from "./server/loaddoc.js";
import type { ExecutePromptContext } from "./openai/executepromptcontext.js";
import { OpenAIClientChatLegacy } from "./openai/openai-chatclientlegacy.js";
import { PromptResponse } from "./server/messages.js";
import { PhaseGatedEnvelope } from "./openai/phase-envelope.js";

type PromptMetadata = {
};

function makePromptResponse(ctx: ExecutePromptContext, text: string): PromptResponse {
  return {
    sessionId: ctx.session.id,
    partId: ctx.partId,
    response: text
  };
}

export async function executePrompt(ctx: ExecutePromptContext): Promise<PromptResponse> {
  const parts = ctx.prompt.split(' ');
  const cmd = parts[0];

  switch (cmd) {
    case '!init':
      await handleInit(ctx.session.database);
      break;

    case '!initmodel':
      await initRuleModel(ctx.session.database);
      break;

    case '!testmodel':
      await testRuleModel(ctx.session.database);
      break;

    case '!list-instructions':
      await handleListRules(ctx.session.database);
      break;

    case '!get-instruction':
      if (parts.length < 2) {
        return makePromptResponse(ctx, 'Usage: get-rule <term1> [term2] ...');
      }
      await handleGetInstructions(ctx.session.database, parts.slice(1));
      break;

    // case '!store-instruction':
    //   await this.handleStoreInstruction();
    //   break;

    // case '!import-doc':
    //   if (parts.length < 2) {
    //     console.log('Usage: !import <filename>');
    //     return;
    //   }
    //   await importDoc(parts[1], ctx.openaiClient);
    //   break;

    case '!load-doc':
      if (parts.length < 2) {
        return makePromptResponse(ctx, 'Usage: !load-doc <filename>');
      }
      await loadDoc(ctx.session, parts[1]);
      break;

    // case '!import-blueprint':
    //   if (parts.length < 2) {
    //     console.log('Usage: !import <filename>');
    //     return;
    //   }
    //   await importBlueprint(parts[1], ctx.openaiClient);
    //   break;

    // case '!ib':
    //   await importBlueprint("tonniecv.html", ctx.openaiClient);
    //   break;

    // case '!make-sample':
    //   await makeSample(ctx.openaiClient, ctx.prompt);
    //   break;

    case '!make-html':
      if (parts.length < 2) {
        return makePromptResponse(ctx, 'Usage: !make-html <markdown-filename>');
      }
      await makeHtml(parts[1]);
      break;

    case '!listparts':
      if (parts.length >= 2) {
        await handleListParts(ctx.session.database, parts[1]);
      } else {
        await handleListParts(ctx.session.database);
      }
      break;

    case '!editpart':
      if (parts.length < 3) {
        return makePromptResponse(ctx, 'Usage: !editpart <docid> <partid>');
      }
      await handleEditPart(ctx.session.database, parts[1], parts[2]);
      break;

    case '!export':
      if (parts.length < 2) {
        return makePromptResponse(ctx, 'Usage: !assemble <docid>');
      }
      await handleExport(ctx.session.database, parts[1]);
      break;

    default:
      // Treat as chat message if not starting with !
      if (!ctx.prompt.startsWith('!')) {
        const result = await skilledWorker(ctx);
        return makePromptResponse(ctx, result.result?.kind === "raw" ?
          result.result?.response as string :
          (result.result?.response as PhaseGatedEnvelope).envelope.content)
      }
  }

  return makePromptResponse(ctx, 'Unknown command. Available: !init, !import-doc, !import-blueprint, !make-sample, !make-html, !listparts, !editpart, !assemble, exit');
}

async function handleInit(database: Database): Promise<void> {
  console.log('Initializing database with default rules...');

  const openaiClient = new OpenAIClientChatLegacy(database)

  // Clear existing instructions
  console.log('Clearing existing instructions...');
  await database.clearInstructions();

  const [successCount, errorCount] = await initInstructions(openaiClient, database);
  console.log(`\nInitialization complete: ${successCount} rules stored, ${errorCount} errors`);

  await initContextMap(openaiClient, database);
}

async function handleListRules(database: Database): Promise<void> {
  const allRules = await database.getAllInstructions();
  if (allRules.length === 0) {
    console.log('No rules found.');
    return;
  }

  console.log('Available rules:');
  allRules.forEach((rule, index) => {
    console.log(`${index + 1}. Terms: ${rule.keywords} (${rule.text.substring(0, 50)}...)`);
  });
}

async function handleGetInstructions(database: Database, terms: string[]): Promise<void> {
  const texts = await database.getAllTextsForTerms(terms);

  if (texts.length === 0) {
    console.log(`No rules found for terms: ${terms.join(', ')}`);
    return;
  }

  console.log(`Rules for terms [${terms.join(', ')}]:`);
  texts.forEach((text, index) => {
    console.log(`\n${index + 1}. ${text}`);
  });
}

async function handleExport(database: Database, docid: string): Promise<void> {
  try {
    // Get document metadata to retrieve filename
    const document = await database.getDocument(docid);

    if (!document) {
      console.log(`❌ Document not found: ${docid}`);
      return;
    }

    console.log(`📄 Assembling document: ${document.filename} (docid: ${docid})`);

    // Assemble the HTML
    const assembledHtml = await assembleHtml(database, docid);

    // Determine output path in content directory
    const contentDir = path.join(process.cwd(), 'content');
    const outputPath = path.join(contentDir, document.filename);

    // Ensure content directory exists
    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true });
    }

    // Write the assembled HTML to file
    fs.writeFileSync(outputPath, assembledHtml, 'utf-8');

    console.log(`✅ Assembled HTML written to: ${outputPath}`);
    console.log(`   Total size: ${assembledHtml.length} characters`);
  } catch (error) {
    console.error('❌ Error assembling document:', error);
  }
}

