import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { EventEmitter } from 'events';
import { ReferencesManager as IReferencesManager } from './types';
import { Reference } from '../types/references';
import { Logger } from '../types/common';

export class ReferencesManager extends EventEmitter implements IReferencesManager {
  private references: Reference[] = [];
  private referencesDir: string;
  private static readonly REFERENCE_FILE_EXTENSION = '.mdt';

  constructor(agentDir: string, private logger: Logger) {
    super();
    this.referencesDir = path.join(agentDir, 'refs');
    if (!fs.existsSync(this.referencesDir)) {
      fs.mkdirSync(this.referencesDir, { recursive: true });
    }
    this.loadReferences();
  }

  getAllReferences(): Reference[] {
    return [...this.references];
  }

  getReference(name: string): Reference | null {
    return this.references.find(reference => reference.name === name) || null;
  }

  addReference(reference: Reference): void {
    if (!this.validateReferenceName(reference.name)) {
      throw new Error('Reference name can only contain letters, numbers, underscores, and dashes');
    }

    const fileName = `${reference.name}${ReferencesManager.REFERENCE_FILE_EXTENSION}`;
    const filePath = path.join(this.referencesDir, fileName);
    
    const metadata = {
      name: reference.name,
      description: reference.description,
      priorityLevel: reference.priorityLevel,
      enabled: reference.enabled,
      include: reference.include
    };

    const content = `---\n${yaml.dump(metadata)}---\n${reference.text}`;
    fs.writeFileSync(filePath, content, 'utf-8');

    // Update the references list
    this.references.push(reference);
    this.sortReferences();
    
    // Emit change event
    this.emit('referencesChanged');
  }

  deleteReference(name: string): boolean {
    const reference = this.getReference(name);
    if (!reference) return false;

    const fileName = `${name}${ReferencesManager.REFERENCE_FILE_EXTENSION}`;
    const filePath = path.join(this.referencesDir, fileName);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.references = this.references.filter(r => r.name !== name);
      
      // Emit change event
      this.emit('referencesChanged');
      return true;
    }
    
    return false;
  }

  private loadReferences(): void {
    this.references = [];
    if (!fs.existsSync(this.referencesDir)) return;

    const files = fs.readdirSync(this.referencesDir).filter(file => file.endsWith(ReferencesManager.REFERENCE_FILE_EXTENSION));
    
    for (const file of files) {
      const filePath = path.join(this.referencesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      try {
        const parts = content.split('---\n');
        if (parts.length >= 3) {
          const metadata = yaml.load(parts[1]) as Partial<Reference>;
          const text = parts.slice(2).join('---\n').trim();
          
          const reference: Reference = {
            name: metadata.name || path.basename(file, ReferencesManager.REFERENCE_FILE_EXTENSION),
            description: metadata.description || '',
            priorityLevel: metadata.priorityLevel || 500,
            enabled: metadata.enabled ?? true,
            text: text,
            include: metadata.include || 'manual'
          };
          this.references.push(reference);
        }
      } catch (error) {
        this.logger.error(`Error loading reference from ${file}:`, error);
      }
    }
    this.sortReferences();
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
