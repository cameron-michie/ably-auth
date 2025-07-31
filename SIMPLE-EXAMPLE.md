# Simple Ably Token Authentication Example

This folder contains two simple TypeScript scripts that demonstrate Ably token authentication using `authUrl` pattern.

## Files

- **`simple-auth-server.ts`** - Auth server that creates and returns Ably tokens
- **`simple-client.ts`** - Client that gets a token and publishes a message

## How It Works

1. **Auth Server**: Receives requests with user headers, creates Ably tokens with specific capabilities
2. **Client**: Uses `authUrl` and `authHeaders` to automatically get tokens and connect to Ably

## Running the Example

### Terminal 1 - Start the Auth Server
```bash
npm run simple-server
```

### Terminal 2 - Run the Client
```bash
npm run simple-client
```

## Expected Output

**Auth Server:**
```
🚀 Simple Auth Server running on http://localhost:3002
📋 Send requests to: http://localhost:3002/auth
📝 Required headers: X-User-Id, X-User-Name (optional)

2025-07-31T15:15:00.000Z - GET /auth
Creating token for user: Alice Johnson (user_456)
✅ Token created for Alice_Johnson.user_456
```

**Client:**
```
🚀 Starting Simple Ably Client
👤 User: Alice Johnson (user_456)
🔗 Auth Server: http://localhost:3002/auth

🔑 Step 1: Requesting token from auth server...
✅ Received token for client: Alice_Johnson.user_456
   Token expires: 2025-07-31T16:15:00.000Z

🔌 Step 2: Connecting to Ably with token...
✅ Connected to Ably successfully!
   Client ID: Alice_Johnson.user_456

📤 Step 3: Publishing message to roomslist channel...
✅ Message published to channel: roomslist:user_456
   Message: {
     "text": "Hello from the simple client!",
     "timestamp": "2025-07-31T15:15:00.000Z",
     "userId": "user_456"
   }

🎉 All done! Closing connection...
```

## Key Features

✅ **TypeScript** - Fully typed with interfaces  
✅ **Human Readable** - Clear console output with emojis and step-by-step progress  
✅ **AuthUrl Pattern** - Client uses `authUrl` and `authHeaders` for automatic token management  
✅ **Capability-based Security** - Tokens only allow access to user-specific channels  
✅ **Error Handling** - Comprehensive error handling and timeouts  
✅ **Real Ably Connection** - Actually connects and publishes messages to Ably  

## Security

The auth server creates tokens with restricted capabilities:
- `roomslist:${userId}` - User can only access their own roomslist
- `presence` - Global presence channel access
- Client ID is enforced: `${userName}.${userId}`