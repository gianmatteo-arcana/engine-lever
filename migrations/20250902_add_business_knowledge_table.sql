-- Migration: Add business_knowledge table for persistent learning
-- Issue: #55 - Knowledge Extraction and Business Memory System
-- Date: 2025-09-02

-- Create enum for knowledge types
CREATE TYPE knowledge_type AS ENUM (
  'profile',      -- Core business information (name, EIN, etc.)
  'preference',   -- User/business preferences (communication style, etc.)
  'pattern',      -- Behavioral patterns observed
  'relationship', -- Business relationships (vendors, customers, etc.)
  'compliance'    -- Compliance-related facts
);

-- Create enum for knowledge categories
CREATE TYPE knowledge_category AS ENUM (
  'identity',          -- Business identity information
  'structure',         -- Entity structure and ownership
  'contact_info',      -- Contact details
  'operations',        -- Operational details
  'financial',         -- Financial information
  'compliance_status', -- Compliance and regulatory status
  'communication',     -- Communication preferences
  'decision_making',   -- Decision-making patterns
  'documentation'      -- Documentation preferences
);

-- Create the business_knowledge table
CREATE TABLE IF NOT EXISTS business_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL, -- Will reference businesses table when it's created
  knowledge_type knowledge_type NOT NULL,
  category knowledge_category NOT NULL,
  field_name VARCHAR(255) NOT NULL,
  field_value JSONB NOT NULL,
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_task_id UUID REFERENCES contexts(id),
  source_event_id UUID REFERENCES context_events(id),
  verification_method VARCHAR(255),
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure unique active facts per business/field combination using partial unique index
CREATE UNIQUE INDEX unique_active_knowledge 
  ON business_knowledge(business_id, field_name) 
  WHERE is_active = true;

-- Create indexes for efficient retrieval
CREATE INDEX idx_business_knowledge_lookup 
  ON business_knowledge(business_id, knowledge_type, category) 
  WHERE is_active = true;

CREATE INDEX idx_business_knowledge_confidence 
  ON business_knowledge(business_id, confidence DESC) 
  WHERE is_active = true;

CREATE INDEX idx_business_knowledge_expiry 
  ON business_knowledge(expires_at) 
  WHERE expires_at IS NOT NULL AND is_active = true;

CREATE INDEX idx_business_knowledge_source 
  ON business_knowledge(source_task_id);

-- Add RLS policies
ALTER TABLE business_knowledge ENABLE ROW LEVEL SECURITY;

-- Policy: Service role has full access
CREATE POLICY service_role_full_access ON business_knowledge
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Policy: Users can read knowledge for their businesses
-- NOTE: This will be updated once business_users table is created
CREATE POLICY user_read_own_business_knowledge ON business_knowledge
  FOR SELECT
  USING (auth.uid() IS NOT NULL); -- Temporary: Allow authenticated users to read

-- Add updated_at trigger
CREATE TRIGGER update_business_knowledge_updated_at
  BEFORE UPDATE ON business_knowledge
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment describing the table
COMMENT ON TABLE business_knowledge IS 'Stores extracted knowledge and learnings from completed tasks for business context enrichment';
COMMENT ON COLUMN business_knowledge.confidence IS 'Confidence score from 0.0 to 1.0 indicating reliability of the extracted fact';
COMMENT ON COLUMN business_knowledge.field_name IS 'Dot-notation path to the field (e.g., profile.ein, preferences.communication_style)';
COMMENT ON COLUMN business_knowledge.is_active IS 'Whether this fact is currently active. Old facts are marked inactive when updated.';