-- AlumniConnect PS-aligned PostgreSQL schema.
-- Safe to run repeatedly: existing prototype tables are extended, not dropped.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
-- The final three-role constraint is applied after the compatibility migration below.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active','pending','suspended'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS alumni_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  graduation_year INTEGER NOT NULL DEFAULT 2024,
  department VARCHAR(100) NOT NULL DEFAULT 'Not specified',
  degree VARCHAR(100) DEFAULT '',
  company VARCHAR(150) DEFAULT '',
  job_title VARCHAR(150) DEFAULT '',
  location VARCHAR(120) DEFAULT '',
  bio TEXT DEFAULT '',
  skills TEXT[] NOT NULL DEFAULT '{}',
  linkedin_url TEXT DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS verification_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS student_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id VARCHAR(60) DEFAULT '',
  department VARCHAR(100) DEFAULT '',
  degree VARCHAR(100) DEFAULT '',
  current_year VARCHAR(30) DEFAULT '',
  graduation_year INTEGER,
  skills TEXT[] NOT NULL DEFAULT '{}',
  interests TEXT[] NOT NULL DEFAULT '{}',
  career_interests TEXT[] NOT NULL DEFAULT '{}',
  bio TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS career_interests TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS career_history (
  id SERIAL PRIMARY KEY,
  alumni_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company VARCHAR(180) NOT NULL,
  job_title VARCHAR(180) NOT NULL,
  employment_type VARCHAR(50) DEFAULT '',
  location VARCHAR(120) DEFAULT '',
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS mentorship_requests (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alumni_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic VARCHAR(180) NOT NULL,
  message TEXT DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (student_id <> alumni_id)
);
ALTER TABLE mentorship_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_mentorship
  ON mentorship_requests(student_id,alumni_id) WHERE status IN ('pending','accepted');

CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY,
  alumni_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  company VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'internship'
    CHECK (type IN ('internship','job','project')),
  location VARCHAR(120) DEFAULT 'Remote',
  apply_by DATE,
  application_url TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE opportunities ALTER COLUMN alumni_id DROP NOT NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS opportunity_applications (
  id SERIAL PRIMARY KEY,
  opportunity_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT DEFAULT '',
  resume_url TEXT DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','reviewing','shortlisted','rejected','hired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(opportunity_id,student_id)
);
ALTER TABLE opportunity_applications DROP CONSTRAINT IF EXISTS opportunity_applications_status_check;
ALTER TABLE opportunity_applications ADD CONSTRAINT opportunity_applications_status_check CHECK (status IN ('submitted','reviewing','shortlisted','rejected','hired'));
ALTER TABLE opportunity_applications ADD COLUMN IF NOT EXISTS resume_url TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunity_applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  description TEXT DEFAULT '',
  venue VARCHAR(180) DEFAULT 'Campus',
  starts_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS event_registrations (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id,user_id)
);

CREATE TABLE IF NOT EXISTS donation_pledges (
  id SERIAL PRIMARY KEY,
  alumni_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  purpose VARCHAR(180) NOT NULL,
  note TEXT DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'interested'
    CHECK (status IN ('interested','contacted','fulfilled','withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  audience VARCHAR(20) NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all','students','alumni','faculty','recruiters')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alumni_department ON alumni_profiles(department);
CREATE INDEX IF NOT EXISTS idx_alumni_year ON alumni_profiles(graduation_year);
CREATE INDEX IF NOT EXISTS idx_mentorship_alumni_status ON mentorship_requests(alumni_id,status);
CREATE INDEX IF NOT EXISTS idx_opportunities_created ON opportunities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,is_read);
CREATE INDEX IF NOT EXISTS idx_career_history_alumni ON career_history(alumni_id,start_date DESC);
CREATE INDEX IF NOT EXISTS idx_applications_student ON opportunity_applications(student_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(starts_at);

-- Consolidate legacy Faculty and Recruiter demo accounts into the final three-role model.
-- Sample events, announcements and opportunity records are retained and transferred to the institution admin.
DO $$
DECLARE institution_admin_id INTEGER;
BEGIN
  SELECT id INTO institution_admin_id FROM users WHERE role='admin' ORDER BY id LIMIT 1;
  IF institution_admin_id IS NOT NULL THEN
    UPDATE events SET created_by=institution_admin_id
      WHERE created_by IN (SELECT id FROM users WHERE role='faculty');
    UPDATE announcements SET created_by=institution_admin_id
      WHERE created_by IN (SELECT id FROM users WHERE role='faculty');
    UPDATE opportunities SET created_by=institution_admin_id, alumni_id=NULL
      WHERE created_by IN (SELECT id FROM users WHERE role='recruiter');
  ELSE
    DELETE FROM events WHERE created_by IN (SELECT id FROM users WHERE role='faculty');
    DELETE FROM announcements WHERE created_by IN (SELECT id FROM users WHERE role='faculty');
    UPDATE opportunities SET created_by=NULL, alumni_id=NULL
      WHERE created_by IN (SELECT id FROM users WHERE role='recruiter');
  END IF;
  UPDATE announcements SET audience='all' WHERE audience IN ('faculty','recruiters');
  DELETE FROM users WHERE role IN ('faculty','recruiter');
END $$;
DROP TABLE IF EXISTS faculty_profiles;
DROP TABLE IF EXISTS recruiter_profiles;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','alumni','student'));
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_audience_check;
ALTER TABLE announcements ADD CONSTRAINT announcements_audience_check CHECK (audience IN ('all','students','alumni'));
