#!/usr/bin/env node

const axios = require('axios');

const TASK_ID = process.argv[2] || '2a1783c4-e7b2-41f8-8c02-fdd72eb55b07';
const API_URL = 'http://localhost:3001/api/tasks/process-pending';

async function processPendingTask() {
  console.log(`\nProcessing task: ${TASK_ID}\n`);
  
  try {
    const response = await axios.post(API_URL, {}, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Task processing triggered');
    console.log('Response:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('❌ Error:', error.response.data);
    } else {
      console.error('❌ Failed to trigger processing:', error.message);
    }
  }
}

processPendingTask();