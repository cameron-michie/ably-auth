import * as Ably from 'ably';
import { startAuthServer, stopAuthServer } from '../auth.ts';
import http from 'http';

describe('Ably Token Authentication Tests', () => {
  let authServer: http.Server;
  let ablyRest: Ably.Rest;

  const ABLY_API_KEY = process.env.ABLY_API_KEY!;
  const AUTH_SERVER_PORT = process.env.AUTH_SERVER_PORT || '3000';
  const TEST_USER_ID = process.env.TEST_USER_ID || 'test_user_123';
  const TEST_USER_FULL_NAME = process.env.TEST_USER_FULL_NAME || 'Test User';

  beforeAll(async () => {
    if (!ABLY_API_KEY) {
      throw new Error('ABLY_API_KEY environment variable is required for tests');
    }
    
    ablyRest = new Ably.Rest({ key: ABLY_API_KEY });
    authServer = await startAuthServer();
    
    // Wait a bit for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    stopAuthServer();
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  describe('Token Generation with Custom Capabilities', () => {
    test('should generate token with comprehensive user-specific capabilities', async () => {
      const response = await fetch(`http://localhost:${AUTH_SERVER_PORT}/auth`, {
        method: 'GET',
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-user-full-name': TEST_USER_FULL_NAME,
        },
      });

      expect(response.ok).toBe(true);
      const tokenDetails = await response.json() as any;

      // Verify token structure
      expect(tokenDetails).toHaveProperty('token');
      expect(tokenDetails).toHaveProperty('keyName');
      expect(tokenDetails).toHaveProperty('issued');
      expect(tokenDetails).toHaveProperty('expires');
      expect(tokenDetails).toHaveProperty('capability');
      expect(tokenDetails).toHaveProperty('clientId');

      // Verify client ID format
      const expectedClientId = `${TEST_USER_FULL_NAME.replace(/\\s+/g, '_')}.${TEST_USER_ID}`;
      expect(tokenDetails.clientId).toBe(expectedClientId);

      // Parse and verify capabilities
      const capabilities = JSON.parse(tokenDetails.capability);
      
      // Check user-specific capabilities
      expect(capabilities).toHaveProperty(`roomslist:${TEST_USER_ID}`);
      expect(capabilities[`roomslist:${TEST_USER_ID}`]).toContain('publish');
      expect(capabilities[`roomslist:${TEST_USER_ID}`]).toContain('subscribe');
      expect(capabilities[`roomslist:${TEST_USER_ID}`]).toContain('history');
      expect(capabilities[`roomslist:${TEST_USER_ID}`]).toContain('object-subscribe');
      expect(capabilities[`roomslist:${TEST_USER_ID}`]).toContain('object-publish');

      // Check profile capabilities
      expect(capabilities).toHaveProperty('profile:*');
      expect(capabilities['profile:*']).toContain('subscribe');
      expect(capabilities).toHaveProperty(`profile:${TEST_USER_ID}`);
      expect(capabilities[`profile:${TEST_USER_ID}`]).toContain('publish');
      expect(capabilities[`profile:${TEST_USER_ID}`]).toContain('subscribe');
      expect(capabilities[`profile:${TEST_USER_ID}`]).toContain('history');

      // Check chat capabilities (both directions)
      expect(capabilities).toHaveProperty(`*:${TEST_USER_ID}`);
      expect(capabilities[`*:${TEST_USER_ID}`]).toContain('publish');
      expect(capabilities[`*:${TEST_USER_ID}`]).toContain('subscribe');
      expect(capabilities[`*:${TEST_USER_ID}`]).toContain('history');
      expect(capabilities[`*:${TEST_USER_ID}`]).toContain('presence');

      expect(capabilities).toHaveProperty(`${TEST_USER_ID}:*`);
      expect(capabilities[`${TEST_USER_ID}:*`]).toContain('publish');
      expect(capabilities[`${TEST_USER_ID}:*`]).toContain('subscribe');
      expect(capabilities[`${TEST_USER_ID}:*`]).toContain('history');
      expect(capabilities[`${TEST_USER_ID}:*`]).toContain('presence');

      // Check global presence
      expect(capabilities).toHaveProperty('presence');
      expect(capabilities['presence']).toContain('presence');
      expect(capabilities['presence']).toContain('publish');
      expect(capabilities['presence']).toContain('subscribe');

      // Check fallback capability
      expect(capabilities).toHaveProperty('*');
      expect(capabilities['*']).toContain('subscribe');
    });

    test('should work with Ably client using generated token', async () => {
      // Get token from auth server
      const response = await fetch(`http://localhost:${AUTH_SERVER_PORT}/auth`, {
        method: 'GET', 
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-user-full-name': TEST_USER_FULL_NAME,
        },
      });

      expect(response.ok).toBe(true);
      const tokenDetails = await response.json() as any;

      // Create Ably client with token
      const ablyWithToken = new Ably.Rest({
        token: tokenDetails.token,
        clientId: tokenDetails.clientId
      });

      // Test that token works by calling Ably API
      const serverTime = await ablyWithToken.time();
      expect(serverTime).toBeGreaterThan(0);
      expect(ablyWithToken.auth.clientId).toBe(tokenDetails.clientId);
    });

    test('should create realtime connection with token auth callback', async () => {
      const authCallback = async (tokenParams: any, callback: any) => {
        try {
          const response = await fetch(`http://localhost:${AUTH_SERVER_PORT}/auth`, {
            method: 'GET',
            headers: {
              'x-user-id': TEST_USER_ID,
              'x-user-full-name': TEST_USER_FULL_NAME,
            },
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const tokenDetails = await response.json() as any;
          callback(null, tokenDetails);
        } catch (error) {
          callback(error, null);
        }
      };

      const ablyRealtime = new Ably.Realtime({
        authCallback,
        autoConnect: false
      });

      // Test auth without connecting
      const auth = await ablyRealtime.auth.authorize();
      expect(auth.clientId).toMatch(new RegExp(`.*\\.${TEST_USER_ID}`));
      
      ablyRealtime.close();
    }, 10000);
  });

  describe('Client ID Enforcement', () => {
    test('should enforce client ID matches token', async () => {
      const response = await fetch(`http://localhost:${AUTH_SERVER_PORT}/auth`, {
        method: 'GET',
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-user-full-name': TEST_USER_FULL_NAME,
        },
      });

      const tokenDetails = await response.json() as any;
      const expectedClientId = `${TEST_USER_FULL_NAME.replace(/\\s+/g, '_')}.${TEST_USER_ID}`;
      
      expect(tokenDetails.clientId).toBe(expectedClientId);

      // Try to create client with different clientId (should fail)
      try {
        const ablyWithWrongClientId = new Ably.Rest({
          token: tokenDetails.token,
          clientId: 'wrong_client_id'
        });
        
        // This should throw an error when trying to use the client
        await ablyWithWrongClientId.time();
        fail('Should have thrown an error for mismatched client ID');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should require user ID in headers', async () => {
      const response = await fetch(`http://localhost:${AUTH_SERVER_PORT}/auth`, {
        method: 'GET',
        headers: {
          'x-user-full-name': TEST_USER_FULL_NAME,
          // Missing x-user-id header
        },
      });

      expect(response.status).toBe(400);
      const errorResponse = await response.json() as any;
      expect(errorResponse.error).toContain('User ID required');
    });

    test('should handle missing full name gracefully', async () => {
      const response = await fetch(`http://localhost:${AUTH_SERVER_PORT}/auth`, {
        method: 'GET',
        headers: {
          'x-user-id': TEST_USER_ID,
          // Missing x-user-full-name header
        },
      });

      expect(response.ok).toBe(true);
      const tokenDetails = await response.json() as any;
      
      // Should use 'Unknown_User' as default
      const expectedClientId = `Unknown_User.${TEST_USER_ID}`;
      expect(tokenDetails.clientId).toBe(expectedClientId);
    });

    test('should sanitize client ID by replacing spaces with underscores', async () => {
      const fullNameWithSpaces = 'John Doe Smith';
      
      const response = await fetch(`http://localhost:${AUTH_SERVER_PORT}/auth`, {
        method: 'GET',
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-user-full-name': fullNameWithSpaces,
        },
      });

      expect(response.ok).toBe(true);
      const tokenDetails = await response.json() as any;
      
      const expectedClientId = `John_Doe_Smith.${TEST_USER_ID}`;
      expect(tokenDetails.clientId).toBe(expectedClientId);
      expect(tokenDetails.clientId).not.toContain(' ');
    });
  });

  describe('Capability-based Channel Access', () => {
    test('should allow access to user-specific channels', async () => {
      const response = await fetch(`http://localhost:${AUTH_SERVER_PORT}/auth`, {
        method: 'GET',
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-user-full-name': TEST_USER_FULL_NAME,
        },
      });

      const tokenDetails = await response.json() as any;
      const capabilities = JSON.parse(tokenDetails.capability);

      // Test that capabilities include expected patterns
      const userSpecificChannels = [
        `roomslist:${TEST_USER_ID}`,
        `profile:${TEST_USER_ID}`,
        `${TEST_USER_ID}:*`,
        `*:${TEST_USER_ID}`
      ];

      userSpecificChannels.forEach(channel => {
        expect(capabilities).toHaveProperty(channel);
        const channelCapabilities = capabilities[channel];
        expect(channelCapabilities).toContain('subscribe');
        expect(channelCapabilities).toContain('publish');
      });
    });

    test('should include wildcard capabilities for read access', async () => {
      const response = await fetch(`http://localhost:${AUTH_SERVER_PORT}/auth`, {
        method: 'GET',
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-user-full-name': TEST_USER_FULL_NAME,
        },
      });

      const tokenDetails = await response.json() as any;
      const capabilities = JSON.parse(tokenDetails.capability);

      // Check wildcard capabilities
      expect(capabilities).toHaveProperty('*');
      expect(capabilities['*']).toContain('subscribe');
      
      expect(capabilities).toHaveProperty('profile:*');
      expect(capabilities['profile:*']).toContain('subscribe');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for invalid endpoints', async () => {
      const response = await fetch(`http://localhost:${AUTH_SERVER_PORT}/invalid`, {
        method: 'GET',
        headers: {
          'x-user-id': TEST_USER_ID,
          'x-user-full-name': TEST_USER_FULL_NAME,
        },
      });

      expect(response.status).toBe(404);
      const errorResponse = await response.json() as any;
      expect(errorResponse.error).toBe('Not Found');
    });

    test('should handle CORS preflight requests', async () => {
      const response = await fetch(`http://localhost:${AUTH_SERVER_PORT}/auth`, {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-User-Id');
    });
  });
});