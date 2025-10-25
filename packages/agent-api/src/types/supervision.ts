import { ChatMessage, MessageUpdate, ChatSession } from './chat.js';
import { Agent } from './agent.js';

// Supervision permission levels
export enum SupervisionPermission {
  READ_ONLY = 'read_only',
  MODIFY_CONTEXT = 'modify_context',
  MODIFY_MESSAGES = 'modify_messages',
  FULL_CONTROL = 'full_control'
}



// Supervisor interface
export interface Supervisor {
  readonly id: string;
  readonly name: string;
  readonly permissions: SupervisionPermission[];
  
  // Core supervision methods
  processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult>;
  processResponse(session: ChatSession, response: MessageUpdate): Promise<ResponseSupervisionResult>;
  
  // Lifecycle
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
}


// Base supervision result - common elements
export interface BaseSupervisionResult {
  action: 'allow' | 'modify' | 'block';
  reasons?: string[];
  metadata?: Record<string, any>;
}

// Request supervision result - what clients receive for requests
export interface RequestSupervisionResult extends BaseSupervisionResult {
  finalMessage?: ChatMessage;
}

// Response supervision result - what clients receive for responses  
export interface ResponseSupervisionResult extends BaseSupervisionResult {
  finalResponse?: MessageUpdate;
}


// Supervision response
export interface SupervisionResponse {
  responses: ChatMessage[];
  selectedResponse?: number;
  metadata?: Record<string, any>;
}

// Supervision manager interface
export interface SupervisionManager {
  // Supervisor management
  addSupervisor(supervisor: Supervisor): Promise<void>;
  removeSupervisor(supervisorId: string): Promise<void>;
  getSupervisor(supervisorId: string): Supervisor | null;
  getAllSupervisors(): Supervisor[];
  
  // Supervision hooks
  registerSupervisor(sessionId: string, supervisor: Supervisor): Promise<void>;
  unregisterSupervisor(sessionId: string, supervisorId: string): Promise<void>;
  getSessionSupervisors(sessionId: string): Supervisor[];
  
  // Message processing
  processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult>;
  processResponse(session: ChatSession, response: MessageUpdate): Promise<ResponseSupervisionResult>;
}

/**
 * Configuration for a supervisor
 */
export interface SupervisorConfig {
  type: 'agent' | 'guardian' | 'architect' | 'collection';
  id: string;
  name: string;
  config: any; // Type-specific config passed directly to constructor
}

// Missing types that supervisors need
export interface ArchitectAnalysis {
  conversationPatterns: string[];
  suggestedRules: string[];
  suggestedReferences: string[];
  effectivenessScore: number;
  recommendations: string[];
}

export interface TestResult {
  success: boolean;
  originalResponse: ChatMessage;
  modifiedResponse: ChatMessage;
  improvementScore: number;
  error?: string;
}

export interface CollectionStats {
  totalMessages: number;
  totalSessions: number;
  averageSessionLength: number;
  mostActiveHours: number[];
  messageTypes: Record<string, number>;
}

export interface GuardianDecision {
  allowed: boolean;
  reason?: string;
  confidence: number;
  modifiedContent?: string;
}

