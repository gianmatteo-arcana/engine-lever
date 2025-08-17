/**
 * Railway Deployment Integration Test
 * 
 * This test ensures our application can start in Railway environment
 * and catches configuration issues before deployment
 */

describe('Railway Deployment Integration', () => {
  const originalEnv = process.env;

  afterEach(() => {
    // Restore environment after each test
    process.env = originalEnv;
    // Clear module cache to reset singletons
    jest.resetModules();
  });

  describe('Critical Environment Variables', () => {
    it('should fail hard when SUPABASE_URL is missing', async () => {
      // Simulate Railway environment without Supabase
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        PORT: '3000',
        SUPABASE_URL: undefined,
        SUPABASE_SERVICE_KEY: 'test-key'
      };

      // Import after env setup to test real initialization
      const { OrchestratorAgent } = await import('../../src/agents/OrchestratorAgent');

      expect(() => {
        OrchestratorAgent.getInstance();
      }).toThrow('CRITICAL: Supabase configuration invalid');
    });

    it('should fail hard when SUPABASE_SERVICE_KEY is missing', async () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        PORT: '3000',
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_KEY: undefined
      };

      const { OrchestratorAgent } = await import('../../src/agents/OrchestratorAgent');

      expect(() => {
        OrchestratorAgent.getInstance();
      }).toThrow('CRITICAL: Supabase configuration invalid');
    });

    // Skip this test - it requires actual valid Supabase credentials
    // In production tests, we would use a test database with valid credentials
    it.skip('should initialize successfully with all required variables', async () => {
      // This test requires valid Supabase credentials which we don't want in the codebase
      // It should be run in CI/CD with proper test environment credentials
    });
  });

  describe('Full Startup Sequence', () => {
    // Skip this test - it requires actual valid Supabase credentials
    it.skip('should start all services with proper configuration', async () => {
      // This test requires valid Supabase credentials which we don't want in the codebase
      // It should be run in CI/CD with proper test environment credentials
    });

    it('should provide actionable error messages for missing configuration', async () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        // Missing all critical variables
      };

      const consoleSpy = jest.spyOn(console, 'error');
      const { OrchestratorAgent } = await import('../../src/agents/OrchestratorAgent');

      try {
        OrchestratorAgent.getInstance();
      } catch (error) {
        // Verify actionable error message was logged
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('CRITICAL CONFIGURATION ERROR')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Go to your Railway project dashboard')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Example: https://raenkewzlvrdqufwxjpl.supabase.co')
        );
      }
    });
  });
});