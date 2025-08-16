module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts', // Exclude main entry point
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  // Performance optimizations
  testTimeout: 10000, // 10 seconds default
  maxWorkers: '50%', // Use only 50% of CPU cores
  maxConcurrency: 5, // Limit concurrent tests
  bail: false, // Don't stop on first failure
  verbose: false, // Less verbose output for speed
  // Run heavy tests separately
  testPathIgnorePatterns: [
    '/node_modules/',
    // Temporarily exclude slow E2E tests from default run
    'api-e2e-real.test.ts',
    'sse-streaming-real.test.ts'
  ],
  // Clear mocks automatically
  clearMocks: true,
  restoreMocks: true
};