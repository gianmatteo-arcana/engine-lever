-- Create a dev user profile with the specific user ID
INSERT INTO public.profiles (
  user_id,
  email,
  full_name,
  first_name,
  last_name,
  created_at,
  updated_at
) VALUES (
  '04ee6ef7-6b59-4cdb-9bb6-3eca2e3a1412',
  'dev@smallbizally.com',
  'Dev User',
  'Dev',
  'User',
  now(),
  now()
) ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  updated_at = now();