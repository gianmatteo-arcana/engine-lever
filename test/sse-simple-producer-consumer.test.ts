/**
 * Simple SSE Producer/Consumer Test
 * Producer adds events → Consumer reads them over authenticated SSE
 */

import express from 'express';
import { EventEmitter } from 'events';
import http from 'http';
import { EventSource } from 'eventsource';

describe('Simple SSE Producer/Consumer', () => {
  let app: express.Application;
  let server: http.Server;
  let port: number;
  const eventBus = new EventEmitter();

  beforeAll((done) => {
    app = express();
    
    // Simple SSE endpoint
    app.get('/events', (req, res) => {
      const auth = req.query.auth;
      
      // Simple auth check
      if (auth !== 'valid-token') {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      // Send initial connection event
      res.write('event: connected\n');
      res.write('data: {"status":"connected"}\n\n');

      // Listen for events on the bus
      const handleEvent = (data: any) => {
        res.write(`event: message\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      eventBus.on('new-event', handleEvent);

      // Clean up on disconnect
      req.on('close', () => {
        eventBus.removeListener('new-event', handleEvent);
        res.end();
      });
    });

    server = app.listen(0, () => {
      port = (server.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('Producer sends events → Consumer receives them via authenticated SSE', (done) => {
    const receivedEvents: any[] = [];
    let timeoutId: NodeJS.Timeout;
    
    // CONSUMER: Connect with auth
    const eventSource = new EventSource(`http://localhost:${port}/events?auth=valid-token`);
    
    eventSource.onopen = () => {
      console.log('Consumer: Connected to SSE');
      
      // PRODUCER: Start sending events after connection
      setTimeout(() => {
        console.log('Producer: Sending event 1');
        eventBus.emit('new-event', { id: 1, message: 'First event' });
        
        setTimeout(() => {
          console.log('Producer: Sending event 2');
          eventBus.emit('new-event', { id: 2, message: 'Second event' });
          
          setTimeout(() => {
            console.log('Producer: Sending event 3');
            eventBus.emit('new-event', { id: 3, message: 'Third event' });
          }, 100);
        }, 100);
      }, 100);
    };

    eventSource.addEventListener('message', (event: any) => {
      const data = JSON.parse(event.data);
      console.log('Consumer: Received event', data);
      receivedEvents.push(data);
      
      // After receiving 3 events, verify and close
      if (receivedEvents.length === 3) {
        clearTimeout(timeoutId);
        expect(receivedEvents[0]).toEqual({ id: 1, message: 'First event' });
        expect(receivedEvents[1]).toEqual({ id: 2, message: 'Second event' });
        expect(receivedEvents[2]).toEqual({ id: 3, message: 'Third event' });
        
        eventSource.close();
        done();
      }
    });

    eventSource.onerror = (error: any) => {
      clearTimeout(timeoutId);
      console.error('Consumer: Error', error);
      eventSource.close();
      done(new Error('SSE connection failed'));
    };

    // Timeout safety
    timeoutId = setTimeout(() => {
      eventSource.close();
      if (receivedEvents.length === 3) {
        // Test actually passed, just timing issue
        done();
      } else {
        done(new Error(`Test timeout - received ${receivedEvents.length}/3 events`));
      }
    }, 5000);
  });

  it('Unauthenticated consumer is rejected', (done) => {
    const eventSource = new EventSource(`http://localhost:${port}/events?auth=invalid`);
    
    eventSource.addEventListener('message', () => {
      eventSource.close();
      done(new Error('Should not receive events without auth'));
    });

    eventSource.onerror = () => {
      // Expected - connection should fail
      eventSource.close();
      done();
    };

    // Producer sends event (should not be received)
    setTimeout(() => {
      eventBus.emit('new-event', { message: 'Should not be received' });
    }, 100);

    // Timeout safety - test passes if no events received
    setTimeout(() => {
      eventSource.close();
      done();
    }, 2000);
  });
});