-- CropsIntel V2 — Team-can-verify-users RLS + trigger
-- Goal: MAXONS team members can promote newly-registered users (access_tier='registered')
-- to 'verified' status, but CANNOT add, delete, change roles, or elevate to team/admin.
-- Admins retain full CRUD via service-role key or existing admin-path.
--
-- Policy stack (order matters only for clarity; RLS is OR'd across policies):
--   1. "Users update own profile"          (pre-existing) — users edit themselves
--   2. "Team can verify registered users"  (NEW)         — team members update others
--   3. Service role bypasses RLS entirely                — scrapers/edge functions
--
-- Trigger: lock down non-admin updates to only flip access_tier registered→verified.
-- This closes the gap where an RLS policy allows the row-level update but doesn't
-- constrain which columns may change in the UPDATE statement.

-- ----------------------------------------------------------------
-- Step 1. RLS policy — team members can UPDATE a row that is currently 'registered'
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "Team can verify registered users" ON user_profiles;

CREATE POLICY "Team can verify registered users" ON user_profiles
  FOR UPDATE
  USING (
    -- The verifier (auth.uid()) must be a team member.
    -- Team = role in canonical team list OR access_tier elevated.
    EXISTS (
      SELECT 1 FROM user_profiles self
      WHERE self.id = auth.uid()
        AND (
          self.role IN ('admin','analyst','broker','seller','trader','sales','maxons_team')
          OR self.access_tier IN ('maxons_team','admin')
        )
    )
    -- The target row must currently be 'registered'. Prevents demoting
    -- verified/team/admin users back down.
    AND access_tier = 'registered'
  )
  WITH CHECK (
    -- After the update, access_tier must be 'verified'. No other value allowed.
    access_tier = 'verified'
  );

COMMENT ON POLICY "Team can verify registered users" ON user_profiles IS
  'Allows MAXONS team members to promote registered → verified. Row-level guard only; column-level guard enforced by trigger lock_team_column_writes.';

-- ----------------------------------------------------------------
-- Step 2. BEFORE-UPDATE trigger — lock down which columns team-but-not-admin can touch
-- ----------------------------------------------------------------
-- The RLS policy above limits WHICH rows can be updated, but cannot limit WHICH columns
-- change in the UPDATE statement. Without this trigger, a team member could submit
--   UPDATE user_profiles SET access_tier='verified', role='admin' WHERE id=<target>
-- and the RLS WITH CHECK would pass (access_tier='verified' is true) while silently
-- granting admin. This trigger rejects that.

CREATE OR REPLACE FUNCTION lock_team_column_writes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  updater_role TEXT;
  updater_tier TEXT;
  is_admin BOOLEAN;
  is_team BOOLEAN;
BEGIN
  -- Service-role UPDATEs set auth.uid() NULL; let those pass freely.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Self-updates (users editing their own profile) are already constrained by the
  -- existing "Users update own profile" RLS, which only checks auth.uid() = id.
  -- We still want to block users from self-promoting their access_tier.
  IF OLD.id = auth.uid() THEN
    -- User editing themselves: can't escalate their own access_tier or role.
    IF NEW.access_tier IS DISTINCT FROM OLD.access_tier THEN
      RAISE EXCEPTION 'Users cannot change their own access_tier. Contact an admin.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Users cannot change their own role. Contact an admin.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Updating someone else: must be admin or team.
  SELECT role, access_tier
    INTO updater_role, updater_tier
  FROM user_profiles
  WHERE id = auth.uid();

  is_admin := (updater_role = 'admin' OR updater_tier = 'admin');
  is_team := (
    updater_role IN ('admin','analyst','broker','seller','trader','sales','maxons_team')
    OR updater_tier IN ('maxons_team','admin')
  );

  IF is_admin THEN
    -- Admins can change anything. Done.
    RETURN NEW;
  END IF;

  IF NOT is_team THEN
    RAISE EXCEPTION 'Only team members can update other user profiles.'
      USING ERRCODE = '42501';
  END IF;

  -- Team-but-not-admin: the ONLY allowed column change is access_tier
  -- registered → verified (and the auto-updated timestamp).
  IF NEW.access_tier IS DISTINCT FROM OLD.access_tier
     AND NOT (OLD.access_tier = 'registered' AND NEW.access_tier = 'verified') THEN
    RAISE EXCEPTION 'Team members can only promote access_tier registered → verified, not % → %',
      OLD.access_tier, NEW.access_tier
      USING ERRCODE = '42501';
  END IF;

  -- Reject any other column change.
  IF NEW.role            IS DISTINCT FROM OLD.role            THEN RAISE EXCEPTION 'Team members cannot change role.'            USING ERRCODE='42501'; END IF;
  IF NEW.email           IS DISTINCT FROM OLD.email           THEN RAISE EXCEPTION 'Team members cannot change email.'           USING ERRCODE='42501'; END IF;
  IF NEW.full_name       IS DISTINCT FROM OLD.full_name       THEN RAISE EXCEPTION 'Team members cannot change name.'            USING ERRCODE='42501'; END IF;
  IF NEW.phone           IS DISTINCT FROM OLD.phone           THEN RAISE EXCEPTION 'Team members cannot change phone.'           USING ERRCODE='42501'; END IF;
  IF NEW.whatsapp_number IS DISTINCT FROM OLD.whatsapp_number THEN RAISE EXCEPTION 'Team members cannot change WhatsApp number.' USING ERRCODE='42501'; END IF;
  IF NEW.company         IS DISTINCT FROM OLD.company         THEN RAISE EXCEPTION 'Team members cannot change company.'         USING ERRCODE='42501'; END IF;
  IF NEW.id              IS DISTINCT FROM OLD.id              THEN RAISE EXCEPTION 'Profile id is immutable.'                    USING ERRCODE='42501'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_team_column_writes ON user_profiles;
CREATE TRIGGER trg_lock_team_column_writes
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION lock_team_column_writes();

-- ----------------------------------------------------------------
-- Step 3. Verification queries (run these after applying the migration):
-- ----------------------------------------------------------------
-- -- Confirm policy exists
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
-- WHERE tablename = 'user_profiles' AND policyname = 'Team can verify registered users';
--
-- -- Confirm trigger exists
-- SELECT tgname, tgtype, tgenabled FROM pg_trigger
-- WHERE tgrelid = 'user_profiles'::regclass AND tgname = 'trg_lock_team_column_writes';
--
-- -- Simulate as team user (won't fully work in SQL editor but pattern is correct):
-- SET LOCAL role TO authenticated;
-- SET LOCAL request.jwt.claim.sub = '<team-user-uuid>';
-- UPDATE user_profiles SET access_tier='verified' WHERE id='<registered-user-uuid>';  -- should succeed
-- UPDATE user_profiles SET access_tier='admin'    WHERE id='<registered-user-uuid>';  -- should fail
-- UPDATE user_profiles SET role='admin'           WHERE id='<registered-user-uuid>';  -- should fail
