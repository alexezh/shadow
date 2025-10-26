import { Database } from "./database.js";
import { assembleHtml, handleEditPart, handleListParts } from "./htmlparts.js";
import { importBlueprint } from "./import-blueprint.js";
import { importDoc } from "./import-doc.js";
import { initRuleModel, testRuleModel } from "./initRuleModel.js";
import { makeHtml } from "./makeHtml.js";
import { makeSample } from "./makeSample.js";
import { OpenAIClient } from "./openai-client.js";
import { initContextMap } from "./skills/context.js";
import { initInstructions } from "./skills/initSkills.js";
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getChatPrompt } from "./chatprompt.js";
import { skilledWorker } from "./skilledworker.js";
import { mcpTools } from "./mcptools.js";
import { Session } from "./clippy/session.js";
import { loadDoc } from "./clippy/loaddoc.js";
import type { ExecutePromptContext } from "./executepromptcontext.js";

type PromptMetadata = {
};

export async function executePrompt(ctx: ExecutePromptContext): Promise<void> {
  const parts = ctx.prompt.split(' ');
  const cmd = parts[0];

  switch (cmd) {
    case '!init':
      await handleInit(ctx.database, ctx.openaiClient);
      break;

    case '!initmodel':
      await initRuleModel(ctx.database);
      break;

    case '!testmodel':
      await testRuleModel(ctx.database);
      break;

    case '!list-instructions':
      await handleListRules(ctx.database);
      break;

    case '!get-instruction':
      if (parts.length < 2) {
        console.log('Usage: get-rule <term1> [term2] ...');
        return;
      }
      await handleGetInstructions(ctx.database, parts.slice(1));
      break;

    // case '!store-instruction':
    //   await this.handleStoreInstruction();
    //   break;

    case '!import-doc':
      if (parts.length < 2) {
        console.log('Usage: !import <filename>');
        return;
      }
      await importDoc(parts[1], ctx.openaiClient);
      break;

    case '!load-doc':
      if (parts.length < 2) {
        console.log('Usage: !load-doc <filename>');
        return;
      }
      await loadDoc(ctx.session, parts[1]);
      break;

    case '!import-blueprint':
      if (parts.length < 2) {
        console.log('Usage: !import <filename>');
        return;
      }
      await importBlueprint(parts[1], ctx.openaiClient);
      break;

    case '!ib':
      await importBlueprint("tonniecv.html", ctx.openaiClient);
      break;

    case '!make-sample':
      await makeSample(ctx.openaiClient, ctx.prompt);
      break;

    case '!make-html':
      if (parts.length < 2) {
        console.log('Usage: !make-html <markdown-filename>');
        return;
      }
      await makeHtml(parts[1]);
      break;

    case '!listparts':
      if (parts.length >= 2) {
        await handleListParts(ctx.database, parts[1]);
      } else {
        await handleListParts(ctx.database);
      }
      break;

    case '!editpart':
      if (parts.length < 3) {
        console.log('Usage: !editpart <docid> <partid>');
        return;
      }
      await handleEditPart(ctx.database, parts[1], parts[2]);
      break;

    case '!export':
      if (parts.length < 2) {
        console.log('Usage: !assemble <docid>');
        return;
      }
      await handleExport(ctx.database, parts[1]);
      break;

    default:
      // Treat as chat message if not starting with !
      if (!ctx.prompt.startsWith('!')) {
        await handleChatMessage(ctx);
      } else {
        console.log('Unknown command. Available: !init, !import-doc, !import-blueprint, !make-sample, !make-html, !listparts, !editpart, !assemble, exit');
      }
  }
}

async function handleInit(database: Database, openaiClient: OpenAIClient): Promise<void> {
  console.log('Initializing database with default rules...');

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

async function handleChatMessage(
  ctx: ExecutePromptContext
): Promise<void> {
  try {
    const systemPrompt = await getChatPrompt(ctx.database, {
      docId: ctx.docId ?? ctx.session?.id,
      partId: ctx.partId ?? ctx.session?.currentPartId,
      selectionRange: ctx.selectionRange
    });
    const result = await skilledWorker(
      ctx,
      mcpTools,
      systemPrompt,
    );

    // Note: conversationState is now returned instead of conversationId
  } catch (error) {
    console.error('❌ Error processing chat message:', error);
  }
}
