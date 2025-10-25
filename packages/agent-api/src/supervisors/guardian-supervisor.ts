import { 
  RequestSupervisionResult,
  ResponseSupervisionResult,
  SupervisionPermission,
  GuardianDecision
} from '../types/supervision.js';
import { ChatMessage, ChatSession, MessageUpdate } from '../types/chat.js';
import { Logger } from '../types/common.js';
import { BaseSupervisor } from './base-supervisor.js';

export class GuardianSupervisorImpl extends BaseSupervisor {
  private guardrailRules: string[] = [];
  private blockedMessages: ChatMessage[] = [];
  private allowedMessages: ChatMessage[] = [];

  constructor(id: string, name: string, logger: Logger) {
    super(id, name, [
      SupervisionPermission.READ_ONLY,
      SupervisionPermission.MODIFY_MESSAGES
    ], logger);
  }

  async processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult> {
    const lastMessage = messages[messages.length - 1];
    const decision = await this.checkContent(lastMessage);
    
    if (!decision.allowed) {
      this.blockedMessages.push(lastMessage);
      this.logger.warn(`Guardian blocked message: ${decision.reason}`);
      return { 
        action: 'block',
        reasons: [decision.reason || 'Content blocked by guardian'],
        metadata: { confidence: decision.confidence }
      };
    }
    
    if (decision.modifiedContent) {
      this.allowedMessages.push(lastMessage);
      const modifiedMessage: ChatMessage = {
        ...lastMessage,
        content: decision.modifiedContent
      } as ChatMessage;
      return { 
        action: 'modify',
        finalMessage: modifiedMessage,
        reasons: ['Content modified by guardian']
      };
    }
    
    this.allowedMessages.push(lastMessage);
    return { action: 'allow', finalMessage: lastMessage };
  }

  async processResponse(session: ChatSession, response: MessageUpdate): Promise<ResponseSupervisionResult> {
    // Guardian can also check responses
    return { action: 'allow' };
  }

  async checkContent(message: ChatMessage): Promise<GuardianDecision> {
    if (!('content' in message) || typeof message.content !== 'string') {
      return { allowed: true, confidence: 1.0 };
    }

    const content = message.content.toLowerCase();
    
    // Check against guardrail rules
    for (const rule of this.guardrailRules) {
      const ruleLower = rule.toLowerCase();
      
      // Simple keyword-based checking (in production, this would be more sophisticated)
      if (ruleLower.includes('no profanity') && this.containsProfanity(content)) {
        return {
          allowed: false,
          reason: 'Content contains inappropriate language',
          confidence: 0.9
        };
      }
      
      if (ruleLower.includes('no personal info') && this.containsPersonalInfo(content)) {
        return {
          allowed: false,
          reason: 'Content contains personal information',
          confidence: 0.8
        };
      }
      
      if (ruleLower.includes('no harmful content') && this.containsHarmfulContent(content)) {
        return {
          allowed: false,
          reason: 'Content may be harmful',
          confidence: 0.7
        };
      }
    }
    
    return { allowed: true, confidence: 1.0 };
  }

  async applyGuardrails(message: ChatMessage): Promise<ChatMessage> {
    if (!('content' in message) || typeof message.content !== 'string') {
      return message;
    }

    let content = message.content;
    
    // Apply content filtering
    content = this.filterProfanity(content);
    content = this.filterPersonalInfo(content);
    content = this.filterHarmfulContent(content);
    
    return {
      ...message,
      content
    };
  }

  getGuardrailRules(): string[] {
    return [...this.guardrailRules];
  }

  async setGuardrailRules(rules: string[]): Promise<void> {
    this.guardrailRules = [...rules];
    this.logger.info(`Updated guardrail rules: ${rules.length} rules set`);
  }

  // Content checking methods
  private containsProfanity(content: string): boolean {
    const profanityWords = ['badword1', 'badword2']; // Simplified - would use proper profanity filter
    return profanityWords.some(word => content.includes(word));
  }

  private containsPersonalInfo(content: string): boolean {
    // Check for common personal information patterns
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/;
    const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/;
    
    return emailRegex.test(content) || phoneRegex.test(content) || ssnRegex.test(content);
  }

  private containsHarmfulContent(content: string): boolean {
    const harmfulPatterns = [
      'violence',
      'self-harm',
      'illegal activities'
    ];
    
    return harmfulPatterns.some(pattern => content.includes(pattern));
  }

  // Content filtering methods
  private filterProfanity(content: string): string {
    const profanityWords = ['badword1', 'badword2'];
    let filtered = content;
    
    profanityWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      filtered = filtered.replace(regex, '[FILTERED]');
    });
    
    return filtered;
  }

  private filterPersonalInfo(content: string): string {
    let filtered = content;
    
    // Replace email addresses
    filtered = filtered.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
    
    // Replace phone numbers
    filtered = filtered.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
    
    // Replace SSNs
    filtered = filtered.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
    
    return filtered;
  }

  private filterHarmfulContent(content: string): string {
    // This would implement more sophisticated content filtering
    // For now, just return the content as-is
    return content;
  }
}
