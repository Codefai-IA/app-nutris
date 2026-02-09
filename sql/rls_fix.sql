-- ===========================================
-- FIX: Remove circular reference in profiles policy
-- Run this in Supabase Dashboard > SQL Editor
-- ===========================================

-- Drop the problematic admin policy on profiles
DROP POLICY IF EXISTS "Admins full access profiles" ON profiles;

-- Create a function to check admin status (avoids circular reference)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate admin policy using the function
CREATE POLICY "Admins can read all profiles" ON profiles
FOR SELECT USING (
  auth.uid() = id OR is_admin()
);

CREATE POLICY "Admins can update all profiles" ON profiles
FOR UPDATE USING (
  auth.uid() = id OR is_admin()
);

CREATE POLICY "Admins can insert profiles" ON profiles
FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admins can delete profiles" ON profiles
FOR DELETE USING (is_admin());

-- Also drop and recreate the user policies to avoid conflicts
DROP POLICY IF EXISTS "Users read own profile" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
