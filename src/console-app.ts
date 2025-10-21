import { getChatPrompt } from './chatprompt.js';
import { Database } from './database.js';
import { importBlueprint } from './import-blueprint.js';
import { importDoc } from './import-doc.js';
import { initInstructions } from './skills/initSkills.js';
import { initRuleModel, testRuleModel } from './initRuleModel.js';
import { makeSample } from './makeSample.js';
import { makeHtml } from './makeHtml.js';
import { mcpTools } from './mcptools.js';
import { OpenAIClient } from './openai-client.js';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initContextMap } from './context.js';
import { skilledWorker } from './skilledworker.js';
import { spawn } from 'child_process';
import { assembleHtml, handleEditPart, handleListParts } from './htmlparts.js';

export class ConsoleApp {
  private database: Database;
  private openaiClient: OpenAIClient;
  private rl: readline.Interface;
  private historyFile: string;
  private currentConversationId?: string;

  constructor(database: Database) {
    this.database = database;
    this.openaiClient = new OpenAIClient(database);
    this.historyFile = path.join(os.homedir(), '.shadow_history');

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: this.completer.bind(this)
    });

    this.loadHistory();
  }

  async start(): Promise<void> {
    console.log('Console mode started. Available commands: !init, !import-doc, !import-blueprint, !make-sample, !make-html, !listparts, !editpart, !assemble, exit');

    this.promptUser();
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const history = fs.readFileSync(this.historyFile, 'utf-8')
          .split('\n')
          .filter(line => line.trim().length > 0);

        // Load last 1000 commands to avoid memory issues
        const recentHistory = history.slice(-1000);

        for (const line of recentHistory) {
          (this.rl as any).history.unshift(line);
        }
      }
    } catch (error) {
      console.warn('Failed to load command history:', error);
    }
  }

  private saveHistory(command: string): void {
    try {
      fs.appendFileSync(this.historyFile, command + '\n', 'utf-8');
    } catch (error) {
      console.warn('Failed to save command to history:', error);
    }
  }

  private completer(line: string): [string[], string] {
    const completions = [
      '!init',
      '!initmodel',
      '!testmodel',
      '!list-instructions',
      '!get-instruction',
      '!import-doc',
      '!import-blueprint',
      '!ib',
      '!make-sample',
      '!make-html',
      '!listparts',
      '!editpart',
      '!assemble',
      'exit'
    ];

    // Check if we're completing a filename after certain commands
    const words = line.split(' ');
    if (words.length > 1 && (words[0] === '!import-doc' || words[0] === '!import-blueprint' || words[0] === '!make-html')) {
      const partialFilename = words[words.length - 1];
      const contentDir = path.join(process.cwd(), 'content');

      try {
        if (fs.existsSync(contentDir)) {
          const files = fs.readdirSync(contentDir)
            .filter(file => file.startsWith(partialFilename))
            .map(file => words.slice(0, -1).join(' ') + ' ' + file);

          return [files, line];
        }
      } catch (error) {
        // Ignore errors and fall back to command completion
      }
    }

    // Command completion
    const hits = completions.filter(completion => completion.startsWith(line));
    return [hits.length ? hits : completions, line];
  }

  private promptUser(): void {
    this.rl.question('> ', async (input) => {
      const trimmed = input.trim();

      // Save non-empty commands to history
      if (trimmed.length > 0) {
        this.saveHistory(trimmed);
      }

      if (trimmed === 'exit') {
        await this.stop();
        return;
      }

      try {
        await this.handleCommand(trimmed);
      } catch (error) {
        console.error(`Error: ${error}`);
      }

      this.promptUser();
    });
  }

  private async handleCommand(command: string): Promise<void> {
    const parts = command.split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case '!init':
        await this.handleInit();
        break;

      case '!initmodel':
        await initRuleModel(this.database);
        break;

      case '!testmodel':
        await testRuleModel(this.database);
        break;

      case '!list-instructions':
        await this.handleListRules();
        break;

      case '!get-instruction':
        if (parts.length < 2) {
          console.log('Usage: get-rule <term1> [term2] ...');
          return;
        }
        await this.handleGetInstructions(parts.slice(1));
        break;

      // case '!store-instruction':
      //   await this.handleStoreInstruction();
      //   break;

      case '!import-doc':
        if (parts.length < 2) {
          console.log('Usage: !import <filename>');
          return;
        }
        await importDoc(parts[1], this.openaiClient);
        break;

      case '!import-blueprint':
        if (parts.length < 2) {
          console.log('Usage: !import <filename>');
          return;
        }
        await importBlueprint(parts[1], this.openaiClient);
        break;

      case '!ib':
        await importBlueprint("tonniecv.html", this.openaiClient);
        break;

      case '!make-sample':
        await makeSample(this.openaiClient, command);
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
          await handleListParts(this.database, parts[1]);
        } else {
          await handleListParts(this.database);
        }
        break;

      case '!editpart':
        if (parts.length < 3) {
          console.log('Usage: !editpart <docid> <partid>');
          return;
        }
        await handleEditPart(this.database, parts[1], parts[2]);
        break;

      case '!export':
        if (parts.length < 2) {
          console.log('Usage: !assemble <docid>');
          return;
        }
        await this.handleExport(parts[1]);
        break;

      default:
        // Treat as chat message if not starting with !
        if (!command.startsWith('!')) {
          await this.handleChatMessage(command);
        } else {
          console.log('Unknown command. Available: !init, !import-doc, !import-blueprint, !make-sample, !make-html, !listparts, !editpart, !assemble, exit');
        }
    }
  }

  private async handleInit(): Promise<void> {
    console.log('Initializing database with default rules...');

    // Clear existing instructions
    console.log('Clearing existing instructions...');
    await this.database.clearInstructions();

    const [successCount, errorCount] = await initInstructions(this.openaiClient, this.database);
    console.log(`\nInitialization complete: ${successCount} rules stored, ${errorCount} errors`);

    await initContextMap(this.openaiClient, this.database);
  }

  private async handleListRules(): Promise<void> {
    const allRules = await this.database.getAllInstructions();
    if (allRules.length === 0) {
      console.log('No rules found.');
      return;
    }

    console.log('Available rules:');
    allRules.forEach((rule, index) => {
      console.log(`${index + 1}. Terms: ${rule.keywords} (${rule.text.substring(0, 50)}...)`);
    });
  }

  private async handleGetInstructions(terms: string[]): Promise<void> {
    const texts = await this.database.getAllTextsForTerms(terms);

    if (texts.length === 0) {
      console.log(`No rules found for terms: ${terms.join(', ')}`);
      return;
    }

    console.log(`Rules for terms [${terms.join(', ')}]:`);
    texts.forEach((text, index) => {
      console.log(`\n${index + 1}. ${text}`);
    });
  }

  // private async handleStoreInstruction(): Promise<void> {
  //   return new Promise((resolve) => {
  //     this.rl.question('Enter terms (space-separated): ', (termsInput) => {
  //       const terms = termsInput.trim().split(/\s+/);

  //       this.rl.question('Enter rule text: ', async (text) => {
  //         try {
  //           const embedding = await this.openaiClient.generateEmbedding(terms);
  //           await this.database.storeAsset(terms, text.trim(), embedding);
  //           console.log(`Rule stored successfully for terms: ${terms.join(', ')}`);
  //         } catch (error) {
  //           console.error(`Failed to store rule: ${error}`);
  //         }
  //         resolve();
  //       });
  //     });
  //   });
  // }

  private async handleExport(docid: string): Promise<void> {
    try {
      // Get document metadata to retrieve filename
      const document = await this.database.getDocument(docid);

      if (!document) {
        console.log(`❌ Document not found: ${docid}`);
        return;
      }

      console.log(`📄 Assembling document: ${document.filename} (docid: ${docid})`);

      // Assemble the HTML
      const assembledHtml = await assembleHtml(this.database, docid);

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

  private async handleChatMessage(message: string): Promise<void> {
    try {

      const startAt = performance.now();
      const systemPrompt = await getChatPrompt(this.database);
      const result = await skilledWorker(
        this.openaiClient,
        mcpTools,
        systemPrompt,
        message,
        { conversationId: this.currentConversationId }
      );

      // Store conversation ID for continuation
      this.currentConversationId = result.conversationId;

      const endAt = performance.now();
      const elapsedSeconds = (endAt - startAt) / 1000;
      console.log(`Shadow complete: elapsed=${elapsedSeconds.toFixed(2)}s prompt=${result.usage.promptTokens} completion=${result.usage.completionTokens} total=${result.usage.totalTokens}`);
      console.log('Response:', result.response);

    } catch (error) {
      console.error('❌ Error processing chat message:', error);
    }
  }

  async stop(): Promise<void> {
    this.rl.close();
    await this.database.close();
    console.log('Console app stopped.');
    process.exit(0);
  }
}
