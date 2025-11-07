import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ProviderType } from '../providers/types.js';
import { Rule } from '../types/rules.js';
import { Reference } from '../types/references.js';
import { McpConfig } from '../mcp/types.js';
import { Agent, AgentConfig } from '../types/agent.js';
import { AGENT_FILE_NAME } from '../index.js';
import { Logger } from '../types/common.js';
import { AgentImpl } from './agent-api.js';

export interface AgentStrategy {
  // Agent lifecycle
  exists(): Promise<boolean>;
  getName(): string;
  deleteAgent(): Promise<void>;
  
  // Configuration
  loadConfig(): Promise<AgentConfig>;
  saveConfig(config: AgentConfig): Promise<void>;

  // System prompt
  loadSystemPrompt(defaultPrompt: string): Promise<string>;
  saveSystemPrompt(prompt: string): Promise<void>;

  // Providers
  loadProviders(): Promise<Record<ProviderType, Record<string, string>>>;
  saveProviders(providers: Record<ProviderType, Record<string, string>>): Promise<void>;
  
  // MCP Servers
  loadMcpServers(): Promise<Record<string, McpConfig>>;
  saveMcpServers(servers: Record<string, McpConfig>): Promise<void>;
  
  // Rules
  loadRules(): Promise<Rule[]>;
  deleteRules(): Promise<void>;
  addRule(rule: Rule): Promise<void>;
  deleteRule(ruleName: string): Promise<void>;
  
  // References
  loadReferences(): Promise<Reference[]>;
  deleteReferences(): Promise<void>;
  addReference(reference: Reference): Promise<void>;
  deleteReference(referenceName: string): Promise<void>;
}

export class FileBasedAgentStrategy implements AgentStrategy {
  public static readonly AGENT_FILE_NAME = AGENT_FILE_NAME;
  private static readonly SYSTEM_PROMPT_FILE_NAME = 'prompt.md';
  private static readonly RULE_FILE_EXTENSION = '.mdt';
  private static readonly REFERENCE_FILE_EXTENSION = '.mdt';
  
  private agentDir: string;
  private agentFile: string;
  private rulesDir: string;
  private referencesDir: string;

  constructor(agentDir: string, private logger: Logger) {
    this.agentDir = agentDir;
    this.agentFile = path.join(this.agentDir, FileBasedAgentStrategy.AGENT_FILE_NAME);
    this.rulesDir = path.join(this.agentDir, 'rules');
    this.referencesDir = path.join(this.agentDir, 'refs');
    
    // Ensure directories exist
    if (!fs.existsSync(this.agentDir)) {
      fs.mkdirSync(this.agentDir, { recursive: true });
    }
    if (!fs.existsSync(this.rulesDir)) {
      fs.mkdirSync(this.rulesDir, { recursive: true });
    }
    if (!fs.existsSync(this.referencesDir)) {
      fs.mkdirSync(this.referencesDir, { recursive: true });
    }
  }

  getName(): string {
    return this.agentDir;
  }

  static async agentExists(agentPath: string): Promise<boolean> {
    const normalizedPath = path.normalize(agentPath);
    const agentFile = path.join(normalizedPath, FileBasedAgentStrategy.AGENT_FILE_NAME);
    return fs.existsSync(agentFile);
  }

  async exists(): Promise<boolean> {
    return fs.existsSync(this.agentFile);
  }

  async deleteAgent(): Promise<void> {
    await fs.promises.rm(this.agentDir, { recursive: true, force: true });
  }

