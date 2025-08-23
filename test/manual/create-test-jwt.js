/**
 * Create a test JWT for E2E testing
 */

const jwt = require('jsonwebtoken');

// Create a test JWT with the proper structure
const payload = {
  sub: '8e8ea7bd-b7fb-4e77-8e34-aa551fe26934', // Existing user from database
  email: 'test@example.com',
  role: 'authenticated',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour expiry
};

// Use a test secret
const secret = 'test-secret-key';

const token = jwt.sign(payload, secret);

console.log('Test JWT Token:');
console.log(token);
console.log('\nDecoded payload:');
console.log(JSON.stringify(payload, null, 2));