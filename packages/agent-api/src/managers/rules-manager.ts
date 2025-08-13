import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { EventEmitter } from 'events';
import { RulesManager as IRulesManager } from './types';
import { Rule, Logger } from '../types';

export class RulesManager extends EventEmitter implements IRulesManager {
  private rules: Rule[] = [];
  private rulesDir: string;
  private static readonly RULE_FILE_EXTENSION = '.mdt';

  constructor(workspaceDir: string, private logger: Logger) {
    super();
    this.rulesDir = path.join(workspaceDir, 'rules');
    this.logger.info(`Initializing RulesManager for directory: ${this.rulesDir}`);
    
    if (!fs.existsSync(this.rulesDir)) {
      this.logger.info(`Creating rules directory: ${this.rulesDir}`);
      fs.mkdirSync(this.rulesDir, { recursive: true });
    }
    this.loadRules();
  }

  getAll(): Rule[] {
    return [...this.rules];
  }

  get(name: string): Rule | null {
    return this.rules.find(rule => rule.name === name) || null;
  }

  save(rule: Rule): void {
    this.logger.info(`Saving rule: ${rule.name}`);
    
    if (!this.validateRuleName(rule.name)) {
      this.logger.error(`Invalid rule name: ${rule.name}`);
      throw new Error('Rule name can only contain letters, numbers, underscores, and dashes');
    }

    if (this.hasRuleWithName(rule.name, rule.name)) {
      this.logger.warn(`Rule already exists: ${rule.name}`);
      throw new Error('A rule with this name already exists');
    }

    // If this is an update to an existing rule, delete the old file first
    const existingRule = this.get(rule.name);
    if (existingRule && existingRule.name !== rule.name) {
      this.logger.info(`Updating existing rule: ${existingRule.name} -> ${rule.name}`);
      this.delete(existingRule.name);
    }

    const fileName = `${rule.name}${RulesManager.RULE_FILE_EXTENSION}`;
    const filePath = path.join(this.rulesDir, fileName);
    
    const metadata = {
      name: rule.name,
      description: rule.description,
      priorityLevel: rule.priorityLevel,
      enabled: rule.enabled,
      include: rule.include
    };

    const content = `---\n${yaml.dump(metadata)}---\n${rule.text}`;
    fs.writeFileSync(filePath, content, 'utf-8');
    this.logger.info(`Rule saved to: ${filePath}`);

    // Reload rules to update the in-memory list
    this.loadRules();
    
    // Emit change event
    this.emit('rulesChanged');
  }

  delete(name: string): boolean {
    const rule = this.get(name);
    if (!rule) return false;

    const fileName = `${name}${RulesManager.RULE_FILE_EXTENSION}`;
    const filePath = path.join(this.rulesDir, fileName);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.loadRules(); // Reload to update in-memory list
      
      // Emit change event
      this.emit('rulesChanged');
      return true;
    }
    
    return false;
  }

  private loadRules(): void {
    this.rules = [];
    if (!fs.existsSync(this.rulesDir)) return;

    const files = fs.readdirSync(this.rulesDir).filter(file => file.endsWith(RulesManager.RULE_FILE_EXTENSION));
    
    for (const file of files) {
      const filePath = path.join(this.rulesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      try {
        const parts = content.split('---\n');
        if (parts.length >= 3) {
          const metadata = yaml.load(parts[1]) as Partial<Rule>;
          const text = parts.slice(2).join('---\n').trim();
          
          const rule: Rule = {
            name: metadata.name || path.basename(file, RulesManager.RULE_FILE_EXTENSION),
            description: metadata.description || '',
            priorityLevel: metadata.priorityLevel || 500,
            enabled: metadata.enabled ?? true,
            text: text,
            include: metadata.include || 'manual'
          };
          this.rules.push(rule);
        }
      } catch (error) {
        console.error(`Error loading rule from ${file}:`, error);
      }
    }
    this.sortRules();
  }

  private sortRules(): void {
    this.rules.sort((a, b) => {
      if (a.priorityLevel !== b.priorityLevel) {
        return a.priorityLevel - b.priorityLevel;
      }
      return a.name.localeCompare(b.name);
    });
  }

  private validateRuleName(name: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(name);
  }

  private hasRuleWithName(name: string, excludeName?: string): boolean {
    return this.rules.some(r => r.name === name && (!excludeName || r.name !== excludeName));
  }
}

