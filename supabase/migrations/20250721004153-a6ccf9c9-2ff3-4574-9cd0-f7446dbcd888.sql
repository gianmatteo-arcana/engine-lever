-- Create or update the demo user with the correct password
-- This will either create the user if they don't exist, or update their password if they do

-- First, let's check if we need to delete and recreate the user
-- Note: We can't directly update passwords in auth.users, so we need to use admin functions

-- Create the demo user with proper credentials
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
) VALUES (
  '04ee6ef7-6b59-4cdb-9bb6-3eca2e3a1412',
  '00000000-0000-0000-0000-000000000000',
  'gianmatteo.costanza@gmail.com',
  crypt('demo123456', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Demo User", "given_name": "Demo", "family_name": "User"}',
  false,
  'authenticated'
)
ON CONFLICT (email) 
DO UPDATE SET 
  encrypted_password = crypt('demo123456', gen_salt('bf')),
  updated_at = now(),
  email_confirmed_at = now();

-- Ensure the demo user has an identity record
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  created_at,
  updated_at
) VALUES (
  '04ee6ef7-6b59-4cdb-9bb6-3eca2e3a1412',
  '04ee6ef7-6b59-4cdb-9bb6-3eca2e3a1412',
  '{"sub": "04ee6ef7-6b59-4cdb-9bb6-3eca2e3a1412", "email": "gianmatteo.costanza@gmail.com"}',
  'email',
  now(),
  now()
)
ON CONFLICT (provider, id)
DO UPDATE SET 
  updated_at = now();