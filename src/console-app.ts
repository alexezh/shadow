import { Database } from './database.js';
import { OpenAIClient } from './openai-client.js';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { executePrompt } from './executeprompt.js';

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
        //await executePrompt(undefined, this.database, this.openaiClient, trimmed);
        throw "Not implemented"
      } catch (error) {
        console.error(`Error: ${error}`);
      }

      this.promptUser();
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

  async stop(): Promise<void> {
    this.rl.close();
    await this.database.close();
    console.log('Console app stopped.');
    process.exit(0);
  }
}
