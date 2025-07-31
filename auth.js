import http from 'http';
import { URL } from 'url';
import * as Ably from 'ably';

const ABLY_API_KEY = "ALwA2Q.4QI37w:D_h8yJGTdcH5Xp8ZB9d7Tt9Zbp7QjfuXTdAL3HLBV1Y";
const PORT = 3000;

const ablyRest = new Ably.Rest({ key: ABLY_API_KEY });

const server = http.createServer(async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  console.log(`\n=== [${requestId}] ${new Date().toISOString()} ===`);
  console.log(`${req.method} ${req.url}`);
  console.log('Client IP:', req.connection.remoteAddress);
  console.log('User-Agent:', req.headers['user-agent']);
  console.log('All Headers:', JSON.stringify(req.headers, null, 2));

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id, X-User-Full-Name');

  if (req.method === 'OPTIONS') {
    console.log(`[${requestId}] Handling CORS preflight - responding with 204`);
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (requestUrl.pathname !== '/auth' || (req.method !== 'POST' && req.method !== 'GET')) {
    console.log(`[${requestId}] INVALID REQUEST: ${requestUrl.pathname} ${req.method}`);
    console.log(`[${requestId}] Expected: /auth with POST or GET`);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: "Not Found" }));
    return;
  }

  const userId = req.headers['x-user-id'];
  const userFullName = req.headers['x-user-full-name'];

  console.log(`[${requestId}] Processing auth request:`);
  console.log(`[${requestId}]   - userId: "${userId}"`);
  console.log(`[${requestId}]   - fullName: "${userFullName}"`);
  console.log(`[${requestId}]   - userId type: ${typeof userId}`);
  console.log(`[${requestId}]   - fullName type: ${typeof userFullName}`);

  if (!userId) {
    console.log(`[${requestId}] VALIDATION ERROR: Missing userId in headers`);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: "User ID required in x-user-id header" }));
    return;
  }

  const safeName = (userFullName || 'Unknown_User').replace(/\s+/g, '_');
  const clientId = `${safeName}.${userId}`;

  console.log(`[${requestId}] Generated clientId: "${clientId}"`);

  // Comprehensive capabilities for the user with proper colon-separated wildcards
  const capabilities = {
    // User's rooms list
    [`roomslist:${userId}`]: ['publish', 'subscribe', 'history', 'object-subscribe', 'object-publish'],

    // Profile channels
    'profile:*': ['subscribe'],
    [`profile:${userId}`]: ['publish', 'subscribe', 'history'],

    // 1:1 Chat rooms using colon-separated format (user1:user2)
    // User can be either first or second participant (sorted alphabetically)
    [`*:${userId}`]: ['publish', 'subscribe', 'history', 'presence'], // User is second participant
    [`${userId}:*`]: ['publish', 'subscribe', 'history', 'presence'], // User is first participant

    // Global presence
    'presence': ['presence', 'publish', 'subscribe'],

    // Fallback for reading any other channels
    '*': ['subscribe']
  };

  console.log(`[${requestId}] Capabilities:`, JSON.stringify(capabilities, null, 2));

  try {
    console.log(`[${requestId}] Creating token request with Ably REST SDK...`);

    const tokenParams = {
      clientId: clientId,
      capability: JSON.stringify(capabilities),
      ttl: 3600000
    };
    console.log(`[${requestId}] Token params:`, JSON.stringify(tokenParams, null, 2));

    // Create an actual token, not just a token request
    const tokenDetails = await ablyRest.auth.requestToken(tokenParams);

    console.log(`[${requestId}] SUCCESS: Token created by Ably SDK`);
    console.log(`[${requestId}] Token details:`, JSON.stringify(tokenDetails, null, 2));

    // Return the full token details object (what authCallback expects)
    const responseBody = JSON.stringify(tokenDetails);
    console.log(`[${requestId}] Sending response with status 200`);
    console.log(`[${requestId}] Response body length: ${responseBody.length}`);

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(responseBody)
    });
    res.end(responseBody);

    console.log(`[${requestId}] Response sent successfully`);

  } catch (error) {
    console.error(`[${requestId}] ERROR: Failed to create token request:`, error);
    console.error(`[${requestId}] Error stack:`, error.stack);

    const errorResponse = JSON.stringify({
      error: "Failed to create Ably token",
      details: error.message,
      requestId: requestId
    });

    console.log(`[${requestId}] Sending error response with status 500`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(errorResponse);
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 Auth server running on http://localhost:${PORT}`);
  console.log(`📍 Endpoint: POST/GET http://localhost:${PORT}/auth`);
  console.log(`📋 Required headers: x-user-id, x-user-full-name (optional)`);
  console.log(`🔑 Using Ably API Key: ${ABLY_API_KEY.substring(0, 20)}...`);
  console.log(`⏰ Server started at: ${new Date().toISOString()}`);
  console.log(`\n--- Ready to handle requests ---\n`);
});
