export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type LLMProvider = 'openai' | 'claude' | 'claude-mcp';

// New interfaces for the updated protocol
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'snoozed' | 'ignored';
  context?: Record<string, any>;
}

// Database Task type (from Supabase)
export interface DatabaseTask {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  task_type: string;
  status: string;
  priority: number;
  due_date?: string | null;
  data?: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface Action {
  label: string;
  instruction: string;
  action_id?: string; // Backend includes this field
}

export interface PsychState {
  stress_level: 'low' | 'medium' | 'high';
  confidence_level: 'low' | 'medium' | 'high';
  overwhelm_indicator: boolean;
  tone_preference: 'formal' | 'casual' | 'encouraging';
}

export interface RequestEnvelope {
  user_message: string;
  task_prompt?: string;
  task?: Task;
  business_profile?: Record<string, any>;
  memory_context?: string[];
  psych_state?: PsychState;
  session_id?: string;
  env?: 'production' | 'dev';
}

export interface ResponsePayload {
  message: string;
  task_id?: string;
  actions: Action[];
  timestamp: string;
  dev_notes?: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
  actions?: Action[];
}