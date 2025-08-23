/**
 * Create a test task to observe agent delegation
 */

const http = require('http');

async function createTestTask() {
  console.log('Creating test task to observe agent delegation...\n');
  
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      task_type: 'onboarding',
      template_id: 'onboarding',
      metadata: {
        user_intent: 'Testing agent delegation',
        test_run: true,
        timestamp: new Date().toISOString()
      }
    });
    
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/tasks',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4ZThlYTdiZC1iN2ZiLTRlNzctOGUzNC1hYTU1MWZlMjY5MzQiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImlhdCI6MTc1NTkyNTYwMCwiZXhwIjoxNzU1OTI5MjAwfQ.BdWfhoBV9L7Y3HKdvwKGaop_NBt5fRZSrNjJRm_sjig'
      }
    };
    
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          
          if (res.statusCode === 200) {
            console.log('✅ Task created successfully');
            console.log('Task ID:', result.task.id);
            console.log('Title:', result.task.title);
            console.log('Status:', result.task.status);
            console.log('\nNow check the backend logs for agent delegation activity...');
            resolve(result);
          } else {
            console.error('❌ Failed to create task:', result.error);
            reject(result.error);
          }
        } catch (e) {
          console.error('Failed to parse response:', e);
          reject(e);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('Error creating task:', error);
      reject(error);
    });
    
    req.write(data);
    req.end();
  });
}

createTestTask();