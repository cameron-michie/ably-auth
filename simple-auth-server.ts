// Simple Auth Server - Creates Ably tokens for clients
import http from 'http';
import * as Ably from 'ably';
import querystring from 'querystring';

// Configuration
const ABLY_API_KEY = process.env.ABLY_API_KEY;
const PORT = 3002;

// Types
interface AuthHeaders {
  'x-user-id'?: string;
  'x-user-name'?: string;
}

interface TokenCapabilities {
  [channelName: string]: string[];
}

interface ErrorResponse {
  error: string;
  details?: string;
}

// Create Ably REST client
const ably = new Ably.Rest({ key: ABLY_API_KEY });

// Helper to parse request body
function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => resolve(querystring.parse(body)));
  });
}

// Create HTTP server
const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id, X-User-Name');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only handle /auth endpoint
  if (!req.url?.startsWith('/auth')) {
    const errorResponse: ErrorResponse = { error: 'Not Found' };
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
    return;
  }

  try {
    let userId: string | undefined;
    let userName: string | undefined = 'Unknown';
    let clientId: string | undefined;

    // Get user info from headers (for direct client requests)
    const headers = req.headers as AuthHeaders;
    if (headers['x-user-id']) {
      userId = headers['x-user-id'];
      userName = headers['x-user-name'] || 'Unknown';
      clientId = `${userName.replace(/\s+/g, '_')}.${userId}`;
      console.log(`Request via headers from user: ${userName} (${userId})`);
    } else {
      // Get user info from query params or body (for Ably SDK authUrl requests)
      const queryParams = querystring.parse(req.url.split('?')[1]);
      const body = await parseBody(req);

      const sdkClientId = (queryParams.clientId || body.clientId) as string | undefined;

      if (sdkClientId) {
        // Extract userId from the clientId provided by the SDK
        const parts = sdkClientId.split('.');
        userId = parts.pop();
        userName = parts.join('.');
        clientId = sdkClientId;
        console.log(`Request via authUrl from SDK for user: ${userName} (${userId})`);
      }
    }

    if (!userId || !clientId) {
      const errorResponse: ErrorResponse = { error: 'Could not determine user identity' };
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(errorResponse));
      return;
    }

    console.log(`Creating token for user: ${userName} (${userId})`);

    // Define capabilities - user can publish/subscribe to their own roomslist
    const capabilities: TokenCapabilities = {
      [`roomslist:${userId}`]: ['publish', 'subscribe', 'history'],
      'presence': ['publish', 'subscribe', 'presence']
    };

    // Create token request parameters
    const tokenRequest = {
      clientId: clientId,
      capability: JSON.stringify(capabilities),
      ttl: 3600000 // 1 hour
    };

    // Request token from Ably
    const tokenDetails = await ably.auth.requestToken(tokenRequest);

    console.log(`✅ Token created for ${clientId}`);

    // Return token details
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tokenDetails));

  } catch (error) {
    console.error('❌ Error creating token:', (error as Error).message);
    const errorResponse: ErrorResponse = {
      error: 'Failed to create token',
      details: (error as Error).message
    };
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errorResponse));
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Simple Auth Server running on http://localhost:${PORT}`);
  console.log(`📋 Send requests to: http://localhost:${PORT}/auth`);
  console.log(`📝 Handles direct requests (with X-User-Id) and Ably SDK authUrl requests.`);
  console.log('');
});
