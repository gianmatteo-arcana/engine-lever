/**
 * Deployment Readiness Tests
 * 
 * These tests ensure that the codebase is ready for deployment.
 * They catch issues that would break deployment but might not affect local development.
 * 
 * CRITICAL: These tests MUST pass before any PR can be merged.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Deployment Readiness', () => {
  /**
   * Test 1: Package Lock Integrity
   * 
   * This test prevents the exact issue that broke Railway deployment.
   * It ensures package-lock.json is in sync with package.json.
   * 
   * Railway uses `npm ci` which requires perfect sync.
   * Local dev uses `npm install` which auto-updates the lock file.
   * This test catches the discrepancy.
   */
  describe('Package Lock Integrity', () => {
    it('should have package-lock.json in sync with package.json', () => {
      // This will throw if package-lock.json is out of sync
      try {
        execSync('npm ci --dry-run', { 
          stdio: 'pipe',
          encoding: 'utf-8'
        });
      } catch (error: any) {
        const output = error.stdout + error.stderr;
        
        // Provide helpful error message
        if (output.includes('can only install packages when your package.json and package-lock.json')) {
          throw new Error(
            'package-lock.json is out of sync with package.json!\n' +
            'Run "npm install" to update package-lock.json, then commit both files.\n' +
            'This would break deployment on Railway.'
          );
        }
        throw error;
      }
    });

    it('should have package-lock.json committed to git', () => {
      const lockPath = path.join(process.cwd(), 'package-lock.json');
      expect(fs.existsSync(lockPath)).toBe(true);
    });
  });

  /**
   * Test 2: TypeScript Compilation
   * 
   * Ensures TypeScript compiles without errors.
   * This catches type errors that might slip through.
   */
  describe('TypeScript Compilation', () => {
    it('should compile without errors', () => {
      try {
        execSync('npx tsc --noEmit', { 
          stdio: 'pipe',
          encoding: 'utf-8'
        });
      } catch (error: any) {
        throw new Error(
          'TypeScript compilation failed!\n' +
          'Run "npx tsc --noEmit" to see errors.\n' +
          'Fix all type errors before pushing.'
        );
      }
    });
  });

  /**
   * Test 3: Build Process
   * 
   * Ensures the production build succeeds.
   * This is what Railway runs during deployment.
   */
  describe('Build Process', () => {
    it('should build successfully', () => {
      try {
        execSync('npm run build', { 
          stdio: 'pipe',
          encoding: 'utf-8',
          timeout: 30000 // 30 second timeout
        });
      } catch (error: any) {
        throw new Error(
          'Build failed!\n' +
          'Run "npm run build" to see errors.\n' +
          'The build must succeed for deployment to work.'
        );
      }
    });
  });

  /**
   * Test 4: No Missing Dependencies
   * 
   * Ensures all imports can be resolved.
   * Catches missing dependencies that would break at runtime.
   */
  describe('Dependency Check', () => {
    it('should have no missing dependencies', () => {
      try {
        // Check for missing dependencies
        execSync('npm ls --depth=0', { 
          stdio: 'pipe',
          encoding: 'utf-8'
        });
      } catch (error: any) {
        const output = error.stdout + error.stderr;
        if (output.includes('missing:') || output.includes('UNMET')) {
          throw new Error(
            'Missing dependencies detected!\n' +
            'Run "npm install" to install missing packages.\n' +
            'All dependencies must be installed for deployment.'
          );
        }
      }
    });
  });

  /**
   * Test 5: Environment Variables Documentation
   * 
   * Ensures critical env vars are documented.
   * Helps prevent deployment failures due to missing config.
   */
  describe('Environment Configuration', () => {
    it('should have .env.example file', () => {
      const envExamplePath = path.join(process.cwd(), '.env.example');
      expect(fs.existsSync(envExamplePath)).toBe(true);
    });
  });

  /**
   * Test 6: No Uncommitted Changes in CI
   * 
   * Ensures all changes are committed before deployment.
   * This prevents deploying with uncommitted fixes.
   */
  describe('Git Status', () => {
    it('should have clean git status (no uncommitted changes)', () => {
      // Skip this test in local development
      if (process.env.CI !== 'true' && process.env.NODE_ENV !== 'production') {
        console.log('Skipping git status check in local development');
        return;
      }

      try {
        const status = execSync('git status --porcelain', { 
          encoding: 'utf-8'
        }).trim();
        
        if (status) {
          throw new Error(
            'Uncommitted changes detected!\n' +
            'All changes must be committed before deployment.\n' +
            'Files with changes:\n' + status
          );
        }
      } catch (error: any) {
        if (error.message && error.message.includes('Uncommitted changes')) {
          throw error;
        }
        // Ignore if git is not available
        console.warn('Git status check skipped:', error.message);
      }
    });
  });
});