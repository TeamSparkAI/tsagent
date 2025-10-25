import { 
  Supervisor, 
  RequestSupervisionResult,
  ResponseSupervisionResult,
  SupervisionPermission
} from '../types/supervision.js';
import { ChatMessage, ChatSession, MessageUpdate } from '../types/chat.js';
import { Logger } from '../types/common.js';

export abstract class BaseSupervisor implements Supervisor {
  public readonly id: string;
  public readonly name: string;
  public readonly permissions: SupervisionPermission[];
  protected logger: Logger;

  constructor(
    id: string, 
    name: string, 
    permissions: SupervisionPermission[], 
    logger: Logger
  ) {
    this.id = id;
    this.name = name;
    this.permissions = permissions;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    this.logger.info(`Initializing supervisor: ${this.name}`);
  }

  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up supervisor: ${this.name}`);
  }

  async processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult> {
    // Default implementation - allow all requests
    return { action: 'allow', finalMessage: messages[messages.length - 1] };
  }

  async processResponse(session: ChatSession, response: MessageUpdate): Promise<ResponseSupervisionResult> {
    // Default implementation - allow all responses
    return { action: 'allow' };
  }


  // Helper methods
  protected hasPermission(permission: SupervisionPermission): boolean {
    return this.permissions.includes(permission);
  }

  protected canModifyContext(): boolean {
    return this.hasPermission(SupervisionPermission.MODIFY_CONTEXT) || 
           this.hasPermission(SupervisionPermission.FULL_CONTROL);
  }

  protected canModifyMessages(): boolean {
    return this.hasPermission(SupervisionPermission.MODIFY_MESSAGES) || 
           this.hasPermission(SupervisionPermission.FULL_CONTROL);
  }

  protected isReadOnly(): boolean {
    return this.permissions.length === 1 && this.permissions.includes(SupervisionPermission.READ_ONLY);
  }
}
