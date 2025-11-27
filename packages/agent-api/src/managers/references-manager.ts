import { EventEmitter } from 'events';
import { Reference, ReferenceSchema } from '../types/references.js';
import { Logger } from '../types/common.js';
import { AgentConfig } from '../types/agent.js';

/**
 * Interface for updating agent config and saving it
 */
export interface ConfigUpdater {
  getConfig(): AgentConfig | null;
  updateConfig(updater: (config: AgentConfig) => void): Promise<void>;
}

export class ReferencesManager extends EventEmitter {
  constructor(
    private logger: Logger,
    private configUpdater: ConfigUpdater | null = null
  ) {
    super();
  }

  private getReferences(): Reference[] {
    const config = this.configUpdater?.getConfig();
    if (!config) return [];
    
    // Return sorted copy (don't mutate source)
    const references = [...(config.references || [])];
    this.sortReferences(references);
    return references;
  }

  getAllReferences(): Reference[] {
    return this.getReferences();
  }

  getReference(name: string): Reference | null {
    return this.getReferences().find(reference => reference.name === name) || null;
  }

  async addReference(reference: Reference): Promise<void> {
    if (!this.configUpdater) {
      throw new Error('Cannot add reference: no config updater available');
    }

    // Validate reference using Zod schema
    const validatedReference = ReferenceSchema.parse(reference);
    
    if (!this.validateReferenceName(validatedReference.name)) {
      throw new Error('Reference name can only contain letters, numbers, underscores, and dashes');
    }

    await this.configUpdater.updateConfig((config) => {
      if (!config.references) {
        config.references = [];
      }
      
      const existingIndex = config.references.findIndex(r => r.name === validatedReference.name);
      if (existingIndex >= 0) {
        // Clear embeddings when updating existing reference (cache invalidation)
        validatedReference.embeddings = undefined;
        config.references[existingIndex] = validatedReference;
      } else {
        // New reference - embeddings will be generated on demand via JIT indexing
        config.references.push(validatedReference);
      }
      
      // Sort references by priority
      this.sortReferences(config.references);
    });
    
    // Emit change event
    this.emit('referencesChanged');
    this.logger.info(`Reference saved to agent config: ${validatedReference.name}`);
  }

  async deleteReference(name: string): Promise<boolean> {
    if (!this.configUpdater) {
      throw new Error('Cannot delete reference: no config updater available');
    }

    const config = this.configUpdater.getConfig();
    if (!config?.references) return false;

    const index = config.references.findIndex(r => r.name === name);
    if (index < 0) return false;

    await this.configUpdater.updateConfig((config) => {
      if (config.references) {
        config.references.splice(index, 1);
      }
    });
    
    // Emit change event
    this.emit('referencesChanged');
    this.logger.info(`Reference deleted from agent config: ${name}`);
    return true;
  }

  private sortReferences(references: Reference[]): void {
    references.sort((a, b) => {
      if (a.priorityLevel !== b.priorityLevel) {
        return a.priorityLevel - b.priorityLevel;
      }
      return a.name.localeCompare(b.name);
    });
  }

  private validateReferenceName(name: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(name);
  }
}
