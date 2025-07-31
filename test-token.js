import * as Ably from 'ably';

const ABLY_API_KEY = "ALwA2Q.4QI37w:D_h8yJGTdcH5Xp8ZB9d7Tt9Zbp7QjfuXTdAL3HLBV1Y";

async function testTokenGeneration() {
  console.log('Testing Ably token generation...');
  
  const ablyRest = new Ably.Rest({ key: ABLY_API_KEY });
  
  // Simple capabilities first
  const simpleCapabilities = {
    '*': ['publish', 'subscribe']
  };
  
  // Complex capabilities like in the server
  const userId = 'test_user_123';
  const complexCapabilities = {
    [`roomslist:${userId}`]: ['publish', 'subscribe', 'history', 'object_subscribe', 'object_publish'],
    'profile:*': ['subscribe'],
    [`profile:${userId}`]: ['publish', 'subscribe', 'history'],
    [`room-*${userId}*-dm`]: ['publish', 'subscribe', 'history', 'presence'],
    [`chat:room-*${userId}*-dm`]: ['publish', 'subscribe', 'history', 'presence'],
    [`chat:*${userId}*`]: ['publish', 'subscribe', 'history', 'presence'],
    'presence': ['presence', 'publish', 'subscribe'],
  };
  
  try {
    console.log('1. Testing simple capabilities...');
    const simpleTokenRequest = await ablyRest.auth.createTokenRequest({
      clientId: 'test-client',
      capability: simpleCapabilities,
      ttl: 3600000
    });
    
    console.log('✅ Simple token request created successfully');
    console.log('Token request:', JSON.stringify(simpleTokenRequest, null, 2));
    
    // Now test with a real Ably client using this token
    console.log('\n2. Testing token with Ably client...');
    const ablyWithToken = new Ably.Rest({
      authUrl: `data:application/json,${JSON.stringify(simpleTokenRequest)}`,
      authMethod: 'GET'
    });
    
    // Try to get time to test connection
    const serverTime = await ablyWithToken.time();
    console.log('✅ Token works! Server time:', new Date(serverTime));
    
    console.log('\n3. Testing complex capabilities...');
    const complexTokenRequest = await ablyRest.auth.createTokenRequest({
      clientId: 'Test_User.test_user_123',
      capability: complexCapabilities,
      ttl: 3600000
    });
    
    console.log('✅ Complex token request created successfully');
    console.log('Complex token request:', JSON.stringify(complexTokenRequest, null, 2));
    
    // Test complex token
    const ablyWithComplexToken = new Ably.Rest({
      authUrl: `data:application/json,${JSON.stringify(complexTokenRequest)}`,
      authMethod: 'GET'
    });
    
    const serverTime2 = await ablyWithComplexToken.time();
    console.log('✅ Complex token works! Server time:', new Date(serverTime2));
    
  } catch (error) {
    console.error('❌ Token generation failed:', error);
    console.error('Error details:', error.message);
    console.error('Stack:', error.stack);
  }
}

testTokenGeneration().catch(console.error);