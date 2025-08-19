import { EventEmitter } from 'events';
import { Reference } from '../types/references';
import { Logger } from '../types/common';
import { AgentStrategy } from '../core/agent-strategy';

export class ReferencesManager extends EventEmitter {
  private references: Reference[] = [];

  constructor(private logger: Logger) {
    super();
  }

  async loadReferences(strategy: AgentStrategy | null): Promise<void> {
    this.references = [];
    if (strategy) {
      this.references = await strategy.loadReferences();
    }
  }

  async deleteReferences(strategy: AgentStrategy | null): Promise<void> {
    if (strategy) {
      await strategy.deleteReferences();
    }
  }

  getAllReferences(): Reference[] {
    return [...this.references];
  }

  getReference(name: string): Reference | null {
    return this.references.find(reference => reference.name === name) || null;
  }

  async addReference(strategy: AgentStrategy | null, reference: Reference): Promise<void> {
    if (strategy) {
      await strategy.addReference(reference);
    }

    // Update the references list
    this.references.push(reference);
    this.sortReferences();
    
    // Emit change event
    this.emit('referencesChanged');
  }

  async deleteReference(strategy: AgentStrategy | null, name: string): Promise<boolean> {
    const reference = this.getReference(name);
    if (!reference) return false;

    if (strategy) {
      await strategy.deleteReference(name);
    }

    // Update the references list
    this.references = this.references.filter(r => r.name !== name);
    this.sortReferences();
    
    // Emit change event
    this.emit('referencesChanged');
    return true;
  }

  private sortReferences(): void {
    this.references.sort((a, b) => {
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
