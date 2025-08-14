/**
 * Base Agent Exports
 * 
 * During the migration to the new consolidated BaseAgent, we export both:
 * - BaseAgent: The legacy EventEmitter-based class (for backward compatibility)
 * - ConsolidatedBaseAgent: The new YAML-based template inheritance implementation
 * 
 * TODO: Once all agents are migrated, remove LegacyBaseAgent and rename ConsolidatedBaseAgent to BaseAgent
 */

// Export legacy BaseAgent as "BaseAgent" for backward compatibility
export { BaseAgent } from './LegacyBaseAgent';

// Export new consolidated BaseAgent with a different name to avoid conflicts
export { BaseAgent as ConsolidatedBaseAgent } from './BaseAgent';

// Export types used by both
export * from './types';