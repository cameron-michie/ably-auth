import { spawn, ChildProcess } from 'child_process';
import { startAuthServer, stopAuthServer } from '../auth';
import http from 'http';

interface CLIResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

describe('Ably CLI Integration Tests', () => {
  let authServer: http.Server;

  const ABLY_API_KEY = process.env.ABLY_API_KEY!;
  const TEST_USER_ID = process.env.TEST_USER_ID || 'test_user_123';
  const TEST_USER_FULL_NAME = process.env.TEST_USER_FULL_NAME || 'Test User';
  const AUTH_SERVER_PORT = process.env.AUTH_SERVER_PORT || '3001';

  beforeAll(async () => {
    if (!ABLY_API_KEY) {
      throw new Error('ABLY_API_KEY environment variable is required for CLI tests');
    }
    
    // Start auth server for token generation tests
    authServer = await startAuthServer();
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);

  afterAll(async () => {
    stopAuthServer();
    await new Promise(resolve => setTimeout(resolve, 500));
  }, 10000);

  /**
   * Execute an Ably CLI command and return the result
   */
  async function executeAblyCommand(args: string[], timeoutMs: number = 30000): Promise<CLIResult> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child: ChildProcess = spawn('ably', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          timedOut
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          exitCode: 1,
          stdout: stdout.trim(),
          stderr: `Process error: ${error.message}`,
          timedOut
        });
      });
    });
  }

  /**
   * Generate a token from the auth server
   */
  async function generateToken(): Promise<string> {
    const response = await fetch(`http://localhost:${AUTH_SERVER_PORT}/auth`, {
      method: 'GET',
      headers: {
        'x-user-id': TEST_USER_ID,
        'x-user-full-name': TEST_USER_FULL_NAME,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to generate token: ${response.status} ${response.statusText}`);
    }

    const tokenDetails = await response.json() as any;
    return tokenDetails.token;
  }

  describe('Phase 1: API Key Authentication (Baseline)', () => {
    test('should verify CLI is available and working', async () => {
      const result = await executeAblyCommand(['--version'], 5000);
      
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Version number pattern
    }, 10000);

    test('a) should publish to roomslist:123 channel with API key', async () => {
      const message = '{"message":"API key test roomslist","timestamp":"' + new Date().toISOString() + '"}';
      const result = await executeAblyCommand([
        'channels', 'publish', 
        'roomslist:123', 
        message,
        '--json'
      ], 15000);

      console.log('Publish roomslist - stdout:', result.stdout);
      console.log('Publish roomslist - stderr:', result.stderr);
      console.log('Publish roomslist - exit code:', result.exitCode);

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      // CLI should not produce errors
      // Allow Ably token renewal warning (40171), but not actual errors
      const hasError = result.stderr.toLowerCase().includes('error') && !result.stderr.includes('40171');
      expect(hasError).toBe(false);
    }, 20000);

    test('b) should subscribe to profile:123 channel with API key', async () => {
      const result = await executeAblyCommand([
        'channels', 'subscribe', 
        'profile:123',
        '--duration', '3',
        '--json'
      ], 10000);

      console.log('Subscribe profile - stdout:', result.stdout);
      console.log('Subscribe profile - stderr:', result.stderr);
      console.log('Subscribe profile - exit code:', result.exitCode);

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      // Should successfully subscribe (even if no messages received)
      // Allow Ably token renewal warning (40171), but not actual errors
      const hasError = result.stderr.toLowerCase().includes('error') && !result.stderr.includes('40171');
      expect(hasError).toBe(false);
    }, 15000);

    test('c) should publish to chat room user123:userabc with API key', async () => {
      const message = '{"chat":"API key bidirectional test","from":"user123","to":"userabc"}';
      const result = await executeAblyCommand([
        'channels', 'publish',
        'user123:userabc',
        message,
        '--json'
      ], 15000);

      console.log('Publish chat - stdout:', result.stdout);
      console.log('Publish chat - stderr:', result.stderr);
      console.log('Publish chat - exit code:', result.exitCode);

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      // Allow Ably token renewal warning (40171), but not actual errors
      const hasError = result.stderr.toLowerCase().includes('error') && !result.stderr.includes('40171');
      expect(hasError).toBe(false);
    }, 20000);

    test('d) should publish to presence channel with API key', async () => {
      const message = '{"status":"online","user":"api_key_test","action":"enter"}';
      const result = await executeAblyCommand([
        'channels', 'publish',
        'presence',
        message,
        '--json'
      ], 15000);

      console.log('Publish presence - stdout:', result.stdout);
      console.log('Publish presence - stderr:', result.stderr);
      console.log('Publish presence - exit code:', result.exitCode);

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      // Allow Ably token renewal warning (40171), but not actual errors
      const hasError = result.stderr.toLowerCase().includes('error') && !result.stderr.includes('40171');
      expect(hasError).toBe(false);
    }, 20000);
  });

  describe('Phase 2: Token Authentication (Capability Testing)', () => {
    test('should generate token and verify CLI accepts --token flag', async () => {
      const token = await generateToken();
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);

      // Test that CLI accepts the token by doing a simple publish
      const message = '{"message":"token test","timestamp":"' + new Date().toISOString() + '"}';
      const result = await executeAblyCommand([
        'channels', 'publish',
        `roomslist:${TEST_USER_ID}`,
        message,
        '--token', token,
        '--json'
      ], 15000);

      console.log('Token test - stdout:', result.stdout);
      console.log('Token test - stderr:', result.stderr);
      console.log('Token test - exit code:', result.exitCode);

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      // Allow Ably token renewal warning (40171), but not actual errors
      const hasError = result.stderr.toLowerCase().includes('error') && !result.stderr.includes('40171');
      expect(hasError).toBe(false);
    }, 25000);

    test('a) should publish to allowed roomslist channel with token', async () => {
      const token = await generateToken();
      const message = '{"message":"token roomslist test","user":"' + TEST_USER_ID + '"}';
      
      const result = await executeAblyCommand([
        'channels', 'publish',
        `roomslist:${TEST_USER_ID}`,
        message,
        '--token', token,
        '--json'
      ], 15000);

      console.log('Token roomslist - stdout:', result.stdout);
      console.log('Token roomslist - stderr:', result.stderr);

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      // Allow Ably token renewal warning (40171), but not actual errors
      const hasError = result.stderr.toLowerCase().includes('error') && !result.stderr.includes('40171');
      expect(hasError).toBe(false);
    }, 25000);

    test('b) should subscribe to user profile channel with token', async () => {
      const token = await generateToken();
      
      const result = await executeAblyCommand([
        'channels', 'subscribe',
        `profile:${TEST_USER_ID}`,
        '--token', token,
        '--duration', '3',
        '--json'
      ], 10000);

      console.log('Token profile subscribe - stdout:', result.stdout);
      console.log('Token profile subscribe - stderr:', result.stderr);

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      // Allow Ably token renewal warning (40171), but not actual errors
      const hasError = result.stderr.toLowerCase().includes('error') && !result.stderr.includes('40171');
      expect(hasError).toBe(false);
    }, 20000);

    test('c) should publish to bidirectional chat channel with token', async () => {
      const token = await generateToken();
      const message = '{"chat":"token chat test","from":"' + TEST_USER_ID + '","to":"userabc"}';
      
      const result = await executeAblyCommand([
        'channels', 'publish',
        `${TEST_USER_ID}:userabc`,
        message,
        '--token', token,
        '--json'
      ], 15000);

      console.log('Token chat - stdout:', result.stdout);
      console.log('Token chat - stderr:', result.stderr);

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      // Allow Ably token renewal warning (40171), but not actual errors
      const hasError = result.stderr.toLowerCase().includes('error') && !result.stderr.includes('40171');
      expect(hasError).toBe(false);
    }, 25000);

    test('d) should publish to global presence channel with token', async () => {
      const token = await generateToken();
      const message = '{"status":"online","user":"' + TEST_USER_ID + '","action":"token_test"}';
      
      const result = await executeAblyCommand([
        'channels', 'publish',
        'presence',
        message,
        '--token', token,
        '--json'
      ], 15000);

      console.log('Token presence - stdout:', result.stdout);
      console.log('Token presence - stderr:', result.stderr);

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      // Allow Ably token renewal warning (40171), but not actual errors
      const hasError = result.stderr.toLowerCase().includes('error') && !result.stderr.includes('40171');
      expect(hasError).toBe(false);
    }, 25000);

    test('should fail to subscribe to unauthorized roomslist channel', async () => {
      const token = await generateToken();
      
      const result = await executeAblyCommand([
        'channels', 'subscribe',
        'roomslist:different_user_456',
        '--token', token,
        '--duration', '3',
        '--json'
      ], 10000);

      console.log('Unauthorized roomslist - stdout:', result.stdout);
      console.log('Unauthorized roomslist - stderr:', result.stderr);
      console.log('Unauthorized roomslist - exit code:', result.exitCode);

      expect(result.timedOut).toBe(false);
      // Should fail with non-zero exit code due to capability restriction
      expect(result.exitCode).not.toBe(0);
      // Should contain some indication of authorization/capability error
      const errorOutput = (result.stderr + result.stdout).toLowerCase();
      expect(
        errorOutput.includes('unauthorized') || 
        errorOutput.includes('forbidden') || 
        errorOutput.includes('capability') ||
        errorOutput.includes('permission') ||
        errorOutput.includes('40160') // Ably capability error code
      ).toBe(true);
    }, 20000);

    test('should fail to subscribe to unauthorized profile channel', async () => {
      const token = await generateToken();
      
      const result = await executeAblyCommand([
        'channels', 'subscribe',
        'profile:unauthorized_user',
        '--token', token,
        '--duration', '3',
        '--json'
      ], 10000);

      console.log('Unauthorized profile - stdout:', result.stdout);
      console.log('Unauthorized profile - stderr:', result.stderr);
      console.log('Unauthorized profile - exit code:', result.exitCode);

      expect(result.timedOut).toBe(false);
      // Should fail due to capability restriction
      expect(result.exitCode).not.toBe(0);
      const errorOutput = (result.stderr + result.stdout).toLowerCase();
      expect(
        errorOutput.includes('unauthorized') || 
        errorOutput.includes('forbidden') || 
        errorOutput.includes('capability') ||
        errorOutput.includes('permission')
      ).toBe(true);
    }, 20000);
  });
});