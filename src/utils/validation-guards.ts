/**
 * Universal validation guards to prevent null/undefined values from being
 * converted to the string "undefined" or "null" throughout the system
 */

/**
 * Checks if a value is effectively empty (null, undefined, empty string, or the literal strings "undefined"/"null"/"string")
 */
export function isEffectivelyEmpty(value: any): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return trimmed === '' || 
           trimmed === 'undefined' || 
           trimmed === 'null' ||
           trimmed === 'string';  // Catch placeholder "string" values
  }
  
  return false;
}

/**
 * Sanitizes a value to ensure it's not null/undefined or their string representations
 * Returns null for invalid values, or the actual value for valid ones
 */
export function sanitizeValue(value: any): any {
  if (isEffectivelyEmpty(value)) {
    return null;
  }
  return value;
}

/**
 * Validates that all required parameters are present and not effectively empty
 * Throws descriptive errors for missing parameters
 */
export function validateRequiredParams(
  params: Record<string, any>, 
  requiredFields: string[], 
  context: string = 'operation'
): void {
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  
  for (const field of requiredFields) {
    if (!(field in params)) {
      missingFields.push(field);
    } else if (isEffectivelyEmpty(params[field])) {
      invalidFields.push(field);
    }
  }
  
  if (missingFields.length > 0 || invalidFields.length > 0) {
    const errors: string[] = [];
    
    if (missingFields.length > 0) {
      errors.push(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    if (invalidFields.length > 0) {
      errors.push(`Invalid/empty fields: ${invalidFields.join(', ')} (received null, undefined, empty string, or placeholder values like "undefined"/"null"/"string")`);
    }
    
    throw new Error(`Parameter validation failed for ${context}: ${errors.join('; ')}`);
  }
}

/**
 * Safely extracts a string value, returning null if it's effectively empty
 */
export function safeString(value: any): string | null {
  if (isEffectivelyEmpty(value)) {
    return null;
  }
  return String(value);
}

/**
 * Safely extracts a string value with a fallback
 */
export function safeStringWithFallback(value: any, fallback: string): string {
  const safe = safeString(value);
  return safe !== null ? safe : fallback;
}

/**
 * Creates a sanitized object by removing all effectively empty values
 */
export function sanitizeObject(obj: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const cleanValue = sanitizeValue(value);
    if (cleanValue !== null) {
      sanitized[key] = cleanValue;
    }
  }
  
  return sanitized;
}

/**
 * Logs a warning when undefined/null string conversion is detected
 */
export function logUndefinedStringDetected(
  value: any, 
  context: string, 
  logger?: { warn: (message: string, meta?: any) => void }
): void {
  if (typeof value === 'string' && (value === 'undefined' || value === 'null')) {
    const message = `🚨 Detected literal "${value}" string in ${context} - this likely indicates improper null/undefined handling`;
    const meta = { 
      detectedValue: value, 
      context, 
      timestamp: new Date().toISOString() 
    };
    
    if (logger) {
      logger.warn(message, meta);
    } else {
      console.warn(message, meta);
    }
  }
}

/**
 * Enhanced JSON.stringify that converts null/undefined to null instead of "undefined"
 */
export function safeJSONStringify(obj: any, space?: number): string {
  return JSON.stringify(obj, (key, value) => {
    if (value === undefined) {
      return null; // Convert undefined to null for JSON
    }
    if (typeof value === 'string' && (value === 'undefined' || value === 'null')) {
      logUndefinedStringDetected(value, `JSON serialization of key "${key}"`);
      return null; // Convert literal "undefined"/"null" strings to null
    }
    return value;
  }, space);
}

/**
 * Type guard to ensure a value is a non-empty string
 */
export function isNonEmptyString(value: any): value is string {
  return typeof value === 'string' && !isEffectivelyEmpty(value);
}

/**
 * Type guard to ensure a value exists and is not effectively empty
 */
export function isValidValue(value: any): value is NonNullable<any> {
  return !isEffectivelyEmpty(value);
}