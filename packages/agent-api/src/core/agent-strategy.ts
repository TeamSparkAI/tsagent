import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { ProviderType } from '../providers/types.js';
import { Rule, RuleSchema } from '../types/rules.js';
import { Reference, ReferenceSchema } from '../types/references.js';
import { McpConfig } from '../mcp/types.js';
import { Agent, AgentConfig, AgentConfigSchema } from '../types/agent.js';
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

  // Providers
  loadProviders(): Promise<Record<ProviderType, Record<string, string>>>;
  saveProviders(providers: Record<ProviderType, Record<string, string>>): Promise<void>;
  
  // MCP Servers
  loadMcpServers(): Promise<Record<string, McpConfig>>;
  saveMcpServers(servers: Record<string, McpConfig>): Promise<void>;
}

export class FileBasedAgentStrategy implements AgentStrategy {
  private static readonly AGENT_FILE_BASE_NAME = 'tsagent';
  private static readonly SYSTEM_PROMPT_FILE_NAME = 'prompt.md';
  private static readonly RULE_FILE_EXTENSION = '.mdt';
  private static readonly REFERENCE_FILE_EXTENSION = '.mdt';
  
  private agentDir: string;
  private agentFile: string;
  private agentFileFormat: 'json' | 'yaml' = 'yaml'; // Default to yaml now
  private rulesDir: string;
  private referencesDir: string;
  private isFileBased: boolean = false; // Track if initialized with file path

  constructor(agentPath: string, private logger: Logger) {
    // Support both file paths and directory paths (for backward compatibility during migration)
    const pathStat = fs.existsSync(agentPath) ? fs.statSync(agentPath) : null;
    
    if (pathStat?.isFile()) {
      // File path provided - validate extension
      const ext = path.extname(agentPath).toLowerCase();
      if (!['.yaml', '.yml', '.json'].includes(ext)) {
        throw new Error(`Agent file must have .yaml, .yml, or .json extension: ${agentPath}`);
      }
      this.agentFile = agentPath;
      this.agentDir = path.dirname(agentPath);
      this.agentFileFormat = ext === '.json' ? 'json' : 'yaml';
      this.isFileBased = true;
    } else {
      // Directory path provided (backward compatibility for migration)
      this.agentDir = agentPath;
      this.agentFile = this.detectAgentFileInDirectory();
      this.isFileBased = false;
    }
    
    // Keep these for migration purposes (loading from old structure)
    this.rulesDir = path.join(this.agentDir, 'rules');
    this.referencesDir = path.join(this.agentDir, 'refs');
    
    // Ensure directories exist
    if (!fs.existsSync(this.agentDir)) {
      fs.mkdirSync(this.agentDir, { recursive: true });
    }
  }

  /**
   * Detect which agent file format exists in directory (.json, .yaml, or .yml).
   * For migration: defaults to checking for tsagent.json first.
   */
  private detectAgentFileInDirectory(): string {
    const basePath = path.join(this.agentDir, FileBasedAgentStrategy.AGENT_FILE_BASE_NAME);
    
    // Check in priority order: .yaml, .yml, .json (yaml preferred for new, json for migration)
    const extensions = ['.yaml', '.yml', '.json'];
    for (const ext of extensions) {
      const candidateFile = basePath + ext;
      if (fs.existsSync(candidateFile)) {
        // Set format based on extension
        this.agentFileFormat = ext === '.json' ? 'json' : 'yaml';
        return candidateFile;
      }
    }
    
    // Default to .yaml if no file exists (new agent)
    this.agentFileFormat = 'yaml';
    return basePath + '.yaml';
  }

  getName(): string {
    // After loadConfig(), agentFile always points to the actual YAML file path
    // (either directly loaded or migrated from JSON)
    return this.agentFile;
  }

  static async agentExists(agentPath: string): Promise<boolean> {
    const normalizedPath = path.normalize(agentPath);
    
    // Check if it's a file path
    if (fs.existsSync(normalizedPath)) {
      const stat = fs.statSync(normalizedPath);
      if (stat.isFile()) {
        const ext = path.extname(normalizedPath).toLowerCase();
        return ['.yaml', '.yml', '.json'].includes(ext);
      }
    }
    
    // Check if it's a directory with agent files
    const basePath = path.join(normalizedPath, FileBasedAgentStrategy.AGENT_FILE_BASE_NAME);
    return fs.existsSync(basePath + '.json') ||
           fs.existsSync(basePath + '.yaml') ||
           fs.existsSync(basePath + '.yml');
  }

