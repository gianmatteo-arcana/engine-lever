/**
 * Production environment tests for BaseAgent
 * These tests ensure the agent works without Supabase configured
 */

import { OrchestratorAgent } from '../../../../src/agents/OrchestratorAgent';

describe('BaseAgent Production Environment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment to production-like settings
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV; // Remove test environment
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
    
    // Clear the singleton instance between tests
    (OrchestratorAgent as any).instance = undefined;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    // Clear the singleton instance
    (OrchestratorAgent as any).instance = undefined;
  });

  describe('without Supabase configured', () => {
    it('should FAIL HARD when Supabase is missing', () => {
      // This test verifies we fail hard as intended!
      expect(() => {
        OrchestratorAgent.getInstance();
      }).toThrow('CredentialVault initialization failed');
    });

    it('should display actionable error message', () => {
      const consoleSpy = jest.spyOn(console, 'error');
      
      try {
        OrchestratorAgent.getInstance();
      } catch (error) {
        // Expected to throw
      }
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('CREDENTIAL VAULT INITIALIZATION FAILED')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Go to your Railway project dashboard')
      );
    });
  });

  // Note: Testing with actual Supabase configuration should be done
  // in integration tests with proper test environment setup, not unit tests

  describe('Railway-specific environment', () => {
    beforeEach(() => {
      // Simulate Railway environment
      process.env.NODE_ENV = 'production';
      process.env.PORT = '3000';
      // No Supabase keys - common in Railway deployments
    });

    it('should FAIL HARD with actionable error in production', () => {
      // This is the NEW behavior - we want it to fail hard!
      expect(() => {
        OrchestratorAgent.getInstance();
      }).toThrow('CredentialVault initialization failed');
    });
  });
});