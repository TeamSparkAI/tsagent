export interface Reference {
    name: string;
    description: string;
    priorityLevel: number;
    enabled: boolean;
    text: string;
    include: 'always' | 'manual' | 'agent';
} 