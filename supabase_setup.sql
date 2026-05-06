-- Run this in your Supabase project: SQL Editor → New Query → paste & Run

-- 1. User profiles (stores display name)
CREATE TABLE profiles (
  id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. CRM data per user (all jobs/customers/invoices stored as JSON)
CREATE TABLE user_crm_data (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data       jsonb NOT NULL DEFAULT '{"jobs":[],"customers":[],"invoices":[],"appointments":[]}',
  updated_at timestamptz DEFAULT now()
);

-- 3. Row Level Security — each user can only access their own data
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_crm_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile"   ON profiles      FOR ALL USING (auth.uid() = id);
CREATE POLICY "own crm data"  ON user_crm_data FOR ALL USING (auth.uid() = user_id);