  async exists(): Promise<boolean> {
    // Re-detect if directory-based, otherwise check file directly
    if (!this.isFileBased) {
      this.agentFile = this.detectAgentFileInDirectory();
    }
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
    // First, detect which agent file format exists in source
    const sourceBasePath = path.join(normalizedSource, FileBasedAgentStrategy.AGENT_FILE_BASE_NAME);
    let sourceAgentFile: string | null = null;
    for (const ext of ['.json', '.yaml', '.yml']) {
      const candidate = sourceBasePath + ext;
      if (fs.existsSync(candidate)) {
        sourceAgentFile = candidate;
        break;
      }
    }
    
    const filesToCopy = [
      { source: sourceAgentFile, isFile: true }, // Agent config file (detected format)
      { source: path.join(normalizedSource, FileBasedAgentStrategy.SYSTEM_PROMPT_FILE_NAME), isFile: true },
      { source: path.join(normalizedSource, 'refs'), isFile: false },
      { source: path.join(normalizedSource, 'rules'), isFile: false }
    ];

    for (const item of filesToCopy) {
      if (!item.source || !fs.existsSync(item.source)) {
        continue;
      }
      
      const targetFile = path.join(normalizedTarget, path.basename(item.source));
      
      if (item.isFile) {
        await fs.promises.copyFile(item.source, targetFile);
        } else {
        await fs.promises.cp(item.source, targetFile, { recursive: true });
      }
    }
 
    // Create and load the new agent, then return it
    const strategy = new FileBasedAgentStrategy(normalizedTarget, logger);
    const clone = new AgentImpl(strategy, logger);
    await clone.load();

    return clone;
  }

  async loadConfig(): Promise<AgentConfig> {
    // Re-detect file if directory-based
    if (!this.isFileBased) {
      this.agentFile = this.detectAgentFileInDirectory();
    }
    
    if (!fs.existsSync(this.agentFile)) {
      throw new Error(`Agent file does not exist: ${this.agentFile}`);
    }
    
    // Check if we need to migrate from JSON to YAML
    if (this.agentFileFormat === 'json') {
      return await this.migrateJsonToYaml();
    }
    
    // Load from YAML
    return await this.loadYamlConfig();
  }

  /**
   * Load config from YAML file (with embedded content)
   */
  private async loadYamlConfig(): Promise<AgentConfig> {
    const content = fs.readFileSync(this.agentFile, 'utf-8');
    
    let data: any;
    try {
      data = yaml.parse(content);
    } catch (parseError: any) {
      throw new Error(`Failed to parse YAML agent config file: ${parseError.message}`);
    }
    
    // Validate and apply defaults using Zod schema
    try {
      return AgentConfigSchema.parse(data);
    } catch (error: any) {
      if (error?.issues) {
        // Zod validation error
        const errorMessages = error.issues.map((issue: any) => {
          const path = issue.path.join('.') || 'root';
          return `${path}: ${issue.message}`;
        });
        throw new Error(`Agent config validation failed:\n${errorMessages.join('\n')}`);
      }
      throw error;
    }
  }

