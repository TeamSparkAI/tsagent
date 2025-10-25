import { Supervisor, SupervisorConfig } from '../types/supervision.js';
import { AgentSupervisor } from './agent-supervisor.js';
import { ArchitectSupervisorImpl } from './architect-supervisor.js';
import { GuardianSupervisorImpl } from './guardian-supervisor.js';
import { CollectionSupervisorImpl } from './collection-supervisor.js';
import { Logger } from '../types/common.js';

/**
 * Factory for creating supervisor instances based on configuration
 */
export class SupervisorFactory {
  /**
   * Create a supervisor instance based on configuration
   */
  static createSupervisor(config: SupervisorConfig, logger: Logger): Supervisor {
    switch (config.type) {
      case 'agent':
        return new AgentSupervisor(
          config.config.agentPath,
          config.config,
          logger
        );
      
      case 'guardian':
        return new GuardianSupervisorImpl(
          config.id,
          config.name,
          logger
        );
      
      case 'architect':
        return new ArchitectSupervisorImpl(
          config.id,
          config.name,
          logger
        );
      
      case 'collection':
        return new CollectionSupervisorImpl(
          config.id,
          config.name,
          logger
        );
      
      default:
        throw new Error(`Unknown supervisor type: ${config.type}`);
    }
  }
}
