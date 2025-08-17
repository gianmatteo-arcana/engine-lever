// Test backend API directly
// Node 18+ has built-in fetch

async function testBackendAPI() {
  console.log('Testing Backend API...\n');
  
  // 1. Test health endpoint
  console.log('1. Testing /health endpoint:');
  try {
    const healthResponse = await fetch('https://biz-buddy-backend-production.up.railway.app/health');
    const healthData = await healthResponse.json();
    console.log('   Status:', healthResponse.status);
    console.log('   Data:', JSON.stringify(healthData, null, 2));
  } catch (error) {
    console.log('   ERROR:', error.message);
  }
  
  // 2. Test tasks endpoint without auth (should fail)
  console.log('\n2. Testing /api/tasks without auth (should fail):');
  try {
    const response = await fetch('https://biz-buddy-backend-production.up.railway.app/api/tasks');
    console.log('   Status:', response.status);
    const text = await response.text();
    console.log('   Response:', text);
  } catch (error) {
    console.log('   ERROR:', error.message);
  }
  
  // 3. Test tasks endpoint with dummy auth (to see error format)
  console.log('\n3. Testing /api/tasks with dummy token:');
  try {
    const response = await fetch('https://biz-buddy-backend-production.up.railway.app/api/tasks', {
      headers: {
        'Authorization': 'Bearer dummy-token-for-testing',
        'Content-Type': 'application/json'
      }
    });
    console.log('   Status:', response.status);
    const text = await response.text();
    console.log('   Response:', text);
  } catch (error) {
    console.log('   ERROR:', error.message);
  }
}

testBackendAPI();