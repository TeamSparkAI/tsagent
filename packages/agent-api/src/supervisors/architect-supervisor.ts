import { 
  RequestSupervisionResult,
  ResponseSupervisionResult,
  SupervisionPermission,
  ArchitectAnalysis,
  TestResult
} from '../types/supervision.js';
import { ChatMessage, ChatSession, MessageUpdate } from '../types/chat.js';
import { Logger } from '../types/common.js';
import { BaseSupervisor } from './base-supervisor.js';

export class ArchitectSupervisorImpl extends BaseSupervisor {
  private analysisHistory: Map<string, ArchitectAnalysis[]> = new Map();
  private testResults: Map<string, TestResult[]> = new Map();

  constructor(id: string, name: string, logger: Logger) {
    super(id, name, [
      SupervisionPermission.READ_ONLY,
      SupervisionPermission.MODIFY_CONTEXT,
      SupervisionPermission.MODIFY_MESSAGES
    ], logger);
  }

  async processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult> {
    // Architect analyzes conversations but doesn't block them
    const lastMessage = messages[messages.length - 1];
    await this.analyzeConversationPattern(lastMessage);
    
    return { action: 'allow', finalMessage: lastMessage };
  }

  async processResponse(session: ChatSession, response: MessageUpdate): Promise<ResponseSupervisionResult> {
    // Architect analyzes responses but doesn't block them
    return { action: 'allow' };
  }

  async analyzeConversation(session: ChatSession): Promise<ArchitectAnalysis> {
    const state = session.getState();
    const conversationPatterns = this.extractPatterns(state.messages);
    const suggestedRules = await this.generateRulesFromPatterns(conversationPatterns);
    const suggestedReferences = await this.generateReferencesFromPatterns(conversationPatterns);
    
    const analysis: ArchitectAnalysis = {
      conversationPatterns,
      suggestedRules,
      suggestedReferences,
      effectivenessScore: this.calculateEffectivenessScore(session),
      recommendations: this.generateRecommendations(conversationPatterns)
    };

    // Store analysis
    if (!this.analysisHistory.has(session.id)) {
      this.analysisHistory.set(session.id, []);
    }
    this.analysisHistory.get(session.id)!.push(analysis);

    return analysis;
  }

  async generateRules(analysis: ArchitectAnalysis): Promise<string[]> {
    return analysis.suggestedRules;
  }

  async generateReferences(analysis: ArchitectAnalysis): Promise<string[]> {
    return analysis.suggestedReferences;
  }

  async testModifications(
    session: ChatSession, 
    modifications: Partial<{ references: string[], rules: string[] }>
  ): Promise<TestResult> {
    // This would involve creating a test session with modified context
    // and comparing responses - simplified for now
    const state = session.getState();
    const testResult: TestResult = {
      success: true,
      originalResponse: state.messages[state.messages.length - 1],
      modifiedResponse: state.messages[state.messages.length - 1], // Placeholder
      improvementScore: 0.5,
      error: undefined
    };

    // Store test result
    if (!this.testResults.has(session.id)) {
      this.testResults.set(session.id, []);
    }
    this.testResults.get(session.id)!.push(testResult);

    return testResult;
  }

  private async analyzeConversationPattern(message: ChatMessage): Promise<void> {
    // Analyze conversation patterns for learning
    this.logger.debug(`Architect analyzing conversation pattern`);
  }

  private extractPatterns(messages: ChatMessage[]): string[] {
    const patterns: string[] = [];
    
    // Extract common patterns from message history
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    
    // Pattern: User asks for specific information
    if (userMessages.some(m => 
      'content' in m && typeof m.content === 'string' && 
      (m.content.includes('what is') || m.content.includes('how does'))
    )) {
      patterns.push('information_request');
    }
    
    // Pattern: User requests action
    if (userMessages.some(m => 
      'content' in m && typeof m.content === 'string' && 
      (m.content.includes('please') || m.content.includes('can you'))
    )) {
      patterns.push('action_request');
    }
    
    // Pattern: Assistant uses tools
    if (assistantMessages.some(m => 
      m.role === 'assistant' && 
      m.modelReply?.turns?.some(turn => turn.toolCalls && turn.toolCalls.length > 0)
    )) {
      patterns.push('tool_usage');
    }
    
    return patterns;
  }

  private async generateRulesFromPatterns(patterns: string[]): Promise<string[]> {
    const rules: string[] = [];
    
    if (patterns.includes('information_request')) {
      rules.push('When users ask for information, provide accurate and detailed responses');
    }
    
    if (patterns.includes('action_request')) {
      rules.push('When users request actions, confirm understanding before proceeding');
    }
    
    if (patterns.includes('tool_usage')) {
      rules.push('Use appropriate tools when they can help provide better responses');
    }
    
    return rules;
  }

  private async generateReferencesFromPatterns(patterns: string[]): Promise<string[]> {
    const references: string[] = [];
    
    // Generate references based on conversation patterns
    if (patterns.includes('information_request')) {
      references.push('general_knowledge');
    }
    
    return references;
  }

  private calculateEffectivenessScore(session: ChatSession): number {
    // Simple effectiveness scoring based on conversation length and tool usage
    const state = session.getState();
    const messages = state.messages;
    const toolUsageCount = messages.filter(m => 
      m.role === 'assistant' && 
      m.modelReply?.turns?.some(turn => turn.toolCalls && turn.toolCalls.length > 0)
    ).length;
    
    const score = Math.min(1.0, (messages.length * 0.1) + (toolUsageCount * 0.2));
    return score;
  }

  private generateRecommendations(patterns: string[]): string[] {
    const recommendations: string[] = [];
    
    if (patterns.includes('information_request')) {
      recommendations.push('Consider adding more reference materials for information requests');
    }
    
    if (patterns.includes('action_request')) {
      recommendations.push('Add rules for handling action requests more effectively');
    }
    
    return recommendations;
  }
}
