/**
 * Execution Phase Constants for Orchestrator
 * 
 * These phases represent the WORKFLOW STEPS in an execution plan,
 * NOT the task status or lifecycle. Phases are about how the orchestrator
 * breaks down work into logical steps that can be executed by agents.
 * 
 * Each phase in an execution plan:
 * - Has a specific goal to accomplish
 * - May contain multiple subtasks
 * - Can be executed in parallel or sequence
 * - Is tracked for resumption purposes
 * 
 * IMPORTANT: These are different from Task Status (pending, completed, etc.)
 * Phases are internal to the orchestrator's execution strategy.
 */

/**
 * Standard execution phases used across different task types
 * These provide a common vocabulary for workflow steps
 */
export enum ExecutionPhase {
  /**
   * Initial setup and context gathering
   * - Load task template
   * - Gather initial requirements
   * - Prepare execution environment
   */
  INITIALIZATION = 'initialization',
  
  /**
   * Discovery and information gathering
   * - Query existing data
   * - Check external systems
   * - Identify missing information
   */
  DISCOVERY = 'discovery',
  
  /**
   * Collect required data from various sources
   * - Gather user profile information
   * - Collect business data
   * - Aggregate from multiple sources
   */
  DATA_COLLECTION = 'data_collection',
  
  /**
   * Validate collected information
   * - Check data completeness
   * - Verify accuracy
   * - Ensure consistency
   */
  VALIDATION = 'validation',
  
  /**
   * Process and analyze data
   * - Run business logic
   * - Generate insights
   * - Prepare results
   */
  PROCESSING = 'processing',
  
  /**
   * Execute main task operations
   * - Perform core business logic
   * - Call specialized agents
   * - Execute workflows
   */
  EXECUTION = 'execution',
  
  /**
   * Generate outputs and artifacts
   * - Create documents
   * - Generate reports
   * - Prepare deliverables
   */
  GENERATION = 'generation',
  
  /**
   * Review and quality check
   * - Verify outputs
   * - Check compliance
   * - Ensure quality standards
   */
  REVIEW = 'review',
  
  /**
   * Finalize and wrap up
   * - Store results
   * - Update records
   * - Clean up resources
   */
  COMPLETION = 'completion'
}

/**
 * Type guard to check if a string is a valid ExecutionPhase
 */
export function isValidExecutionPhase(phase: string): phase is ExecutionPhase {
  return Object.values(ExecutionPhase).includes(phase as ExecutionPhase);
}

/**
 * Get the next logical phase in a standard workflow
 * Returns null if at the end or phase is not recognized
 */
export function getNextPhase(currentPhase: ExecutionPhase): ExecutionPhase | null {
  const standardFlow = [
    ExecutionPhase.INITIALIZATION,
    ExecutionPhase.DISCOVERY,
    ExecutionPhase.DATA_COLLECTION,
    ExecutionPhase.VALIDATION,
    ExecutionPhase.PROCESSING,
    ExecutionPhase.EXECUTION,
    ExecutionPhase.GENERATION,
    ExecutionPhase.REVIEW,
    ExecutionPhase.COMPLETION
  ];
  
  const currentIndex = standardFlow.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === standardFlow.length - 1) {
    return null;
  }
  
  return standardFlow[currentIndex + 1];
}

/**
 * Phase metadata for tracking and display
 */
export interface PhaseMetadata {
  phase: ExecutionPhase;
  displayName: string;
  description: string;
  estimatedDuration?: string;
  requiresUserInput?: boolean;
}

/**
 * Standard phase metadata definitions
 */
export const PHASE_METADATA: Record<ExecutionPhase, PhaseMetadata> = {
  [ExecutionPhase.INITIALIZATION]: {
    phase: ExecutionPhase.INITIALIZATION,
    displayName: 'Initialization',
    description: 'Setting up task execution environment',
    estimatedDuration: '< 1 minute',
    requiresUserInput: false
  },
  [ExecutionPhase.DISCOVERY]: {
    phase: ExecutionPhase.DISCOVERY,
    displayName: 'Discovery',
    description: 'Gathering context and identifying requirements',
    estimatedDuration: '1-2 minutes',
    requiresUserInput: false
  },
  [ExecutionPhase.DATA_COLLECTION]: {
    phase: ExecutionPhase.DATA_COLLECTION,
    displayName: 'Data Collection',
    description: 'Collecting required information',
    estimatedDuration: '2-5 minutes',
    requiresUserInput: true
  },
  [ExecutionPhase.VALIDATION]: {
    phase: ExecutionPhase.VALIDATION,
    displayName: 'Validation',
    description: 'Verifying data accuracy and completeness',
    estimatedDuration: '1 minute',
    requiresUserInput: false
  },
  [ExecutionPhase.PROCESSING]: {
    phase: ExecutionPhase.PROCESSING,
    displayName: 'Processing',
    description: 'Analyzing and processing information',
    estimatedDuration: '2-3 minutes',
    requiresUserInput: false
  },
  [ExecutionPhase.EXECUTION]: {
    phase: ExecutionPhase.EXECUTION,
    displayName: 'Execution',
    description: 'Performing main task operations',
    estimatedDuration: '3-5 minutes',
    requiresUserInput: false
  },
  [ExecutionPhase.GENERATION]: {
    phase: ExecutionPhase.GENERATION,
    displayName: 'Generation',
    description: 'Creating outputs and deliverables',
    estimatedDuration: '2-3 minutes',
    requiresUserInput: false
  },
  [ExecutionPhase.REVIEW]: {
    phase: ExecutionPhase.REVIEW,
    displayName: 'Review',
    description: 'Quality checking results',
    estimatedDuration: '1-2 minutes',
    requiresUserInput: false
  },
  [ExecutionPhase.COMPLETION]: {
    phase: ExecutionPhase.COMPLETION,
    displayName: 'Completion',
    description: 'Finalizing and storing results',
    estimatedDuration: '< 1 minute',
    requiresUserInput: false
  }
};