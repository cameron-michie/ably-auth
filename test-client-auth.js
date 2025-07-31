import * as Ably from 'ably';
import { ChatClient } from '@ably/chat';
import Objects from 'ably/objects';

async function testClientAuth() {
  console.log('Testing client authentication like in the app...');
  
  const authOptions = {
    authCallback: async (tokenParams, callback) => {
      try {
        console.log('Requesting token for user: test_user_123');
        const response = await fetch('http://localhost:3000/auth', {
          method: 'GET',
          headers: {
            'x-user-id': 'test_user_123',
            'x-user-full-name': 'Test User',
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const tokenDetails = await response.json();
        console.log('Token received successfully');
        console.log('Token details being passed to callback:', JSON.stringify(tokenDetails, null, 2));
        callback(null, tokenDetails);
      } catch (error) {
        console.error('Token request failed:', error);
        callback(error, null);
      }
    },
  };

  try {
    console.log('1. Creating Ably Realtime client with authCallback...');
    const ablyClient = new Ably.Realtime({
      ...authOptions,
      plugins: { Objects },
      log: { level: 4 } // Enable debug logging
    });

    // Wait for connection
    await new Promise((resolve, reject) => {
      ablyClient.connection.on('connected', () => {
        console.log('✅ Ably client connected successfully');
        resolve();
      });
      
      ablyClient.connection.on('failed', (error) => {
        console.error('❌ Ably client connection failed:', error);
        reject(error);
      });
      
      ablyClient.connection.on('disconnected', (error) => {
        console.error('❌ Ably client disconnected:', error);
        reject(error);
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);
    });

    console.log('✅ Authentication successful!');
    console.log('Client ID:', ablyClient.auth.clientId);
    
    // Test ChatClient
    console.log('\n2. Testing ChatClient...');
    const chatClient = new ChatClient(ablyClient);
    console.log('✅ ChatClient created successfully');
    
    ablyClient.close();
    
  } catch (error) {
    console.error('❌ Authentication failed:', error);
    console.error('Error details:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  }
}

testClientAuth().catch(console.error);