  /**
   * Automatically migrate JSON agent to YAML format
   */
  private async migrateJsonToYaml(): Promise<AgentConfig> {
    this.logger.info(`Auto-migrating agent from JSON to YAML: ${this.agentFile}`);
    
    // Load JSON config
    const jsonContent = fs.readFileSync(this.agentFile, 'utf-8');
    let config: any;
    try {
      config = JSON.parse(jsonContent);
    } catch (parseError: any) {
      throw new Error(`Failed to parse JSON agent config file: ${parseError.message}`);
    }
    
    // Normalize settings: convert string numeric values to numbers (settings are now stored as numbers)
    // Integer settings should be converted to integers, float settings to floats
    if (config.settings && typeof config.settings === 'object') {
      const integerSettingsKeys = [
        'maxChatTurns',
        'maxOutputTokens',
        'contextTopK',
        'contextTopN'
      ];
      
      const floatSettingsKeys = [
        'temperature',
        'topP',
        'contextIncludeScore'
      ];
      
      // Convert integer settings
      for (const key of integerSettingsKeys) {
        if (config.settings[key] !== undefined) {
          if (typeof config.settings[key] === 'string') {
            const intValue = parseInt(config.settings[key], 10);
            if (!isNaN(intValue)) {
              this.logger.debug(`Converting setting ${key} from string "${config.settings[key]}" to integer ${intValue}`);
              config.settings[key] = intValue;
            }
          } else if (typeof config.settings[key] === 'number') {
            // Ensure it's an integer (round if needed)
            const intValue = Math.round(config.settings[key]);
            if (intValue !== config.settings[key]) {
              this.logger.debug(`Converting setting ${key} from float ${config.settings[key]} to integer ${intValue}`);
              config.settings[key] = intValue;
            }
          }
        }
      }
      
      // Convert float settings
      for (const key of floatSettingsKeys) {
        if (config.settings[key] !== undefined) {
          if (typeof config.settings[key] === 'string') {
            const floatValue = parseFloat(config.settings[key]);
            if (!isNaN(floatValue)) {
              this.logger.debug(`Converting setting ${key} from string "${config.settings[key]}" to float ${floatValue}`);
              config.settings[key] = floatValue;
            }
          }
          // If it's already a number, leave it as is
        }
      }
    }
    
    // Load prompt.md if exists
    const promptFile = path.join(this.agentDir, FileBasedAgentStrategy.SYSTEM_PROMPT_FILE_NAME);
    let systemPrompt = '';
    if (fs.existsSync(promptFile)) {
      systemPrompt = fs.readFileSync(promptFile, 'utf-8');
    }
    
    // Load rules from rules/*.mdt
    const rules = await this.loadRulesFromDirectory();
    
    // Load references from refs/*.mdt
    const references = await this.loadReferencesFromDirectory();
    
    // Build consolidated config
    const yamlConfig: AgentConfig = {
      ...config,
      systemPrompt,
      rules,
      references
    };
    
    // Validate
    try {
      const validatedConfig = AgentConfigSchema.parse(yamlConfig);
      
      // Save as YAML
      const yamlFile = path.join(this.agentDir, 'tsagent.yaml');
      const yamlContent = yaml.stringify(validatedConfig, {
        indent: 2,
        lineWidth: 0, // 0 means no line wrapping (yaml library uses 0, not -1)
        simpleKeys: false,
        doubleQuotedAsJSON: false
      });
      
      fs.writeFileSync(yamlFile, yamlContent, 'utf-8');
      
      this.logger.info(`Successfully migrated agent to YAML: ${yamlFile}`);
      
      // Update internal state to use YAML
      // After migration, switch to file-based identification
      this.agentFile = yamlFile;
      this.agentFileFormat = 'yaml';
      this.isFileBased = true; // Now using file path directly
      
      return validatedConfig;
    } catch (error: any) {
      this.logger.error(`Migration validation failed, falling back to JSON:`, error);
      // Fall back to JSON loading
      return AgentConfigSchema.parse(config);
    }
  }

