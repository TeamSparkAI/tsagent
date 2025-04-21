import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import log from 'electron-log';
import { Rule } from '../../shared/Rule';
import { EventEmitter } from 'events';

export class RulesManager extends EventEmitter {
  private rules: Rule[] = [];
  private rulesDir: string;
  private static readonly RULE_FILE_EXTENSION = '.mdt';

  constructor(configDir: string) {
    super();
    this.rulesDir = path.join(configDir, 'rules');
    log.info(`[RULES MANAGER] Initializing with rules directory: ${this.rulesDir}`);
    if (!fs.existsSync(this.rulesDir)) {
      log.info(`[RULES MANAGER] Rules directory does not exist, creating it: ${this.rulesDir}`);
      fs.mkdirSync(this.rulesDir, { recursive: true });
    }
    this.loadRules();
  }

  private loadRules() {
    this.rules = [];
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
        } else {
        }
      } catch (error) {
        log.error(`[RULES MANAGER] Error loading rule from ${file}:`, error);
      }
    }
    this.sortRules();
  }

  private sortRules() {
    this.rules.sort((a, b) => {
      // First sort by priority (lower priority first)
      if (a.priorityLevel !== b.priorityLevel) {
        return a.priorityLevel - b.priorityLevel;
      }
      // Then sort by name
      return a.name.localeCompare(b.name);
    });
  }

  public getRules(): Rule[] {
    return [...this.rules];
  }

  private validateRuleName(name: string): boolean {
    // Only allow alphanumeric chars, underscores, and dashes
    return /^[a-zA-Z0-9_-]+$/.test(name);
  }

  private hasRuleWithName(name: string, excludeName?: string): boolean {
    return this.rules.some(r => r.name === name && (!excludeName || r.name !== excludeName));
  }

  public saveRule(rule: Rule) {
    if (!this.validateRuleName(rule.name)) {
      throw new Error('Rule name can only contain letters, numbers, underscores, and dashes');
    }

    if (this.hasRuleWithName(rule.name, rule.name)) {
      throw new Error('A rule with this name already exists');
    }

    // If this is an update to an existing rule, delete the old file first
    const existingRule = this.getRule(rule.name);
    if (existingRule && existingRule.name !== rule.name) {
      this.deleteRule(existingRule.name);
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
    
    this.loadRules();
    this.emit('rulesChanged');
  }

  public getRule(name: string) {
    return this.rules.find(r => r.name === name);
  }

  public deleteRule(name: string) {
    const filePath = path.join(this.rulesDir, `${name}${RulesManager.RULE_FILE_EXTENSION}`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.loadRules();
      this.emit('rulesChanged');
    }
  }
} 