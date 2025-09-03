/**
 * UI Types for UIRequest coordination and management
 */

export type UIFieldType = 
  | 'text' 
  | 'email' 
  | 'tel' 
  | 'number' 
  | 'select' 
  | 'checkbox' 
  | 'radio' 
  | 'textarea'
  | 'date'
  | 'url';

export interface UIFieldOption {
  value: string;
  label: string;
}

export interface UIRequestField {
  id: string;
  type: UIFieldType;
  label: string;
  placeholder?: string;
  help?: string;
  required?: boolean;
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
  };
  options?: UIFieldOption[]; // For select, radio, checkbox
  defaultValue?: any;
}

export interface UIRequest {
  requestId?: string;
  title: string;
  instructions?: string;
  templateType: 'form' | 'wizard' | 'confirmation' | 'info';
  fields: UIRequestField[];
  metadata?: Record<string, any>;
  semanticData?: Record<string, any>;
  context?: {
    contextId?: string;
    userProgress?: number;
    deviceType?: 'mobile' | 'desktop' | 'tablet';
    urgency?: 'low' | 'medium' | 'high' | 'critical';
    [key: string]: any;
  };
}

export interface UIResponse {
  requestId: string;
  responses: Record<string, any>; // field id -> value
  timestamp: string;
  source: 'user' | 'system';
}