  /**
   * Load rules from directory (for migration purposes)
   */
  private async loadRulesFromDirectory(): Promise<Rule[]> {
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
          const metadataRaw = yaml.parse(parts[1]);
          const text = parts.slice(2).join('---\n').trim();
          
          // Validate metadata using Zod schema (partial for loading from file)
          const metadata = RuleSchema.partial().parse(metadataRaw || {});
          
          // Build complete rule with defaults
          const rule: Rule = RuleSchema.parse({
            name: metadata.name || path.basename(file, FileBasedAgentStrategy.RULE_FILE_EXTENSION),
            description: metadata.description || '',
            priorityLevel: metadata.priorityLevel || 500,
            text: text,
            include: metadata.include || 'manual'
          });
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

  /**
   * Load references from directory (for migration purposes)
   */
  private async loadReferencesFromDirectory(): Promise<Reference[]> {
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
          const metadataRaw = yaml.parse(parts[1]);
          const text = parts.slice(2).join('---\n').trim();
          
          // Validate metadata using Zod schema (partial for loading from file)
          const metadata = ReferenceSchema.partial().parse(metadataRaw || {});
          
          // Build complete reference with defaults
          const reference: Reference = ReferenceSchema.parse({
            name: metadata.name || path.basename(file, FileBasedAgentStrategy.REFERENCE_FILE_EXTENSION),
            description: metadata.description || '',
            priorityLevel: metadata.priorityLevel || 500,
            text: text,
            include: metadata.include || 'manual'
          });
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

  async saveConfig(config: AgentConfig): Promise<void> {
    // Always save as YAML now (no more JSON)
    this.agentFileFormat = 'yaml';
    
    // If file was .json, update to .yaml
    if (this.agentFile.endsWith('.json')) {
      this.agentFile = this.agentFile.replace(/\.json$/, '.yaml');
    } else if (!this.agentFile.endsWith('.yaml') && !this.agentFile.endsWith('.yml')) {
      // If no extension, add .yaml
      this.agentFile = this.agentFile + '.yaml';
    }
    
    // Validate before saving (includes embedded content)
    const validatedConfig = AgentConfigSchema.parse(config);
    
    // Always save as YAML
    // Use Document API for fine-grained formatting control (flow style for embedding arrays)
    const doc = yaml.parseDocument(yaml.stringify(validatedConfig));
    
    // Set flow style for embedding arrays (nested at depth 5: rules/references -> embeddings -> embedding)
    // We'll use a custom function to traverse and set flow style on embedding arrays
    this.setEmbeddingArraysToFlowStyle(doc);
    
    const content = doc.toString({
      indent: 2,
      lineWidth: 0,
      simpleKeys: false,
      doubleQuotedAsJSON: false
    });
    
    fs.writeFileSync(this.agentFile, content, 'utf-8');
    this.logger.info(`Agent config saved to: ${this.agentFile}`);
  }

  /**
   * Traverse the YAML document and set flow style for embedding arrays
   * Handles both rule/reference embeddings and tool embeddings in MCP server configs
   * Also adds comments to the embeddings lines
   */
  private setEmbeddingArraysToFlowStyle(doc: yaml.Document): void {
    const visit = (node: yaml.Node | null): void => {
      if (!node) return;
      
      if (node instanceof yaml.YAMLMap) {
        // Check for rule/reference embeddings (direct 'embeddings' key)
        const embeddingsNode = node.get('embeddings', true);
        if (embeddingsNode instanceof yaml.YAMLSeq) {
          // Check if it's an array of number arrays (embeddings: number[][])
          const firstItem = embeddingsNode.items[0];
          if (firstItem instanceof yaml.YAMLSeq) {
            const firstEmbeddingItem = firstItem.items[0];
            if (firstEmbeddingItem instanceof yaml.Scalar && typeof firstEmbeddingItem.value === 'number') {
              // This is embeddings: [[...], [...]]
              // Add comment to the embeddings key
              for (const item of node.items) {
                if (item.key instanceof yaml.Scalar && item.key.value === 'embeddings') {
                  item.key.comment = ' Delete embeddings when editing item, they will be automatically regenerated';
                  break;
                }
              }
              
              // Keep outer array in block style, set flow style on each inner array (each embedding)
              for (const item of embeddingsNode.items) {
                if (item instanceof yaml.YAMLSeq) {
                  item.flow = true;  // Each embedding array on one line
                }
              }
            }
          }
        }

        // Check for tool embeddings in MCP server configs (toolEmbeddings.tools)
        const toolEmbeddingsNode = node.get('toolEmbeddings', true);
        if (toolEmbeddingsNode instanceof yaml.YAMLMap) {
          const toolsNode = toolEmbeddingsNode.get('tools', true);
          if (toolsNode instanceof yaml.YAMLMap) {
            // Process each tool's embedding data (no comment for tool embeddings)
            for (const toolItem of toolsNode.items) {
              if (toolItem.value instanceof yaml.YAMLMap) {
                const toolEmbeddingsNode = toolItem.value.get('embeddings', true);
                if (toolEmbeddingsNode instanceof yaml.YAMLSeq) {
                  // Check if it's an array of number arrays
                  const firstItem = toolEmbeddingsNode.items[0];
                  if (firstItem instanceof yaml.YAMLSeq) {
                    const firstEmbeddingItem = firstItem.items[0];
                    if (firstEmbeddingItem instanceof yaml.Scalar && typeof firstEmbeddingItem.value === 'number') {
                      // Set flow style on each inner array (each embedding vector)
                      for (const item of toolEmbeddingsNode.items) {
                        if (item instanceof yaml.YAMLSeq) {
                          item.flow = true;  // Each embedding array on one line
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // Recursively visit children
      if (node instanceof yaml.YAMLMap) {
        for (const item of node.items) {
          if (item.value) visit(item.value as yaml.Node);
        }
      } else if (node instanceof yaml.YAMLSeq) {
        for (const item of node.items) {
          if (item) visit(item as yaml.Node);
        }
      }
    };
    
    if (doc.contents) {
      visit(doc.contents);
    }
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

}
