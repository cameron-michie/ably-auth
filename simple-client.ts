// Simple Client - Gets token from auth server and publishes a message
import * as Ably from 'ably';

// Configuration
const AUTH_SERVER_URL = 'http://localhost:3002/auth';
const USER_ID = 'user_456';
const USER_NAME = 'Alice Johnson';

// Types
interface AuthResponse {
  token: string;
  keyName: string;
  issued: number;
  expires: number;
  capability: string;
  clientId: string;
}

interface MessageData {
  text: string;
  timestamp: string;
  userId: string;
}

async function main(): Promise<void> {
  try {
    console.log('🔑 Step 1: Requesting token from auth server...');

    // Request token from auth server using authUrl pattern
    const response = await fetch(AUTH_SERVER_URL, {
      method: 'GET',
      headers: {
        'X-User-Id': USER_ID,
        'X-User-Name': USER_NAME,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Auth server responded with ${response.status}: ${response.statusText}`);
    }

    const tokenDetails = await response.json() as AuthResponse;
    var str = JSON.stringify(tokenDetails, null, 2);
    console.log(`✅ Received token: ${str}`);

    console.log('\n🔌 Step 2: Connecting to Ably with token...');

    // Create Ably client using the token
    const ably = new Ably.Realtime({
      authUrl: AUTH_SERVER_URL,
      authHeaders: {
        'X-User-Id': USER_ID,
        'X-User-Name': USER_NAME
      },
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      ably.connection.on('connected', () => {
        console.log('✅ Connected to Ably successfully!');
        console.log(`   Client ID: ${ably.auth.clientId} `);
        resolve();
      });

      ably.connection.on('failed', (error) => {
        console.error('❌ Connection failed:', error);
        reject(error);
      });

      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });

    console.log('\n📤 Step 3: Publishing message to roomslist channel...');

    // Get the channel and publish a message
    const channelName = `roomslist:${USER_ID}`;
    const channel = ably.channels.get(channelName);

    const messageData: MessageData = {
      text: 'Hello from the simple client!',
      timestamp: new Date().toISOString(),
      userId: USER_ID
    };

    await channel.publish('message', messageData);
    console.log(`✅ Message published to channel: ${channelName} `);
    console.log(`   Message: ${JSON.stringify(messageData, null, 2)} `);

    console.log('\n🤝 Step 4: Joining presence set for "presence" channel...');

    // Get the presence channel and enter the set
    const presenceChannel = ably.channels.get('presence');
    await presenceChannel.presence.enter();
    console.log('✅ Successfully entered presence set.');

    console.log('\n🎉 All done! Closing connection...');
    ably.close();

  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
    process.exit(1);
  }
}

// Run the client
console.log('🚀 Starting Simple Ably Client');
console.log(`👤 User: ${USER_NAME} (${USER_ID})`);
console.log(`🔗 Auth Server: ${AUTH_SERVER_URL} `);
console.log('');

main().catch(console.error);
