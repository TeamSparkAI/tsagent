#!/usr/bin/env node

import { program } from 'commander';
import path from 'path';
import chalk from 'chalk';
import { loadAgent } from '@tsagent/core/runtime';
import { Agent } from '@tsagent/core';
import { SemanticIndexer, Scope, SearchResult } from './indexer';
import { SimpleLogger } from './logger';

export const PRODUCT_NAME = 'TsAgent Semantic Index';

async function main() {
  const logger = new SimpleLogger();
  
  program
    .name('tsagent-semantic-index')
    .description(PRODUCT_NAME)
    .version('1.2.8')
    .argument('<agent-path>', 'Path to agent directory')
    .option('--verbose', 'Enable verbose logging')
    .option('--stats', 'Display performance statistics (indexing and search timing)')
    .option('--scope <scope>', 'Default scope: all, rules, references, or tools (default: all)', 'all')
    .parse();

  const options = program.opts();
  const agentPath = program.args[0];

  if (!agentPath) {
    console.error(chalk.red('Error: Agent path is required'));
    program.help();
    process.exit(1);
  }

  // Set logging level
  if (options.verbose) {
    logger.setVerbose(true);
  }

  logger.info(`Starting ${PRODUCT_NAME}`);
  
  // Resolve agent path
  const resolvedPath = path.resolve(agentPath);
  logger.info(`Loading agent from: ${resolvedPath}`);

  try {
    // Load agent
    const agent = await loadAgent(resolvedPath, logger);
    logger.info(`Agent loaded: ${agent.name}`);

    // Get all rules, references, and tools
    const rules = agent.getAllRules();
    const references = agent.getAllReferences();
    
    // Get tools from MCP clients (tools the agent can use)
    const mcpClients = await agent.getAllMcpClients();
    const tools: Array<{ name: string; description: string }> = [];
    for (const [serverName, client] of Object.entries(mcpClients)) {
      for (const tool of client.serverTools) {
        tools.push({
          name: tool.name,
          description: tool.description || ''
        });
      }
    }

    logger.info(`Found ${rules.length} rule(s), ${references.length} reference(s), ${tools.length} tool(s)`);

    if (rules.length === 0 && references.length === 0 && tools.length === 0) {
      console.log(chalk.yellow('No rules, references, or tools found in agent. Exiting.'));
      process.exit(0);
    }

    // Validate default scope if provided
    const validScopes = ['all', 'rules', 'references', 'tools'];
    const defaultScope = options.scope || 'all';
    if (!validScopes.includes(defaultScope)) {
      console.error(chalk.red(`Error: --scope must be one of: ${validScopes.join(', ')}`));
      process.exit(1);
    }

    // Create indexer and index all items
    console.log(chalk.blue('Indexing rules, references, and tools...'));
    const indexer = new SemanticIndexer(logger);
    const indexStats = await indexer.indexAll(rules, references, tools);
    console.log(chalk.green('Indexing complete!'));
    
    if (options.stats) {
      const modelInitSeconds = (indexStats.modelInitMs / 1000).toFixed(2);
      const indexingSeconds = (indexStats.indexingMs / 1000).toFixed(2);
      const totalSeconds = (indexStats.totalMs / 1000).toFixed(2);
      console.log(chalk.gray(`\nIndexing stats:`));
      console.log(chalk.gray(`  Items indexed: ${indexStats.items}`));
      console.log(chalk.gray(`  Chunks created: ${indexStats.chunks}`));
      console.log(chalk.gray(`  Model initialization: ${modelInitSeconds}s`));
      console.log(chalk.gray(`  Embedding generation: ${indexingSeconds}s`));
      console.log(chalk.gray(`  Total time: ${totalSeconds}s\n`));
    }

    // Interactive search loop
    console.log(chalk.cyan('\nEnter search queries (type "exit" or "quit" to exit):\n'));
    
    const readline = await import('node:readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('> ')
    });

    rl.prompt();

    rl.on('line', async (input: string) => {
      const rawQuery = input.trim();
      
      if (rawQuery === 'exit' || rawQuery === 'quit' || rawQuery === 'q') {
        rl.close();
        process.exit(0);
      }

      if (!rawQuery) {
        rl.prompt();
        return;
      }

      try {
        // Parse query for "scope: text" pattern
        const scopePattern = /^(all|rules|references|tools):\s*(.+)$/i;
        const match = rawQuery.match(scopePattern);
        
        let query: string;
        let scope: Scope | 'all';
        
        if (match) {
          // Scope found in query
          scope = match[1].toLowerCase() as Scope | 'all';
          query = match[2].trim();
        } else {
          // Use default scope from command line
          scope = defaultScope as Scope | 'all';
          query = rawQuery;
        }

        console.log(chalk.blue(`\nSearching for: "${query}"${scope !== 'all' ? ` (scope: ${scope})` : ''}...`));
        const searchResult = await indexer.search(query, 5, scope);
        const results = searchResult.results;
        
        if (options.stats) {
          const inferenceMs = searchResult.elapsedMs;
          const inferenceSeconds = (inferenceMs / 1000).toFixed(3);
          console.log(chalk.gray(`  Inference time: ${inferenceSeconds}s\n`));
        }
        
        if (results.length === 0) {
          console.log(chalk.yellow('No results found.'));
        } else {
          const scopeLabel = scope !== 'all' ? ` ${scope}` : '';
          console.log(chalk.green(`\nFound ${results.length} relevant${scopeLabel} item(s):\n`));
          results.forEach((result: SearchResult, index: number) => {
            const scopePrefix = `[${result.scope}]`;
            console.log(chalk.cyan(`${index + 1}. ${scopePrefix} ${result.itemName}`));
            console.log(chalk.gray(`   (similarity: ${result.score.toFixed(4)})`));
            if (result.chunkText) {
              const preview = result.chunkText.substring(0, 150).replace(/\n/g, ' ');
              console.log(chalk.gray(`   Preview: ${preview}...`));
            }
            console.log();
          });
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }

      rl.prompt();
    });

    rl.on('close', () => {
      console.log(chalk.cyan('\nGoodbye!'));
      process.exit(0);
    });

  } catch (error) {
    console.error(chalk.red(`Failed to load agent: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});