  static async cloneAgent(sourcePath: string, targetPath: string, logger: Logger): Promise<Agent> {
    const normalizedSource = path.normalize(sourcePath);
    const normalizedTarget = path.normalize(targetPath);

    // Check if source agent exists
    if (!await FileBasedAgentStrategy.agentExists(normalizedSource)) {
      throw new Error(`Source agent does not exist: ${normalizedSource}`);
    }

    // Check if target agent already exists
    if (await FileBasedAgentStrategy.agentExists(normalizedTarget)) {
      throw new Error(`Target agent already exists: ${normalizedTarget}`);
    }

    // Create target directory
    if (!fs.existsSync(normalizedTarget)) {
      fs.mkdirSync(normalizedTarget, { recursive: true });
    }

    // Copy all agent files
    const filesToCopy = [
      FileBasedAgentStrategy.AGENT_FILE_NAME,
      FileBasedAgentStrategy.SYSTEM_PROMPT_FILE_NAME,
      'refs',
      'rules'
    ];

    for (const file of filesToCopy) {
      const sourceFile = path.join(normalizedSource, file);
      const targetFile = path.join(normalizedTarget, file);
      
      if (fs.existsSync(sourceFile)) {
        if (fs.lstatSync(sourceFile).isDirectory()) {
          await fs.promises.cp(sourceFile, targetFile, { recursive: true });
        } else {
          await fs.promises.copyFile(sourceFile, targetFile);
        }
      }
    }
 
    // Create and load the new agent, then return it
    const strategy = new FileBasedAgentStrategy(normalizedTarget, logger);
    const clone = new AgentImpl(strategy, logger);
    await clone.load();

    return clone;
  }

  async loadConfig(): Promise<AgentConfig> {
    if (!fs.existsSync(this.agentFile)) {
      throw new Error(`Agent file does not exist: ${this.agentFile}`);
    }
    
    const content = fs.readFileSync(this.agentFile, 'utf-8');
    return JSON.parse(content) as AgentConfig;
  }

  async saveConfig(config: AgentConfig): Promise<void> {
    fs.writeFileSync(this.agentFile, JSON.stringify(config, null, 2), 'utf-8');
    this.logger.info(`Agent config saved to: ${this.agentFile}`);
  }

  async loadSystemPrompt(defaultPrompt: string): Promise<string> {
    const promptFile = path.join(this.agentDir, FileBasedAgentStrategy.SYSTEM_PROMPT_FILE_NAME);
    if (!fs.existsSync(promptFile)) {
      return defaultPrompt;
    }
    return fs.readFileSync(promptFile, 'utf-8');
  }

  async saveSystemPrompt(prompt: string): Promise<void> {
    const promptFile = path.join(this.agentDir, FileBasedAgentStrategy.SYSTEM_PROMPT_FILE_NAME);
    fs.writeFileSync(promptFile, prompt, 'utf-8');
    this.logger.info(`System prompt saved to: ${promptFile}`);
  }

  async loadProviders(): Promise<Record<ProviderType, Record<string, string>>> {
    const config = await this.loadConfig();
    return config.providers || {};
  }

  async saveProviders(providers: Record<ProviderType, Record<string, string>>): Promise<void> {
    const config = await this.loadConfig();
    config.providers = providers;
    await this.saveConfig(config);
  }

  async loadMcpServers(): Promise<Record<string, McpConfig>> {
    const config = await this.loadConfig();
    return config.mcpServers || {};
  }

  async saveMcpServers(servers: Record<string, McpConfig>): Promise<void> {
    const config = await this.loadConfig();
    config.mcpServers = servers;
    await this.saveConfig(config);
  }

