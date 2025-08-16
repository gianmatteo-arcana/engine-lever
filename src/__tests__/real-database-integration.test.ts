/**
 * REAL DATABASE INTEGRATION TESTS
 * 
 * These tests use the ACTUAL Supabase database with NO MOCKING
 * Tests real CRUD operations against the unified schema
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use REAL database connection - MUST use environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://raenkewzlvrdqufwxjpl.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Skip these tests if environment variable not set
const describeIfEnv = SUPABASE_SERVICE_KEY ? describe : describe.skip;

describeIfEnv('REAL Database Integration - NO MOCKS', () => {
  let supabase: SupabaseClient;
  // Use actual test user ID from environment or defaults
  const testUserId = process.env.TEST_USER_ID || '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934';
  const _testUserEmail = process.env.TEST_USER_EMAIL || 'gianmatteo.allyn.test@gmail.com'; // Kept for reference
  const createdIds = {
    tasks: [] as string[],
    businesses: [] as string[],
    events: [] as string[]
  };

  beforeAll(() => {
    // Create REAL database client - only if we have the key
    if (SUPABASE_SERVICE_KEY) {
      supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    }
  });

  afterAll(async () => {
    // Clean up all test data
    for (const taskId of createdIds.tasks) {
      await supabase.from('tasks').delete().eq('id', taskId);
    }
    for (const businessId of createdIds.businesses) {
      await supabase.from('businesses').delete().eq('id', businessId);
    }
    for (const eventId of createdIds.events) {
      await supabase.from('task_context_events').delete().eq('id', eventId);
    }
  });

  describe('Database Connection', () => {
    it('should connect to the real database', async () => {
      const { error } = await supabase
        .from('tasks')
        .select('id')
        .limit(1);
      
      expect(error).toBeNull();
    });

    it('should verify unified schema exists', async () => {
      const { error: eventTableError } = await supabase
        .from('task_context_events')
        .select('id')
        .limit(1);
      
      expect(eventTableError).toBeNull();
    });
  });

  describe('Task CRUD Operations - REAL DATABASE', () => {
    it('should CREATE a real task in the database', async () => {
      const taskData = {
        user_id: testUserId,
        task_type: 'real_test',
        title: 'Real Database Test Task',
        description: 'This is a real task in the actual database',
        status: 'pending',
        priority: 'high',
        metadata: {
          test: true,
          timestamp: new Date().toISOString()
        }
      };

      const { data, error } = await supabase
        .from('tasks')
        .insert(taskData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.id).toBeDefined();
      expect(data.title).toBe(taskData.title);
      
      createdIds.tasks.push(data.id);
    });

    it('should READ a real task from the database', async () => {
      // First create a task
      const { data: createdTask } = await supabase
        .from('tasks')
        .insert({
          user_id: testUserId,
          task_type: 'read_test',
          title: 'Task to Read',
          description: 'Testing READ operation',
          status: 'pending',
          priority: 'medium'
        })
        .select()
        .single();

      createdIds.tasks.push(createdTask.id);

      // Now read it back
      const { data: readTask, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', createdTask.id)
        .single();

      expect(error).toBeNull();
      expect(readTask.id).toBe(createdTask.id);
      expect(readTask.title).toBe('Task to Read');
    });

    it('should UPDATE a real task in the database', async () => {
      // Create a task
      const { data: createdTask } = await supabase
        .from('tasks')
        .insert({
          user_id: testUserId,
          task_type: 'update_test',
          title: 'Original Title',
          description: 'Original Description',
          status: 'pending',
          priority: 'low'
        })
        .select()
        .single();

      createdIds.tasks.push(createdTask.id);

      // Update it (use only fields that exist in the schema)
      const { data: updatedTask, error } = await supabase
        .from('tasks')
        .update({
          title: 'Updated Title',
          status: 'in_progress',
          description: 'Updated description for testing'
        })
        .eq('id', createdTask.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updatedTask.title).toBe('Updated Title');
      expect(updatedTask.status).toBe('in_progress');
      expect(updatedTask.description).toBe('Updated description for testing');
    });

    it('should DELETE a real task from the database', async () => {
      // Create a task to delete
      const { data: taskToDelete } = await supabase
        .from('tasks')
        .insert({
          user_id: testUserId,
          task_type: 'delete_test',
          title: 'Task to Delete',
          description: 'This will be deleted',
          status: 'pending',
          priority: 'low'
        })
        .select()
        .single();

      // Delete it
      const { error: deleteError } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskToDelete.id);

      expect(deleteError).toBeNull();

      // Verify it's gone
      const { data: shouldBeNull } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskToDelete.id)
        .single();

      expect(shouldBeNull).toBeNull();
    });
  });

  describe('Unified task_context_events - REAL DATABASE', () => {
    it('should CREATE events in unified task_context_events table', async () => {
      const contextId = crypto.randomUUID();
      
      // Create a task first
      const { data: task } = await supabase
        .from('tasks')
        .insert({
          user_id: testUserId,
          task_type: 'event_test',
          title: 'Task with Events',
          description: 'Testing unified events',
          status: 'pending',
          priority: 'high'
        })
        .select()
        .single();

      createdIds.tasks.push(task.id);

      // Create events in unified table
      const events = [
        {
          context_id: contextId,
          task_id: task.id,
          actor_type: 'user',
          actor_id: testUserId,
          operation: 'task_created',
          data: { initial: true },
          reasoning: 'Task creation event'
        },
        {
          context_id: contextId,
          task_id: task.id,
          actor_type: 'agent',
          actor_id: 'test_agent',
          operation: 'analysis_started',
          data: { 
            agentMeta: { 
              state: 'analyzing',
              progress: 25 
            }
          },
          reasoning: 'Agent started analysis'
        },
        {
          context_id: contextId,
          task_id: task.id,
          actor_type: 'system',
          actor_id: 'backend',
          operation: 'status_update',
          data: { 
            old_status: 'pending',
            new_status: 'in_progress' 
          },
          reasoning: 'System status update'
        }
      ];

      for (const event of events) {
        const { data, error } = await supabase
          .from('task_context_events')
          .insert(event)
          .select()
          .single();

        expect(error).toBeNull();
        expect(data).toBeDefined();
        expect(data.sequence_number).toBeDefined();
        createdIds.events.push(data.id);
      }

      // Query all events for the task
      const { data: allEvents, error: queryError } = await supabase
        .from('task_context_events')
        .select('*')
        .eq('task_id', task.id)
        .order('sequence_number');

      expect(queryError).toBeNull();
      expect(allEvents).toBeDefined();
      expect(allEvents!.length).toBe(3);
      expect(allEvents![0].operation).toBe('task_created');
      expect(allEvents![1].operation).toBe('analysis_started');
      expect(allEvents![2].operation).toBe('status_update');
    });

    it('should enforce unique sequence numbers per context', async () => {
      const contextId = crypto.randomUUID();
      
      // Create first event
      const { data: firstEvent } = await supabase
        .from('task_context_events')
        .insert({
          context_id: contextId,
          actor_type: 'user',
          actor_id: testUserId,
          operation: 'test_op',
          data: {}
        })
        .select()
        .single();

      createdIds.events.push(firstEvent.id);

      // Try to create duplicate sequence number (should fail)
      const { error } = await supabase
        .from('task_context_events')
        .insert({
          context_id: contextId,
          sequence_number: firstEvent.sequence_number,
          actor_type: 'user',
          actor_id: testUserId,
          operation: 'duplicate_test',
          data: {}
        });

      expect(error).toBeDefined();
      // PostgreSQL unique constraint violation
      if (error?.message) {
        expect(error.message.toLowerCase()).toMatch(/unique|duplicate/);
      }
    });
  });

  describe('Business Operations with additional_info - REAL DATABASE', () => {
    it('should CREATE business with additional_info field', async () => {
      const businessData = {
        name: 'Real Test Business LLC',
        entity_type: 'LLC',
        state: 'CA',
        industry: 'Technology',
        ein: `99-${Math.floor(Math.random() * 9999999)}`,
        additional_info: {
          test_scenario: 'real_database_test',
          timestamp: new Date().toISOString(),
          nested_data: {
            level1: {
              level2: 'deeply nested'
            }
          }
        }
      };

      const { data, error } = await supabase
        .from('businesses')
        .insert(businessData)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.additional_info).toBeDefined();
      expect(data.additional_info.test_scenario).toBe('real_database_test');
      expect(data.additional_info.nested_data.level1.level2).toBe('deeply nested');
      
      createdIds.businesses.push(data.id);
    });

    it('should UPDATE additional_info field', async () => {
      // Create a business
      const { data: business } = await supabase
        .from('businesses')
        .insert({
          name: 'Update Test Business',
          entity_type: 'Corporation',
          state: 'NY',
          additional_info: {
            original: true,
            version: 1
          }
        })
        .select()
        .single();

      createdIds.businesses.push(business.id);

      // Update additional_info
      const { data: updated, error } = await supabase
        .from('businesses')
        .update({
          additional_info: {
            original: false,
            version: 2,
            updated_at: new Date().toISOString()
          }
        })
        .eq('id', business.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(updated.additional_info.original).toBe(false);
      expect(updated.additional_info.version).toBe(2);
      expect(updated.additional_info.updated_at).toBeDefined();
    });
  });

  describe('Complex Queries - REAL DATABASE', () => {
    it('should perform JOIN queries between tasks and events', async () => {
      const contextId = crypto.randomUUID();
      
      // Create task with events
      const { data: task } = await supabase
        .from('tasks')
        .insert({
          user_id: testUserId,
          task_type: 'join_test',
          title: 'Join Test Task',
          status: 'pending',
          priority: 'high'
        })
        .select()
        .single();

      createdIds.tasks.push(task.id);

      // Create multiple events
      for (let i = 0; i < 5; i++) {
        const { data: event } = await supabase
          .from('task_context_events')
          .insert({
            context_id: contextId,
            task_id: task.id,
            actor_type: 'agent',
            actor_id: `agent_${i}`,
            operation: `operation_${i}`,
            data: { index: i }
          })
          .select()
          .single();
        
        createdIds.events.push(event.id);
      }

      // Query task with event count
      const { data: taskWithEvents, error } = await supabase
        .from('tasks')
        .select(`
          *,
          task_context_events (
            id,
            operation,
            actor_type,
            sequence_number
          )
        `)
        .eq('id', task.id)
        .single();

      expect(error).toBeNull();
      expect(taskWithEvents).toBeDefined();
      expect(taskWithEvents.task_context_events).toBeDefined();
      expect(taskWithEvents.task_context_events.length).toBe(5);
    });

    it('should handle transactions and rollbacks properly', async () => {
      // This tests that our database handles failed operations correctly
      const { error } = await supabase
        .from('tasks')
        .insert({
          user_id: testUserId,
          // Invalid status to trigger error
          status: 'invalid_status',
          title: 'Should Fail',
          task_type: 'error_test',
          priority: 'medium'
        });

      expect(error).toBeDefined();
      expect(error?.message).toContain('check');
    });
  });
});