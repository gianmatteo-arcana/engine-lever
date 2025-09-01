/**
 * TDD Helper Utilities
 * 
 * Utilities to support Test-Driven Development practices
 * Provides assertion helpers, mocks, and testing utilities
 */

import { TaskContext, ContextEntry, TaskState } from '../types/engine-types';

/**
 * Custom Jest matchers for engine-specific assertions
 */
export const engineMatchers = {
  /**
   * Verifies TaskContext follows event sourcing principles
   */
  toBeValidEventSourced(received: TaskContext) {
    const pass = 
      received.history !== undefined &&
      Array.isArray(received.history) &&
      received.history.every((entry, index) => 
        entry.sequenceNumber === index + 1
      );

    return {
      pass,
      message: () => pass
        ? `Expected TaskContext not to be valid event-sourced`
        : `Expected TaskContext to have sequential history entries`
    };
  },

  /**
   * Verifies append-only compliance
   */
  toBeAppendOnly(history: ContextEntry[]) {
    const timestamps = history.map(e => new Date(e.timestamp).getTime());
    const pass = timestamps.every((t, i) => 
      i === 0 || t >= timestamps[i - 1]
    );

    return {
      pass,
      message: () => pass
        ? `Expected history not to be append-only`
        : `Expected history to have chronological timestamps`
    };
  },

  /**
   * Verifies actor attribution
   */
  toHaveCompleteActorAttribution(entry: ContextEntry) {
    const pass = 
      entry.actor !== undefined &&
      entry.actor.type !== undefined &&
      entry.actor.id !== undefined &&
      entry.actor.version !== undefined &&
      entry.reasoning !== undefined &&
      entry.reasoning.length > 0;

    return {
      pass,
      message: () => pass
        ? `Expected entry not to have complete actor attribution`
        : `Expected entry to have actor type, id, version, and reasoning`
    };
  }
};

/**
 * Performance testing utilities
 */
export class PerformanceTimer {
  private startTime: number;
  private marks: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  mark(name: string): void {
    this.marks.set(name, Date.now());
  }

  getDuration(from?: string, to?: string): number {
    const start = from ? this.marks.get(from)! : this.startTime;
    const end = to ? this.marks.get(to)! : Date.now();
    return end - start;
  }

  assertDurationUnder(maxMs: number, from?: string, to?: string): void {
    const duration = this.getDuration(from, to);
    if (duration > maxMs) {
      throw new Error(
        `Performance requirement failed: Operation took ${duration}ms, ` +
        `expected under ${maxMs}ms`
      );
    }
  }
}

/**
 * Mock implementations for external services
 */
export class MockServices {
  /**
   * Creates a mock LLM provider
   */
  static createMockLLMProvider() {
    return {
      complete: jest.fn().mockResolvedValue({
        content: 'Mock LLM response',
        usage: { prompt_tokens: 100, completion_tokens: 50 }
      }),
      
      completeWithRetry: jest.fn().mockImplementation(async (prompt) => {
        return {
          content: `Processed: ${prompt.substring(0, 50)}...`,
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        };
      })
    };
  }

  /**
   * Creates a mock Supabase client
   */
  static createMockSupabaseClient() {
    const mockChain = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      like: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      data: null,
      error: null
    };

    return {
      from: jest.fn(() => mockChain),
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'mock-user-id' } },
          error: null
        }),
        signIn: jest.fn().mockResolvedValue({
          data: { session: { access_token: 'mock-token' } },
          error: null
        })
      },
      storage: {
        from: jest.fn(() => ({
          upload: jest.fn().mockResolvedValue({ data: { path: 'mock-path' }, error: null }),
          download: jest.fn().mockResolvedValue({ data: Buffer.from('mock-data'), error: null })
        }))
      }
    };
  }

  /**
   * Creates a mock Redis client
   */
  static createMockRedisClient() {
    const store = new Map<string, string>();
    
    return {
      get: jest.fn((key) => Promise.resolve(store.get(key) || null)),
      set: jest.fn((key, value, _options) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((key) => {
        const existed = store.has(key);
        store.delete(key);
        return Promise.resolve(existed ? 1 : 0);
      }),
      exists: jest.fn((key) => Promise.resolve(store.has(key) ? 1 : 0)),
      expire: jest.fn(() => Promise.resolve(1)),
      ttl: jest.fn(() => Promise.resolve(-1)),
      keys: jest.fn((pattern) => {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return Promise.resolve(
          Array.from(store.keys()).filter(k => regex.test(k))
        );
      })
    };
  }
}

/**
 * Assertion helpers for event sourcing
 */
