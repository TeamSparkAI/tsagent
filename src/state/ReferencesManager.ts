import { Reference } from '../types/Reference';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import log from 'electron-log';
import { EventEmitter } from 'events';

export class ReferencesManager extends EventEmitter {
    private references: Reference[] = [];
    private referencesDir: string;

    constructor(configDir: string) {
        super();
        this.referencesDir = path.join(configDir, 'refs');
        if (!fs.existsSync(this.referencesDir)) {
            fs.mkdirSync(this.referencesDir, { recursive: true });
        }
        this.loadReferences();
    }

    private loadReferences() {
        this.references = [];
        const files = fs.readdirSync(this.referencesDir).filter(file => file.endsWith('.mdw'));
        
        for (const file of files) {
            const filePath = path.join(this.referencesDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            
            try {
                const parts = content.split('---\n');
                if (parts.length >= 3) {
                    const metadata = yaml.load(parts[1]) as Partial<Reference>;
                    const text = parts.slice(2).join('---\n').trim();
                    
                    const reference: Reference = {
                        name: metadata.name || path.basename(file, '.mdw'),
                        description: metadata.description || '',
                        priorityLevel: metadata.priorityLevel || 500,
                        enabled: metadata.enabled ?? true,
                        text: text
                    };
                    this.references.push(reference);
                }
            } catch (error) {
                log.error(`Error loading reference from ${file}:`, error);
            }
        }
        
        this.sortReferences();
    }

    private sortReferences() {
        this.references.sort((a, b) => {
            // First sort by priority (lower priority first)
            if (a.priorityLevel !== b.priorityLevel) {
                return a.priorityLevel - b.priorityLevel;
            }
            // Then sort by name
            return a.name.localeCompare(b.name);
        });
    }

    public getReferences(): Reference[] {
        return [...this.references];
    }

    private validateReferenceName(name: string): boolean {
        // Only allow alphanumeric chars, underscores, and dashes
        return /^[a-zA-Z0-9_-]+$/.test(name);
    }

    private hasReferenceWithName(name: string, excludeName?: string): boolean {
        return this.references.some(r => r.name === name && (!excludeName || r.name !== excludeName));
    }

    public saveReference(reference: Reference) {
        if (!this.validateReferenceName(reference.name)) {
            throw new Error('Reference name can only contain letters, numbers, underscores, and dashes');
        }

        if (this.hasReferenceWithName(reference.name, reference.name)) {
            throw new Error('A reference with this name already exists');
        }

        // If this is an update to an existing reference, delete the old file first
        const existingReference = this.getReference(reference.name);
        if (existingReference && existingReference.name !== reference.name) {
            this.deleteReference(existingReference.name);
        }

        const fileName = `${reference.name}.mdw`;
        const filePath = path.join(this.referencesDir, fileName);
        
        const metadata = {
            name: reference.name,
            description: reference.description,
            priorityLevel: reference.priorityLevel,
            enabled: reference.enabled
        };

        const content = `---\n${yaml.dump(metadata)}---\n${reference.text}`;
        fs.writeFileSync(filePath, content, 'utf-8');
        
        this.loadReferences();
        this.sortReferences();
        this.emit('referencesChanged');
    }

    public getReference(name: string) {
        return this.references.find(r => r.name === name);
    }

    public deleteReference(name: string) {
        const filePath = path.join(this.referencesDir, `${name}.mdw`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            this.loadReferences();
            this.emit('referencesChanged');
        }
    }
} 