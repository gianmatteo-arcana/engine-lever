/**
 * Secure Database Service
 * Implements SQL injection prevention and query sanitization
 * All queries use parameterized statements
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { RequestContextService } from './request-context';

/**
 * SQL Query Builder with parameterized queries
 * Prevents SQL injection by separating query structure from data
 */
export class SecureQueryBuilder {
  private query: string = '';
  private params: any[] = [];
  private paramCounter: number = 1;

  /**
   * Select columns (sanitized)
   */
  select(table: string, columns: string[] = ['*']): this {
    const sanitizedTable = this.sanitizeIdentifier(table);
    const sanitizedColumns = columns.map(col => 
      col === '*' ? '*' : this.sanitizeIdentifier(col)
    );
    
    this.query = `SELECT ${sanitizedColumns.join(', ')} FROM ${sanitizedTable}`;
    return this;
  }

  /**
   * Insert with parameterized values
   */
  insert(table: string, data: Record<string, any>): this {
    const sanitizedTable = this.sanitizeIdentifier(table);
    const columns = Object.keys(data).map(col => this.sanitizeIdentifier(col));
    const placeholders = Object.keys(data).map(() => `$${this.paramCounter++}`);
    
    this.query = `INSERT INTO ${sanitizedTable} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    this.params.push(...Object.values(data));
    
    return this;
  }

  /**
   * Update with parameterized values
   */
  update(table: string, data: Record<string, any>): this {
    const sanitizedTable = this.sanitizeIdentifier(table);
    const setClauses = Object.keys(data).map(col => {
      const sanitizedCol = this.sanitizeIdentifier(col);
      const placeholder = `$${this.paramCounter++}`;
      this.params.push(data[col]);
      return `${sanitizedCol} = ${placeholder}`;
    });
    
    this.query = `UPDATE ${sanitizedTable} SET ${setClauses.join(', ')}`;
    return this;
  }

  /**
   * Where clause with parameterized values
   */
  where(column: string, operator: string, value: any): this {
    const sanitizedColumn = this.sanitizeIdentifier(column);
    const sanitizedOperator = this.sanitizeOperator(operator);
    const placeholder = `$${this.paramCounter++}`;
    
    const whereClause = `${sanitizedColumn} ${sanitizedOperator} ${placeholder}`;
    this.query += this.query.includes('WHERE') 
      ? ` AND ${whereClause}`
      : ` WHERE ${whereClause}`;
    
    this.params.push(value);
    return this;
  }

  /**
   * Where IN clause with parameterized values
   */
  whereIn(column: string, values: any[]): this {
    const sanitizedColumn = this.sanitizeIdentifier(column);
    const placeholders = values.map(() => `$${this.paramCounter++}`);
    
    this.query += ` WHERE ${sanitizedColumn} IN (${placeholders.join(', ')})`;
    this.params.push(...values);
    
    return this;
  }

  /**
   * Order by (sanitized)
   */
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    const sanitizedColumn = this.sanitizeIdentifier(column);
    const sanitizedDirection = direction === 'DESC' ? 'DESC' : 'ASC';
    
    this.query += ` ORDER BY ${sanitizedColumn} ${sanitizedDirection}`;
    return this;
  }

  /**
   * Limit (sanitized)
   */
  limit(count: number): this {
    const sanitizedLimit = Math.max(1, Math.min(1000, Math.floor(count)));
    this.query += ` LIMIT ${sanitizedLimit}`;
    return this;
  }

  /**
   * Offset (sanitized)
   */
  offset(count: number): this {
    const sanitizedOffset = Math.max(0, Math.floor(count));
    this.query += ` OFFSET ${sanitizedOffset}`;
    return this;
  }

  /**
   * Build the final query
   */
  build(): { query: string; params: any[] } {
    return {
      query: this.query,
      params: this.params
    };
  }

  /**
   * Sanitize SQL identifier (table/column names)
   * Only allows alphanumeric, underscore, and dash
   */
  private sanitizeIdentifier(identifier: string): string {
    // Remove any characters that aren't alphanumeric, underscore, or dash
    const sanitized = identifier.replace(/[^a-zA-Z0-9_-]/g, '');
    
    // Ensure it doesn't start with a number
    if (/^\d/.test(sanitized)) {
      throw new Error(`Invalid identifier: ${identifier}`);
    }
    
    // Check against SQL reserved words
    const reserved = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'EXEC', 'EXECUTE'];
    if (reserved.includes(sanitized.toUpperCase())) {
      throw new Error(`Reserved word used as identifier: ${identifier}`);
    }
    
    return sanitized;
  }

  /**
   * Sanitize SQL operator
   */
  private sanitizeOperator(operator: string): string {
    const allowedOperators = ['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'ILIKE', 'IS', 'IS NOT'];
    const upperOp = operator.toUpperCase();
    
    if (!allowedOperators.includes(upperOp)) {
      throw new Error(`Invalid operator: ${operator}`);
    }
    
    return upperOp;
  }
}

/**
 * Input validation utilities
 */
export class InputValidator {
  /**
   * Validate UUID format
   */
  static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 255;
  }

  /**
   * Validate business ID format
   */
  static isValidBusinessId(id: string): boolean {
    return /^(biz_|business_)?[a-zA-Z0-9]{6,32}$/.test(id);
  }

  /**
   * Validate context ID format
   */
  static isValidContextId(id: string): boolean {
    return /^(ctx_|context_)?[a-zA-Z0-9]{6,32}$/.test(id);
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(input: string, maxLength: number = 1000): string {
    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Limit length
    sanitized = sanitized.substring(0, maxLength);
    
    // Remove control characters except newlines and tabs
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    return sanitized;
  }

  /**
   * Sanitize JSON input
   */
  static sanitizeJSON(input: any): any {
    if (typeof input !== 'object' || input === null) {
      return input;
    }

    const sanitized: any = Array.isArray(input) ? [] : {};

    for (const key in input) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        const sanitizedKey = this.sanitizeString(key, 100);
        
        if (typeof input[key] === 'string') {
          sanitized[sanitizedKey] = this.sanitizeString(input[key]);
        } else if (typeof input[key] === 'object') {
          sanitized[sanitizedKey] = this.sanitizeJSON(input[key]);
        } else {
          sanitized[sanitizedKey] = input[key];
        }
      }
    }

    return sanitized;
  }

  /**
   * Validate pagination parameters
   */
  static validatePagination(limit?: number, offset?: number): { limit: number; offset: number } {
    const validLimit = Math.max(1, Math.min(100, Math.floor(limit || 50)));
    const validOffset = Math.max(0, Math.floor(offset || 0));
    
    return {
      limit: validLimit,
      offset: validOffset
    };
  }
}

/**
 * Secure database operations wrapper
 * All operations use parameterized queries
 */
export class SecureDatabaseOperations {
  constructor(private client: SupabaseClient) {}

  /**
   * Execute a parameterized query safely
   */
  async executeQuery<T = any>(queryBuilder: SecureQueryBuilder): Promise<T[]> {
    const { query, params } = queryBuilder.build();
    
    RequestContextService.log('info', 'Executing secure query', {
      query: query.substring(0, 100), // Log first 100 chars only
      paramCount: params.length
    });

    try {
      const { data, error } = await this.client.rpc('execute_query', {
        query_text: query,
        query_params: params
      });

      if (error) {
        logger.error('Query execution failed', { error, query: query.substring(0, 100) });
        throw error;
      }

      return data as T[];
    } catch (error: any) {
      RequestContextService.log('error', 'Secure query failed', { 
        error: error.message,
        query: query.substring(0, 100)
      });
      throw error;
    }
  }

  /**
   * Get record by ID with validation
   */
  async getById<T = any>(table: string, id: string, columns: string[] = ['*']): Promise<T | null> {
    // Validate ID format
    if (!InputValidator.isValidUUID(id) && !InputValidator.isValidBusinessId(id) && !InputValidator.isValidContextId(id)) {
      throw new Error('Invalid ID format');
    }

    const query = new SecureQueryBuilder()
      .select(table, columns)
      .where('id', '=', id)
      .limit(1);

    const results = await this.executeQuery<T>(query);
    return results[0] || null;
  }

  /**
   * Insert record with validation
   */
  async insert<T = any>(table: string, data: Record<string, any>): Promise<T> {
    // Sanitize input data
    const sanitizedData = InputValidator.sanitizeJSON(data);

    const query = new SecureQueryBuilder()
      .insert(table, sanitizedData);

    const results = await this.executeQuery<T>(query);
    return results[0];
  }

  /**
   * Update record with validation
   */
  async update<T = any>(table: string, id: string, data: Record<string, any>): Promise<T> {
    // Validate ID
    if (!InputValidator.isValidUUID(id) && !InputValidator.isValidBusinessId(id) && !InputValidator.isValidContextId(id)) {
      throw new Error('Invalid ID format');
    }

    // Sanitize input data
    const sanitizedData = InputValidator.sanitizeJSON(data);

    const query = new SecureQueryBuilder()
      .update(table, sanitizedData)
      .where('id', '=', id);

    const results = await this.executeQuery<T>(query);
    return results[0];
  }

  /**
   * Delete record with validation (soft delete recommended)
   */
  async delete(table: string, id: string): Promise<boolean> {
    // Validate ID
    if (!InputValidator.isValidUUID(id) && !InputValidator.isValidBusinessId(id) && !InputValidator.isValidContextId(id)) {
      throw new Error('Invalid ID format');
    }

    // Prefer soft delete
    const query = new SecureQueryBuilder()
      .update(table, { deleted_at: new Date().toISOString() })
      .where('id', '=', id);

    await this.executeQuery(query);
    return true;
  }

  /**
   * Search with sanitized input
   */
  async search<T = any>(
    table: string, 
    searchTerm: string, 
    searchColumns: string[],
    limit: number = 50
  ): Promise<T[]> {
    // Sanitize search term
    const sanitizedTerm = InputValidator.sanitizeString(searchTerm, 100);
    const { limit: validLimit } = InputValidator.validatePagination(limit);

    // Build search query with parameterized LIKE
    const query = new SecureQueryBuilder()
      .select(table)
      .where(searchColumns[0], 'ILIKE', `%${sanitizedTerm}%`)
      .limit(validLimit);

    return await this.executeQuery<T>(query);
  }
}

export { SecureDatabaseOperations as SecureDB };