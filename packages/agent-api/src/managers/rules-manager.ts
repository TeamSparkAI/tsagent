import { EventEmitter } from 'events';
import { Rule } from '../types/rules.js';
import { Logger } from '../types/common.js';
import { AgentStrategy } from '../core/agent-strategy.js';

export class RulesManager extends EventEmitter {
  private rules: Rule[] = [];

  constructor(private logger: Logger) {
    super();
  }

  async loadRules(strategy: AgentStrategy | null): Promise<void> {
    this.rules = [];
    if (strategy) {
      this.rules = await strategy.loadRules();
    }
  }

  async deleteRules(strategy: AgentStrategy | null  ): Promise<void> {
    if (strategy) {
      await strategy.deleteRules();
    }
  }

  getAllRules(): Rule[] {
    return [...this.rules];
  }

  getRule(name: string): Rule | null {
    return this.rules.find(rule => rule.name === name) || null;
  }

  async addRule(strategy: AgentStrategy | null, rule: Rule): Promise<void> {
    if (strategy) {
      await strategy.addRule(rule);
    }

    // Update the rules list - replace existing rule if it exists, otherwise add new one
    const existingIndex = this.rules.findIndex(r => r.name === rule.name);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push(rule);
    }
    this.sortRules();
    
    // Emit change event
    this.emit('rulesChanged');
  }

  async deleteRule(strategy: AgentStrategy | null, name: string): Promise<boolean> {
    const rule = this.getRule(name);
    if (!rule) return false;

    if (strategy) {
      await strategy.deleteRule(name);
    }

    // Update the rules list
    this.rules = this.rules.filter(r => r.name !== name);
    this.sortRules();
      
    // Emit change event
    this.emit('rulesChanged');
    return true;
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
}

