export interface Rule {
    name: string;
    description: string;
    priorityLevel: number;
    enabled: boolean;
    text: string;
    include: 'always' | 'manual' | 'agent';
} 