export class EventSourcingAssertions {
  /**
   * Asserts that history is append-only
   */
  static assertAppendOnly(history: ContextEntry[]): void {
    for (let i = 1; i < history.length; i++) {
      const prev = new Date(history[i - 1].timestamp).getTime();
      const curr = new Date(history[i].timestamp).getTime();
      
      if (curr < prev) {
        throw new Error(
          `History violates append-only: Entry ${i} timestamp ` +
          `(${history[i].timestamp}) is before entry ${i-1} ` +
          `(${history[i-1].timestamp})`
        );
      }
      
      if (history[i].sequenceNumber !== i + 1) {
        throw new Error(
          `History violates sequence: Entry ${i} has sequence number ` +
          `${history[i].sequenceNumber}, expected ${i + 1}`
        );
      }
    }
  }

  /**
   * Asserts complete actor attribution
   */
  static assertActorAttribution(entry: ContextEntry): void {
    if (!entry.actor) {
      throw new Error('Entry missing actor');
    }
    
    if (!entry.actor.type || !entry.actor.id || !entry.actor.version) {
      throw new Error('Entry actor missing required fields');
    }
    
    if (!entry.reasoning || entry.reasoning.length < 10) {
      throw new Error('Entry missing or insufficient reasoning');
    }
  }

  /**
   * Asserts state can be computed from history
   */
  static assertStateComputable(history: ContextEntry[]): TaskState {
    const state: TaskState = {
      status: 'pending',
      completeness: 0,
      data: {}
    };

    for (const entry of history) {
      // Apply each entry to compute state
      if (entry.operation === 'status_updated' && entry.data.status) {
        state.status = entry.data.status;
      }
      
      if (entry.operation === 'progress_updated' && entry.data.completeness !== undefined) {
        state.completeness = entry.data.completeness;
      }
      
      if (entry.data) {
        state.data = { ...state.data, ...entry.data };
      }
    }

    return state;
  }
}

/**
 * Test data validation utilities
 */
export class ValidationHelpers {
  /**
   * Validates TaskContext structure
   */
  static validateTaskContext(context: TaskContext): string[] {
    const errors: string[] = [];
    
    if (!context.contextId) errors.push('Missing contextId');
    if (!context.taskTemplateId) errors.push('Missing taskTemplateId');
    if (!context.tenantId) errors.push('Missing tenantId');
    if (!context.createdAt) errors.push('Missing createdAt');
    if (!context.currentState) errors.push('Missing currentState');
    if (!Array.isArray(context.history)) errors.push('History must be array');
    if (!context.templateSnapshot) errors.push('Missing templateSnapshot');
    
    // Validate ISO date format
    if (context.createdAt && !isValidISODate(context.createdAt)) {
      errors.push('createdAt must be valid ISO date');
    }
    
    return errors;
  }

  /**
   * Validates sanitization of user input
   */
  static assertSanitized(input: string): void {
    const dangerous = [
      '<script>',
      '</script>',
      'javascript:',
      'onclick=',
      'onerror=',
      'DROP TABLE',
      'DELETE FROM',
      '--',
      '/*',
      '*/'
    ];

    for (const pattern of dangerous) {
      if (input.includes(pattern)) {
        throw new Error(`Input contains dangerous pattern: ${pattern}`);
      }
    }
  }
}

/**
 * Utilities for testing async operations
 */
export class AsyncTestHelpers {
  /**
   * Waits for a condition to be true
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Retries an operation until it succeeds
   */
  static async retry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (i < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
      }
    }
    
    throw lastError || new Error('Retry failed');
  }

  /**
   * Creates a deferred promise
   */
  static createDeferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
  } {
    let resolve: (value: T) => void;
    let reject: (error: Error) => void;
    
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    
    return { promise, resolve: resolve!, reject: reject! };
  }
}

/**
 * Coverage reporting utilities
 */
export class CoverageHelpers {
  /**
   * Tracks which code paths have been tested
   */
  static createPathTracker() {
    const paths = new Set<string>();
    
    return {
      mark: (path: string) => paths.add(path),
      has: (path: string) => paths.has(path),
      getMissing: (expected: string[]) => 
        expected.filter(p => !paths.has(p)),
      getCoverage: (expected: string[]) => 
        (paths.size / expected.length) * 100
    };
  }

  /**
   * Generates coverage report
   */
  static generateReport(
    tested: string[],
    total: string[]
  ): { coverage: number; missing: string[] } {
    const testedSet = new Set(tested);
    const missing = total.filter(t => !testedSet.has(t));
    const coverage = (tested.length / total.length) * 100;
    
    return { coverage, missing };
  }
}

// Helper functions
function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && 
         date.toISOString() === dateString;
}

/**
 * Setup function to initialize all custom matchers
 */
export function setupCustomMatchers(): void {
  expect.extend(engineMatchers);
}

/**
 * Cleanup function for after tests
 */
export function cleanupAfterTests(): void {
  jest.clearAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
}