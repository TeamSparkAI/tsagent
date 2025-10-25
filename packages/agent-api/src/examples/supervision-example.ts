import { loadAgent } from '../runtime.js';
import { SupervisionManagerImpl } from '../managers/supervision-manager.js';
import { ArchitectSupervisorImpl } from '../supervisors/architect-supervisor.js';
import { GuardianSupervisorImpl } from '../supervisors/guardian-supervisor.js';
import { CollectionSupervisorImpl } from '../supervisors/collection-supervisor.js';
import { Logger } from '../types/common.js';

/**
 * Example demonstrating how to use the supervision system
 */
export async function supervisionExample(logger: Logger) {
  // Load an existing agent
  const agent = await loadAgent('./my-agent', logger);
  
  // Create supervision manager
  const supervisionManager = new SupervisionManagerImpl(logger);
  
  // Create different types of supervisors
  const architectSupervisor = new ArchitectSupervisorImpl(
    'architect-1',
    'Conversation Architect',
    logger
  );
  
  const guardianSupervisor = new GuardianSupervisorImpl(
    'guardian-1',
    'Content Guardian',
    logger
  );
  
  const collectionSupervisor = new CollectionSupervisorImpl(
    'collection-1',
    'Data Collector',
    logger
  );
  
  // Set up guardian rules
  await guardianSupervisor.setGuardrailRules([
    'no profanity',
    'no personal info',
    'no harmful content'
  ]);
  
  // Add supervisors to the supervision manager
  await supervisionManager.addSupervisor(architectSupervisor);
  await supervisionManager.addSupervisor(guardianSupervisor);
  await supervisionManager.addSupervisor(collectionSupervisor);
  
  // Set the supervision manager on the agent
  agent.setSupervisionManager(supervisionManager);
  
  // Create a chat session (supervision will be automatically applied)
  const session = agent.createChatSession('supervised-session');
  
  // Register supervisors for this specific session
  await supervisionManager.registerSupervisor('supervised-session', architectSupervisor);
  await supervisionManager.registerSupervisor('supervised-session', guardianSupervisor);
  await supervisionManager.registerSupervisor('supervised-session', collectionSupervisor);
  
  // Now when you send messages, they will be supervised
  try {
    const response = await session.handleMessage('Hello, how can you help me?');
    console.log('Response:', response);
    
    // The architect will analyze the conversation
    const analysis = await architectSupervisor.analyzeConversation(session);
    
    console.log('Architect Analysis:', analysis);
    
    // The collection supervisor will have collected data
    const stats = collectionSupervisor.getCollectionStats();
    console.log('Collection Stats:', stats);
    
  } catch (error) {
    console.error('Error in supervised conversation:', error);
  }
  
  // Export collected data
  const exportedData = await collectionSupervisor.exportData('json');
  console.log('Exported Data:', exportedData);
}

/**
 * Example of creating a custom supervisor
 */
export class CustomSupervisor extends ArchitectSupervisorImpl {
  constructor(id: string, name: string, logger: Logger) {
    super(id, name, logger);
  }
  
  async processRequest(session: any, messages: any[]): Promise<any> {
    // Custom logic here
    const lastMessage = messages[messages.length - 1];
    console.log(`Custom supervisor intercepting message: ${'content' in lastMessage && typeof lastMessage.content === 'string' ? lastMessage.content : 'No content'}`);
    
    // Call parent implementation
    return super.processRequest(session, messages);
  }
  
  async analyzeConversation(context: any): Promise<any> {
    // Custom analysis logic
    console.log('Custom supervisor analyzing conversation...');
    
    // Call parent implementation
    return super.analyzeConversation(context);
  }
}
