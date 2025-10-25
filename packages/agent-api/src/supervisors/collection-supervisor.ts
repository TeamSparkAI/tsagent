import { 
  RequestSupervisionResult,
  ResponseSupervisionResult,
  SupervisionPermission,
  CollectionStats
} from '../types/supervision.js';
import { ChatMessage, ChatSession, MessageUpdate } from '../types/chat.js';
import { Logger } from '../types/common.js';
import { BaseSupervisor } from './base-supervisor.js';

export class CollectionSupervisorImpl extends BaseSupervisor {
  private collectedData: Map<string, any[]> = new Map();
  private sessionStats: Map<string, any> = new Map();
  private totalMessages: number = 0;
  private totalSessions: number = 0;

  constructor(id: string, name: string, logger: Logger) {
    super(id, name, [SupervisionPermission.READ_ONLY], logger);
  }

  async processRequest(session: ChatSession, messages: ChatMessage[]): Promise<RequestSupervisionResult> {
    // Collection supervisor is read-only, just collects data
    const lastMessage = messages[messages.length - 1];
    await this.collectMessage(lastMessage, {
      sessionId: session.id,
      timestamp: Date.now(),
      supervisorId: this.id
    });
    
    return { action: 'allow', finalMessage: lastMessage };
  }

  async processResponse(session: ChatSession, response: MessageUpdate): Promise<ResponseSupervisionResult> {
    // Collection supervisor also collects response data
    for (const message of response.updates) {
      await this.collectMessage(message, {
        sessionId: session.id,
        timestamp: Date.now(),
        supervisorId: this.id
      });
    }
    
    return { action: 'allow' };
  }

  async collectMessage(message: ChatMessage, metadata: Record<string, any>): Promise<void> {
    const sessionId = metadata.sessionId;
    
    if (!this.collectedData.has(sessionId)) {
      this.collectedData.set(sessionId, []);
      this.totalSessions++;
    }
    
    const messageData = {
      message,
      metadata,
      timestamp: Date.now()
    };
    
    this.collectedData.get(sessionId)!.push(messageData);
    this.totalMessages++;
    
    // Update session stats
    this.updateSessionStats(sessionId, message);
    
    this.logger.debug(`Collected message for session ${sessionId}`);
  }

  async exportData(format: 'json' | 'csv' | 'log'): Promise<string> {
    switch (format) {
      case 'json':
        return this.exportAsJson();
      case 'csv':
        return this.exportAsCsv();
      case 'log':
        return this.exportAsLog();
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  getCollectionStats(): CollectionStats {
    const messageTypes: Record<string, number> = {};
    const sessionLengths: number[] = [];
    const hourlyActivity: number[] = new Array(24).fill(0);
    
    // Calculate stats from collected data
    for (const [sessionId, messages] of this.collectedData.entries()) {
      sessionLengths.push(messages.length);
      
      for (const messageData of messages) {
        const message = messageData.message;
        const messageType = message.role;
        messageTypes[messageType] = (messageTypes[messageType] || 0) + 1;
        
        // Calculate hourly activity
        const hour = new Date(messageData.timestamp).getHours();
        hourlyActivity[hour]++;
      }
    }
    
    const averageSessionLength = sessionLengths.length > 0 
      ? sessionLengths.reduce((sum, length) => sum + length, 0) / sessionLengths.length 
      : 0;
    
    const mostActiveHours = hourlyActivity
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(item => item.hour);
    
    return {
      totalMessages: this.totalMessages,
      totalSessions: this.totalSessions,
      averageSessionLength,
      mostActiveHours,
      messageTypes
    };
  }

  private updateSessionStats(sessionId: string, message: ChatMessage): void {
    if (!this.sessionStats.has(sessionId)) {
      this.sessionStats.set(sessionId, {
        messageCount: 0,
        userMessages: 0,
        assistantMessages: 0,
        systemMessages: 0,
        firstMessage: Date.now(),
        lastMessage: Date.now()
      });
    }
    
    const stats = this.sessionStats.get(sessionId)!;
    stats.messageCount++;
    stats.lastMessage = Date.now();
    
    switch (message.role) {
      case 'user':
        stats.userMessages++;
        break;
      case 'assistant':
        stats.assistantMessages++;
        break;
      case 'system':
        stats.systemMessages++;
        break;
    }
  }

  private exportAsJson(): string {
    const exportData = {
      stats: this.getCollectionStats(),
      sessions: Object.fromEntries(this.collectedData),
      sessionStats: Object.fromEntries(this.sessionStats)
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  private exportAsCsv(): string {
    const csvLines = ['timestamp,sessionId,role,content,metadata'];
    
    for (const [sessionId, messages] of this.collectedData.entries()) {
      for (const messageData of messages) {
        const message = messageData.message;
        const content = typeof message.content === 'string' 
          ? message.content.replace(/"/g, '""') 
          : JSON.stringify(message.content);
        
        const metadata = JSON.stringify(messageData.metadata).replace(/"/g, '""');
        
        csvLines.push(
          `${messageData.timestamp},"${sessionId}","${message.role}","${content}","${metadata}"`
        );
      }
    }
    
    return csvLines.join('\n');
  }

  private exportAsLog(): string {
    const logLines: string[] = [];
    
    logLines.push(`# Collection Supervisor Log - ${new Date().toISOString()}`);
    logLines.push(`# Total Messages: ${this.totalMessages}`);
    logLines.push(`# Total Sessions: ${this.totalSessions}`);
    logLines.push('');
    
    for (const [sessionId, messages] of this.collectedData.entries()) {
      logLines.push(`## Session: ${sessionId}`);
      logLines.push(`Messages: ${messages.length}`);
      logLines.push('');
      
      for (const messageData of messages) {
        const message = messageData.message;
        const timestamp = new Date(messageData.timestamp).toISOString();
        
        logLines.push(`[${timestamp}] ${message.role.toUpperCase()}:`);
        if (typeof message.content === 'string') {
          logLines.push(message.content);
        } else {
          logLines.push(JSON.stringify(message.content, null, 2));
        }
        logLines.push('');
      }
    }
    
    return logLines.join('\n');
  }
}
