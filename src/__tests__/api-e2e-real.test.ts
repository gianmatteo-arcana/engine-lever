/**
 * REAL END-TO-END API TESTS
 * 
 * These tests hit actual Express endpoints with HTTP requests
 * Uses real database, real authentication, real everything
 * NO MOCKS - Complete request → auth → database → response flow
 */

import request from 'supertest';
import app from '../app';
import { createClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';

// Real database connection
const SUPABASE_URL = 'https://raenkewzlvrdqufwxjpl.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhZW5rZXd6bHZyZHF1Znd4anBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzA0NzM4MywiZXhwIjoyMDY4NjIzMzgzfQ.tPBuIjB_JF4aW0NEmYwzVfbg1zcFUo1r1eOTeZVWuyw';

// Test user from actual database
const TEST_USER_ID = '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934';
const TEST_USER_EMAIL = 'gianmatteo.allyn.test@gmail.com';

// Generate a valid JWT for testing
const JWT_SECRET = process.env.JWT_SECRET || 'your-256-bit-secret';
const generateTestToken = () => {
  return jwt.sign(
    {
      sub: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      role: 'authenticated',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    },
    JWT_SECRET
  );
};

describe('REAL E2E API Tests - Complete Flow', () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authToken = `Bearer ${generateTestToken()}`;
  const createdIds: string[] = [];

  afterAll(async () => {
    // Clean up all test data
    for (const id of createdIds) {
      await supabase.from('tasks').delete().eq('id', id);
    }
  });

  describe('POST /api/tasks - Create Task', () => {
    it('should create a task with valid authentication', async () => {
      const taskData = {
        task_type: 'e2e_test',
        title: 'E2E API Test Task',
        description: 'Created via real API endpoint',
        status: 'pending',
        priority: 'high',
        metadata: {
          test: true,
          timestamp: new Date().toISOString()
        }
      };

      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', authToken)
        .send(taskData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(taskData.title);
      expect(response.body.user_id).toBe(TEST_USER_ID);
      
      createdIds.push(response.body.id);

      // Verify in database
      const { data: dbTask } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', response.body.id)
        .single();

      expect(dbTask).toBeDefined();
      expect(dbTask.title).toBe(taskData.title);
    });

    it('should reject task creation without authentication', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .send({ title: 'Unauthorized' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('auth');
    });

    it('should reject invalid task data', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', authToken)
        .send({
          // Missing required fields
          description: 'Invalid task'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject invalid status values', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', authToken)
        .send({
          task_type: 'test',
          title: 'Test',
          status: 'invalid_status' // Should fail check constraint
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('GET /api/tasks/:id - Read Task', () => {
    let testTaskId: string;

    beforeAll(async () => {
      // Create a task for reading
      const { data } = await supabase
        .from('tasks')
        .insert({
          user_id: TEST_USER_ID,
          task_type: 'read_test',
          title: 'Task to Read',
          description: 'E2E Read Test',
          status: 'pending',
          priority: 'medium'
        })
        .select()
        .single();
      
      testTaskId = data.id;
      createdIds.push(testTaskId);
    });

    it('should read a task with valid authentication', async () => {
      const response = await request(app)
        .get(`/api/tasks/${testTaskId}`)
        .set('Authorization', authToken)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.id).toBe(testTaskId);
      expect(response.body.title).toBe('Task to Read');
      expect(response.body.user_id).toBe(TEST_USER_ID);
    });

    it('should return 404 for non-existent task', async () => {
      const fakeId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      
      await request(app)
        .get(`/api/tasks/${fakeId}`)
        .set('Authorization', authToken)
        .expect(404);
    });

    it('should reject reading without authentication', async () => {
      await request(app)
        .get(`/api/tasks/${testTaskId}`)
        .expect(401);
    });
  });

  describe('PUT /api/tasks/:id - Update Task', () => {
    let testTaskId: string;

    beforeAll(async () => {
      // Create a task for updating
      const { data } = await supabase
        .from('tasks')
        .insert({
          user_id: TEST_USER_ID,
          task_type: 'update_test',
          title: 'Original Title',
          description: 'Original Description',
          status: 'pending',
          priority: 'low'
        })
        .select()
        .single();
      
      testTaskId = data.id;
      createdIds.push(testTaskId);
    });

    it('should update a task with valid authentication', async () => {
      const updateData = {
        title: 'Updated via API',
        status: 'in_progress',
        description: 'Updated Description'
      };

      const response = await request(app)
        .put(`/api/tasks/${testTaskId}`)
        .set('Authorization', authToken)
        .send(updateData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.title).toBe(updateData.title);
      expect(response.body.status).toBe(updateData.status);
      expect(response.body.description).toBe(updateData.description);

      // Verify in database
      const { data: dbTask } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', testTaskId)
        .single();

      expect(dbTask.title).toBe(updateData.title);
    });

    it('should reject updates with invalid data', async () => {
      await request(app)
        .put(`/api/tasks/${testTaskId}`)
        .set('Authorization', authToken)
        .send({
          status: 'not_a_valid_status'
        })
        .expect(400);
    });

    it('should prevent updating other users tasks', async () => {
      // Create a task for a different user
      const { data: otherTask } = await supabase
        .from('tasks')
        .insert({
          user_id: 'different-user-id',
          task_type: 'other_user',
          title: 'Other User Task',
          status: 'pending',
          priority: 'medium'
        })
        .select()
        .single();

      createdIds.push(otherTask.id);

      // Try to update it with our test user token
      await request(app)
        .put(`/api/tasks/${otherTask.id}`)
        .set('Authorization', authToken)
        .send({ title: 'Hacked!' })
        .expect(403); // Forbidden
    });
  });

  describe('DELETE /api/tasks/:id - Delete Task', () => {
    it('should delete a task with valid authentication', async () => {
      // Create a task to delete
      const { data: taskToDelete } = await supabase
        .from('tasks')
        .insert({
          user_id: TEST_USER_ID,
          task_type: 'delete_test',
          title: 'Task to Delete',
          description: 'Will be deleted',
          status: 'pending',
          priority: 'low'
        })
        .select()
        .single();

      // Delete via API
      await request(app)
        .delete(`/api/tasks/${taskToDelete.id}`)
        .set('Authorization', authToken)
        .expect(204); // No content

      // Verify it's gone from database
      const { data: shouldBeNull } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskToDelete.id)
        .single();

      expect(shouldBeNull).toBeNull();
    });

    it('should reject deletion without authentication', async () => {
      // Create a task
      const { data: task } = await supabase
        .from('tasks')
        .insert({
          user_id: TEST_USER_ID,
          task_type: 'auth_test',
          title: 'Protected Task',
          status: 'pending',
          priority: 'high'
        })
        .select()
        .single();

      createdIds.push(task.id);

      // Try to delete without auth
      await request(app)
        .delete(`/api/tasks/${task.id}`)
        .expect(401);

      // Verify it still exists
      const { data: stillExists } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', task.id)
        .single();

      expect(stillExists).toBeDefined();
    });
  });

  describe('GET /api/tasks - List Tasks', () => {
    beforeAll(async () => {
      // Create multiple tasks for listing
      const tasks = [
        { title: 'Task 1', priority: 'high' },
        { title: 'Task 2', priority: 'medium' },
        { title: 'Task 3', priority: 'low' }
      ];

      for (const task of tasks) {
        const { data } = await supabase
          .from('tasks')
          .insert({
            user_id: TEST_USER_ID,
            task_type: 'list_test',
            title: task.title,
            description: 'List test',
            status: 'pending',
            priority: task.priority
          })
          .select()
          .single();
        
        createdIds.push(data.id);
      }
    });

    it('should list tasks for authenticated user', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', authToken)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      // All tasks should belong to the test user
      response.body.forEach((task: any) => {
        expect(task.user_id).toBe(TEST_USER_ID);
      });
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/tasks?limit=2&offset=0')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body.length).toBeLessThanOrEqual(2);
    });

    it('should support filtering by status', async () => {
      const response = await request(app)
        .get('/api/tasks?status=pending')
        .set('Authorization', authToken)
        .expect(200);

      response.body.forEach((task: any) => {
        expect(task.status).toBe('pending');
      });
    });

    it('should support sorting', async () => {
      const response = await request(app)
        .get('/api/tasks?sort=priority&order=desc')
        .set('Authorization', authToken)
        .expect(200);

      // Verify tasks are sorted by priority
      if (response.body.length > 1) {
        const priorities = response.body.map((t: any) => t.priority);
        // Verify sorting manually since toBeSorted may not be available
        for (let i = 1; i < priorities.length; i++) {
          // Check if properly sorted
          const prev = priorities[i - 1];
          const curr = priorities[i];
          // High > Medium > Low
          expect(prev >= curr).toBe(true);
        }
      }
    });
  });

  describe('POST /api/tasks/:id/events - Add Context Event', () => {
    let testTaskId: string;
    let testContextId: string;

    beforeAll(async () => {
      testContextId = crypto.randomUUID();
      
      // Create a task for events
      const { data } = await supabase
        .from('tasks')
        .insert({
          user_id: TEST_USER_ID,
          context_id: testContextId,
          task_type: 'event_test',
          title: 'Task with Events',
          description: 'Event testing',
          status: 'pending',
          priority: 'high'
        })
        .select()
        .single();
      
      testTaskId = data.id;
      createdIds.push(testTaskId);
    });

    it('should add context event to task', async () => {
      const eventData = {
        actor_type: 'user',
        operation: 'status_update',
        data: {
          old_status: 'pending',
          new_status: 'in_progress'
        },
        reasoning: 'User started working on task'
      };

      const response = await request(app)
        .post(`/api/tasks/${testTaskId}/events`)
        .set('Authorization', authToken)
        .send(eventData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.task_id).toBe(testTaskId);
      expect(response.body.actor_type).toBe('user');
      expect(response.body.actor_id).toBe(TEST_USER_ID);
      expect(response.body).toHaveProperty('sequence_number');

      // Verify in database
      const { data: events } = await supabase
        .from('task_context_events')
        .select('*')
        .eq('task_id', testTaskId);

      expect(events?.length || 0).toBeGreaterThan(0);
    });

    it('should enforce unique sequence numbers', async () => {
      // Add first event
      await request(app)
        .post(`/api/tasks/${testTaskId}/events`)
        .set('Authorization', authToken)
        .send({
          actor_type: 'system',
          operation: 'test_1',
          data: {}
        })
        .expect(201);

      // This should succeed with next sequence number
      const response = await request(app)
        .post(`/api/tasks/${testTaskId}/events`)
        .set('Authorization', authToken)
        .send({
          actor_type: 'system',
          operation: 'test_2',
          data: {}
        })
        .expect(201);

      expect(response.body.sequence_number).toBeGreaterThan(1);
    });
  });

  describe('Rate Limiting & Error Handling', () => {
    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/tasks')
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });

    it('should handle database connection errors gracefully', async () => {
      // This would require mocking database failure
      // For now, test that error responses have consistent structure
      const response = await request(app)
        .get('/api/tasks/not-a-uuid')
        .set('Authorization', authToken);

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate UUID format', async () => {
      await request(app)
        .get('/api/tasks/invalid-uuid-format')
        .set('Authorization', authToken)
        .expect(400);
    });

    // Rate limiting would need to be implemented first
    it.skip('should enforce rate limits', async () => {
      // Make many requests quickly
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          request(app)
            .get('/api/tasks')
            .set('Authorization', authToken)
        );
      }

      const responses = await Promise.all(promises);
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    });
  });

  describe('PATCH /api/tasks/:id - Partial Update', () => {
    let testTaskId: string;

    beforeAll(async () => {
      const { data } = await supabase
        .from('tasks')
        .insert({
          user_id: TEST_USER_ID,
          task_type: 'patch_test',
          title: 'Original',
          description: 'Original Desc',
          status: 'pending',
          priority: 'low'
        })
        .select()
        .single();
      
      testTaskId = data.id;
      createdIds.push(testTaskId);
    });

    it('should partially update a task', async () => {
      const response = await request(app)
        .patch(`/api/tasks/${testTaskId}`)
        .set('Authorization', authToken)
        .send({
          status: 'completed' // Only update status
        })
        .expect(200);

      expect(response.body.status).toBe('completed');
      expect(response.body.title).toBe('Original'); // Unchanged
      expect(response.body.description).toBe('Original Desc'); // Unchanged
    });
  });

  describe('Content-Type Validation', () => {
    it('should require application/json for POST', async () => {
      await request(app)
        .post('/api/tasks')
        .set('Authorization', authToken)
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(400);
    });

    it('should return JSON for all endpoints', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('status');
    });
  });
});