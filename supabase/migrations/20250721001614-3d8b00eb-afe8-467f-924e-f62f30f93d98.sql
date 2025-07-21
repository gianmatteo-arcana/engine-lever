-- Create trigger to automatically create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Manually create profile for existing user
INSERT INTO public.profiles (
  user_id,
  email,
  full_name,
  first_name,
  last_name,
  avatar_url
) VALUES (
  '04ee6ef7-6b59-4cdb-9bb6-3eca2e3a1412',
  'gianmatteo.costanza@gmail.com',
  'Gianmatteo Costanza',
  'Gianmatteo',
  'Costanza',
  null
) ON CONFLICT (user_id) DO NOTHING;