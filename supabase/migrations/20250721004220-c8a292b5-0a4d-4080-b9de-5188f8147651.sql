-- Delete existing demo user if exists and recreate with proper password
-- We need to use the auth schema properly

-- First, delete any existing user with this email
DELETE FROM auth.users WHERE email = 'gianmatteo.costanza@gmail.com';

-- Create the demo user with the correct structure
-- Note: We'll use a function to properly hash the password
DO $$
DECLARE
    new_user_id uuid := '04ee6ef7-6b59-4cdb-9bb6-3eca2e3a1412';
BEGIN
    -- Insert into auth.users with properly hashed password
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
        role,
        aud,
        confirmation_token,
        email_confirmed_at,
        phone_confirmed_at,
        confirmed_at
    ) VALUES (
        new_user_id,
        '00000000-0000-0000-0000-000000000000',
        'gianmatteo.costanza@gmail.com',
        crypt('demo123456', gen_salt('bf')),
        now(),
        now(),
        now(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Demo User", "given_name": "Demo", "family_name": "User"}',
        false,
        'authenticated',
        'authenticated',
        '',
        now(),
        null,
        now()
    );

    -- Insert into auth.identities
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        created_at,
        updated_at
    ) VALUES (
        new_user_id,
        new_user_id,
        jsonb_build_object(
            'sub', new_user_id::text,
            'email', 'gianmatteo.costanza@gmail.com'
        ),
        'email',
        now(),
        now()
    );
END $$;