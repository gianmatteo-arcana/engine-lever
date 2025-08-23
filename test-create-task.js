/**
 * Create a test task to observe agent delegation
 */

const http = require('http');

async function createTestTask() {
  console.log('Creating test task to observe agent delegation...\n');
  
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      template_type: 'us_general_business_onboarding',
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
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJpYXQiOjE3NTU4MzA4MTMsImV4cCI6MTc1NTgzNDQxM30.scUhGtzAH7aYuVBpQg7Pzh-6SPp9fT4HqU8iTo9FTvI'
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