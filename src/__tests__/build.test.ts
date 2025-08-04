import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Build Verification', () => {
  it('should successfully compile TypeScript without errors', () => {
    try {
      // Run the TypeScript compiler
      execSync('npx tsc --noEmit', { 
        stdio: 'pipe',
        encoding: 'utf8'
      });
      
      // If we get here, the build succeeded
      expect(true).toBe(true);
    } catch (error: any) {
      // Build failed - fail the test with the compilation errors
      const errorMessage = error.stdout || error.stderr || error.message;
      throw new Error(`TypeScript compilation failed:\n${errorMessage}`);
    }
  });

  it('should have a valid tsconfig.json', () => {
    const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
    expect(fs.existsSync(tsconfigPath)).toBe(true);
    
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    expect(tsconfig.compilerOptions).toBeDefined();
    expect(tsconfig.compilerOptions.outDir).toBe('./dist');
  });

  it('should have all required dependencies', () => {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Check critical dependencies
    expect(packageJson.dependencies).toBeDefined();
    expect(packageJson.dependencies['express']).toBeDefined();
    expect(packageJson.dependencies['@supabase/supabase-js']).toBeDefined();
    
    // Check dev dependencies
    expect(packageJson.devDependencies).toBeDefined();
    expect(packageJson.devDependencies['typescript']).toBeDefined();
    expect(packageJson.devDependencies['@types/node']).toBeDefined();
  });

  it('should be able to build for production', () => {
    try {
      // Run the actual build command
      execSync('npm run build', {
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 30000 // 30 second timeout
      });
      
      // Verify dist folder exists
      const distPath = path.join(process.cwd(), 'dist');
      expect(fs.existsSync(distPath)).toBe(true);
      
      // Verify main entry point exists
      const mainPath = path.join(distPath, 'index.js');
      expect(fs.existsSync(mainPath)).toBe(true);
      
    } catch (error: any) {
      const errorMessage = error.stdout || error.stderr || error.message;
      throw new Error(`Production build failed:\n${errorMessage}`);
    }
  });
});