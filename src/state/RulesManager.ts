import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import log from 'electron-log';
import { Rule } from '../types/Rule';

export class RulesManager {
  private rules: Rule[] = [];
  private rulesDir: string;

  constructor(configDir: string) {
    this.rulesDir = path.join(configDir, 'rules');
    if (!fs.existsSync(this.rulesDir)) {
      fs.mkdirSync(this.rulesDir, { recursive: true });
    }
    this.loadRules();
  }

  private loadRules() {
    this.rules = [];
    const files = fs.readdirSync(this.rulesDir).filter(file => file.endsWith('.mdw'));
    
    for (const file of files) {
      const filePath = path.join(this.rulesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      try {
        const parts = content.split('---\n');
        if (parts.length >= 3) {
          const metadata = yaml.load(parts[1]) as Partial<Rule>;
          const text = parts.slice(2).join('---\n').trim();
          
          const rule: Rule = {
            name: metadata.name || path.basename(file, '.mdw'),
            description: metadata.description || '',
            priorityLevel: metadata.priorityLevel || 500,
            enabled: metadata.enabled ?? true,
            text: text
          };
          this.rules.push(rule);
        }
      } catch (error) {
        log.error(`Error loading rule from ${file}:`, error);
      }
    }
  }

  public getRules(): Rule[] {
    return [...this.rules];
  }

  public saveRule(rule: Rule) {
    const fileName = `${rule.name}.mdw`;
    const filePath = path.join(this.rulesDir, fileName);
    
    const metadata = {
      name: rule.name,
      description: rule.description,
      priorityLevel: rule.priorityLevel,
      enabled: rule.enabled
    };

    const content = `---\n${yaml.dump(metadata)}---\n${rule.text}`;
    fs.writeFileSync(filePath, content, 'utf-8');
    
    this.loadRules();
  }

  public getRule(name: string) {
    return this.rules.find(r => r.name === name);
  }

  public deleteRule(name: string) {
    const filePath = path.join(this.rulesDir, `${name}.mdw`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.loadRules();
    }
  }
} 