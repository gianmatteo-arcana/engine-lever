import { DatabaseService } from '../services/database';
import { TaskPriority, AgentRole } from '../agents/base/types';

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  lt: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn()
};

// Mock the Supabase module
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

describe('DatabaseService', () => {
  let dbService: DatabaseService;

  beforeEach(() => {
    jest.clearAllMocks();
    dbService = DatabaseService.getInstance();
    dbService.initialize('https://test.supabase.co', 'test-key');
  });

  afterEach(() => {
    dbService.reset();
  });

  describe('Task operations', () => {
    it('should create a task', async () => {
      const mockTask = {
        id: 'task-123',
        user_id: 'user-123',
        business_id: 'biz-123',
        template_id: 'soi-filing',
        status: 'pending' as const,
        priority: 'high' as const,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTask,
        error: null
      });

      const task = await dbService.createTask({
        user_id: 'user-123',
        business_id: 'biz-123',
        template_id: 'soi-filing',
        status: 'pending',
        priority: 'high',
        metadata: {}
      });

      expect(task).toEqual(mockTask);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('tasks');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });

    it('should get a task by ID', async () => {
      const mockTask = {
        id: 'task-123',
        user_id: 'user-123',
        business_id: 'biz-123',
        template_id: 'soi-filing',
        status: 'active',
        priority: 'high',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockTask,
        error: null
      });

      const task = await dbService.getTask('task-123');

      expect(task).toEqual(mockTask);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'task-123');
    });

    it('should return null for non-existent task', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' }
      });

      const task = await dbService.getTask('non-existent');

      expect(task).toBeNull();
    });

    it('should update a task', async () => {
      const updatedTask = {
        id: 'task-123',
        status: 'completed',
        completed_at: new Date().toISOString()
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: updatedTask,
        error: null
      });

      const task = await dbService.updateTask('task-123', {
        status: 'completed',
        completed_at: new Date().toISOString()
      });

      expect(task).toEqual(updatedTask);
      expect(mockSupabaseClient.update).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'task-123');
    });

    it('should get user tasks', async () => {
      const mockTasks = [
        { id: 'task-1', user_id: 'user-123', status: 'active' },
        { id: 'task-2', user_id: 'user-123', status: 'completed' }
      ];

      mockSupabaseClient.order.mockReturnValueOnce({
        data: mockTasks,
        error: null
      });

      const tasks = await dbService.getUserTasks('user-123');

      expect(tasks).toEqual(mockTasks);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should filter user tasks by status', async () => {
      const mockTasks = [
        { id: 'task-1', user_id: 'user-123', status: 'active' }
      ];

      // Setup mock to handle chained calls
      mockSupabaseClient.order.mockReturnValueOnce({
        data: mockTasks,
        error: null
      });

      const tasks = await dbService.getUserTasks('user-123', 'active');

      expect(tasks).toEqual(mockTasks);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('status', 'active');
    });
  });

  describe('Task execution operations', () => {
    it('should create an execution', async () => {
      const mockExecution = {
        id: 'exec-123',
        task_id: 'task-123',
        execution_id: 'exec-123',
        current_step: 'validate',
        completed_steps: [],
        agent_assignments: {},
        variables: {},
        status: 'running',
        is_paused: false,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockExecution,
        error: null
      });

      const execution = await dbService.createExecution({
        task_id: 'task-123',
        execution_id: 'exec-123',
        current_step: 'validate',
        completed_steps: [],
        agent_assignments: {},
        variables: {},
        status: 'running',
        is_paused: false,
        started_at: new Date().toISOString()
      });

      expect(execution).toEqual(mockExecution);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('task_executions');
    });

    it('should get paused executions', async () => {
      const mockExecutions = [
        { id: 'exec-1', is_paused: true, paused_at: '2024-01-01' },
        { id: 'exec-2', is_paused: true, paused_at: '2024-01-02' }
      ];

      mockSupabaseClient.order.mockReturnValueOnce({
        data: mockExecutions,
        error: null
      });

      const executions = await dbService.getPausedExecutions();

      expect(executions).toEqual(mockExecutions);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_paused', true);
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('paused_at', { ascending: true });
    });

    it('should update execution status', async () => {
      const updatedExecution = {
        execution_id: 'exec-123',
        status: 'completed',
        ended_at: new Date().toISOString()
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: updatedExecution,
        error: null
      });

      const execution = await dbService.updateExecution('exec-123', {
        status: 'completed',
        ended_at: new Date().toISOString()
      });

      expect(execution).toEqual(updatedExecution);
      expect(mockSupabaseClient.update).toHaveBeenCalled();
    });
  });

  describe('Agent message operations', () => {
    it('should save an agent message', async () => {
      mockSupabaseClient.insert.mockReturnValueOnce({
        error: null
      });

      const message = {
        id: 'msg-123',
        from: AgentRole.ORCHESTRATOR,
        to: AgentRole.LEGAL_COMPLIANCE,
        type: 'request' as const,
        timestamp: new Date(),
        priority: TaskPriority.HIGH,
        payload: { action: 'validate' }
      };

      await dbService.saveMessage(message, 'task-123', 'exec-123');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('agent_messages');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });

    it('should get unprocessed messages', async () => {
      const mockMessages = [
        { id: 'msg-1', processed: false },
        { id: 'msg-2', processed: false }
      ];

      mockSupabaseClient.limit.mockReturnValueOnce({
        data: mockMessages,
        error: null
      });

      const messages = await dbService.getUnprocessedMessages(10);

      expect(messages).toEqual(mockMessages);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('processed', false);
      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(10);
    });

    it('should mark message as processed', async () => {
      mockSupabaseClient.eq.mockReturnValueOnce({
        error: null
      });

      await dbService.markMessageProcessed('msg-123');

      expect(mockSupabaseClient.update).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('message_id', 'msg-123');
    });
  });

  describe('Pause point operations', () => {
    it('should create a pause point and return token', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { resume_token: 'token-123' },
        error: null
      });

      const token = await dbService.createPausePoint({
        task_id: 'task-123',
        pause_type: 'user_approval',
        pause_reason: 'Need user confirmation',
        resumed: false
      });

      expect(token).toBe('token-123');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('task_pause_points');
    });

    it('should resume from pause point', async () => {
      const mockPausePoint = {
        id: 'pause-123',
        task_id: 'task-123',
        resumed: true,
        resumed_at: new Date().toISOString()
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockPausePoint,
        error: null
      });

      const pausePoint = await dbService.resumeFromPausePoint('token-123', { approved: true });

      expect(pausePoint).toEqual(mockPausePoint);
      expect(mockSupabaseClient.update).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('resume_token', 'token-123');
    });

    it('should get active pause points', async () => {
      const mockPausePoints = [
        { id: 'pause-1', resumed: false },
        { id: 'pause-2', resumed: false }
      ];

      mockSupabaseClient.order.mockReturnValueOnce({
        data: mockPausePoints,
        error: null
      });

      const pausePoints = await dbService.getActivePausePoints('task-123');

      expect(pausePoints).toEqual(mockPausePoints);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('task_id', 'task-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('resumed', false);
    });
  });

  describe('Workflow state operations', () => {
    it('should save workflow state', async () => {
      mockSupabaseClient.insert.mockReturnValueOnce({
        error: null
      });

      await dbService.saveWorkflowState(
        'task-123',
        'exec-123',
        'validation',
        AgentRole.LEGAL_COMPLIANCE,
        { validated: true }
      );

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('workflow_states');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });

    it('should get latest workflow state', async () => {
      const mockState = {
        id: 'state-123',
        task_id: 'task-123',
        step_id: 'validation',
        state_data: { validated: true }
      };

      mockSupabaseClient.limit.mockReturnValueOnce({
        data: [mockState],
        error: null
      });

      const state = await dbService.getLatestWorkflowState('task-123', 'validation');

      expect(state).toEqual(mockState);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('task_id', 'task-123');
      // The second eq call for step_id is optional parameter
      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(1);
    });
  });

  describe('Audit trail operations', () => {
    it('should add audit entry', async () => {
      mockSupabaseClient.insert.mockReturnValueOnce({
        error: null
      });

      await dbService.addAuditEntry(
        'task-123',
        'task_started',
        { initiator: 'user' },
        AgentRole.ORCHESTRATOR,
        'user-123'
      );

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('task_audit_trail');
      expect(mockSupabaseClient.insert).toHaveBeenCalled();
    });

    it('should get task audit trail', async () => {
      const mockAudit = [
        { id: 'audit-1', action: 'task_started' },
        { id: 'audit-2', action: 'step_completed' }
      ];

      mockSupabaseClient.order.mockReturnValueOnce({
        data: mockAudit,
        error: null
      });

      const audit = await dbService.getTaskAuditTrail('task-123');

      expect(audit).toEqual(mockAudit);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('task_id', 'task-123');
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });

  describe('Helper methods', () => {
    it('should convert TaskContext to database record', () => {
      const context = {
        taskId: 'task-123',
        userId: 'user-123',
        businessId: 'biz-123',
        templateId: 'soi-filing',
        priority: TaskPriority.HIGH,
        deadline: new Date('2024-12-31'),
        metadata: { foo: 'bar' },
        auditTrail: []
      };

      const record = dbService.convertTaskContextToRecord(context, 'user-123');

      expect(record).toEqual({
        user_id: 'user-123',
        business_id: 'biz-123',
        template_id: 'soi-filing',
        status: 'pending',
        priority: 'high',
        deadline: '2024-12-31T00:00:00.000Z',
        metadata: { foo: 'bar' },
        completed_at: undefined
      });
    });
  });

  describe('Error handling', () => {
    it('should throw error when database not initialized', () => {
      const uninitializedService = DatabaseService.getInstance();
      uninitializedService.reset();

      expect(() => uninitializedService.getTask('task-123')).rejects.toThrow(
        'Database not initialized'
      );
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: dbError
      });

      await expect(dbService.getTask('task-123')).rejects.toThrow('Database connection failed');
    });
  });
});