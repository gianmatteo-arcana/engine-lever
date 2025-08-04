import { Response, NextFunction } from 'express';
import { extractUserContext, requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Authentication Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      query: {},
      body: {},
      path: '/test'
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('extractUserContext', () => {
    it('should extract JWT token from Authorization header', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
      mockRequest.headers = {
        'authorization': `Bearer ${token}`
      };

      extractUserContext(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockRequest.userToken).toBe(token);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should extract user ID from X-User-Id header', () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      mockRequest.headers = {
        'x-user-id': userId,
        'x-user-email': 'test@example.com',
        'x-user-role': 'authenticated'
      };

      extractUserContext(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockRequest.userId).toBe(userId);
      expect(mockRequest.userEmail).toBe('test@example.com');
      expect(mockRequest.userRole).toBe('authenticated');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should extract user ID from query params if not in headers', () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      mockRequest.query = { user_id: userId };

      extractUserContext(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockRequest.userId).toBe(userId);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should extract user ID from body if not in headers or query', () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      mockRequest.body = { user_id: userId };

      extractUserContext(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockRequest.userId).toBe(userId);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should prefer header user ID over query or body', () => {
      const headerUserId = '123e4567-e89b-12d3-a456-426614174000';
      const queryUserId = '987654321-e89b-12d3-a456-426614174000';
      const bodyUserId = '111111111-e89b-12d3-a456-426614174000';
      
      mockRequest.headers = { 'x-user-id': headerUserId };
      mockRequest.query = { user_id: queryUserId };
      mockRequest.body = { user_id: bodyUserId };

      extractUserContext(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockRequest.userId).toBe(headerUserId);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle requests without user context', () => {
      extractUserContext(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockRequest.userId).toBeUndefined();
      expect(mockRequest.userEmail).toBeUndefined();
      expect(mockRequest.userRole).toBeUndefined();
      expect(mockRequest.userToken).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        'Request without user context (likely health check or public endpoint)'
      );
    });
  });

  describe('requireAuth', () => {
    it('should reject request without JWT token', () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      mockRequest.userId = userId;
      // No userToken set

      requireAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'You must provide a valid JWT token to access this resource'
      });
    });

    it('should allow request with valid user ID and JWT token', () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
      mockRequest.userId = userId;
      mockRequest.userToken = token;

      requireAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject request without user ID even with token', () => {
      mockRequest.userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
      // No userId set

      requireAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        message: 'You must be logged in to access this resource'
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should reject request with invalid user ID format', () => {
      mockRequest.userId = 'invalid-user-id';
      mockRequest.userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';

      requireAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid authentication',
        message: 'Invalid user ID format'
      });
      expect(logger.warn).toHaveBeenCalledWith('Invalid user ID format: invalid-user-id');
    });

    it('should validate UUID format correctly', () => {
      const validUUIDs = [
        '123e4567-e89b-12d3-a456-426614174000',
        'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
        '00000000-0000-0000-0000-000000000000'
      ];
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';

      validUUIDs.forEach(uuid => {
        mockRequest.userId = uuid;
        mockRequest.userToken = token;
        requireAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);
        expect(mockNext).toHaveBeenCalled();
        (mockNext as jest.Mock).mockClear();
      });
    });

    it('should reject malformed UUIDs', () => {
      const invalidUUIDs = [
        '123e4567-e89b-12d3-a456-42661417400',  // Missing digit
        '123e4567-e89b-12d3-a456-4266141740000', // Extra digit
        '123e4567e89b12d3a456426614174000',      // No dashes
        'not-a-uuid-at-all',
        '123e4567-e89b-12d3-a456-42661417400g'   // Invalid character
      ];
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';

      invalidUUIDs.forEach(uuid => {
        mockRequest.userId = uuid;
        mockRequest.userToken = token;
        requireAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext);
        expect(mockNext).not.toHaveBeenCalled();
        expect(mockResponse.status).toHaveBeenCalledWith(401);
        (mockNext as jest.Mock).mockClear();
        (mockResponse.status as jest.Mock).mockClear();
        (mockResponse.json as jest.Mock).mockClear();
      });
    });
  });
});