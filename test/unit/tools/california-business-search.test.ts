/**
 * Minimal test for California Business Search Tool to avoid hanging
 */

// Mock Stagehand before importing anything that uses it
jest.mock('@browserbasehq/stagehand', () => ({
  Stagehand: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    page: {
      goto: jest.fn().mockResolvedValue(undefined),
      act: jest.fn().mockResolvedValue(undefined),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      extract: jest.fn().mockResolvedValue({ results: [] })
    }
  }))
}));

import { CaliforniaBusinessSearchTool } from '../../../src/tools/california-business-search';

describe('CaliforniaBusinessSearchTool - Minimal', () => {
  let tool: CaliforniaBusinessSearchTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new CaliforniaBusinessSearchTool();
  });

  it('should create an instance', () => {
    expect(tool).toBeDefined();
    expect(tool).toBeInstanceOf(CaliforniaBusinessSearchTool);
  });

  it('should return empty array when no results found', async () => {
    const results = await tool.searchByName('NonexistentCompany');
    expect(results).toEqual([]);
  });
});