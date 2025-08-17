// Test backend authentication directly
const fs = require('fs');
const path = require('path');

async function testBackendAuth() {
  console.log('🔍 Testing Backend Authentication\n');
  console.log('=' .repeat(50) + '\n');
  
  // Read the stored auth state to get a valid token
  const authStatePath = path.join(__dirname, '../biz-buddy-e2e-tests/.auth/user-state.json');
  
  let accessToken;
  try {
    const authState = JSON.parse(fs.readFileSync(authStatePath, 'utf8'));
    
    // Find the localStorage entry with the auth token
    const localStorageEntry = authState.origins?.[0]?.localStorage?.find(
      item => item.name === 'sb-raenkewzlvrdqufwxjpl-auth-token'
    );
    
    if (localStorageEntry) {
      const authData = JSON.parse(localStorageEntry.value);
      accessToken = authData.access_token;
      console.log('✅ Found access token from stored auth state');
      console.log('   Token preview:', accessToken.substring(0, 50) + '...');
      console.log('   User:', authData.user?.email);
      console.log('   Expires:', new Date(authData.expires_at * 1000).toLocaleString());
    } else {
      console.log('❌ No auth token found in stored state');
      return;
    }
  } catch (error) {
    console.log('❌ Failed to read auth state:', error.message);
    return;
  }
  
  // Test the token directly against the backend
  console.log('\n1️⃣ Testing /health endpoint (no auth required)...\n');
  
  try {
    const healthResponse = await fetch('https://biz-buddy-backend-production.up.railway.app/health');
    console.log('   Status:', healthResponse.status);
    const healthData = await healthResponse.json();
    console.log('   Data:', JSON.stringify(healthData, null, 2));
  } catch (error) {
    console.log('   ERROR:', error.message);
  }
  
  console.log('\n2️⃣ Testing /api/tasks with our token...\n');
  
  try {
    const response = await fetch('https://biz-buddy-backend-production.up.railway.app/api/tasks', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('   Status:', response.status);
    
    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = responseText;
    }
    
    if (response.status === 200) {
      console.log('   ✅ SUCCESS! Tasks retrieved');
      console.log('   Response:', JSON.stringify(data, null, 2).substring(0, 500));
    } else {
      console.log('   ❌ Failed with status', response.status);
      console.log('   Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.log('   ERROR:', error.message);
  }
  
  // Also test JWT validation endpoint if it exists
  console.log('\n3️⃣ Testing token validation (if endpoint exists)...\n');
  
  try {
    const response = await fetch('https://biz-buddy-backend-production.up.railway.app/api/auth/validate', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('   Status:', response.status);
    if (response.status === 200) {
      const data = await response.json();
      console.log('   Valid token! User:', data);
    } else if (response.status === 404) {
      console.log('   Validation endpoint not found (expected)');
    } else {
      console.log('   Token validation failed');
    }
  } catch (error) {
    console.log('   ERROR:', error.message);
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('🏁 Test complete\n');
}

testBackendAuth().catch(console.error);