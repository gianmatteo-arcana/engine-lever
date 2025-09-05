/**
 * Helper to setup mocks for task recovery tests
 */

export function setupRecoveryMocks(mockSupabaseClient: any) {
  // Setup chain for the initial status check query
  // from('tasks').select(...).order(...).limit(10)
  const statusCheckChain = {
    data: [], // Default to no tasks
    error: null
  };
  
  // Setup chain for orphaned task query
  // from('tasks').select('*').eq('status', 'AGENT_EXECUTION_IN_PROGRESS')
  const orphanedTaskChain = {
    data: [],
    error: null
  };
  
  // Setup chain for paused task query
  // from('tasks').select('id, task_type').eq('status', 'AGENT_EXECUTION_PAUSED')
  const pausedTaskChain = {
    data: [],
    error: null
  };
  
  // Chain the mock returns properly
  let callCount = 0;
  
  mockSupabaseClient.limit.mockImplementation(() => {
    return Promise.resolve(statusCheckChain);
  });
  
  mockSupabaseClient.eq.mockImplementation((field: string, value: string) => {
    if (value === 'AGENT_EXECUTION_IN_PROGRESS') {
      return Promise.resolve(orphanedTaskChain);
    } else if (value === 'AGENT_EXECUTION_PAUSED') {
      return Promise.resolve(pausedTaskChain);
    }
    return Promise.resolve({ data: [], error: null });
  });
  
  return {
    setStatusCheckResult: (data: any[]) => {
      statusCheckChain.data = data;
    },
    setOrphanedTasks: (data: any[]) => {
      orphanedTaskChain.data = data;
    },
    setPausedTasks: (data: any[]) => {
      pausedTaskChain.data = data;
    }
  };
}