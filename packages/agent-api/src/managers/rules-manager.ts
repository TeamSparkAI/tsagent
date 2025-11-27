import { EventEmitter } from 'events';
import { Rule, RuleSchema } from '../types/rules.js';
import { Logger } from '../types/common.js';
import { AgentConfig } from '../types/agent.js';

/**
 * Interface for updating agent config and saving it
 */
export interface ConfigUpdater {
  getConfig(): AgentConfig | null;
  updateConfig(updater: (config: AgentConfig) => void): Promise<void>;
}

export class RulesManager extends EventEmitter {
  constructor(
    private logger: Logger,
    private configUpdater: ConfigUpdater | null = null
  ) {
    super();
  }

  private getRules(): Rule[] {
    const config = this.configUpdater?.getConfig();
    if (!config) return [];
    
    // Return sorted copy (don't mutate source)
    const rules = [...(config.rules || [])];
    this.sortRules(rules);
    return rules;
  }

  getAllRules(): Rule[] {
    return this.getRules();
  }

  getRule(name: string): Rule | null {
    return this.getRules().find(rule => rule.name === name) || null;
  }

  async addRule(rule: Rule): Promise<void> {
    if (!this.configUpdater) {
      throw new Error('Cannot add rule: no config updater available');
    }

    // Validate rule using Zod schema
    const validatedRule = RuleSchema.parse(rule);
    
    if (!this.validateRuleName(validatedRule.name)) {
      throw new Error('Rule name can only contain letters, numbers, underscores, and dashes');
    }

    await this.configUpdater.updateConfig((config) => {
      if (!config.rules) {
        config.rules = [];
      }
      
      const existingIndex = config.rules.findIndex(r => r.name === validatedRule.name);
      if (existingIndex >= 0) {
        // Clear embeddings when updating existing rule (cache invalidation)
        validatedRule.embeddings = undefined;
        config.rules[existingIndex] = validatedRule;
      } else {
        // New rule - embeddings will be generated on demand via JIT indexing
        config.rules.push(validatedRule);
      }
      
      // Sort rules by priority
      this.sortRules(config.rules);
    });
    
    // Emit change event
    this.emit('rulesChanged');
    this.logger.info(`Rule saved to agent config: ${validatedRule.name}`);
  }

  async deleteRule(name: string): Promise<boolean> {
    if (!this.configUpdater) {
      throw new Error('Cannot delete rule: no config updater available');
    }

    const config = this.configUpdater.getConfig();
    if (!config?.rules) return false;

    const index = config.rules.findIndex(r => r.name === name);
    if (index < 0) return false;

    await this.configUpdater.updateConfig((config) => {
      if (config.rules) {
        config.rules.splice(index, 1);
      }
    });
    
    // Emit change event
    this.emit('rulesChanged');
    this.logger.info(`Rule deleted from agent config: ${name}`);
    return true;
  }

  private sortRules(rules: Rule[]): void {
    rules.sort((a, b) => {
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
