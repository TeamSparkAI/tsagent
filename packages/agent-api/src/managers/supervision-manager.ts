import { EventEmitter } from 'events';
import { 
  Supervisor, 
  SupervisionManager, 
  RequestSupervisionResult,
  ResponseSupervisionResult
} from '../types/supervision.js';
import { ChatMessage, MessageUpdate, ChatSession } from '../types/chat.js';
import { Agent } from '../types/agent.js';
import { Logger } from '../types/common.js';

export class SupervisionManagerImpl extends EventEmitter implements SupervisionManager {
  private supervisors: Map<string, Supervisor> = new Map();
  private sessionSupervisors: Map<string, Set<string>> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    super();
    this.logger = logger;
  }

  async addSupervisor(supervisor: Supervisor): Promise<void> {
    this.supervisors.set(supervisor.id, supervisor);
    await supervisor.initialize();
    this.logger.info(`Added supervisor: ${supervisor.name} (${supervisor.id})`);
  }

  async removeSupervisor(supervisorId: string): Promise<void> {
    const supervisor = this.supervisors.get(supervisorId);
    if (supervisor) {
      await supervisor.cleanup();
      this.supervisors.delete(supervisorId);
      
      // Remove from all sessions
      for (const [sessionId, supervisorIds] of this.sessionSupervisors.entries()) {
        supervisorIds.delete(supervisorId);
        if (supervisorIds.size === 0) {
          this.sessionSupervisors.delete(sessionId);
        }
      }
      
      this.logger.info(`Removed supervisor: ${supervisorId}`);
    }
  }

  getSupervisor(supervisorId: string): Supervisor | null {
    return this.supervisors.get(supervisorId) || null;
  }

  getAllSupervisors(): Supervisor[] {
    return Array.from(this.supervisors.values());
  }

  async registerSupervisor(sessionId: string, supervisor: Supervisor): Promise<void> {
    if (!this.sessionSupervisors.has(sessionId)) {
      this.sessionSupervisors.set(sessionId, new Set());
    }
    
    this.sessionSupervisors.get(sessionId)!.add(supervisor.id);
    this.logger.info(`Registered supervisor ${supervisor.id} for session ${sessionId}`);
  }

  async unregisterSupervisor(sessionId: string, supervisorId: string): Promise<void> {
    const supervisorIds = this.sessionSupervisors.get(sessionId);
    if (supervisorIds) {
      supervisorIds.delete(supervisorId);
      if (supervisorIds.size === 0) {
        this.sessionSupervisors.delete(sessionId);
      }
    }
    this.logger.info(`Unregistered supervisor ${supervisorId} from session ${sessionId}`);
  }

  getSessionSupervisors(sessionId: string): Supervisor[] {
    const supervisorIds = this.sessionSupervisors.get(sessionId);
    if (!supervisorIds) return [];
    
    return Array.from(supervisorIds)
      .map(id => this.supervisors.get(id))
      .filter((supervisor): supervisor is Supervisor => supervisor !== undefined);
  }

  async processRequest(
    session: ChatSession, 
    messages: ChatMessage[]
  ): Promise<RequestSupervisionResult> {
    const supervisors = this.getSessionSupervisors(session.id);
    
    // Chain supervisors sequentially - each gets the output of the previous
    let currentMessages = [...messages];
    const modificationReasons: string[] = [];

    for (const supervisor of supervisors) {
      const result = await supervisor.processRequest(session, currentMessages);
      
      // If supervisor blocks, return immediately
      if (result.action === 'block') {
        return result;
      }

      // Update current messages for next supervisor
      if (result.action === 'modify' && result.finalMessage) {
        // Update the last message in the array (the user message)
        currentMessages[currentMessages.length - 1] = result.finalMessage;
        if (result.reasons && result.reasons.length > 0) {
          modificationReasons.push(...result.reasons);
        }
      }
    }

    // Return final result with chained modifications
    return {
      action: modificationReasons.length > 0 ? 'modify' : 'allow',
      finalMessage: currentMessages[currentMessages.length - 1], // The last message (user message)
      reasons: modificationReasons,
      metadata: { 
        modificationsApplied: modificationReasons.length,
        supervisorsProcessed: supervisors.length
      }
    };
  }


  async processResponse(
    session: ChatSession, 
    response: MessageUpdate
  ): Promise<ResponseSupervisionResult> {
    const supervisors = this.getSessionSupervisors(session.id);
    let processedResponse = response;
    const modificationReasons: string[] = [];

    for (const supervisor of supervisors) {
      try {
        const result = await supervisor.processResponse(session, processedResponse);
        
        if (result.action === 'block') {
          // If any supervisor blocks, return block result
          return {
            action: 'block',
            reasons: result.reasons,
            metadata: result.metadata
          };
        } else if (result.action === 'modify' && result.finalResponse) {
          processedResponse = result.finalResponse;
          if (result.reasons && result.reasons.length > 0) {
            modificationReasons.push(...result.reasons);
          }
        }
      } catch (error) {
        this.logger.error(`Error in supervisor ${supervisor.id}:`, error);
        // Continue with original response if supervisor fails
      }
    }

    // Return structured result
    return {
      action: 'allow',
      finalResponse: processedResponse,
      reasons: modificationReasons,
      metadata: { 
        modificationsApplied: modificationReasons.length,
        supervisorsProcessed: supervisors.length
      }
    };
  }

}
