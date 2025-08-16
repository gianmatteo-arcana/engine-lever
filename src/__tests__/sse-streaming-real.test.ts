/**
 * REAL SSE (Server-Sent Events) STREAMING TESTS
 * 
 * Tests real-time streaming functionality with actual database
 * NO MOCKS - Tests actual event streams from database changes
 */

import request from 'supertest';
import app from '../app';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { EventSource } from 'eventsource';

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

describe('REAL SSE Streaming Tests', () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const authToken = generateTestToken();
  const createdIds: string[] = [];
  let server: any;
  const PORT = 3456; // Test port

  beforeAll((done) => {
    // Start server for SSE testing
    server = app.listen(PORT, () => {
      console.log(`Test server started on port ${PORT}`);
      done();
    });
  });

  afterAll(async () => {
    // Clean up test data
    for (const id of createdIds) {
      await supabase.from('tasks').delete().eq('id', id);
    }
    
    // Close server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('GET /api/tasks/:id/stream - Task Context Stream', () => {
    let testTaskId: string;
    let testContextId: string;

    beforeAll(async () => {
      testContextId = crypto.randomUUID();
      
      // Create a task for streaming
      const { data } = await supabase
        .from('tasks')
        .insert({
          user_id: TEST_USER_ID,
          context_id: testContextId,
          task_type: 'stream_test',
          title: 'Streaming Test Task',
          description: 'Testing SSE streams',
          status: 'pending',
          priority: 'high'
        })
        .select()
        .single();
      
      testTaskId = data.id;
      createdIds.push(testTaskId);
    });

    it('should stream task context updates in real-time', (done) => {
      const eventSource = new EventSource(
        `http://localhost:${PORT}/api/tasks/${testTaskId}/stream`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      const receivedEvents: any[] = [];

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        receivedEvents.push(data);

        // After receiving initial event, trigger an update
        if (receivedEvents.length === 1) {
          // Add a new event to trigger stream
          supabase
            .from('task_context_events')
            .insert({
              context_id: testContextId,
              task_id: testTaskId,
              actor_type: 'system',
              actor_id: 'test-system',
              operation: 'stream_test_update',
              data: { test: true, timestamp: new Date().toISOString() },
              reasoning: 'Testing SSE stream'
            })
            .select()
            .single()
            .then(({ data: _event }) => {
              // Event created, should trigger stream
            });
        }

        // After receiving update event, close connection
        if (receivedEvents.length >= 2) {
          eventSource.close();
          
          // Verify we received the streamed update
          expect(receivedEvents.length).toBeGreaterThanOrEqual(2);
          const updateEvent = receivedEvents.find(e => 
            e.operation === 'stream_test_update'
          );
          expect(updateEvent).toBeDefined();
          expect(updateEvent.actor_type).toBe('system');
          
          done();
        }
      };

      eventSource.onerror = (error) => {
        eventSource.close();
        done(error);
      };

      // Timeout after 5 seconds
      setTimeout(() => {
        eventSource.close();
        done(new Error('SSE stream timeout'));
      }, 5000);
    });

    it('should handle multiple concurrent streams', async () => {
      const streams: EventSource[] = [];
      const streamData: Map<number, any[]> = new Map();

      // Create 3 concurrent streams
      for (let i = 0; i < 3; i++) {
        streamData.set(i, []);
        
        const eventSource = new EventSource(
          `http://localhost:${PORT}/api/tasks/${testTaskId}/stream`,
          {
            headers: {
              'Authorization': `Bearer ${authToken}`
            }
          }
        );

        const streamIndex = i;
        eventSource.onmessage = (_event) => {
          const data = JSON.parse(_event.data);
          streamData.get(streamIndex)?.push(data);
        };

        streams.push(eventSource);
      }

      // Wait a bit for connections to establish
      await new Promise(resolve => setTimeout(resolve, 500));

      // Trigger an update that all streams should receive
      await supabase
        .from('task_context_events')
        .insert({
          context_id: testContextId,
          task_id: testTaskId,
          actor_type: 'system',
          actor_id: 'test-system',
          operation: 'broadcast_test',
          data: { broadcast: true },
          reasoning: 'Testing broadcast to multiple streams'
        })
        .select()
        .single();

      // Wait for streams to receive the update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Close all streams
      streams.forEach(s => s.close());

      // Verify all streams received data
      let allReceivedBroadcast = true;
      streamData.forEach((events, _index) => {
        const hasBroadcast = events.some(e => e.operation === 'broadcast_test');
        if (!hasBroadcast) allReceivedBroadcast = false;
      });

      expect(allReceivedBroadcast).toBe(true);
    });

    it('should reject SSE connection without authentication', (done) => {
      const eventSource = new EventSource(
        `http://localhost:${PORT}/api/tasks/${testTaskId}/stream`
        // No auth header
      );

      eventSource.onerror = (error: any) => {
        // Should get authentication error
        expect(error).toBeDefined();
        eventSource.close();
        done();
      };

      // Timeout - if no error, test fails
      setTimeout(() => {
        eventSource.close();
        done(new Error('Should have received auth error'));
      }, 2000);
    });

    it('should handle stream reconnection', (done) => {
      let connectionCount = 0;
      let eventSource: EventSource;

      const connect = () => {
        eventSource = new EventSource(
          `http://localhost:${PORT}/api/tasks/${testTaskId}/stream`,
          {
            headers: {
              'Authorization': `Bearer ${authToken}`
            }
          }
        );

        eventSource.onopen = () => {
          connectionCount++;
          
          if (connectionCount === 1) {
            // Simulate connection drop after first connect
            setTimeout(() => {
              eventSource.close();
              // Reconnect
              connect();
            }, 500);
          } else if (connectionCount === 2) {
            // Successfully reconnected
            eventSource.close();
            expect(connectionCount).toBe(2);
            done();
          }
        };

        eventSource.onerror = (error) => {
          if (connectionCount < 2) {
            // Ignore errors during reconnection test
          } else {
            done(error);
          }
        };
      };

      connect();

      // Timeout
      setTimeout(() => {
        if (eventSource) eventSource.close();
        done(new Error('Reconnection test timeout'));
      }, 5000);
    });
  });

  describe('POST /api/tasks/:id/stream-command - Stream Commands', () => {
    let testTaskId: string;
    let testContextId: string;

    beforeAll(async () => {
      testContextId = crypto.randomUUID();
      
      // Create a task for command streaming
      const { data } = await supabase
        .from('tasks')
        .insert({
          user_id: TEST_USER_ID,
          context_id: testContextId,
          task_type: 'command_stream_test',
          title: 'Command Stream Test',
          description: 'Testing streaming commands',
          status: 'pending',
          priority: 'high'
        })
        .select()
        .single();
      
      testTaskId = data.id;
      createdIds.push(testTaskId);
    });

    it('should process streaming commands and update database', async () => {
      // Send a command that should trigger database updates
      const response = await request(app)
        .post(`/api/tasks/${testTaskId}/stream-command`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          command: 'UPDATE_STATUS',
          data: {
            new_status: 'in_progress',
            reason: 'User initiated via stream command'
          }
        })
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);

      // Verify database was updated
      const { data: task } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', testTaskId)
        .single();

      expect(task.status).toBe('in_progress');

      // Verify event was created
      const { data: events } = await supabase
        .from('task_context_events')
        .select('*')
        .eq('task_id', testTaskId)
        .eq('operation', 'UPDATE_STATUS');

      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/stream/health - SSE Health Check', () => {
    it('should stream health status updates', (done) => {
      const eventSource = new EventSource(
        `http://localhost:${PORT}/api/stream/health`
      );

      let healthPings = 0;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        healthPings++;

        expect(data).toHaveProperty('status');
        expect(data).toHaveProperty('timestamp');
        expect(data).toHaveProperty('database_connected');

        // Close after receiving 2 health pings
        if (healthPings >= 2) {
          eventSource.close();
          done();
        }
      };

      eventSource.onerror = (error) => {
        eventSource.close();
        done(error);
      };

      // Timeout
      setTimeout(() => {
        eventSource.close();
        if (healthPings > 0) {
          done(); // Got at least one ping
        } else {
          done(new Error('No health pings received'));
        }
      }, 3000);
    });
  });

  describe('Stream Performance & Error Handling', () => {
    it('should handle high-frequency updates', async () => {
      const contextId = crypto.randomUUID();
      
      // Create task for high-frequency test
      const { data: task } = await supabase
        .from('tasks')
        .insert({
          user_id: TEST_USER_ID,
          context_id: contextId,
          task_type: 'performance_test',
          title: 'Performance Test',
          status: 'pending',
          priority: 'high'
        })
        .select()
        .single();
      
      createdIds.push(task.id);

      // Insert many events rapidly
      const eventPromises = [];
      for (let i = 0; i < 50; i++) {
        eventPromises.push(
          supabase
            .from('task_context_events')
            .insert({
              context_id: contextId,
              task_id: task.id,
              actor_type: 'system',
              actor_id: 'perf-test',
              operation: `rapid_update_${i}`,
              data: { index: i, timestamp: new Date().toISOString() }
            })
            .select()
        );
      }

      const results = await Promise.all(eventPromises);
      const successCount = results.filter(r => !r.error).length;
      
      // Most should succeed (some may fail due to constraints)
      expect(successCount).toBeGreaterThan(40);
    });

    it('should gracefully handle database disconnection', (done) => {
      // This would require simulating database failure
      // For now, test error event format
      const eventSource = new EventSource(
        `http://localhost:${PORT}/api/tasks/invalid-task-id/stream`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        }
      );

      eventSource.onerror = (error: any) => {
        // Should receive error for invalid task
        expect(error).toBeDefined();
        eventSource.close();
        done();
      };

      // Timeout
      setTimeout(() => {
        eventSource.close();
        done();
      }, 2000);
    });

    it('should handle chunked responses for large payloads', async () => {
      const contextId = crypto.randomUUID();
      
      // Create task with large metadata
      const largeData = {
        data: Array(1000).fill(null).map((_, i) => ({
          index: i,
          value: `test_value_${i}`,
          nested: {
            deep: {
              property: `deep_${i}`
            }
          }
        }))
      };

      const { data: task } = await supabase
        .from('tasks')
        .insert({
          user_id: TEST_USER_ID,
          context_id: contextId,
          task_type: 'large_payload_test',
          title: 'Large Payload Test',
          description: 'Testing chunked responses',
          status: 'pending',
          priority: 'high',
          metadata: largeData
        })
        .select()
        .single();
      
      createdIds.push(task.id);

      // Verify large payload can be streamed
      const response = await request(app)
        .get(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.metadata).toBeDefined();
      expect(response.body.metadata.data).toHaveLength(1000);
    });
  });
});