  async loadRules(): Promise<Rule[]> {
    const rules: Rule[] = [];
    
    if (!fs.existsSync(this.rulesDir)) {
      return rules;
    }

    const files = fs.readdirSync(this.rulesDir).filter(file => 
      file.endsWith(FileBasedAgentStrategy.RULE_FILE_EXTENSION)
    );
    
    for (const file of files) {
      const filePath = path.join(this.rulesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      try {
        const parts = content.split('---\n');
        if (parts.length >= 3) {
          const metadata = yaml.load(parts[1]) as Partial<Rule>;
          const text = parts.slice(2).join('---\n').trim();
          
          const rule: Rule = {
            name: metadata.name || path.basename(file, FileBasedAgentStrategy.RULE_FILE_EXTENSION),
            description: metadata.description || '',
            priorityLevel: metadata.priorityLevel || 500,
            text: text,
            include: metadata.include || 'manual'
          };
          rules.push(rule);
        }
      } catch (error) {
        this.logger.error(`Error loading rule from ${file}:`, error);
      }
    }
    
    return rules.sort((a, b) => {
      if (a.priorityLevel !== b.priorityLevel) {
        return a.priorityLevel - b.priorityLevel;
      }
      return a.name.localeCompare(b.name);
    });
  }

  async deleteRules(): Promise<void> {
    if (!fs.existsSync(this.rulesDir)) {
      return;
    }

    // !!! This would only be for a deleteAgent to efficiently delete all rules
    // !!! Delete all rules files in the rules directory and the directory itself
  }

  async addRule(rule: Rule): Promise<void> {
    if (!this.validateRuleName(rule.name)) {
      throw new Error('Rule name can only contain letters, numbers, underscores, and dashes');
    }

    const fileName = `${rule.name}${FileBasedAgentStrategy.RULE_FILE_EXTENSION}`;
    const filePath = path.join(this.rulesDir, fileName);
    
    const metadata = {
      name: rule.name,
      description: rule.description,
      priorityLevel: rule.priorityLevel,
      include: rule.include
    };

    const content = `---\n${JSON.stringify(metadata, null, 2)}---\n${rule.text}`;
    fs.writeFileSync(filePath, content, 'utf-8');
    this.logger.info(`Rule saved to: ${filePath}`);
  }

  async deleteRule(ruleName: string): Promise<void> {
    const fileName = `${ruleName}${FileBasedAgentStrategy.RULE_FILE_EXTENSION}`;
    const filePath = path.join(this.rulesDir, fileName);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.logger.info(`Rule deleted: ${filePath}`);
    }
  }

  async loadReferences(): Promise<Reference[]> {
    const references: Reference[] = [];
    
    if (!fs.existsSync(this.referencesDir)) {
      return references;
    }

    const files = fs.readdirSync(this.referencesDir).filter(file => 
      file.endsWith(FileBasedAgentStrategy.REFERENCE_FILE_EXTENSION)
    );
    
    for (const file of files) {
      const filePath = path.join(this.referencesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      try {
        const parts = content.split('---\n');
        if (parts.length >= 3) {
          const metadata = yaml.load(parts[1]) as Partial<Reference>;
          const text = parts.slice(2).join('---\n').trim();
          
          const reference: Reference = {
            name: metadata.name || path.basename(file, FileBasedAgentStrategy.REFERENCE_FILE_EXTENSION),
            description: metadata.description || '',
            priorityLevel: metadata.priorityLevel || 500,
            text: text,
            include: metadata.include || 'manual'
          };
          references.push(reference);
        }
      } catch (error) {
        this.logger.error(`Error loading reference from ${file}:`, error);
      }
    }
    
    return references.sort((a, b) => {
      if (a.priorityLevel !== b.priorityLevel) {
        return a.priorityLevel - b.priorityLevel;
      }
      return a.name.localeCompare(b.name);
    });
  }

  async deleteReferences(): Promise<void> {
    if (!fs.existsSync(this.referencesDir)) {
      return;
    }

    // !!! This would only be for a deleteAgent to efficiently delete all references
    // !!! Delete all references files in the references directory and the directory itself
  }

  async addReference(reference: Reference): Promise<void> {
    if (!this.validateReferenceName(reference.name)) {
      throw new Error('Reference name can only contain letters, numbers, underscores, and dashes');
    }

    const fileName = `${reference.name}${FileBasedAgentStrategy.REFERENCE_FILE_EXTENSION}`;
    const filePath = path.join(this.referencesDir, fileName);
    
    const metadata = {
      name: reference.name,
      description: reference.description,
      priorityLevel: reference.priorityLevel,
      include: reference.include
    };

    const content = `---\n${JSON.stringify(metadata, null, 2)}---\n${reference.text}`;
    fs.writeFileSync(filePath, content, 'utf-8');
    this.logger.info(`Reference saved to: ${filePath}`);
  }

  async deleteReference(referenceName: string): Promise<void> {
    const fileName = `${referenceName}${FileBasedAgentStrategy.REFERENCE_FILE_EXTENSION}`;
    const filePath = path.join(this.referencesDir, fileName);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.logger.info(`Reference deleted: ${filePath}`);
    }
  }

  private validateRuleName(name: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(name);
  }

  private validateReferenceName(name: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(name);
  }
}
